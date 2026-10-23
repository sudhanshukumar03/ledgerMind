"""Check repository documentation offline, using only Python's standard library.

This checks static consistency. It does not render Mermaid, execute application
examples, test credentials, or establish runtime correctness.
"""

from __future__ import annotations

import html
import json
import os
import re
import sys
import unicodedata
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
SKIP = {"node_modules", ".git", ".next", "dist", ".agents", ".codex", ".runtime"}
ERRORS: list[str] = []
COUNTS: dict[str, int] = {}


def count(name: str) -> None:
    COUNTS[name] = COUNTS.get(name, 0) + 1


def fail(file: Path, message: str) -> None:
    ERRORS.append(f"{file.relative_to(ROOT).as_posix()}: {message}")


@dataclass
class Block:
    language: str
    body: str
    line: int


def code_blocks(file: Path, text: str) -> tuple[str, list[Block]]:
    visible, blocks, body = [], [], []
    marker, language, first = "", "", 0
    for line_number, line in enumerate(text.splitlines(), 1):
        match = re.match(r"^\s{0,3}(`{3,}|~{3,})(.*)$", line)
        if not marker and match:
            marker, language, first = match[1], match[2].strip().split(" ")[0], line_number
            body = []
            visible.append("")
        elif marker and re.fullmatch(rf"\s{{0,3}}{re.escape(marker[0])}{{{len(marker)},}}\s*", line):
            blocks.append(Block(language.lower(), "\n".join(body), first))
            marker = ""
            visible.append("")
        elif marker:
            body.append(line)
            visible.append("")
        else:
            visible.append(line)
    if marker:
        fail(file, f"unclosed code fence at line {first}")
    return "\n".join(visible), blocks


def heading_ids(text: str) -> set[str]:
    found, occurrences = set(), {}
    for line in text.splitlines():
        match = re.match(r"^#{1,6}\s+(.+?)\s*#*\s*$", line)
        if not match:
            continue
        label = re.sub(r"!?\[([^]]+)\]\([^)]*\)", r"\1", match[1])
        label = re.sub(r"<[^>]+>", "", html.unescape(label)).lower()
        slug = "".join(
            char for char in label
            if unicodedata.category(char)[0] in "LNM" or char.isspace() or char in "_-"
        )
        slug = re.sub(r"\s", "-", slug)
        number = occurrences.get(slug, 0)
        occurrences[slug] = number + 1
        found.add(f"{slug}-{number}" if number else slug)
    return found


def markdown_urls(text: str):
    """Read inline destinations with balanced parentheses, including Windows paths."""
    text = re.sub(r"(`+)[^\n]*?\1", "", text)
    for match in re.finditer(r"\]\(", text):
        start = match.end()
        if text[start:start + 1] == "<":
            end = text.find(">", start + 1)
            if end != -1:
                yield text[start + 1:end]
            continue
        depth, index = 1, start
        while index < len(text) and depth:
            if text[index] == "\\":
                index += 2
                continue
            if text[index] == "(":
                depth += 1
            elif text[index] == ")":
                depth -= 1
            index += 1
        if depth == 0:
            yield text[start:index - 1].strip().split(' "', 1)[0]
    for match in re.finditer(r"^\s{0,3}\[[^]]+\]:\s*<?(\S+?)>?(?:\s+[\"'(].*)?$", text, re.M):
        yield match[1]


class AssetLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if value and name in {"src", "href"}:
                self.urls.append(value)
            elif value and name == "srcset":
                self.urls.extend(part.strip().split()[0] for part in value.split(",") if part.strip())


