# Documentation guide

The documentation is organized around one reference per topic. Start with [local development](operations/local-development.md), then read the [behavior contract](architecture/behavior-contract.md) while exploring the source.

## Read by purpose

| Purpose | Reference |
| --- | --- |
| Understand components, reconciliation, states, and design tradeoffs | [Architecture guide](architecture/overview.md) |
| Follow system and lifecycle flows visually | [Architecture diagrams](architecture/diagrams.md) |
| Check shared financial, approval, and recovery rules | [Behavior contract](architecture/behavior-contract.md) |
| Understand scope, operator workflows, and learning requirements | [Product requirements](product/prd.md) |
| Integrate with routes, payloads, and response shapes | [API reference](specifications/api.md) |
| Inspect current model fields, enums, and relationships | [Database reference](specifications/database.md) |
| Understand the AI tool catalogue and advisory boundary | [AI specification](specifications/ai-agent.md) |
| Check authentication, isolation, secrets, and known control limits | [Security boundaries](specifications/security.md) |
| Configure environments, services, providers, and upgrades | [Local development](operations/local-development.md) |
| Run isolated checks and maintain dependencies/docs | [Testing and maintenance](operations/testing.md) |
| Review dated completed checks and per-finding closure | [Verification record](operations/fix-verification.md) |
| Study original pre-fix symptoms and repair directions | [Historical audit](operations/full-code-audit-2026-10-21.md) |

The [root README](../README.md) introduces the project, [TODO.md](../TODO.md) tracks optional exercises, and [AGENTS.md](../AGENTS.md) describes AI/policy/audit responsibilities.

## How to interpret claims

Use the API and database references when you need exact names and formats. Use the architecture and product guides when you want to understand why a rule exists. Historical audit symptoms describe the pre-fix snapshot, while the verification record states which corrected cases ran and when. Optional exercises remain in TODO.md. Editing a document or passing its static checker does not rerun the application tests.
