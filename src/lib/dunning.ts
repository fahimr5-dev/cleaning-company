import "server-only";
import { prisma } from "@/lib/prisma";
import { sendEmail, logWhatsAppLink } from "@/lib/email";
import { fillTemplate } from "@/lib/whatsapp";
import { recordAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/money";
import { settleInvoice, shouldPauseForDebt } from "@/lib/billing";
import { env } from "@/lib/env";

/**
 * Chasing money, politely and on time.
 *
 * PLAIN ENGLISH: reminders go out on the due date, then three days later, then
 * a week later — whatever schedule you set. Each one goes by email and produces
 * a WhatsApp link. A reminder is never sent twice, and never sent at all once
 * the invoice is settled.
 */

export type DunningRunResult = {
  due: number;
  sent: number;
  skippedPaid: number;
  failed: number;
  clientsPaused: number;
  problems: string[];
};

/**
 * Sends whatever reminders are due right now.
 *
 * Safe to run as often as you like: each reminder is marked SENT once, and a
 * settled invoice has its remaining reminders marked SKIPPED rather than sent.
 */
export async function runDunning(options: { now?: Date; dryRun?: boolean } = {}): Promise<DunningRunResult> {
  const now = options.now ?? new Date();
  const org = await prisma.organization.findFirst();
  if (!org) {
    return { due: 0, sent: 0, skippedPaid: 0, failed: 0, clientsPaused: 0, problems: ["No company settings."] };
  }

  const due = await prisma.dunningEvent.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: 200,
    include: {
      invoice: {
        include: {
          client: {
            select: {
              id: true, clientNo: true, contactName: true, companyName: true,
              email: true, phone: true, whatsappPhone: true, locale: true,
              isBookingPaused: true,
            },
          },
        },
      },
    },
  });

  const result: DunningRunResult = {
    due: due.length, sent: 0, skippedPaid: 0, failed: 0, clientsPaused: 0, problems: [],
  };

  const template = await prisma.messageTemplate.findUnique({
    where: { code: "PAYMENT_REMINDER" },
  });

  for (const event of due) {
    const invoice = event.invoice;

    // Nothing owing? The reminder is no longer appropriate.
    const settlement = settleInvoice({
      totalFils: invoice.totalFils,
      paidFils: invoice.amountPaidFils,
      creditedFils: 0,
      dueDate: invoice.dueDate,
      now,
      isVoid: invoice.status === "VOID",
      isDraft: invoice.status === "DRAFT",
    });

    if (settlement.balanceFils <= 0 || invoice.status === "VOID" || invoice.status === "PAID") {
      if (!options.dryRun) {
        await prisma.dunningEvent.update({
          where: { id: event.id },
          data: { status: "SKIPPED", sentAt: now },
        });
      }
      result.skippedPaid += 1;
      continue;
    }

    if (options.dryRun) continue;

    const client = invoice.client;
    const locale = client.locale === "AR" ? "ar" : "en";
    const name = client.companyName ?? client.contactName;
    const values = {
      name,
      invoiceNo: invoice.invoiceNo,
      balance: formatMoney(settlement.balanceFils, locale),
      total: formatMoney(invoice.totalFils, locale),
      dueDate: invoice.dueDate.toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE"),
      daysOverdue: String(settlement.daysOverdue),
      payLink: invoice.stripePaymentLinkUrl ?? `${env.appUrl}/${locale}/portal`,
    };

    const subject = fillTemplate(
      (locale === "ar" ? template?.subjectAr : template?.subjectEn) ??
        `Reminder: invoice {{invoiceNo}}`,
      values,
    );
    const body = fillTemplate(
      (locale === "ar" ? template?.bodyAr : template?.bodyEn) ??
        `Hi {{name}}, invoice {{invoiceNo}} for {{balance}} is now due.`,
      values,
    );

    let delivered = false;

    if (client.email) {
      const emailResult = await sendEmail({
        to: client.email,
        subject,
        text: body,
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6"${locale === "ar" ? ' dir="rtl"' : ""}>
  <p>${body.replace(/\n/g, "<br>")}</p>
  ${invoice.stripePaymentLinkUrl
    ? `<p><a href="${invoice.stripePaymentLinkUrl}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${locale === "ar" ? "ادفع الآن" : "Pay now"}</a></p>`
    : ""}
</div>`,
        relatedEntity: "Invoice",
        relatedId: invoice.id,
        clientId: client.id,
        templateCode: "PAYMENT_REMINDER",
      });
      delivered = emailResult.ok;
      if (!emailResult.ok) result.problems.push(`${invoice.invoiceNo}: ${emailResult.reason}`);
    } else {
      result.problems.push(`${invoice.invoiceNo}: the client has no email address.`);
    }

    // The WhatsApp link is produced either way — it is how most UAE clients
    // actually get chased, and it costs nothing.
    const phone = client.whatsappPhone ?? client.phone;
    if (phone) {
      await logWhatsAppLink({
        toPhone: phone,
        body,
        relatedEntity: "Invoice",
        relatedId: invoice.id,
        clientId: client.id,
        templateCode: "PAYMENT_REMINDER",
      });
    }

    await prisma.dunningEvent.update({
      where: { id: event.id },
      data: {
        status: delivered ? "SENT" : "FAILED",
        sentAt: now,
        error: delivered ? null : "Email could not be sent — see the message log.",
      },
    });

    if (delivered) result.sent += 1;
    else result.failed += 1;

    // Somebody far enough past due may be stopped from booking again.
    if (
      shouldPauseForDebt({
        daysOverdue: settlement.daysOverdue,
        autoPauseEnabled: org.autoPauseOverdueClients,
        pauseAfterDays: org.autoPauseAfterDays,
        alreadyPaused: client.isBookingPaused,
      })
    ) {
      await prisma.client.update({
        where: { id: client.id },
        data: {
          isBookingPaused: true,
          status: "PAUSED",
          bookingPauseReason: `Automatically paused: invoice ${invoice.invoiceNo} is ${settlement.daysOverdue} days overdue.`,
        },
      });
      result.clientsPaused += 1;

      await recordAudit({
        action: "UPDATE",
        entity: "Client",
        entityId: client.id,
        summary: `${client.clientNo} paused automatically — ${invoice.invoiceNo} is ${settlement.daysOverdue} days overdue`,
      });
    }
  }

  if (!options.dryRun && (result.sent > 0 || result.failed > 0)) {
    await recordAudit({
      action: "SEND",
      entity: "DunningEvent",
      entityId: "RUN",
      summary:
        `Payment reminders: ${result.sent} sent, ${result.failed} failed, ` +
        `${result.skippedPaid} no longer needed`,
    });
  }

  return result;
}

/**
 * Brings every invoice's overdue flag up to date.
 *
 * An invoice does not become overdue because somebody looked at it; it becomes
 * overdue because a day passed. This is what notices that.
 */
export async function refreshOverdueInvoices(now = new Date()): Promise<number> {
  const result = await prisma.invoice.updateMany({
    where: {
      deletedAt: null,
      status: { in: ["ISSUED", "PARTIALLY_PAID"] },
      balanceFils: { gt: 0 },
      dueDate: { lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
    },
    data: { status: "OVERDUE" },
  });
  return result.count;
}
