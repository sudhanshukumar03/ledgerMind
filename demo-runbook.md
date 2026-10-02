wc -l scripts/generate-bank-data.ts

docker-compose up -d postgres redis
cd backend && npm run prisma:reset && npm run seed

npm run prisma:reset -w backend 
npm run seed -w backend


# LedgerMind — Demo Video Runbook

Target length **5:00**. Two parts: the pre-flight you run before touching the record button, and the beat-by-beat script with narration and click cues.

Budget note: 5 minutes of comfortable narration is roughly **650–700 words**. The script below is written to that. If you find yourself rushing, cut the architecture aside at 4:20 — never cut the approval beat.

---

## Part 1 — Pre-flight

### The one blocker to clear first

```bash
wc -l scripts/generate-bank-data.ts
```

If that returns `0`, **stop and fix it before anything else.** That script is what injects the bank records that disagree with the gateway. Without it there is no mismatch, no exception, and nothing to investigate on camera — the entire middle three minutes of this video don't exist. Everything below assumes it works.

### Clean-state reset (run this between every take)

```bash
docker-compose up -d postgres redis
cd backend && npm run prisma:reset && npm run seed
```

`prisma:reset` is destructive and that's the point — it's what makes takes repeatable. The seed deliberately creates **no exceptions**, so a fresh reset always lands you on a healthy dashboard. Save this as a one-liner you can paste between takes without thinking:

```bash
npm run prisma:reset -w backend && npm run seed -w backend
```

### Rehearse before you record

Run the full flow **three times end to end** before the first take, and at least twice more after. This isn't polish, it's data collection — you need to know how long the AI investigation actually takes so you can plan narration over it. Time it:

```
Investigation latency: ______ seconds
```

Under 8 seconds, talk through it live. Over 8, you have two options: narrate the tool-call indicators as they appear (better — it shows the work), or cut on the click and resume on the result. Decide now, not on camera. With Groq behind it you should land well under that — its inference speed is a real demo asset, so plan to narrate live and let the judges watch the analysis come back almost immediately. Time it anyway: on Groq the risk isn't latency, it's a rate limit.

### Two browser profiles, logged in ahead of time

The approval beat needs two roles: `FINANCE` proposes, `ADMIN` approves. Do **not** log out on camera — it wastes fifteen seconds and looks like dead air.

| Window | Profile | Role | Parked on |
| --- | --- | --- | --- |
| A | Chrome profile 1 | `FINANCE` | `/dashboard` |
| B | Chrome profile 2 (or incognito) | `ADMIN` | `/actions` |

Log both in **before** you start recording. Login is throttled to **5 requests per minute**, so a fumbled password on camera can lock you out mid-take.

### Screen setup

- **Resolution 1920×1080**, browser zoom **110–125%**. Judges watch on laptops; default zoom makes a dense table unreadable.
- Terminal font bumped to ~18pt for the same reason.
- Hide the bookmarks bar. Close every other tab.
- **Do Not Disturb on**, Slack and mail quit. One notification toast ruins a take.
- **Never show `.env` on camera** — your `GROQ_API_KEY` and `RAZORPAY_KEY_SECRET` are in it.
- Don't film the seeded passwords either. Have both windows pre-authenticated.
- Sanity check one visual detail: money columns should be aligned via `tabular-nums`. Misaligned rupee figures are the first thing a finance-literate judge notices.

### Recording tool (Windows)

Simplest path, already installed:

- **Win + Alt + R** starts and stops recording the focused window (Xbox Game Bar). Output lands in `Videos\Captures`.
- **Win + G** opens the overlay to check the mic level first.

Caveat: Game Bar records a single window, so it will not follow you between the browser and the terminal. If your script crosses windows — and this one does — use **OBS Studio** instead with a Display Capture source. Free, and it gives you scene switching so the terminal beat is one click away.

**Record in segments.** Five minutes in one take with a live model call in the middle is a coin flip. Record each beat separately, reset between them, and stitch. Nobody can tell, and you stop losing four good minutes to one stumble at 4:30.