def check_url(file: Path, url: str, documents: dict[Path, tuple[str, list[Block]]]) -> None:
    if urlsplit(url).scheme or url.startswith("//"):
        return
    count("local links/assets")
    parsed = urlsplit(html.unescape(url))
    target = (file.parent / unquote(parsed.path)).resolve() if parsed.path else file
    if not target.is_relative_to(ROOT):
        fail(file, f"local reference escapes repository: {url}")
    elif not target.exists():
        fail(file, f"missing local target: {url}")
    elif parsed.fragment:
        fragment = unquote(parsed.fragment)
        if re.fullmatch(r"L\d+(?:-L\d+)?", fragment):
            maximum = len(target.read_text(encoding="utf-8").splitlines())
            if any(int(line) > maximum for line in re.findall(r"L(\d+)", fragment)):
                fail(file, f"line anchor out of range: {url}")
        elif target in documents and fragment not in heading_ids(documents[target][0]):
            fail(file, f"missing heading anchor: {url}")


def prisma_models(schema: str):
    result = {}
    for model, body in re.findall(r"^model (\w+) \{\n(.*?)^\}", schema, re.M | re.S):
        fields = {}
        for line in body.splitlines():
            match = re.match(r"\s*(\w+)\s+([\w\[\]?]+)\s*(.*)", line.split("//", 1)[0])
            if match:
                field, kind, attributes = match.groups()
                mapped = re.search(r'@map\("([^\"]+)"\)', attributes)
                fields[field] = (kind, mapped[1] if mapped else field)
        result[model] = fields
    return result


def check_source_contracts(documents: dict[Path, tuple[str, list[Block]]]) -> None:
    schema = (ROOT / "backend/prisma/schema.prisma").read_text(encoding="utf-8")
    models = prisma_models(schema)
    database = (ROOT / "docs/specifications/database.md").read_text(encoding="utf-8")
    sections = re.findall(r"^### (\w+) \(`[^`]+`\)\n(.*?)(?=^### |^## |\Z)", database, re.M | re.S)
    documented = {name: body for name, body in sections}
    if set(documented) != set(models):
        fail(ROOT / "docs/specifications/database.md", "model catalogue differs from Prisma")
    for name, fields in models.items():
        rows = re.findall(r"^\| `(\w+)` \| `([^`]+)` \| `([^`]+)` \|", documented.get(name, ""), re.M)
        expected = {
            field: (kind, column) for field, (kind, column) in fields.items()
            if kind.replace("[]", "").rstrip("?") not in models
        }
        actual = {field: (kind, column) for field, column, kind in rows}
        if actual != expected:
            fail(ROOT / "docs/specifications/database.md", f"scalar fields/types/columns differ for {name}")
        count("Prisma models")

    service = (ROOT / "backend/src/modules/ai/ai.service.ts").read_text(encoding="utf-8")
    catalogue = service.split("export const AI_TOOLS = [", 1)[1].split("\n];", 1)[0]
    tools = set(re.findall(r"function:\s*\{\s*name:\s*['\"]([^'\"]+)['\"]", catalogue))
    ai_doc = ROOT / "docs/specifications/ai-agent.md"
    names = set(re.findall(r"^\| (\w+) \| (?:Discovery|Advisory|Proposal) \|", ai_doc.read_text(encoding="utf-8"), re.M))
    if names != tools:
        fail(ai_doc, "tool catalogue differs from AI_TOOLS")
    COUNTS["AI tools"] = len(tools)

    api_file = ROOT / "docs/specifications/api.md"
    api = api_file.read_text(encoding="utf-8")
    for controller in (ROOT / "backend/src/modules").rglob("*.controller.ts"):
        source = controller.read_text(encoding="utf-8")
        prefix = re.search(r"@Controller\('([^']*)'\)", source)
        if not prefix:
            continue
        for method, suffix in re.findall(r"@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)", source):
            route = "/" + "/".join(part for part in (prefix[1], suffix) if part)
            if route not in api:
                fail(api_file, f"implemented route is undocumented: {method.upper()} {route}")
            count("controller routes")

    packages = {
        "root": json.loads((ROOT / "package.json").read_text(encoding="utf-8")),
        "backend": json.loads((ROOT / "backend/package.json").read_text(encoding="utf-8")),
        "frontend": json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8")),
    }
    for file, (_, blocks) in documents.items():
        for block in blocks:
            if block.language not in {"bash", "sh", "shell", "powershell", "ps1"}:
                continue
            context = "root"
            if "from backend:" in file.read_text(encoding="utf-8") and "Push-Location backend" in block.body:
                context = "backend"
            for line in block.body.splitlines():
                if line.strip() in {"cd backend", "Push-Location backend"}:
                    context = "backend"
                command = line
                if re.search(r"\bnpm run npm --\s+", command):
                    if "npm" not in packages[context].get("scripts", {}):
                        fail(file, f"unknown {context} npm wrapper in code block: {line}")
                    count("npm commands")
                    command = re.sub(r"\bnpm run npm --\s+", "npm ", command, count=1)
                workspace = re.search(r"(?:-w|--workspace)(?:=|\s+)(backend|frontend)\b", command)
                match = re.search(r"\bnpm run ([\w:-]+)", command)
                if match:
                    selected = workspace[1] if workspace else context
                    if match[1] not in packages[selected].get("scripts", {}):
                        fail(file, f"unknown {selected} package script in code block: {line}")
                    count("npm commands")


