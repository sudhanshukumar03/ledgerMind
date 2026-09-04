# Frontend — AI Finance Controller Dashboard

This is the working implementation of the locked UI spec: sidebar nav, KPI row, "Needs Attention" exception queue, recent transactions table, and the right-side investigation drawer with Overview / Timeline / AI Analysis / Notes tabs.

## Files

```
frontend/
├── app/
│   └── dashboard/
│       └── page.tsx                 # Next.js App Router route — renders the dashboard
├── components/
│   └── dashboard/
│       └── FinanceControllerDashboard.tsx   # The full dashboard (single component, mock data)
└── README.md
```

## Setup (drop into an existing Next.js + Tailwind project)

1. Copy `components/dashboard/FinanceControllerDashboard.tsx` and `app/dashboard/page.tsx` into your Next.js project, preserving the paths (the page imports via the `@/components/...` alias — confirm your `tsconfig.json` has that path mapping, which `create-next-app` sets up by default).
2. Install the one dependency this component needs beyond React/Next/Tailwind:
   ```bash
   npm install lucide-react
   ```
3. Make sure Tailwind's `content` globs in `tailwind.config.ts` include the `components/` and `app/` folders (default in any `create-next-app` scaffold).
4. Run `npm run dev` and visit `/dashboard`.

No Tailwind config changes are required — exact design-token colors (`#0F172A`, `#475569`, `#1D4ED8`, `#15803D`, `#B45309`, `#B91C1C`, `#F8FAFC`) are applied via inline `style` props rather than custom Tailwind classes, so the palette renders correctly regardless of your Tailwind theme config. If you'd rather have them as first-class Tailwind classes (e.g. `bg-critical`), extend `tailwind.config.ts` `theme.colors` with the same hex values and swap the inline `style={{ color: C.critical }}` calls for `className="text-critical"` — the `C` token object at the top of the component is the single place to do that swap.

## Font

The component sets `font-family: Inter, system-ui, sans-serif` inline. To actually load Inter, add it in your root layout:

```tsx
// app/layout.tsx
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
```

## Replacing mock data with the real API

Everything the dashboard renders currently comes from three constants at the top of `FinanceControllerDashboard.tsx`: `kpis`, `exceptions`, `transactions`. These map directly onto endpoints already defined in `docs/07-API-SPECIFICATION.md`:

| Mock constant | Replace with |
|---|---|
| `kpis` | `GET /api/v1/dashboard/metrics` |
| `exceptions` (Needs Attention) | `GET /api/v1/exceptions?status=open&sort=severity` |
| `transactions` (Recent Transactions table) | `GET /api/v1/transactions?limit=5` |
| `InvestigationDrawer` timeline + AI analysis | `GET /api/v1/exceptions/:id/timeline` + `GET /api/v1/exceptions/:id` (`analysis` field, populated after `POST /api/v1/exceptions/:id/investigate`) |
| "Verify Now" / "Mark Resolved" buttons | `POST /api/v1/actions` with `action_type: "mark_reviewed"` or the relevant resolution action, then `POST /api/v1/actions/:id/approve` if it needs approval |

The component is intentionally left with **all data as local constants and no `fetch` calls** so it can be dropped in and visually reviewed before wiring it to a live backend. Swap each constant for a `useEffect` + `fetch`/React Query call against the endpoints above; the shape of `exceptions[i]` and `transactions[i]` was designed to match the API spec's response fields (`severity`, `confidence`, `colLeft`/`colRight` status pairs, etc.) so the mapping should be close to 1:1.

## Known simplifications (intentional, for a first pass)

- Search bar (`⌘K`) is decorative — no command palette wired up yet.
- Pagination buttons are decorative — no page-change handler.
- "Notes" tab has no persistence — wire to a new `notes` field on the exception once the backend supports it.
- No loading/error/empty states yet — add these when you connect real data (an empty "Needs Attention" list, a failed fetch, etc. all need their own state per `docs/12-ERROR-HANDLING.md` §5, Frontend Error Handling).
