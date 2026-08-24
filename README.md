# CleanOS

Management platform for a residential and commercial cleaning company operating
in the UAE.

**Status: Phase 3 of 8 complete.** Working today: the public website with its
instant-quote calculator, the lead pipeline, client records with referral
tracking, and the weekly drag-and-drop schedule with its recurring-booking
engine, conflict detection and capacity view. Screens from later phases show a
clearly-labelled placeholder rather than anything that pretends to work.

## Getting started

Read **[SETUP.md](./SETUP.md)** — written for a non-technical reader, about 30
minutes end to end.

```bash
npm install
cp .env.example .env     # then fill it in; every line explains where to look
npm run db:setup         # tables + security rules + demo data
npm run dev              # http://localhost:3000
```

## What is built

| Phase | Scope | Status |
|---|---|---|
| 1 | Auth, roles, database schema, seed data, admin shell | **Done** |
| 2 | Clients, leads, quote calculator, public site | **Done** |
| 3 | Scheduling and the recurring job engine | **Done** |
| 4 | Cleaner mobile view, checklists, photos | Not started |
| 5 | Invoicing, Stripe, dunning | Not started |
| 6 | Ratings, retention, referrals | Not started |
| 7 | Staff/HR and inventory | Not started |
| 8 | Reporting dashboard and polish | Not started |

## The stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui · Supabase (Postgres, Auth, Storage, RLS) · Prisma 7 · next-intl
(English + Arabic, RTL) · deployed on Vercel.

## Conventions that matter

- **Money is stored as whole fils.** AED 249.50 is `24950`. Percentages are in
  basis points: 5% VAT is `500`. Never use a decimal for money.
  See `src/lib/money.ts`.
- **Prices are VAT-exclusive.** A quoted AED 300 job invoices as AED 300 + AED
  15 VAT = AED 315.
- **Nothing is hard deleted.** Every important table has `deletedAt`.
- **Business rules live in the `organizations` table**, not in code — VAT rate,
  weekend days, reschedule cutoff, geofence radius, dunning schedule, referral
  rewards.
- **Unbuilt screens say so loudly.** See `src/components/common/todo-screen.tsx`.
  There is no silent placeholder anywhere in this codebase.
- **Prices are never in the code.** Every figure comes from the rate card in
  the database, through `src/lib/quote.ts`. If a rule is missing, the app says
  so rather than quoting zero.
- **Client components never import database modules.** Anything a browser file
  imports gets shipped to the visitor. Shared types live in files like
  `src/lib/leads-shared.ts` and `src/lib/schedule-shared.ts`, which contain no
  Prisma import.
- **Impossible is refused; merely difficult is questioned.** A move that would
  put one team in two places at once is blocked. A tight cross-city drive is a
  warning you can override — you know about the traffic, the software does not.
- **Date and scheduling maths is pure and tested.** `src/lib/recurrence.ts` and
  `src/lib/scheduling.ts` take no database and no clock of their own, which is
  why 75 tests can cover them directly.

## Security

Two independent locks: a role check in the app, and 187 Row Level Security
policies inside the database. Run `npm run test:rls` to prove the second one
works — 41 assertions across all four roles.

Read **[docs/SECURITY.md](./docs/SECURITY.md)**, including the honest note on
what this model does *not* yet cover.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run typecheck` | Type-check without building |
| `npm run db:setup` | Migrate, apply security rules, seed demo data |
| `npm run db:seed` | Refresh demo data only |
| `npm run db:studio` | Browse the database |
| `npm run db:rls` | Re-apply security rules (after any new migration) |
| `npm run test:rls` | Verify the security rules |
| `npm test` | Run the money and pricing tests |
| `npm run test:e2e` | Drive the real quote calculator in a browser |
| `npm run test:e2e:schedule` | Drive the real schedule board in a browser |