### Don't click these

Three things in the UI are decorative, and clicking them on camera turns a strength into a visible gap: the **⌘K search** (no palette wired), the **pagination controls** (no handler), and the **Notes tab** (no persistence endpoint). Also avoid opening the action-type dropdown unless you've confirmed it matches the backend enum — a judge who sees `CREATE_PAYMENT_LINK` listed and cut will ask about it.

---

## Part 2 — The script

The demo spine: a **₹50,000 payment the gateway marked `FAILED`**, while the bank shows a **₹50,000 credit under `UTR-DEMO-001`**. The money arrived. The system says it didn't.

Narration is written to be spoken from inside the job, not about the product. Resist the urge to name features — let the screen do that.

---

### 0:00 – 0:30 · Cold open

**Screen:** Terminal, split or side by side — the bank statement line next to the gateway's record for the same payment. No dashboard yet.

> "A customer emails you on Friday morning. They were charged ₹50,000, and their order still says unpaid.
>
> So you check. The gateway says the payment **failed**. The bank statement says ₹50,000 landed in your account at 11:42 that morning, under a UTR you've never seen.
>
> Both of those are true. Somebody has to work out which one is wrong, and right now that somebody is you, with six tabs open, for the fourth time this week."

**Why this open:** you've put the judge inside the problem before showing them a single button. A demo that opens on a dashboard is asking them to care about software; this one asks them to care about a missing ₹50,000.

---

### 0:30 – 0:50 · The baseline

**Screen:** Window A, `/dashboard`. Healthy — KPI row green, reconciliation rate high, *Needs Attention* empty.

> "This is the same books, reconciled. Volume, reconciliation rate, open exceptions — none. Every order, payment, refund, settlement and bank line agrees with every other one.
>
> That empty queue is the whole product. Let's break it."

Pause a beat on the empty queue. It has to register as *normal* now, or the exception won't land later.

---

### 0:50 – 1:15 · Inject reality

**Screen:** Cut to terminal.

```bash
npm run generate:bank-data
```

> "Real bank feeds don't agree with your payment gateway. Settlements land short. Payments get captured twice. A charge fails on the gateway and clears at the bank anyway.
>
> This writes exactly that kind of disagreement into the bank records — the same mess you'd get on any ordinary Tuesday."

**Screen:** Back to Window A → `/reconciliation` → click **Run Reconciliation**.

> "And this is reconciliation. Not a model — plain deterministic code. Exact IDs first, then UTR, then amount and timestamp, all in integer paise. It either matches or it doesn't, and it can show you why."

---

### 1:15 – 1:45 · The exception surfaces

**Screen:** Back to `/dashboard`. Within one 3-second poll, *Needs Attention* populates. Let it appear on camera — don't cut to it.

> "Four seconds. Top of the queue: **critical**, ₹50,000 of exposure, `BANK_PAYMENT_MISMATCH`.
>
> That's our customer. The engine didn't guess — it found a bank credit with no payment behind it and refused to explain it away."

Hover the severity badge. Colour in this interface only ever means severity, so the eye goes to the ₹50,000 before you say the number.

---

### 1:45 – 2:45 · Investigate

**Screen:** Click into `/exceptions/:id`. Graph left, timeline below, AI panel right. Click **Investigate**.

> "Finding it was the easy part. Explaining it is where your afternoon used to go.
>
> So it investigates. Fourteen read-only tools, every one scoped to this merchant — it pulls the order, the payment, the settlement, the bank line, and the timeline in financial-event order, not row-insert order."

**As tool-call indicators appear**, name them as they land. This is the most convincing twenty seconds in the video — the judge watches it gather evidence rather than being told it did.

**On the result:**

> "Root cause: the gateway recorded a capture failure after the funds had already moved. Confidence, and the evidence it used — every record it read, and nothing it didn't.
>
> One detail worth pointing out. That bank description contains text shaped like an instruction, sitting in the data on purpose. It read it as a description, because that's what it is. Untrusted fields are data here, never instructions."

