# How CleanOS keeps data separate

Plain-English explanation of the security model, and an honest note about its
one limitation.

## Two independent locks

Every request passes through two checks that do not depend on each other. A
mistake in one does not open the door, because the other still holds.

**Lock 1 — the app checks the role.**
`requireRole()` in `src/lib/auth.ts` runs before any office page renders. A
cleaner who types `/en/invoices` into the address bar is sent back to their own
jobs list before the page is built.

**Lock 2 — the database checks the row.**
187 Row Level Security policies, in `prisma/sql/01_rls.sql`, sit inside Postgres
itself. They decide, row by row, what each signed-in person may see. They apply
even if the app code asks the wrong question.

`npm run test:rls` proves lock 2 works, by signing in as each role and checking
41 separate things it should and should not be able to do.

## Who can see what

| | Owner | Ops Manager | Cleaner | Client |
|---|---|---|---|---|
| Clients, jobs, schedule | Full | Full | Only their own team's jobs | Only their own |
| Invoices, payments | Full | **Read only** | No access | Only their own |
| Rate card, VAT settings | Full | **Read only** | No | Read (to see prices) |
| Marketing spend | Full | **No access** | No | No |
| Audit log | Read | **No access** | No | No |
| Staff records | Full | Full | Only their own | No |
| Timesheets | Full | Full | Only their own | No |
| Internal ticket notes | Full | Full | Own tickets | **Never** |

## Why `anon` gets nothing

Every Supabase project publishes its tables on a public web API. If a table has
no rules, anyone who knows your project address can read it. This is the single
most common way Supabase applications leak customer data.

`01_rls.sql` revokes all access from the `anon` role — a visitor who is not
signed in. The test suite confirms it: `anon` gets "permission denied", not an
empty list.

The public marketing site and quote calculator (Phase 2) will therefore read
their data on the server, not from the browser.

## How the second lock is applied (updated in Phase 4)

**Office screens** use the ordinary database connection, which connects as the
owner and is *not* subject to the row rules. Those users are allowed to see
everything anyway, so the row rules are not the protection that matters there —
`requireRole()` is.

**The cleaner app** (and, from the next phase, the client portal) runs every
query through `withUserRls()` in `src/lib/rls.ts`. That opens a transaction,
tells Postgres "for the next few queries you are this user, with no special
privileges", and runs the work there. Every rule in this document then applies.

This is the same mechanism Supabase uses behind its own API; we simply do it
from our own server. It means a badly written query on the cleaner app returns
nothing it should not — the database refuses, regardless of what the code asked
for. Ten tests in `tests/rls-context.test.ts` prove it, including that the
restricted role never leaks into the next request on the same connection.

Practically: **a bug in an office screen could show an owner something an ops
manager should not see. A bug in the cleaner app could not.**

> One rule when writing queries inside `withUserRls`: run them one at a time.
> A transaction holds a single database connection, and a connection can carry
> only one query at a time, so `Promise.all` there makes the driver interleave
> them on one wire.

### Also not yet handled

- **Salary is row-level, not column-level.** An ops manager can open a staff
  record and therefore sees the salary fields on it. Postgres can restrict
  individual columns, but that is a separate mechanism from RLS.
  **TODO (Phase 7):** hide salary columns from `OPS_MANAGER`.
- **Photo storage rules are written but untested here.** The bucket policies in
  `prisma/sql/02_storage.sql` can only run inside a real Supabase project, so
  they have been reviewed but not executed. Run `npm run test:rls` after
  applying them, and check that a cleaner cannot open another team's photo.
- ~~The audit log is not yet written to.~~ **Done in Phase 2.** Lead moves,
  conversions, client billing changes and booking pauses all write to it via
  `recordAudit()` in `src/lib/audit.ts`.

## After every future migration

A new table created by a migration starts with **no rules on it at all**. Always
run this straight afterwards:

```bash
npm run db:rls && npm run test:rls
```

The first command is safe to run repeatedly.

## Public pages and the anon role

The marketing site and the quote calculator are public, but they still read
nothing directly from the browser. Prices are worked out by a Server Action on
the server, so the rate card never leaves it and a visitor cannot change a
price by editing the page. That is why `anon` can stay locked out of every
table.

A customer's quote page (`/en/quote/<id>`) is protected by the quote's random
128-bit id acting as the password, the same way an unlisted document link
works. It cannot be guessed, it is only ever sent to the person it belongs to,
and nothing about any other customer is reachable from it.

## Dependency note

`package.json` contains an `overrides` entry pinning `deepmerge-ts` to `^8.0.2`.

Versions below 8 have a published high-severity advisory (GHSA-ggr8-5vv4-36mx).
It reaches the project only through the Prisma command-line tool, which is a
development dependency and never ships to your customers — but the override
clears it anyway so `npm audit` reports zero, and a real problem in future is
not lost in the noise of a known one.

Remove the override only once Prisma ships a release that depends on
`deepmerge-ts` 8 or later, and confirm `npm audit` still reports zero.
