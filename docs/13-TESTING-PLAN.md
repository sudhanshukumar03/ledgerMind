# Testing Plan

## 1. Unit Tests

### Backend
- **Normalization** – test conversion of Razorpay webhook payloads and bank CSV rows to canonical format.
- **Matching Logic** – test each matching level with sample data; verify scores.
- **Exception Generation** – given mismatched data, assert correct exception type and severity.
- **Policy Engine** – test approval thresholds.
- **Utility functions** – encryption, signature verification.

### Frontend
- Component tests for ExceptionCard, AIAnalysisPanel, etc.
- State management tests.

## 2. Integration Tests

- **Webhook Flow** – simulate Razorpay webhook → verify event stored, worker processes, DB updated, reconciliation triggered.
- **Reconciliation Run** – seed database with known transactions, trigger run, assert matches and exceptions.
- **AI Integration** – mock AI tool responses, test investigation endpoint returns structured analysis.
- **Action Approval** – create action, approve, verify Razorpay API called (mocked), audit log written.

## 3. End-to-End Tests

Use Playwright to simulate user journeys:
- Login → view dashboard → see exceptions.
- Click exception → view AI analysis → take action → approve.
- Use AI chat to query exceptions.

## 4. Synthetic Data Tests

Create a suite of scenarios (as described in problem statement) to test reconciliation accuracy:
- Normal transaction
- Payment missing
- Bank says paid but payment failed
- Settlement discrepancy
- Duplicate payment
- Refund stuck
- Settlement missing

For each, assert correct exception and AI explanation (if applicable).

## 5. Performance Testing

- Load test webhook endpoint with 1000 req/s using Artillery or k6.
- Measure reconciliation run time with 10k transactions.
- AI response latency < 2s for simple queries.

## 6. Security Testing

- Verify webhook signature validation rejects invalid signatures.
- Test role-based access: viewer cannot propose actions.
- Test API rate limiting.
- Check for SQL injection in filters.

## 7. AI Evaluation

- Create labeled dataset of 50 synthetic exceptions with known causes.
- Measure AI root-cause identification accuracy.
- Evaluate explanation quality manually (clarity, relevance).
- Check safety: AI should not recommend irreversible actions without approval.

## 8. Regression Testing

- Maintain test suite for critical flows (webhook, reconciliation, actions) run on every PR.

## 9. Buildathon Demo Testing

- Run through demo script at least 3 times to ensure no hiccups.
- Prepare fallback if API calls fail (mock mode).