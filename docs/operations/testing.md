# Testing and maintenance

This guide describes repeatable checks and their scope. Completed results and dates belong in the [verification record](fix-verification.md). Commands run from the repository root unless stated otherwise.

Complete the [local setup](local-development.md), including dependency installation and Prisma client generation, first. Start with offline checks; use separate disposable services for database suites. Provider checks are optional and make real test requests.

## Offline/type/build checks

```powershell
python scripts/check_docs.py
npm run node -- scripts/verify-contracts.cjs
npm run node -- scripts/verify-tooling.cjs
npm run lint:backend
npm run lint:frontend
npm run build:backend
npm run test:backend
npm run build:frontend
```

Lint commands run TypeScript checks. Unit tests use Jest ESM in-band and do not reset a database. Frontend builds use webpack consistently; no Turbopack verification is implied. Root commands select the configured project runtime and forward arguments after -- to the workspace script.

Run memory-intensive builds and suites sequentially on constrained hosts. A worker-spawn or memory failure is different from an application assertion failure; record it and rerun only the affected check after resolving the environment issue.

## PostgreSQL and Redis

Use a new disposable PostgreSQL database on loopback and a separate Redis instance. Do not use the normal learning database. Before any guarded suite:

| Variable | Requirement |
| --- | --- |
| NODE_ENV | test |
| TEST_ALLOW_DATABASE_RESET | true |
| DATABASE_URL | Explicit localhost, 127.0.0.1, or [::1] connection to `ledgermind_test` or, for example, `ledgermind_test_review1`. A suffix may contain only letters and digits. |
| AI_ENABLED | false |
| PAYMENT_EXECUTION_MODE | disabled, with provider methods stubbed where a suite exercises actions. |
| REDIS_HOST / REDIS_PORT | The isolated test instance. |
| TEST_REDIS_PORT | The dedicated Redis port used by verify-fixes.mjs. The documented combined run uses 56383, which verify-http.mjs also expects. Unlike the database guard, this variable does not itself prove Redis isolation. |

Provision the current Prisma schema on that disposable target and build the backend before running compiled-service checks. The guard runs before destructive E2E fixtures import. The operator owns database/Redis creation and teardown; these commands do not provision a safe target automatically.

| Command | Scope |
| --- | --- |
| npm run npm -- run test:e2e -w backend | HTTP/security/webhook suites; may delete test records and start workers. |
| npm run node -- scripts/verify-fixes.mjs | 19 PostgreSQL/Redis scenarios for reservations, approvals, rollback, dispatch, ingestion, lifecycle, scope, batches, AI audit, and recovery. |
| npm run node -- scripts/review-fixes.mjs | R1-R6 stale-owner/recovery schedules, shared refund state, matching, exposure, and order-level link protection. |
| npm run node -- scripts/review-lifecycle.mjs | 15 R8 lifecycle schedules, including confirmed lock waits, active-state controls, and audit failure/retry. |
| npm run node -- scripts/review-quality.mjs | Five expanded Q1-Q5 acceptance groups, including after-claim terminal parents and inactive-link replacement. |
| npm run node -- scripts/verify-http.mjs | Real compiled API/throttler, selected infrastructure configuration, authentication, fallback audit, and malformed webhook boundaries. |

verify-http.mjs uses Redis port 56383 and API port 3108; keep them available for the isolated run. The Jest HTTP suites use a compatibility shim for one ESM/CJS throttler import, while native HTTP checks exercise the real module. These are complementary checks.

## Container packaging

Build from the root using the canonical workspace lockfile:

```powershell
docker build -f backend/Dockerfile -t ledgermind-fix-verification-backend .
docker build -f frontend/Dockerfile -t ledgermind-fix-verification-frontend .
npm run node -- scripts/verify-containers.mjs
```

The smoke creates uniquely named/labeled PostgreSQL, Redis, backend, and frontend containers on a private network. It checks fresh schema startup, canonical frontend API proxying, and synthetic merchant/audit records surviving a backend restart. Finally it removes its own containers, anonymous volumes, and network, without using normal Compose volumes or host-published ports.

Docker access and pullable/cached base images are required. The production backend build disables incremental-emission reuse and verifies dist/main.js; Docker excludes nested outputs and metadata. Shell entrypoints use LF line endings.

## Browser checks

frontend/e2e uses synthetic intercepted API responses. Tests require visible fixtures and actual requests/outcomes; they do not require a seeded backend or real provider.

```powershell
npm run npm -- run test:e2e -w frontend -- --workers=1 --retries=0
```

Playwright normally starts the frontend development server. For an existing production server, set PLAYWRIGHT_BASE_URL and PLAYWRIGHT_EXTERNAL_SERVER=true; set PLAYWRIGHT_CHANNEL=msedge when using installed Edge. CI prepares a standalone production server after building. The configuration defaults to two retries in CI and zero locally; the explicit --retries=0 above reproduces the recorded no-retry acceptance setting.

Build/test with NEXT_PUBLIC_API_URL=/api and again with /api/v1 to verify fixture normalization. This matrix checks intercepted browser requests; the container smoke separately verifies the real canonical /api-to-/api/v1 proxy.

Cases cover server filtering, selected refund target, timeout/retry, stale entity/proposal responses, exact large paise, failed reads/run feedback, login feedback, FINANCE rejection, freshness, unavailable tool metadata, and ADMIN refresh of a completed payment link. Use one worker and zero retries when collecting the documented acceptance result. review-browser.cjs selects the R7 pending-proposal/entity-switch case.

## Optional provider checks

These commands contact external providers and are separate from deterministic regression gates:

```powershell
npm run verify:providers -- razorpay
npm run verify:providers -- groq
```

By default they read backend/.env privately; --compose selects root .env. Output is sanitized and failures return nonzero. Razorpay requires test credentials and reads payment/refund collections. Groq checks model lookup, synthetic completion, and a forced tool call. Groq probes allow 512 completion tokens, including reasoning, with low reasoning effort for gpt-oss. SDK probes have a 90-second overall deadline. They do not edit private configuration.

### Opt-in Action Engine payment-link test

Build the backend and provision a fresh guarded loopback test database before running:

```powershell
$env:PROVIDER_TEST_ALLOW_LINK = 'true'
npm run node -- scripts/verify-provider-action.mjs
Remove-Item Env:PROVIDER_TEST_ALLOW_LINK
```

The script selects provider_test within its process, requires rzp_test_ credentials, and creates a 100-paise link through the Action Engine. It verifies identity, amount, and audit, cancels the link, and confirms cancellation. It does not supply an email/phone, seed/reset a database, or execute a refund.

An ignored .runtime/provider-probes record stores the operation reference before submission and its returned provider ID. Cleanup cancels only a link matching that identity/amount. An uncertain timeout or cleanup failure requires inspecting the saved test reference before retrying; do not blindly create another operation. The operator owns the disposable database lifecycle.

## Dependency maintenance

The root lockfile is canonical. Use clean strict-peer installs, the real coverage-tooling check, and relevant tests/builds when changing dependencies:

```powershell
npm run npm -- ci
npm run npm -- audit --audit-level=low
npm run node -- scripts/verify-tooling.cjs
```

Two dependency corrections are recorded as of 24 October 2026:

- The root owns @istanbuljs/load-nyc-config 1.1.0 and scopes js-yaml ^4.1.1 to that loader. The lock selects js-yaml 4.3.2 and argparse 2.0.1, removing the sprintf-js chain without downgrading Jest/ts-jest or suppressing advisories.
- The frontend pins Next.js 16.4.1 after 16.4.0 was flagged during verification. Both prefix builds/browser suites and clean Docker builds passed with the updated lockfile. The full audit at that time reported zero vulnerabilities; this is a dated result, not a claim about future advisories.

verify-tooling.cjs resolves the actual Babel coverage loader, checks the selected YAML major and absent vulnerable chain, and exercises YAML inheritance/options. Installation or audit alone is insufficient evidence of tooling compatibility. The loader uses yaml.load; see its [published source](https://github.com/istanbuljs/load-nyc-config/blob/v1.1.0/index.js) and the [YAML migration guide](https://github.com/nodeca/js-yaml/blob/4.1.0/migrate_v3_to_v4.md).

The Next.js maintainer advisories are [typed-array cache RCE](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr), [SVG optimization RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), and [Server Action denial of service](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r). Recording the dependency update does not establish that every exploit prerequisite existed in this application.

## Documentation maintenance

python scripts/check_docs.py uses the standard library and performs offline checks. It reads repository source and documents without starting services, reading private environment files, or contacting providers.

| Check | What it verifies |
| --- | --- |
| Markdown and links | Balanced fences, existing local files/assets, and heading references. |
| Examples | Valid fenced JSON and known npm scripts. |
| Mermaid | Supported declarations, balanced sequence groups, and current ER model/column names. |
| Storage | All 17 model field/type/column/nullability tables agree with Prisma. |
| AI/API catalogue | Documented tool names match AI_TOOLS and registered routes occur in the API reference. |

The checker does not render diagrams, verify external URLs, execute examples, or prove runtime correctness. Manually compare wire shapes, monetary units, approval boundaries, date scope, failure boundaries, environment locations, and evidence claims when code changes.

Maintain one current interface reference per topic. Label historical discovery and optional targets explicitly. Update the behavior contract, relevant API/schema/product guide, tests, and dated verification record together.

## Error handling and troubleshooting

| Symptom / boundary | Expected behavior and response |
| --- | --- |
| Bad login or invalid input | Return a controlled client error; keep relevant inline feedback. |
| Invalid/malformed webhook signature | Preserve diagnostic evidence and return the rejected acknowledgement body; do not ingest financial records. |
| Queue unavailable after durable webhook persistence | Keep dispatch intent so recovery can enqueue later. |
| Worker failure or lease expiry | Retain failure state and retry within the shared attempt limit; exhausted work stays visible for authorized retry. |
| Reconciliation rollback | Persist a FAILED run separately; do not report successful completion or clear unevaluated exceptions. |
| AI unavailable or malformed output | Return an explicit auditable fallback. Required audit failure must remain visible. |
| Known action nonexecution | Persist the confirmed failure without pretending a provider outcome is unknown. |
| Submitted outcome uncertain | Retain OUTCOME_UNKNOWN/protection and verify the existing operation before any new request. |
| Late action response | Preserve terminal exception decisions while retaining the action result and required audit. |
| Failed browser read | Show an error distinct from an empty successful collection. |
| Superseded request / timeout | Ignore stale results, stop loading, and permit a current retry. |
| Redis rate limiter unavailable | Current storage fails open; do not interpret availability as continued brute-force protection. |

Keep provider keys, database credentials, and unnecessary financial payloads out of troubleshooting logs. Operational extensions are tracked in [TODO.md](../../TODO.md).

## Limits

Mocks do not prove PostgreSQL rollback or competing-write behavior. Browser interception does not prove provider delivery. A successful test link does not prove real refund execution. Static documentation checks do not certify financial correctness. Record which checks actually ran, on which data/services, and when.
