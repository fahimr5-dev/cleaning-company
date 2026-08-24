# CleanOS — setting it up

Written for someone who does not write code. Every command is meant to be
copied and pasted exactly as it appears.

You will need about 30 minutes. Nothing here costs money — Supabase and Vercel
both have free tiers that are more than enough to start.

---

## What you are installing

| Piece | What it does | Cost to start |
|---|---|---|
| **Supabase** | Your database and your login system | Free |
| **Vercel** | Puts the app on the internet | Free |
| **Resend** | Sends emails (needed from Phase 5) | Free |
| **Stripe** | Takes card payments (needed from Phase 5) | Per transaction |

Phase 1 only needs Supabase.

---

## Step 1 — Install the tools on your computer

You need **Node.js version 20 or newer**. Check whether you already have it:

```bash
node --version
```

If that prints an error, or a number below 20, download the "LTS" version from
<https://nodejs.org> and install it, then close and reopen your terminal.

---

## Step 2 — Get the code and install it

```bash
git clone https://github.com/fahimr5-dev/cleaning-company.git
cd cleaning-company
npm install
```

`npm install` takes a couple of minutes. It is downloading everything the app
depends on. It is normal for it to print a lot of text.

---

## Step 3 — Create your Supabase project

1. Go to <https://supabase.com> and sign up.
2. Click **New project**.
3. Name it `cleanos`.
4. **Choose a database password and save it somewhere safe.** You will need it
   twice in the next step, and Supabase will never show it to you again.
5. For region, pick **Frankfurt** or **Mumbai** — there is no UAE region, and
   these are the closest.
6. Click **Create new project** and wait about two minutes.

---

## Step 4 — Fill in your settings

```bash
cp .env.example .env
```

Now open the new `.env` file in any text editor. It explains, line by line,
exactly where in the Supabase dashboard to find each value. Fill in the five
settings in **SECTION 1** and leave the rest blank for now.

---

## Step 5 — Build the database

This creates all 57 tables, switches on the security rules, and fills the
database with demo data.

```bash
npm run db:setup
```

You should see it finish with a summary like this:

```
Demo data ready:
  clients      20
  properties   20
  teams        4
  staff        16
  jobs         200
  ...
  Login ready: owner@cleanos.demo / CleanOS!2026  (OWNER)
```

> If it says **"TODO — DEMO LOGINS WERE NOT CREATED"**, your
> `SUPABASE_SERVICE_ROLE_KEY` is missing from `.env`. Add it and run
> `npm run db:seed` again. The message tells you exactly what to do.

---

## Step 6 — Turn on file storage

Job photos and visa scans are stored as files, which needs a separate step.

1. In Supabase, open **SQL Editor** in the left-hand menu.
2. Click **New query**.
3. Open the file `prisma/sql/02_storage.sql` from this project, copy everything
   in it, and paste it into the editor.
4. Click **Run**.

You should see `Success. No rows returned`.

---

## Step 7 — Start it up

```bash
npm run dev
```

Open <http://localhost:3000> in your browser.

---

## Step 8 — Check the security rules actually work

This is worth doing once, so you have seen it with your own eyes.

```bash
npm run test:rls
```

It signs in as each of the four roles in turn and checks the database refuses
what it should refuse. Every line must say `PASS`:

```
  PASS    cleaner CANNOT see invoices          expected: 0    got: 0
  PASS    client sees ONLY own jobs            expected: 12   got: 12
  PASS    ops CANNOT edit an invoice           expected: refused
  ...
  41 passed, 0 failed, 41 total
```

If anything says `**FAIL**`, stop and tell your developer. It means somebody
could see data they should not.

---

## Putting it on the internet (Vercel)

1. Push your code to GitHub.
2. Go to <https://vercel.com>, sign in with GitHub, click **Add New → Project**
   and pick this repository.
3. Before clicking Deploy, open **Environment Variables** and add every value
   from your `.env` file.
4. Change `NEXT_PUBLIC_APP_URL` to your real Vercel address.
5. Click **Deploy**.

