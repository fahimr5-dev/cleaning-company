import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * Writes a line to the audit trail.
 *
 * PLAIN ENGLISH: every time somebody changes something that matters — cancels a
 * job, edits a price, deletes a client — this records who did it, when, and what
 * the record looked like before and after. Nobody can edit or delete these
 * lines through the app; only the owner can read them.
 *
 * Deliberately never throws: failing to WRITE the history must not stop the
 * thing that was being recorded. A failure is logged to the server console.
 */

export type AuditAction =
  | "CREATE" | "UPDATE" | "SOFT_DELETE" | "RESTORE" | "LOGIN"
  | "EXPORT" | "APPROVE" | "REJECT" | "SEND" | "PAYMENT_RECORDED" | "REFUND";

export type AuditInput = {
  action: AuditAction;
  /** The model name, e.g. "Lead", "Client", "Job". */
  entity: string;
  entityId: string;
  /** A human sentence: "Moved lead LD-2026-0004 to Won". */
  summary?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
};

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const user = await getCurrentUser();

    let ipAddress: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      // Vercel and most proxies put the real visitor IP first in this list.
      ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      userAgent = h.get("user-agent");
    } catch {
      // Called outside a request (a scheduled job, or the seed script).
    }

    await prisma.auditLog.create({
      data: {
        actorId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        summary: input.summary ?? null,
        before: input.before,
        after: input.after,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error("[audit] FAILED to record audit entry", input, error);
  }
}

/**
 * Narrows an object down to the fields worth storing in the trail.
 * Keeps the log readable and avoids copying large blobs into it.
 */
export function auditFields<T extends object, K extends keyof T>(
  source: T | null | undefined,
  keys: readonly K[],
): Prisma.InputJsonValue | undefined {
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    out[String(key)] = value instanceof Date ? value.toISOString() : value;
  }
  return out as Prisma.InputJsonValue;
}
