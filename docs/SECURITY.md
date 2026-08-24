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

## The honest limitation

**Prisma connects as the database owner and is not subject to these rules.**

Prisma is used for migrations, the demo-data seed, and reading data for office
screens *after* `requireRole()` has already confirmed the person is office
staff. Those users are allowed to see everything anyway, so the row rules are
not the protection that matters there.

Where it genuinely matters — the cleaner app and the client portal — data will
be read through the Supabase client, which carries the signed-in person's
identity and is fully subject to the rules above.

Practically, this means: **a bug in an office screen could show an owner
something an ops manager should not see.** A bug in the cleaner or client app
could not, because the database would refuse.

### Also not yet handled

- **Salary is row-level, not column-level.** An ops manager can open a staff
  record and therefore sees the salary fields on it. Postgres can restrict
  individual columns, but that is a separate mechanism from RLS.
  **TODO (Phase 7):** hide salary columns from `OPS_MANAGER`.
- **The audit log is not yet written to.** The table, its rules and its indexes
  exist and are correct; nothing populates it until Phase 2 adds the write
  helper. **TODO (Phase 2).**

## After every future migration

A new table created by a migration starts with **no rules on it at all**. Always
run this straight afterwards:

```bash
npm run db:rls && npm run test:rls
```

The first command is safe to run repeatedly.
