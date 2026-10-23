# Security boundaries and current controls

This guide describes the learning application's implemented boundaries and known limits. It is not a compliance assessment. Shared financial rules are in the [behavior contract](../architecture/behavior-contract.md), route contracts in the [API reference](api.md), and tested cases in [verification](../operations/fix-verification.md).

## Authentication and roles

Protected application routes use JWT authentication. Login, signed-provider webhook reception, and liveness health are public. Swagger can be separately exposed when enabled. There is no self-registration, SSO, refresh-token, or invitation service.

Passwords are verified against bcrypt hashes; hashes are not returned in login responses. JWT_SECRET must be configured with at least 32 characters. The browser stores its bearer token in localStorage; this is the current learning implementation, not an HttpOnly-cookie session design.

| Role | Domain permissions |
| --- | --- |
| VIEWER | Read scoped data and use authenticated investigation/chat surfaces; cannot submit action mutations. |
| FINANCE | Scoped investigation, proposal submission, run/allocation/retry operations, and rejection of pending actions. |
| ADMIN | Same merchant scope plus required approvals and provider-outcome verification. |

Server authorization is authoritative. Hiding a button is not a security control, and ADMIN does not grant access to another merchant.

## Merchant and target isolation

Queries derive merchant identity from authenticated context. Services validate direct and nested relationships before returning records or acting on them. Internal UUIDs and provider IDs are separate identifiers and must be resolved deliberately.

Financial eligibility includes current captured/collectible state, INR, positive safe integer paise, related target, and available shared capacity. Policy approval alone does not prove target eligibility.

## Webhook trust boundary

HMAC-SHA256 is verified over original request bytes. The signature helper accepts a complete 64-digit hexadecimal digest before constant-time comparison. Invalid or malformed inputs remain diagnostics and cannot ingest financial records.

Verified new entities require trusted merchant account mapping or an existing scoped relationship. Delivery/event identity or a body-hash fallback deduplicates work. An invalid signature cannot reserve the valid event identity; duplicates preserve original processing state.

Durable event intent, owned leases, monotonic state updates, bounded attempts, and authorized manual retry complement signature verification. A unique key alone does not establish eventual or exactly-once processing. Read the acknowledgement body: HTTP 200 can contain accepted, ignored, or rejected status.

## Action authorization and recovery

AI returns proposals; an authenticated operator submits them through the Action Engine. The [monetary approval table](../product/prd.md#actions-and-approval-defaults) applies to refunds and payment links. Requesters cannot approve themselves, and one ADMIN cannot supply two votes.

Canonical server-generated keys support authorized replay; no Idempotency-Key HTTP header is implemented. Changing a reason creates a different action without bypassing reservations or order-level link protection.

Claims, leases, row locks, current-parent checks, and a durable submission marker protect execution. Unsubmitted invalid work becomes known nonexecution. Submitted uncertain work remains OUTCOME_UNKNOWN with reserved/protective state until an existing operation is confirmed. ADMIN provider lookup requires provider_test mode and reads an existing operation; it does not submit another financial operation. Simulation and disabled mode cannot use that provider lookup.

Late results preserve terminal exception decisions; reconciliation evaluates financial clearance independently. Required audit guarantees are described under [audit and operational limits](#audit-and-operational-limits).

## AI and untrusted text

Provider keys remain server-side. Runtime tool allow-lists, scoped lookups, argument schemas, and structured output validation constrain model interactions. Financial descriptions, names, metadata, and snapshots remain untrusted data even when included in a prompt.

A synthetic prompt-injection fixture is a learning test, not proof of general resistance. Model confidence is advisory and never authorizes an action. The [AI specification](ai-agent.md) defines proposal-only tools and required fallback/audit behavior.

## API, browser, and network controls

| Control | Current behavior / limit |
| --- | --- |
| Validation | Global transform/whitelist DTO validation plus domain checks for identifiers, enums, ranges, amounts, and relationships. |
| Body size | JSON parser limit is 100 KB; browser chat uses a lower 90 KB encoded budget. |
| CORS | Configured frontend origin; production configuration requires FRONTEND_URL. |
| Proxy trust | false by default; configure actual trusted hops/addresses only. |
| Rate limiting | Redis-backed controls; current storage fails open on Redis outage. |
| Backend headers | Helmet middleware. |
| Frontend headers | HSTS, SAMEORIGIN, nosniff, origin-when-cross-origin referrer policy, and restricted camera/microphone/geolocation permissions. |
| CSP | No application-specific CSP or report-only CSP is configured. |
| Containers | Application processes run as unprivileged users; this does not establish complete container isolation. |
| Compose ports | Database/cache publish on loopback; frontend/backend exposure depends on host/ingress configuration. |

Redis failure preserves availability but weakens brute-force/cost controls during the outage. Forwarded headers are not trusted by default. Frontend headers do not configure TLS by themselves.

## Secrets and data handling

Keep database credentials, JWT secrets, Razorpay credentials/webhook secret, and Groq keys out of source, browser variables, logs, and chat. Tracked templates contain placeholders; private .env files and backups are ignored by Git/Docker contexts.

Use only the information required for the learning case. Do not store raw card numbers, CVVs, PINs, or unnecessary payment credentials. TLS, managed encryption at rest, backup protection, and any field-level encryption depend on the selected infrastructure; local synthetic fixtures do not establish those controls.

## Audit and operational limits

Required AI/action audit writes are transactional. The application exposes audit records, but does not provide a cryptographically tamper-evident chain, universal correlation, complete audit coverage for every possible state change, or independently enforced append-only database access.

Monitor failed login, rejected signatures, authorization errors, exhausted work, repeated provider failures, and unexpected policy outcomes as learning exercises. Dedicated alerting and a dead-letter operations dashboard are optional extensions.

Ordinary restarts preserve data. Explicit seed/reset and database test guards reduce accidental fixture deletion; they do not replace target review and retained backups. Follow [local setup](../operations/local-development.md) and [testing](../operations/testing.md) for those workflows.
