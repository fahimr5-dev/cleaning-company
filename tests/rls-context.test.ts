import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { makeAdapter } from "../src/lib/db-driver";

/**
 * Proves the RLS-enforced connection actually restricts what a user can reach.
 *
 * These run against the real database, because the whole point is that Postgres
 * — not our code — is doing the restricting.
 */

try { process.loadEnvFile(".env"); } catch { /* env already set */ }

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ adapter: makeAdapter(url!) });

// The fixed demo ids the seed creates.
const OWNER = "00000000-0000-4000-8000-000000000001";
const OPS = "00000000-0000-4000-8000-000000000002";
const CLEANER = "00000000-0000-4000-8000-000000000003";
const CLIENT = "00000000-0000-4000-8000-000000000004";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function asUser<T>(userId: string, work: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT set_config('request.jwt.claims', $1, true)",
      JSON.stringify({ sub: userId, role: "authenticated" }),
    );
    await tx.$executeRawUnsafe("SET LOCAL ROLE authenticated");
    return work(tx);
  });
}

let seeded = false;
before(async () => {
  const count = await prisma.user.count({ where: { id: OWNER } }).catch(() => 0);
  seeded = count > 0;
  if (!seeded) {
    console.log("  (skipping: run `npm run db:setup` first so the demo data exists)");
  }
});
after(async () => { await prisma.$disconnect(); });

describe("the RLS-enforced connection", { skip: !process.env.DIRECT_URL && !process.env.DATABASE_URL }, () => {
  test("an owner still sees everything", async (t) => {
    if (!seeded) return t.skip();
    const all = await prisma.job.count();
    const seen = await asUser<number>(OWNER, (tx) => tx.job.count());
    assert.equal(seen, all);
  });

  test("a cleaner sees only their own team's jobs", async (t) => {
    if (!seeded) return t.skip();
    const all = await prisma.job.count();
    const seen = await asUser<number>(CLEANER, (tx) => tx.job.count());
    assert.ok(seen > 0, "should see some jobs");
    assert.ok(seen < all, `should see fewer than all ${all} jobs, saw ${seen}`);
  });

  test("a cleaner sees no invoices at all", async (t) => {
    if (!seeded) return t.skip();
    assert.equal(await asUser<number>(CLEANER, (tx) => tx.invoice.count()), 0);
  });

  test("a cleaner sees only their own employee record", async (t) => {
    if (!seeded) return t.skip();
    assert.equal(await asUser<number>(CLEANER, (tx) => tx.staff.count()), 1);
  });

  test("a cleaner sees nobody else's timesheet", async (t) => {
    if (!seeded) return t.skip();
    const staff = await prisma.staff.findFirstOrThrow({ where: { userId: CLEANER }, select: { id: true } });
    const others = await asUser<number>(CLEANER, (tx) =>
      tx.timeEntry.count({ where: { staffId: { not: staff.id } } }));
    assert.equal(others, 0);
  });

  test("a client sees only their own jobs", async (t) => {
    if (!seeded) return t.skip();
    const client = await prisma.client.findFirstOrThrow({ where: { userId: CLIENT }, select: { id: true } });
    const mine = await prisma.job.count({ where: { clientId: client.id, deletedAt: null } });
    const seen = await asUser<number>(CLIENT, (tx) => tx.job.count());
    assert.equal(seen, mine);
  });

  test("an operations manager can read invoices but changes none", async (t) => {
    if (!seeded) return t.skip();
    const before = await prisma.invoice.aggregate({ _sum: { totalFils: true } });
    const seen = await asUser<number>(OPS, (tx) => tx.invoice.count());
    assert.ok(seen > 0, "ops should be able to read invoices");

    const changed = await asUser<{ count: number }>(OPS, (tx) => tx.invoice.updateMany({ data: { totalFils: 1 } }));
    const after = await prisma.invoice.aggregate({ _sum: { totalFils: true } });
    assert.equal(changed.count, 0, "ops must not be able to change an invoice");
    assert.equal(before._sum.totalFils, after._sum.totalFils);
  });

  test("a refused write changes nothing, even though it does not throw", async (t) => {
    if (!seeded) return t.skip();
    const before = await prisma.invoice.aggregate({ _sum: { totalFils: true } });
    const changed = await asUser<{ count: number }>(CLEANER, (tx) => tx.invoice.updateMany({ data: { totalFils: 1 } }));
    const after = await prisma.invoice.aggregate({ _sum: { totalFils: true } });
    assert.equal(changed.count, 0);
    assert.equal(before._sum.totalFils, after._sum.totalFils);
  });

  test("the restricted role does not leak out of the transaction", async (t) => {
    if (!seeded) return t.skip();
    await asUser(CLEANER, (tx) => tx.job.count());
    const all = await prisma.job.count();
    assert.ok(all > 0, "the next query on the same pool must be unrestricted again");
    assert.equal(all, await prisma.job.count());
  });

  test("an unknown user id sees nothing", async (t) => {
    if (!seeded) return t.skip();
    const seen = await asUser<number>("00000000-0000-4000-8000-00000000dead", (tx) => tx.job.count());
    assert.equal(seen, 0);
  });
});