After the first deploy, go back to Supabase → **Authentication → URL
Configuration** and add your Vercel address to **Redirect URLs**, otherwise
password-reset emails will not work.

---

## Step 9 — Turn on payments and reminders  (Phase 5)

Everything below is optional to *look* at CleanOS, but required before you can
actually take money.

**Card payments.** Fill in `STRIPE_SECRET_KEY` and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` from Section 4 of `.env.example`. Use the
test keys (`sk_test_…`) first. Until you do, the "Create card payment link"
button is disabled and says why — cash and bank transfers still work.

**Getting told when a card is paid.** In Stripe → Developers → Webhooks, add an
endpoint at `https://YOUR-DOMAIN/api/webhooks/stripe` listening for
`checkout.session.completed`, `payment_intent.succeeded` and `charge.refunded`,
then copy its signing secret into `STRIPE_WEBHOOK_SECRET`. Without this, a
client's card payment will go through at Stripe but the invoice in CleanOS will
still say unpaid.

**Emailed invoices and reminders.** Fill in `RESEND_API_KEY` and
`RESEND_FROM_EMAIL` (Section 3). Without them, sending an invoice tells you
plainly that email is not set up and offers the WhatsApp link instead — it
never silently does nothing.

**The daily reminder run.** Invent a long random value for `CRON_SECRET` and put
the same value in Vercel → Settings → Environment Variables. `vercel.json`
already schedules the job for 04:00 UTC (08:00 Dubai) every day. On your own
computer there is no cron, so press **Send reminders now** on the Invoices
screen instead — it does exactly the same thing.

---

## The commands you will actually use

| Command | What it does |
|---|---|
| `npm run dev` | Start the app on your computer |
| `npm run build` | Check everything compiles before deploying |
| `npm run db:setup` | Build the database from scratch (migrate + rules + demo data) |
| `npm run db:seed` | Refresh the demo data only |
| `npm run db:studio` | Open a spreadsheet-like view of your database |
| `npm run test:rls` | Prove the security rules still work |
| `npm run db:rls` | Re-apply the security rules (run after any new migration) |
| `npm run db:roles` | Create the security roles and the `cleanos` folder (safe to repeat) |
| `npm run db:migrate:http` | Apply migrations when your network blocks the database port |
| `npm run test:e2e:invoices` | Drive invoicing and payments in a real browser |

---

## When something goes wrong

**"CleanOS is not connected to Supabase yet"**
Your `.env` is missing values, or you did not restart after editing it. Stop the
app with Ctrl+C and run `npm run dev` again.

**"DATABASE_URL is not set"**
You have not created your `.env` file yet. Go back to Step 4.

**`npm run db:setup` fails with a connection error**
The password inside `DATABASE_URL` is wrong, or you left `[YOUR-PASSWORD]` in
place. If your password contains `@`, `#`, `/` or `?`, those characters have to
be percent-encoded — the simplest fix is to reset the database password in
Supabase to something using only letters and numbers.

**I can see the login page but cannot sign in**
The demo accounts only exist after a successful `npm run db:seed` that printed
`Login ready:` lines. Check `SUPABASE_SERVICE_ROLE_KEY` is filled in.

---

## Important, before real customers use this

- [ ] Change `SEED_DEMO_PASSWORD`, or delete the four `@cleanos.demo` accounts
      in Supabase → Authentication → Users.
- [ ] Run `npm run test:rls` against your production database and confirm 41/41.
- [ ] Replace the demo company details (Sparkle Facilities Management, and its
      placeholder TRN) with your real ones.
- [ ] Turn on Point-in-Time Recovery in Supabase so you can undo a bad day.
- [ ] Swap the Stripe test keys for live keys, and re-point the webhook at your
      live endpoint (the signing secret is different for live mode).
- [ ] Set your real TRN and invoice prefix in the company settings before you
      issue an invoice to a real customer — an issued invoice number cannot be
      changed afterwards.
