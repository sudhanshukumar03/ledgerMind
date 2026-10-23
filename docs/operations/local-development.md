# Local development

Use synthetic data and preserve existing private environment files. The commands below run from the repository root unless stated otherwise. For results from previous checks, see the [verification record](fix-verification.md).

## Configuration

### Node and npm

The project pins Node 22.23.4 in .node-version and .nvmrc. Package engines accept ^22.22.3, ^24.15.0, or >=26.0.0; Docker and CI use Node 22.

On Windows x64, bootstrap the project runtime:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-node.ps1
npm run node -- --version
npm run npm -- --version
```

The bootstrap verifies the official archive checksum before extracting into ignored .runtime. It does not replace the machine-wide installation. Root dev/build/lint/backend-test commands select the project runtime and forward arguments to their workspace scripts. Use the node/npm aliases for other commands. On other platforms, install a supported Node version; the launcher uses that installation.

### Environment files

Create files only when they do not already exist:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
if (-not (Test-Path backend/.env)) { Copy-Item .env.example backend/.env }
if (-not (Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
npm run npm -- ci
```

| File | Used by |
| --- | --- |
| Root .env | Docker Compose interpolation and provider probes using --compose. |
| backend/.env | Local backend commands and default provider probes. |
| frontend/.env.local | Next.js development/build configuration. |

The root package-lock.json is canonical for both workspaces. Configure JWT_SECRET with at least 32 characters, an explicit PostgreSQL DATABASE_URL, and Redis credentials matching the selected instance. Host Redis uses 6380 in Compose; containers use redis:6379. Configuration loads before Prisma/application imports and Redis client construction.

| Setting | Default / rule |
| --- | --- |
| PAYMENT_EXECUTION_MODE | Application/Compose fallback is disabled. The tracked root .env.example explicitly selects simulation for learning. |
| provider_test mode | Requires rzp_test_ credentials; live keys are rejected. |
| AI_ENABLED | false; enable explicitly with a valid GROQ_API_KEY. |
| TRUST_PROXY | false; configure only actual trusted proxy addresses/subnets. |
| SEED_DATABASE | false; container seeding is an explicit opt-in. |

Missing payment credentials never enable simulation implicitly. Provider keys remain server-side and must not be committed or placed in NEXT_PUBLIC variables.

Copying the current template opts into simulation through its explicit setting. For a session with no monetary execution, change the selected private configuration to `PAYMENT_EXECUTION_MODE=disabled` before starting. The local backend and Compose read different files, so check the one used by your chosen startup command.

## Backing services and initialization

Start PostgreSQL and Redis, then generate the Prisma client:

```powershell
docker compose up -d postgres redis
npm run npm -- run prisma:generate -w backend
```

Check the selected DATABASE_URL privately before any schema operation. For a fresh disposable learning database:

```powershell
npm run npm -- run prisma:push -w backend
```