**Optional, only if you're ahead of time:** `/ai-controller`, one natural-language question over the same ledger. Cut this first if you're over.

---

### 2:45 – 3:15 · Propose

**Screen:** Click the recommended action. Proposal is created; policy evaluation shown.

> "It has a recommendation. What it does *not* have is the ability to act on it.
>
> The proposal goes to the Policy Engine — limits, role, exposure. Under the ceiling and it's eligible for approval. Over it, or the wrong role, and it's blocked and logged.
>
> Either way, it's now sitting in a queue waiting for a person."

---

### 3:15 – 3:50 · Approve

**Screen:** Switch to Window B (`ADMIN`), `/actions`. Show the pending approval, then click **Approve**.

> "Different person, different role. Whoever proposed it can't sign it off.
>
> Here's the amount, the reasoning, and the exception behind it — everything needed to say yes or no without opening another tab.
>
> Approve."

Hold on the button for a beat before clicking. This is the load-bearing frame of the entire video: **money moves here, and only because someone chose to.**

---

### 3:50 – 4:20 · The loop closes

**Screen:** Execution runs. Show the audit trail, then back to `/dashboard` — exception resolved, queue empty again.

> "Now it executes — amount re-validated against live state first, because things change between approval and execution.
>
> Full audit trail: who proposed, what the analysis said, which policy applied, who approved, what was sent, what came back. All correlated by one ID.
>
> And the action produces its own webhook, which reconciles again — so the exception closes itself. Back to an empty queue."

---

### 4:20 – 4:45 · Why it's built this way

**Screen:** The trust-boundary diagram from `docs/ARCHITECTURE.md` §3.

> "One thing to be precise about, because it's the part that matters in production.
>
> Nothing you just watched let a model touch money. It has read-only tools and one place it can write — a proposal. There's no code path from there to your payment provider. That's not a rule in a prompt it could be talked out of, it's the shape of what it's allowed to call.
>
> And it never does arithmetic on your money. Matching, exposure, severity — deterministic code, integer paise, tested. A model that computes a financial difference will eventually compute one wrong, and you'd have no way to audit it."

---

### 4:45 – 5:00 · Close

**Screen:** Back to the resolved dashboard. Static.

> "Reconciliation was never the hard part. The investigation around it was — and that's the part that just got handed off.
>
> Machines reconcile. AI investigates. Policies control. Humans approve."

Stop on the thesis. No feature recap, no roadmap, no thank-you slide. The line is the ending.

---

## If it breaks on camera

| Symptom | Do this |
| --- | --- |
| No exception after the run | `generate-bank-data` didn't write. Reset, re-run, re-take the beat. |
| Investigation hangs past ~20s | Cut. Resume on the rendered analysis — don't narrate dead air. |
| `401` mid-demo | Token expired. This is why both windows are pre-authenticated; reset and re-take. |
| Login locked out | You hit the 5-per-min throttle. Wait 60 seconds. Don't retry into it. |
| `429` from Groq mid-investigation | You've hit the TPM or RPM ceiling. Wait it out and re-take — don't retry into it, and don't stack rehearsals back to back right before a take. |
| Amount renders as `NaN` or `5000000` | A money field got `parseFloat`ed or wasn't formatted. `lib/money.ts`, then re-take. |
| Frontend can't reach the API | Frontend is `3000`, API is `3001`. Check `NEXT_PUBLIC_API_BASE_URL` and that CORS allows `http://localhost:3000`. |

---

## Final check before you upload

- [ ] `generate-bank-data.ts` is implemented and the mismatch appears reliably
- [ ] Three full rehearsals done, investigation latency measured
- [ ] Both browser windows pre-authenticated, `FINANCE` and `ADMIN`
- [ ] No `.env`, no API key, no password visible in any frame
- [ ] Audio levels checked, DND on, notifications silenced
- [ ] Money columns aligned, no `NaN`, no raw paise on screen
- [ ] Nothing decorative clicked
- [ ] Runtime under the cap
- [ ] Watched the whole thing back once, with sound