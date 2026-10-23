<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## LedgerMind frontend work

Use the installed Next.js documentation described above before changing framework code. Current workspace commands and versions are defined in [package.json](package.json); use the [root runtime/setup guide](../docs/operations/local-development.md) to run them.

Keep API shapes aligned with the [API reference](../docs/specifications/api.md) and financial behavior aligned with the [behavior contract](../docs/architecture/behavior-contract.md). Preserve integer paise, request/entity ownership, explicit error versus empty states, and actual approval/recovery outcomes. UI visibility never replaces backend authorization.

Run the relevant TypeScript/build/browser checks from [testing](../docs/operations/testing.md). Browser fixtures intercept synthetic API data; they do not establish provider correctness. Avoid changing private environment files or resetting learning data as part of frontend work.