For existing records, use the [upgrade workflow](#updating-an-existing-learning-database) instead. A complete versioned Prisma migration history is not yet provided.

### Optional synthetic reset

Seeding deletes existing records. Use only a disposable learning target and set the exact selected database name:

```powershell
$env:ALLOW_DEMO_RESET = 'true'
$env:DEMO_RESET_DATABASE = 'ledgermind'
npm run npm -- run prisma:seed -w backend
Remove-Item Env:ALLOW_DEMO_RESET
Remove-Item Env:DEMO_RESET_DATABASE
```

Replace ledgermind if the disposable database has another name. Ordinary starts do not seed. Opt-in container seeding also requires both confirmations, and seed failure stops startup.

After seeding, the demonstration accounts are admin@ledgermind.dev, finance@ledgermind.dev, and viewer@ledgermind.dev, with password demo1234. Run reconciliation to generate exceptions; the seed supplies source records.

## Start the application

Run each command in its own terminal:

```powershell
npm run dev:backend
npm run dev:frontend
```

| Service | Default address |
| --- | --- |
| Frontend / login | http://localhost:3000 / http://localhost:3000/login |
| Backend | http://localhost:3001/api/v1 |
| Liveness | http://localhost:3001/api/v1/health |
| Swagger, when enabled | http://localhost:3001/api |
| PostgreSQL / Redis host ports | 127.0.0.1:5432 / 127.0.0.1:6380 |

Browser API defaults to /api. Next.js rewrites through server-only API_UPSTREAM_URL, defaulting to http://localhost:3001/api/v1. Compose builds the upstream as http://backend:3001/api/v1. Public Next.js values are embedded at build time; restart/rebuild after configuration changes as appropriate.

Alternatively, docker compose up --build runs all services. Avoid binding the same ports with local processes. The backend entrypoint synchronizes the schema without resetting data; review changes before starting it against an existing database. docker compose down stops the stack; adding -v removes the database volume and is a destructive operation.

## Backend commands and configuration

| Command from root | Purpose |
| --- | --- |
| npm run lint:backend | TypeScript check. |
| npm run build:backend | Compile ESM backend and check dist/main.js syntax. |
| npm run test:backend | Run unit tests without database reset. |
| npm run npm -- run prisma:generate -w backend | Generate Prisma client. |
| npm run npm -- run generate:bank-data -w backend | Add fixed synthetic order/payment fixtures for the first merchant in the selected database. Despite its name, this command does not insert bank rows or exceptions. |

Database E2E commands are separate and require the isolation guard documented in [testing](testing.md#postgresql-and-redis). Backend compiled relative imports use explicit .js suffixes.

The fixture command uses fixed provider IDs and does not offer a merchant selector. Use it only in a dedicated demo database; it is separate from the BankDataGenerator class exercised by the SQL verification suite. Neither is a live bank integration.

## Optional Groq setup

Set AI_ENABLED=true, a private GROQ_API_KEY, and optionally AI_MODEL in backend/.env for local commands or root .env for Compose. The endpoint is https://api.groq.com/openai/v1; application and Compose default to llama-3.3-70b-versatile.

```powershell
npm run verify:providers -- groq
npm run verify:providers -- groq --compose
```

These commands make real synthetic provider requests. They check model lookup, a completion, and a forced read-only tool call without printing keys. HTTP 401 is reported as INVALID_OR_REVOKED_KEY. Replace a rejected key privately, keep local/Compose configuration consistent, and restart the API after changes.

After startup, sign in, run reconciliation as FINANCE or ADMIN, and open an exception. A successful health response only proves the process is running; login, a completed run, and saved analysis/audit results check different parts of the setup.

Disabled/unavailable AI returns an auditable fallback. See the [AI specification](../specifications/ai-agent.md) for analysis behavior and [provider checks](testing.md#optional-provider-checks) for probe settings and scope.

## Updating an existing learning database

The retained [20261022 SQL upgrade](../../backend/prisma/upgrades/20261022_correctness.sql) is a reviewed one-time change for the inspected pre-correction schema. Do not rerun it on an upgraded database or assume it matches another schema.

1. Stop old API/workers so incompatible executors do not run during the upgrade.
2. Confirm the intended connection privately and back up records that must survive.
3. Restore the backup into a separate database and rehearse the exact reviewed SQL there.
4. Generate/review a diff for any different source schema. Apply reviewed SQL with stop-on-error in one transaction.
5. Check the resulting schema and legacy row/column values before resuming work.

Do not use reset or --accept-data-loss to bypass schema warnings. New disposable databases can use db push; retained data needs a reviewed/rehearsed upgrade.

The retained script adds 19 columns, two enum values, two tables, three indexes, and four foreign keys. Its current SHA-256 is 95bbca49ef104060d3f9379bb7af99835e8b57bd0a8030bd06c05aa2e9fa644a. The script rehearsed/applied on 22 October had SHA-256 079c814f40f74183f509eaa656039db96478412a22f3338ef8985d7631f145f6; commit preparation removed one extra blank line at EOF without changing executable SQL. The configured local database was upgraded after backup/rehearsal on 22 October 2026, with legacy values preserved. Private backup and preservation files remain under ignored .local-backups/schema-upgrade-2026-10-22T05-07-30-498Z. This is a historical record, not a statement about another database's current schema.

### Review existing facts

- Import settlement membership from evidence; never infer allocations from equal amounts.
- Historical actions without executionProtocol=v2 are not automatically submitted. Review pending/approved/executing rows before reproposing or assigning outcomes.
- Stop old executors before relying on new claim-token fencing. Unknown submitted outcomes require provider verification.
- Legacy links with null targetOrderId remain protected through stored parameters/parent relations. A resolved parent alone does not permit replacement.
- Historical run snapshot defaults may be zero; run a fresh full reconciliation for meaningful coverage.
- Review failed/expired webhooks through authorized retry rather than editing their state directly.

Start with PAYMENT_EXECUTION_MODE=disabled while reviewing historical intents. Verify login, reconciliation, approvals, uncertain outcomes, and audit before resuming experiments.

The built-in provider-outcome lookup requires provider_test mode and matching test credentials. It cannot verify simulated operations or query the provider while execution mode is disabled. Review an uncertain operation's identity before changing mode; switching modes alone does not resolve it.
