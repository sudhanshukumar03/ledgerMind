# Learning backlog

This backlog separates completed tracked repairs from optional next exercises. Checked items refer to the dated acceptance cases in the [verification record](docs/operations/fix-verification.md).

## Completed tracked work

| Workstream | Historical IDs | Status |
| --- | --- | --- |
| Explicit simulation, configuration, startup preservation, and test isolation | 01-02, 20, 34, 36, 41, 50-51, 57 | Verified |
| Shared validation, timestamps, exact paise, presentation units, and severity bounds | 21, 23-24, 38, 43, 53-54, 58 | Verified |
| Durable webhook dispatch, duplicates, new entities, and monotonic states | 03-07 | Verified |
| Financial eligibility, approvals, reservations, audit, and outcome recovery | 16-19, 28, 39-40, 42, 46 | Verified |
| Reconciliation evidence, batches, lifecycle, scope, and metrics | 08-15, 22, 25, 35, 48-49, 56 | Verified |
| AI tool validation, evidence, bounded chat, and required auditing | 31-33, 37 | Verified |
| Browser request ownership, filtering, failure feedback, and freshness | 26-27, 29-30, 45, 47, 52, 55, 59 | Verified |

The stable historical IDs run from 01 through 59. ID 44 was a mistaken missing-audit-page observation and was withdrawn, leaving 58 findings. Its withdrawal is not an application fix.

- [x] Close R1-R11 ownership, refund-state, matching, lifecycle, webhook-input, and UI follow-ups.
- [x] Close Q1-Q6 AI-output, lifecycle-concurrency, retry-limit, inactive-link, stale-action, and browser-prefix follow-ups.
- [x] Verify the scoped coverage dependency correction and targeted Next.js 16.4.1 update.
- [x] Configure the project Node runtime and verify root command forwarding.
- [x] Back up, restore/rehearse, and apply the reviewed additive upgrade to the configured learning database; preserve legacy records.
- [x] Verify Docker startup, API proxying, and record preservation across restart.

## Optional next exercises

- [ ] Introduce a versioned migration history and rehearse upgrades from representative earlier schemas.
- [ ] Measure reconciliation and UI performance with documented hardware and synthetic data distributions.
- [ ] Build a dead-letter operations view for exhausted webhook events.
- [ ] Extend request/operation correlation across API, workers, provider evidence, and audit records.
- [ ] Add configurable policy settings with explicit authorization and audit requirements.
- [ ] Explore notifications and streaming updates while retaining truthful polling/error states.
- [ ] Design a bank adapter with explicit ingestion identity, ownership, and evidence provenance.
- [ ] Evaluate AI root-cause accuracy and explanation quality against labeled synthetic cases.
- [ ] Verify provider refund execution only when an appropriate captured test-payment fixture is available.

## How to complete an exercise

Explain the invariant, reproduce the failure with synthetic data, implement the change, and verify relevant normal, boundary, concurrent, delayed, and recovery cases. Use PostgreSQL/Redis integration checks for guarantees that mocks cannot establish. Update the [behavior contract](docs/architecture/behavior-contract.md), relevant interface reference, and verification evidence together.
