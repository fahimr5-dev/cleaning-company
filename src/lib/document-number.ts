import type { Prisma } from "@prisma/client";

/**
 * Issues the next sequential document number, e.g. INV-2026-000318.
 *
 * PLAIN ENGLISH: UAE tax rules require invoice numbers to run in an unbroken
 * sequence with no gaps and no repeats. Two people clicking "create invoice" at
 * the same instant must not both get number 318.
 *
 * This runs inside a database transaction and locks the counter row while it
 * increments, so the second request waits for the first and gets 319.
 */

export type DocumentPrefix =
  | "INV" | "QT" | "CN" | "JOB" | "PAY" | "CL" | "LD" | "TKT" | "EMP" | "PKG";

/** Pass the transaction client — the caller decides the transaction boundary. */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  prefix: DocumentPrefix,
  options: { year?: number; pad?: number } = {},
): Promise<string> {
  const year = options.year ?? new Date().getFullYear();
  const pad = options.pad ?? (prefix === "JOB" || prefix === "INV" || prefix === "PAY" ? 6 : 4);

  // `upsert` + `increment` is a single atomic statement: it both creates the
  // counter the first time and bumps it every time after, without a race.
  const counter = await tx.documentCounter.upsert({
    where: { prefix_year: { prefix, year } },
    create: { prefix, year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });

  return `${prefix}-${year}-${String(counter.lastNumber).padStart(pad, "0")}`;
}

/** A referral code that is easy to read aloud over the phone. */
export function buildReferralCode(name: string, suffix: number): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 6) || "CLEAN";
  return `${base}-${String(suffix).padStart(4, "0")}`;
}
