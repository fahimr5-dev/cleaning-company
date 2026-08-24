import "server-only";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { fillTemplate } from "@/lib/whatsapp";
import { recordAudit } from "@/lib/audit";
import { documentStatus, dueComplianceAlert } from "@/lib/hr";
import { stockStatus, quantityOnHand, shouldAlertLowStock } from "@/lib/stock";
import { formatMoney } from "@/lib/money";

/**
 * The warnings that have to arrive before the problem does.
 *
 * PLAIN ENGLISH: a visa that expires without warning means an employee who
 * cannot legally work, and a fine that lands on you. A chemical that runs out
 * without warning means a team standing in a client's flat with nothing to
 * clean it with. Both are cheap to prevent and expensive to discover.
 */

export type ComplianceRunResult = {
  documentsChecked: number;
  alertsSent: number;
  failed: number;
  blockedStaff: number;
  problems: string[];
};

/**
 * Sends the visa / Emirates ID / medical expiry warnings that are due today.
 *
 * Each warning is sent once, ever, per document per offset — recorded in
 * compliance_alerts. Renewing a document clears those records so the next
 * expiry gets its own full run of warnings.
 */
export async function runComplianceAlerts(options: { now?: Date } = {}): Promise<ComplianceRunResult> {
  const now = options.now ?? new Date();
  const result: ComplianceRunResult = {
    documentsChecked: 0, alertsSent: 0, failed: 0, blockedStaff: 0, problems: [],
  };

  const org = await prisma.organization.findFirst();
  if (!org) {
    result.problems.push("No company settings, so no expiry warnings were sent.");
    return result;
  }

  const recipient = org.complianceAlertEmail ?? org.email;
  if (!recipient) {
    result.problems.push(
      "No address to send expiry warnings to. Set complianceAlertEmail in your company settings.",
    );
    return result;
  }

  const offsets = org.complianceAlertDays.length > 0 ? org.complianceAlertDays : [60, 30, 7];
  const warnWithinDays = Math.max(...offsets);

  const documents = await prisma.staffDocument.findMany({
    where: {
      deletedAt: null,
      expiresAt: { not: null },
      staff: { deletedAt: null, employmentStatus: { not: "TERMINATED" } },
    },
    select: {
      id: true, type: true, number: true, expiresAt: true,
      staff: { select: { id: true, employeeNo: true, firstName: true, lastName: true } },
      alerts: { select: { daysBefore: true } },
    },
  });

  const template = await prisma.messageTemplate.findUnique({ where: { code: "VISA_EXPIRY_ALERT" } });
  const blocked = new Set<string>();

  for (const document of documents) {
    result.documentsChecked += 1;

    const check = documentStatus({
      type: document.type,
      expiresAt: document.expiresAt,
      now,
      warnWithinDays,
    });
    if (check.blocksWork) blocked.add(document.staff.id);

    const offset = dueComplianceAlert({
      daysUntilExpiry: check.daysUntilExpiry,
      offsetsDays: offsets,
      alreadySent: document.alerts.map((a) => a.daysBefore),
    });
    if (offset === null) continue;

    const staffName = `${document.staff.firstName} ${document.staff.lastName}`;
    const documentName = document.type.replace(/_/g, " ").toLowerCase();
    const values = {
      staffName,
      employeeNo: document.staff.employeeNo,
      documentType: documentName,
      days: String(Math.max(0, check.daysUntilExpiry ?? 0)),
      expiryDate: document.expiresAt!.toISOString().slice(0, 10),
    };

    const subject = fillTemplate(
      template?.subjectEn ?? "Action needed: {{documentType}} expires in {{days}} days",
      values,
    );
    const body = fillTemplate(
      template?.bodyEn ??
        "{{staffName}}'s {{documentType}} expires on {{expiryDate}} ({{days}} days). Start renewal now.",
      values,
    );

    const sent = await sendEmail({
      to: recipient,
      subject,
      text: body,
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6">
  <p>${body}</p>
  <p style="color:#666;font-size:13px">${document.staff.employeeNo} · ${documentName}${document.number ? ` · ${document.number}` : ""}</p>
</div>`,
      relatedEntity: "StaffDocument",
      relatedId: document.id,
      templateCode: "VISA_EXPIRY_ALERT",
    });

    if (sent.ok) {
      // Recorded ONLY on success, so a failed send is retried tomorrow rather
      // than being marked done and forgotten.
      await prisma.complianceAlert.create({
        data: { staffDocumentId: document.id, daysBefore: offset, recipient },
      });
      result.alertsSent += 1;
    } else {
      result.failed += 1;
      result.problems.push(`${staffName} (${documentName}): ${sent.reason}`);
    }
  }

  result.blockedStaff = blocked.size;

  if (result.alertsSent > 0) {
    await recordAudit({
      action: "SEND",
      entity: "StaffDocument",
      entityId: "sweep",
      summary: `${result.alertsSent} document expiry warnings sent to ${recipient}`,
    });
  }

  return result;
}

export type LowStockRunResult = {
  itemsChecked: number;
  alertsSent: number;
  itemsNeedingOrder: number;
  problems: string[];
};

/**
 * Emails one summary of everything that needs ordering.
 *
 * One email listing ten items, not ten emails — and never more often than once
 * a week per item, so it stays worth opening.
 */
export async function runLowStockAlerts(options: { now?: Date } = {}): Promise<LowStockRunResult> {
  const now = options.now ?? new Date();
  const result: LowStockRunResult = {
    itemsChecked: 0, alertsSent: 0, itemsNeedingOrder: 0, problems: [],
  };

  const org = await prisma.organization.findFirst();
  if (!org) {
    result.problems.push("No company settings, so no stock warnings were sent.");
    return result;
  }

  const recipient = org.lowStockAlertEmail ?? org.email;
  if (!recipient) {
    result.problems.push(
      "No address to send stock warnings to. Set lowStockAlertEmail in your company settings.",
    );
    return result;
  }

  const items = await prisma.inventoryItem.findMany({
    where: { deletedAt: null, isActive: true },
    select: {
      id: true, sku: true, nameEn: true, unit: true, reorderLevel: true,
      unitCostFils: true, supplier: true, lowStockAlertedAt: true,
      movements: { select: { type: true, quantity: true } },
    },
  });

  const toAlert: Array<{ id: string; line: string }> = [];

  for (const item of items) {
    result.itemsChecked += 1;

    const onHand = quantityOnHand(
      item.movements.map((m) => ({ type: m.type, quantity: Number(m.quantity) })),
    );
    const status = stockStatus({ onHand, reorderLevel: Number(item.reorderLevel) });
    if (status.level === "REORDER" || status.level === "OUT_OF_STOCK") {
      result.itemsNeedingOrder += 1;
    }

    if (!shouldAlertLowStock({ level: status.level, lastAlertedAt: item.lowStockAlertedAt, now })) {
      continue;
    }

    toAlert.push({
      id: item.id,
      line:
        `${item.nameEn} (${item.sku}) — ${onHand} ${item.unit.toLowerCase()} left, ` +
        `order about ${status.suggestedOrderQty}` +
        (item.supplier ? ` from ${item.supplier}` : "") +
        ` — roughly ${formatMoney(Math.round(status.suggestedOrderQty * item.unitCostFils))}`,
    });
  }

  if (toAlert.length === 0) return result;

  const sent = await sendEmail({
    to: recipient,
    subject: `${toAlert.length} items need ordering`,
    text: toAlert.map((a) => `• ${a.line}`).join("\n"),
    html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6">
  <p>These are at or below their reorder level:</p>
  <ul>${toAlert.map((a) => `<li>${a.line}</li>`).join("")}</ul>
</div>`,
    relatedEntity: "InventoryItem",
    relatedId: toAlert[0].id,
  });

  if (sent.ok) {
    await prisma.inventoryItem.updateMany({
      where: { id: { in: toAlert.map((a) => a.id) } },
      data: { lowStockAlertedAt: now },
    });
    result.alertsSent = toAlert.length;

    await recordAudit({
      action: "SEND",
      entity: "InventoryItem",
      entityId: "sweep",
      summary: `Low-stock warning for ${toAlert.length} items sent to ${recipient}`,
    });
  } else {
    result.problems.push(sent.reason);
  }

  return result;
}
