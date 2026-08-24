# CleanOS

Management platform for a residential and commercial cleaning company operating
in the UAE.

**Status: Phase 1 of 8 complete.** Accounts, roles, the database, the security
rules and the demo data are built and tested. The feature screens arrive in
later phases and currently show a clearly-labelled placeholder rather than
anything that pretends to work.

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
| 2 | Clients, leads, quote calculator, public site | Not started |
| 3 | Scheduling and the recurring job engine | Not started |
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
