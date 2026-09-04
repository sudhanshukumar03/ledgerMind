# Development Roadmap

## Phase 1: Foundation (Days 1-2)
- [x] Set up repository and documentation skeleton
- [ ] Initialize NestJS backend project
- [ ] Initialize Next.js frontend project
- [ ] Set up Docker Compose with PostgreSQL, Redis, backend, frontend
- [ ] Configure Prisma with initial schema
- [ ] Implement authentication (JWT) with user roles

## Phase 2: Data Ingestion (Day 3)
- [ ] Implement Razorpay API client (using test mode)
- [ ] Implement synthetic bank data generator (CSV or API)
- [ ] Create webhook receiver endpoint with signature verification
- [ ] Set up BullMQ queue and worker for webhook processing
- [ ] Normalize incoming data into canonical transaction format

## Phase 3: Reconciliation Engine (Day 4)
- [ ] Implement matching logic (ID, UTR, amount, timestamp)
- [ ] Create reconciliation run manager
- [ ] Build exception engine with categories and severity scoring
- [ ] Store reconciliation results and exceptions in database

## Phase 4: AI Controller (Day 5)
- [ ] Integrate OpenAI API with function calling
- [ ] Define tools as NestJS service methods
- [ ] Build investigation prompt and parse JSON response
- [ ] Expose AI analysis via REST API
- [ ] Implement policy engine (approval thresholds)

## Phase 5: Action Engine & Audit (Day 6)
- [ ] Create action types (refund, mark reviewed, create payment link)
- [ ] Implement approval workflow (human-in-the-loop)
- [ ] Log all actions in audit log
- [ ] Execute mock Razorpay actions

## Phase 6: Frontend Dashboard (Day 7)
- [ ] Set up Next.js with Tailwind and shadcn/ui
- [ ] Build dashboard KPIs with Recharts
- [ ] Exception queue with filters
- [ ] Transaction investigation view
- [ ] AI chat/command center
- [ ] Approval modals

## Phase 7: Testing & Demo (Day 8)
- [ ] Write unit tests for reconciliation logic
- [ ] Integration tests for webhook flow
- [ ] End-to-end tests with Playwright
- [ ] Prepare demo script with synthetic exceptions
- [ ] Finalize Buildathon presentation

## Phase 8: Polish (Day 9-10)
- [ ] Improve UI/UX
- [ ] Add documentation for all APIs
- [ ] Security hardening
- [ ] Performance optimization
