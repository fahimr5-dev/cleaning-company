import "server-only";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

/**
 * Sends transactional email through Resend, and records every attempt.
 *
 * PLAIN ENGLISH: if the email key is missing or Resend rejects the message,
 * this does NOT pretend it worked. It writes a FAILED row to the message log
 * with the reason, prints a loud warning to the server, and returns that
 * failure to the caller so the screen can tell you.
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer }[];
  /** For the message log, so you can trace what an email was about. */
  relatedEntity?: string;
  relatedId?: string;
  clientId?: string;
  templateCode?: string;
};

export type SendEmailResult =
  | { ok: true; providerId: string | null; messageLogId: string }
  | { ok: false; reason: string; messageLogId: string };

function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  return { apiKey, from, configured: Boolean(apiKey && from) };
}

/** True once email can actually be sent — screens use this to warn you. */
export function isEmailConfigured(): boolean {
  return emailConfig().configured;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { apiKey, from, configured } = emailConfig();

  const template = input.templateCode
    ? await prisma.messageTemplate.findUnique({ where: { code: input.templateCode } })
    : null;

  const logBase = {
    channel: "EMAIL" as const,
    templateId: template?.id ?? null,
    clientId: input.clientId ?? null,
    toEmail: input.to,
    subject: input.subject,
    body: input.text ?? null,
    relatedEntity: input.relatedEntity ?? null,
    relatedId: input.relatedId ?? null,
  };

  if (!configured) {
    const reason =
      "Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL in .env, then restart.";
    console.warn(
      `\n!! TODO — EMAIL NOT SENT to ${input.to}: ${reason}\n` +
        `   Subject was: ${input.subject}\n`,
    );
    const log = await prisma.messageLog.create({
      data: { ...logBase, status: "FAILED", error: reason },
    });
    return { ok: false, reason, messageLogId: log.id };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: from!,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (error) {
      console.error(`[email] Resend rejected the message to ${input.to}:`, error.message);
      const log = await prisma.messageLog.create({
        data: { ...logBase, status: "FAILED", error: error.message },
      });
      return { ok: false, reason: error.message, messageLogId: log.id };
    }

    const log = await prisma.messageLog.create({
      data: { ...logBase, status: "SENT", providerId: data?.id ?? null, sentAt: new Date() },
    });
    return { ok: true, providerId: data?.id ?? null, messageLogId: log.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown email error";
    console.error(`[email] Failed to send to ${input.to}:`, reason);
    const log = await prisma.messageLog.create({
      data: { ...logBase, status: "FAILED", error: reason },
    });
    return { ok: false, reason, messageLogId: log.id };
  }
}

/** Records that a WhatsApp link was produced, so comms history is complete. */
export async function logWhatsAppLink(input: {
  toPhone: string;
  body: string;
  relatedEntity?: string;
  relatedId?: string;
  clientId?: string;
  templateCode?: string;
}) {
  const template = input.templateCode
    ? await prisma.messageTemplate.findUnique({ where: { code: input.templateCode } })
    : null;

  return prisma.messageLog.create({
    data: {
      channel: "WHATSAPP",
      templateId: template?.id ?? null,
      clientId: input.clientId ?? null,
      toPhone: input.toPhone,
      body: input.body,
      relatedEntity: input.relatedEntity ?? null,
      relatedId: input.relatedId ?? null,
      // QUEUED, not SENT: a human still has to press send in WhatsApp.
      status: "QUEUED",
    },
  });
}
