import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Runs database work AS THE SIGNED-IN PERSON, with the database's own security
 * rules switched on.
 *
 * PLAIN ENGLISH: normally our server connects to the database as the owner,
 * which can see everything. That is fine for office screens, where the person
 * is allowed to see everything anyway. It is NOT fine for the cleaner app or
 * the client portal, where a mistake in our code could show somebody another
 * person's data.
 *
 * This wrapper opens a transaction, tells Postgres "for the next few queries,
 * you are this user, with no special privileges", and runs the work there.
 * Every Row Level Security rule then applies — so even a badly written query
 * simply returns nothing it should not.
 *
 * It is the same mechanism Supabase itself uses; we are just doing it from our
 * own server rather than through their API.
 *
 * The role and the identity are set with SET LOCAL / set_config(..., true),
 * which Postgres discards at the end of the transaction, so nothing leaks into
 * the next request that borrows the same connection.
 *
 * IMPORTANT: run queries inside `work` ONE AT A TIME. A transaction holds a
 * single database connection, and a connection can only carry one query at a
 * time — `Promise.all` here makes the driver interleave them on one wire.
 */
export async function withUserRls<T>(
  userId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // The claim must be set BEFORE dropping privileges, and is parameterised
      // so a user id can never be treated as SQL.
      await tx.$executeRawUnsafe(
        "SELECT set_config('request.jwt.claims', $1, true)",
        JSON.stringify({ sub: userId, role: "authenticated" }),
      );
      await tx.$executeRawUnsafe("SET LOCAL ROLE authenticated");
      return work(tx);
    },
    { timeout: options.timeoutMs ?? 15_000 },
  );
}

/**
 * True when a write inside `withUserRls` silently changed nothing.
 *
 * Row Level Security does not throw when an UPDATE or DELETE matches no rows —
 * it just changes nothing. Anything that MUST have taken effect should check
 * this, or a refused write looks like a successful one.
 */
export function changedNothing(result: { count: number }): boolean {
  return result.count === 0;
}
