# Fix verification record

Latest full application verification: **24 October 2026**. This record covers the documented cases for 58 original findings, R1-R11, and Q1-Q6. ID 44 was withdrawn and is not an application fix. The later fresh-install and hosted-CI follow-up is recorded separately below so earlier evidence is not attributed to a newer lockfile.

Start with [completed checks](#completed-checks), then use the [original finding matrix](#per-finding-closure), [R1-R11](#r1-r11-review-and-closure), or [Q1-Q6](#q1-q6-quality-review-and-closure) for the relevant case. The [testing guide](testing.md) describes repeatable commands; the [historical audit](full-code-audit-2026-10-21.md) preserves pre-fix observations.

## Completed checks

The codes in this table identify evidence from the completed baseline run used by the closure matrices below.

| Code | Completed result | Scope |
| --- | --- | --- |
| U | 174 backend unit tests in 13 suites passed with Babel coverage. | Domain, validation, AI, signature, and provider-mode cases using controlled dependencies. |
| E | 11 HTTP E2E tests passed. | Disposable loopback PostgreSQL/Redis; guarded destructive fixtures. |
| S | 19 maintained SQL/Redis scenarios passed. | Actual competing writes, rollback, reservations, ingestion, lifecycle, batches, and recovery; S numbers below refer to verify-fixes.mjs. |
| H | Native compiled-API HTTP checks passed, including seven malformed-webhook boundary cases. | Real controller/throttler, selected database/Redis configuration, authentication, validation, fallback audit, retained diagnostics, and unchanged financial counts. |
| B | 14 production-browser cases passed for /api and again for /api/v1: 28 checks, one worker, zero retries. | Synthetic intercepted API responses; both builds used Next.js 16.4.1. |
| C | Offline contracts, tooling, and documentation checks passed. | Exact paise, units, timestamps, bounded chat, validation, CSS alpha, YAML loader, links, catalogues, and diagram structure. |
| D | Both images built after clean strict-peer npm ci; startup/proxy/restart smoke passed. | Fresh isolated schema and synthetic merchant/audit sentinels; current installs each reported zero vulnerabilities. |
| R | R1-R6 recovery/ownership cases and all 15 R8 lifecycle scenarios passed. | Real PostgreSQL schedules with provider stubs, including confirmed lock waits and audit failure/retry. |
| Q | Five expanded Q1-Q5 acceptance groups passed. | Compiled services on isolated PostgreSQL; Q6 is covered by both browser-prefix runs. |

Both TypeScript checks, backend build, and both frontend webpack builds passed. The full npm audit on the patched lockfile reported zero vulnerabilities. Next.js was pinned to 16.4.1 after the 16.4.0 advisory check; the real coverage-tooling check still passed.

The disposable run is retained under ignored .runtime/quality-fix-20261023/3e2de772. summary.json records successful schema/SQL/HTTP/review groups and owned-service removal; browser-summary.json records both prefixes. Build, browser, audit, and container logs are retained alongside them.

## Verification environment

- Local project runtime: Node 22.23.4 with npm 10.9.9; Docker/CI use Node 22. Machine-wide Node was left unchanged.
- Database/Redis suites used guarded, task-owned synthetic services. No ordinary learning database was used for destructive tests.
- AI/provider methods were disabled or stubbed for the 24 October fix verification. No private environment edit, schema change, or real provider call was required for that follow-up.
- Browser checks used production builds and isolated Edge with intercepted API responses. Container smoke separately verified the real canonical API proxy.
- Both verification images installed from the canonical patched lockfile. Docker Desktop was started after its engine was found stopped; that infrastructure state was not treated as an application defect.
- Task-owned containers/networks were removed. Normal Compose resources, retained backups, and learning records were preserved.

## CI configuration

GitHub Actions runs backend units, offline contracts/tooling/docs, guarded HTTP E2E, Q1-Q5, R1-R6, R8, SQL/Redis invariants, native HTTP, both production browser prefixes, and a separate container startup/proxy/restart smoke. PostgreSQL readiness checks use TCP availability. Every workspace job installs from the root lockfile; browser matrix failures do not cancel the other prefix.

The first pushed baseline, ae9bff1, triggered [run 40027237587](https://github.com/sudhanshukumar03/ledgerMind/actions/runs/40027237587). Units and 14 /api browser cases passed, but CI failed: cross-workspace offline checks could not resolve TypeScript after a frontend-only install, and five-second E2E lifecycle hooks expired during worker shutdown and subsequent setup. The /api/v1 matrix job was cancelled. This was not a passing hosted run.

The follow-up installs all workspaces at the root, resolves shared checks through their owning workspace, gives application lifecycle hooks 30 seconds, and removes --forceExit. Request/assertion timeouts remain unchanged. Docker Hub credentials are still required in repository secrets.

### Fresh-install follow-up - 24 October 2026

Before the later dependency refresh, a new isolated local run passed 174 units, 11 HTTP E2E cases, all 19 SQL/Redis scenarios, R1-R6, all 15 R8 schedules, and five Q1-Q5 groups. Task-owned services were removed. Its first browser invocation selected the wrong configuration, and native HTTP cold startup exceeded the old harness grace; neither was counted as a pass.

After the four dependency patches described in [dependency maintenance](testing.md#dependency-maintenance), a clean strict-peer npm ci and Prisma generation passed. The resolved dependency tree was valid and the full audit reported zero vulnerabilities. Against that exact install, both TypeScript checks, 174 units, backend build, both frontend builds, offline contracts/tooling, and all 28 production-browser cases passed with one worker and zero retries. Logs are retained under ignored .runtime/recheck-20261024/final.

The local Linux image compiled successfully but failed during Docker export/unpack as the host encountered memory/paging pressure. Docker then became unavailable; other applications were not restarted. Container and database acceptance against the refreshed lockfile must be established by the follow-up hosted run before attributing those baseline results to it.

## Per-finding closure

Each row links an original finding to an implemented correction and its evidence category above. The original symptoms remain historical in the audit. Finding 44 is intentionally absent.

| ID | Implemented correction | Evidence |
| --- | --- | --- |
| 01 | Restarts do not seed; explicit reset requires two confirmations. | D restart sentinel; U reset/isolation guard |
| 02 | Disabled, simulation, and provider_test are explicit modes. | U gateway modes; H optional-provider startup; D |
| 03 | Verified duplicates preserve the original durable event. | S06; E webhook duplicate |
| 04 | Owned leases reclaim failed/expired processing work. | S07 |
| 05 | Persistent dispatch intent repairs missing Redis submission. | S06 with actual Redis |
| 06 | Trusted merchant ingestion upserts entities and deferred links. | S07–08 |
| 07 | Capture/refund history is monotonic; complete refund handlers. | S06–08, S18 |
| 08 | UUID display IDs and atomic stable detector identity. | S09, S12 competing/repeated runs |
| 09 | Facts refresh, clearance resolves, genuine recurrence reopens. | S09 |
| 10 | Explicit batch membership, net adjustments, refund evidence. | S14, S19; U reconciliation batches |
| 11 | Only eligible posted bank evidence; no unrelated reuse. | U bank eligibility/reuse and failed-payment links |
| 12 | Independent overdue deadlines precede missing-evidence flags. | U fresh/due orders and capture clearing deadline |
| 13 | Unpaid orders and refunded capture history are evaluated. | U order/capture eligibility |
| 14 | Capture sums handle legitimate splits and positive shortfall. | U split captures/underpayment/refunds |
| 15 | Date anchors retain related evidence outside the window. | S10 |
| 16 | Action acceptance cannot clear a discrepancy; related processed evidence required. | U pending/unrelated refunds and action completion; S09 |
| 17 | Unknown external outcomes stay reserved; read-only recovery. | S04, S18 |
| 18 | Payment lock and atomic reservations prevent overspending. | S01 competing requests/replay; S18 |
| 19 | Exact paise thresholds, distinct votes, requester exclusion. | U policy boundaries; S02 |
| 20 | Proxy trust defaults off; changing XFF cannot evade throttle. | H real Redis 429 with spoofed forwarding headers |
| 21 | INR required before financial comparison/action. | U currency rejection; E validation |
| 22 | Refund/debit conservation and unexplained posted movements. | U linked refund bank evidence; S13 generated scenarios |
| 23 | Shared UUID, enum, safe integer, pagination/date validation. | U pagination/validation; H invalid inputs; C |
| 24 | Generic responses preserve ISO Date and decimal BigInt. | C Date serialization |
| 25 | Coverage numerator/denominator share a completed run snapshot. | U metrics; S10; B dashboard 50% fixture |
| 26 | Investigation timeout cancels/settles loading and permits retry. | B timeout/retry |
| 27 | Entity request identity prevents stale details/analysis. | B slow previous drawer response; scoped hook implementation |
| 28 | Operator explicitly selects a related captured payment. | B selected payment payload/outcome; U target relation |
| 29 | Search runs server-side; cleared status requests all. | B server search/all-status |
| 30 | Methods use canonical lowercase filter values. | B transaction method request |
| 31 | 40 turns, 8,000 chars/turn, 90 KB encoded browser payload. | C Unicode/control-character byte budget; U chat limits |
| 32 | Tool JSON and per-request names/arguments validated in controlled boundary. | U malformed JSON/disallowed tool |
| 33 | Investigation includes refund tools, snapshots, trails, latest analysis. | S17; U tool catalogue/proposals |
| 34 | Validated config loads before Prisma imports and Redis creation. | H owned env-file Redis port plus explicit database; U config |
| 35 | Visible durable runs, failure records, overlapping request coalescing. | S12 |
| 36 | Launcher/setup reject ordinary or remote reset targets. | U test DB guard; E isolated loopback DB |
| 37 | Required AI audit is transactional; fallback attribution persists. | S17; U chat fallback/audit failure; H |
| 38 | Confidence must be integer 0..100 before persistence. | S17 fractional output fallback |
| 39 | Action/audit/intent commit together; recovery excludes legacy intents. | S03, S04, S16; U audit failure |
| 40 | Refund eligibility rechecked against captured state and balance. | S01, S15; U eligibility |
| 41 | Simulation IDs differ per operation and remain stable on replay. | U simulation identity |
| 42 | Links require related collectible orders and remaining balance. | S05; U target validation |
| 43 | Exact decimal paise avoids Number precision loss, including AI proposal cards. | C large/safe amounts; B exact transaction and AI proposal amounts |
| 45 | Failed run displays failure feedback. | B failed reconciliation request |
| 46 | FINANCE rejection UI is available; ADMIN-only approval remains. | B rejection outcome; S02 |
| 47 | Invalid login remains on form with inline message. | B login failure |
| 48 | Only valid PROCESSED allocated settlements contribute coverage. | U settlement eligibility/batch membership; S14 |
| 49 | Known bank reference conflicts exclude weak fallback matching. | U UTR/stored-link conflicts |
| 50 | Generator uses UUIDs in internal ID columns. | S13 writes all generator scenarios to PostgreSQL |
| 51 | One strict-peer workspace lock and root Docker contexts. | D both clean npm ci/builds; removed incompatible unused wrapper |
| 52 | Failed reads remain errors, distinct from empty collections. | B failed transaction/audit reads; source error states |
| 53 | Explicit money fields preserve counts as counts. | C count vs paise formatting |
| 54 | Theme alpha uses valid color-mix expressions. | C static contract; B computed header color |
| 55 | Browser tests require fixtures, requests, and actual outcomes. | B maintained unconditional browser tests |
| 56 | Counts, captured volume, coverage, and resolution labels match scope. | U metrics; S10; B labels |
| 57 | Server-only upstream includes /api/v1; browser default /api. | D frontend /api/health reaches backend /api/v1/health |
| 58 | Severity clamps to database Int without altering exact exposure. | S11 large-money persistence |
| 59 | Successful manual/SWR reads update freshness. | B manual page freshness |

## R1-R11 review and closure

These follow-ups exposed adjacent cases beyond the earlier acceptance fixtures. Their current results supplement the original matrix.

### Follow-up closure

| Review ID | Implemented correction | Acceptance evidence |
| --- | --- | --- |
| R1 | Recovery locks/re-reads current submission state. Every execution has a claim token; submission requires that token and an unexpired lease. Stale owners cannot submit, fail, or finalize a replacement claim. | Actual SQL controlled stale-read, expired-owner, and replacement-owner schedules passed; unit tests cover lost ownership and previously recorded submission. |
| R2 | Action finalization and webhook ingestion share the payment row lock; capture ingestion also locks before reading prior state. | Two synchronized 5,000 refunds for a 10,000 payment persist REFUNDED with a 10,000 refund total. |
| R3 | New disabled-mode monetary proposals fail before creating intent/reservation. Approved but unsubmitted work fails as known nonexecution if mode changes to disabled. | SQL verifies no phantom action; unit tests verify known FAILED without provider submission. |
| R4 | Resolve globally unique strong links before weak candidates. Weak candidates must be unique in both directions and cannot claim another known reference. | Matching passes in both iteration orders; ambiguous/conflicting candidates are refused in unit and controlled service tests. |
| R5 | One failed-payment draft sums all eligible credits and retains their evidence. | Actual SQL stores 10,000 exposure for 4,000 + 6,000 credits; unit checks one draft and both evidence/match rows. |
| R6 | Store targetOrderId and protect links across all merchant/order exceptions. Null legacy targets remain protected via parameters/parent identity. | SQL refuses the second link after partial collection and exception transition, both with new and legacy target rows. |
| R7 | Reset pending proposal state on entity change while retaining response generation guards. | The entity-switch regression verifies pending proposal -> switch -> old response, enabled new controls, and no stale success message. |
| R8 | An atomic conditional parent update permits only OPEN/INVESTIGATING. Late completion preserves RESOLVED/IGNORED metadata while recording the action result and a required preservation audit in the same transaction. | 15 PostgreSQL scenarios: two paused-provider schedules, six verified row-lock waits, six active-state positive controls, and audit failure/retry; four additional unit cases. |
| R9 | Validate a complete hexadecimal SHA-256 signature before byte comparison. Normalize malformed event metadata to unknown while retaining diagnostic payloads; non-object service input is wrapped as raw evidence. | 18 additional unit cases and seven native HTTP cases pass; invalid inputs return the intended rejection, verified unsupported input finishes UNSUPPORTED, and scoped financial counts stay unchanged. |
| R10 | AI proposal cards use the shared integer-paise formatter instead of floating-point division. | A production-browser test displays 9007199254740991 paise as INR 90071992547409.91 exactly. |
| R11 | Keep an unavailable tool count as null and display an explicit unavailable state; preserve reported zero counts. | A production-browser test forces the config request to fail and verifies unavailable feedback without an invented 14-tool count. |

### Controlled concurrency schedules

R1 pauses after claim commit and before the submission gate, allowing the test to replace ownership without deadlocking inside a held action lock. R8 confirms competing PostgreSQL lock waits before releasing terminal-state writes. These schedules exercise races directly; the table above records their outcomes.

## Q1-Q6 quality review and closure

The 22 October quality review reproduced five application edge cases and one fixture portability defect. All six were corrected and verified in the 24 October run.

| ID | Implemented correction | Completed acceptance |
| --- | --- | --- |
| Q1 | Require nonempty summary/likely_cause and supplied integer confidence. Both final-response paths classify empty/incomplete results as fallback. | Normal and forced-final tests cover null/blank/empty-object/missing-field/malformed/truncated/filtered output, plus valid concise answers and atomic audit attribution. |
| Q2 | Lock and re-read the existing exception before deriving lifecycle fields. | A real MARK_REVIEWED commits after the detector read; resumed reconciliation preserves INVESTIGATING. Existing recurrence and R8 lifecycle cases still pass. |
| Q3 | Dispatcher and worker share MAX_WEBHOOK_ATTEMPTS; the limit is in the atomic claim. | Attempt 21 is refused, attempt 20 can run once, another queued retry is a no-op, and authorized manual retry resets/requeues and permits attempt 1. |
| Q4 | ADMIN may refresh unknown or completed link evidence. Confirmed cancelled/expired links become known inactive FAILED actions, retaining provider result, creation timestamp and required audit. | Unknown/active protection, cancelled recovery, exactly one concurrent replacement, active completed refresh and expired completed refresh/replacement pass in PostgreSQL. Unit cases reject mismatched IDs; browser checks exercise ADMIN verification and the updated list. |
| Q5 | Lock/revalidate the parent at claim and again with ownership/lease at the transactional monetary submission boundary. | RESOLVED/IGNORED before claim and after claim/before submission produce known nonexecution with zero provider calls; OPEN/INVESTIGATING controls still execute. Prior stale-owner fencing and submitted-outcome recovery pass. |
| Q6 | Shared API URL normalization is used by the global fixture and overrides; CI has a two-prefix matrix. | All 14 browser cases pass for each prefix, one worker and zero retries: 28 checks. These test fixture matching; D separately verifies the real proxy. |

## Implementation phases

The original repairs were implemented in eight phases. All have acceptance evidence in this record; later R/Q cases strengthen their coverage rather than replacing the original IDs.

| Phase | Findings owned by this phase | Result and evidence |
| --- | --- | --- |
| 1. Configuration, explicit demo behavior, and isolation | 01, 02, 20, 34, 36, 41, 50, 51, 57 | Explicit execution/reset modes, isolated tests, runtime configuration, and reproducible installs. Evidence: U, H, D. |
| 2. Shared contracts and units | 21, 23, 24, 38, 43, 53, 54, 58 | Exact units, serialization, and bounded validation/storage. Evidence: U, C, S. |
| 3. Durable webhook ingestion | 03, 04, 05, 06, 07 | Durable dispatch, owned retries, trusted ingestion, and monotonic evidence. Evidence: U, E, S. |
| 4. Financial actions and approvals | 16, 17, 18, 19, 28, 39, 40, 42, 46 | Eligible targets, conserved capacity, distinct approvals, audit, and outcome recovery. Evidence: U, S, R. |
| 5. Reconciliation and lifecycle | 08, 09, 10, 11, 12, 13, 14, 15, 22, 25, 35, 48, 49, 56 | Complete evidence, batch matching, scoped lifecycle, and truthful metrics. Evidence: U, S, R. |
| 6. AI evidence, validation, and audit | 31, 32, 33, 37 | Bounded model input, validated tools/output, evidence trails, and required audit. Evidence: U, H, S. |
| 7. UI request state and meaningful browser tests | 26, 27, 29, 30, 45, 47, 52, 55, 59 | Request ownership, filtering, exact display, and observable outcomes. Evidence: B, C. |
| 8. Integration, documentation, and closure | All active IDs | Build/package checks, integrated regressions, and documented closure. Evidence: completed-checks table above. |

## Runtime, provider, and database follow-ups

### Runtime and dependency work

The Windows runtime bootstrap verified the official Node archive checksum before installation. Root commands and child process resolution were checked on Node 22.23.4. The scoped YAML override removed the sprintf-js dependency chain without downgrading Jest/ts-jest; real loader/coverage checks passed. The later Next.js patch and dated audit result are described in [dependency maintenance](testing.md#dependency-maintenance).

### Optional provider evidence - 22 October 2026

Actual Razorpay test SDK reads authenticated successfully. A separate Action Engine test created a 100-paise link in a new disposable database, verified provider identity/amount/audit, cancelled that test-owned link, and confirmed cancellation. No captured test payment was available, so provider refund execution remains unverified.

An earlier Groq key was rejected with HTTP 401. A later valid root-file key was synchronized privately to the backend configuration, and model lookup, synthetic completion, and forced read-only tool-call checks passed from both configurations using openai/gpt-oss-120b. The smoke budget was increased to 512 completion tokens to accommodate reasoning. This is connectivity evidence, not an evaluation of investigation quality or a statement that current private credentials remain valid indefinitely.

These provider checks were separate from the stubbed/disabled fix regressions. Their repeatable scope is documented under [optional provider checks](testing.md#optional-provider-checks).

### Existing learning database - 22 October 2026

After explicit authorization, the configured learning database was backed up, restored separately, and upgraded using reviewed additive SQL rehearsed on that restore. An empty schema diff and fingerprints confirmed all 15 legacy rows across 15 original tables retained every original column value. Backup and preservation files remain in ignored .local-backups.

Subsequent schema/preservation rechecks were read-only on the normal database; destructive suites used disposable copies. Follow the [existing-database workflow](local-development.md#updating-an-existing-learning-database) for any other target. Do not infer that the one-time SQL matches another schema.

## Verification boundaries and remaining learning work

Passing these cases establishes their observed outcomes. Unit mocks do not prove every database interleaving, browser interception does not prove external delivery, and provider connectivity does not prove financial reconciliation correctness.

Earlier runs used smaller test totals as cases were added. Intermediate worker/engine/memory/teardown failures were not counted as passing checks. Application lifecycle and cold-start budgets were increased in the CI follow-up as recorded above; request/assertion deadlines and acceptance assertions were retained.

Optional learning work is tracked in [TODO.md](../../TODO.md).