def check_diagram(file: Path, block: Block, models: dict) -> None:
    count("Mermaid structures")
    language = block.body.strip().split("\n", 1)[0].strip()
    if not re.match(r"^(?:flowchart|graph)\s+(?:TB|TD|BT|LR|RL)$|^(?:sequenceDiagram|stateDiagram-v2|erDiagram)$", language):
        fail(file, f"unknown Mermaid declaration at line {block.line}")
    if language == "sequenceDiagram":
        stack = []
        for line in block.body.splitlines()[1:]:
            command = line.strip().split(" ", 1)[0]
            if command in {"alt", "opt", "loop", "par", "critical", "break", "rect"}:
                stack.append(command)
            elif command == "end":
                if not stack:
                    fail(file, f"unmatched Mermaid end at block line {block.line}")
                else:
                    stack.pop()
        if stack:
            fail(file, f"unclosed Mermaid groups at line {block.line}: {stack}")
    if language == "erDiagram":
        by_table = {
            re.sub(r"(?<!^)(?=[A-Z])", "_", name).upper(): fields for name, fields in models.items()
        }
        for table, body in re.findall(r"^\s+(\w+)\s*\{\n(.*?)^\s*\}", block.body, re.M | re.S):
            if table not in by_table:
                fail(file, f"unknown current ER entity: {table}")
                continue
            columns = {column for _, column in by_table[table].values()}
            for line in body.splitlines():
                match = re.match(r"\s*\w+\s+(\w+)\b", line)
                if match and match[1] not in columns:
                    fail(file, f"ER column is absent from current Prisma model: {table}.{match[1]}")


def main() -> int:
    documents = {}
    for directory, directories, names in os.walk(ROOT):
        directories[:] = sorted(name for name in directories if name not in SKIP)
        for name in sorted(names):
            if name.endswith(".md"):
                file = Path(directory) / name
                count("Markdown files")
                documents[file] = code_blocks(file, file.read_text(encoding="utf-8"))
    models = prisma_models((ROOT / "backend/prisma/schema.prisma").read_text(encoding="utf-8"))
    for file, (visible, blocks) in documents.items():
        for url in markdown_urls(visible):
            check_url(file, url, documents)
        assets = AssetLinks()
        assets.feed(visible)
        for url in assets.urls:
            check_url(file, url, documents)
        for block in blocks:
            if block.language == "json":
                count("JSON examples")
                try:
                    json.loads(block.body)
                except json.JSONDecodeError as error:
                    fail(file, f"invalid JSON example near line {block.line}: {error}")
            elif block.language == "mermaid":
                check_diagram(file, block, models)
    check_source_contracts(documents)
    for error in ERRORS:
        print(f"ERROR: {error}")
    print(json.dumps({"checks": COUNTS, "errors": len(ERRORS)}, indent=2))
    print("Static checks only; Mermaid rendering, services, and runtime correctness are not tested.")
    return 1 if ERRORS else 0


if __name__ == "__main__":
    sys.exit(main())
