# User Flows

This document describes the primary journeys of different user types interacting with LedgerMind.

## 1. Merchant Onboarding & Login

1. Merchant visits the application URL.
2. If no account exists, they register with email and password.
3. After registration or existing login, the system redirects to the dashboard.
4. Dashboard displays an overview of reconciliation health.

## 2. Viewing the Exception Queue

1. From the sidebar, user clicks **Exceptions**.
2. System loads a paginated list sorted by severity and recency.
3. User applies filters (type, severity, status, date range).
4. User clicks an exception row to open the detail view.

## 3. Investigating an Exception

1. User selects an exception (e.g., `EXC-1024`).
2. Exception detail view loads with:
   - Transaction graph (Order → Payment → Bank → Settlement)
   - AI analysis panel (likely cause, confidence, exposure, recommendation)
   - Event timeline
3. User reviews the AI explanation.
4. Optionally, user clicks **Investigate with AI** to trigger a deeper analysis.
5. AI returns additional evidence or asks clarifying questions.

## 4. Taking Action on an Exception

1. AI recommends an action (e.g., “Verify and mark as captured”).
2. User clicks **Take Action**.
3. A modal appears showing action details and required approval level.
4. If the amount is below the auto‑approval threshold:
   - Action executes immediately (if user has permission).
5. If approval is required:
   - User submits the action for approval.
   - Approver (could be same user if Admin) reviews and approves/rejects.
6. Upon approval, the Action Engine calls Razorpay API (or mock).
7. Result is logged; exception status updates automatically if resolved.

## 5. Using the AI Command Center (Chat)

1. User opens the AI chat panel from the top bar.
2. Types a query: “Show me all high‑value unresolved payment mismatches.”
3. AI fetches relevant exceptions and summarizes them.
4. User asks follow‑up: “Investigate the ₹1.2L one.”
5. AI performs the investigation and presents the result in chat.
6. User can click a suggested action button directly in the chat.

## 6. Viewing Reconciliation Runs

1. User navigates to **Reconciliation**.
2. Sees a list of runs with status (in progress, completed, failed).
3. Clicks a run to view detailed matches and exceptions for that run.

## 7. Handling a Webhook Event (Automated)

1. Razorpay sends a webhook (e.g., `payment.captured`).
2. System verifies signature and stores the raw event.
3. Background worker processes the event, updates payment status.
4. Reconciliation engine automatically runs for the affected merchant/order.
5. If a mismatch is found, an exception is created and AI analysis is scheduled.
6. The dashboard updates in real time (via polling or WebSocket).

## 8. Approving a High‑Value Refund

1. User (approver) receives a notification about a pending approval.
2. Opens the **Approvals** queue.
3. Reviews refund details, reason, AI recommendation, and policy result.
4. Approves or rejects.
5. If approved, the Action Engine executes the refund via Razorpay API.
6. The action is logged in the audit trail.

## 9. Admin Configuring Policies (Future)

1. Admin navigates to **Settings → Policies**.
2. Sets approval thresholds (e.g., auto‑approve below ₹1,000).
3. Defines dual approval for amounts above ₹50,000.
4. Changes take effect immediately for new actions.
