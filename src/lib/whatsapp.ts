/**
 * Builds WhatsApp deep links (wa.me).
 *
 * PLAIN ENGLISH: WhatsApp is how business is actually done in the Gulf, so
 * every message CleanOS sends also comes with a "Send on WhatsApp" button.
 * There is no WhatsApp account or API bill involved — the link simply opens
 * WhatsApp with the message already typed, ready for a human to press send.
 */

/**
 * WhatsApp needs a plain international number with no +, spaces or dashes.
 * A UAE number written 050 123 4567 becomes 971501234567.
 */
export function normalisePhone(raw: string, defaultCountryCode = "971"): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;

  let out = digits.startsWith("+") ? digits.slice(1) : digits;

  // 0501234567 -> 971501234567
  if (out.startsWith("0")) out = defaultCountryCode + out.slice(1);
  // 501234567 -> 971501234567
  else if (out.length === 9 && !out.startsWith(defaultCountryCode)) out = defaultCountryCode + out;

  // Shortest possible international number is 8 digits, longest is 15 (E.164).
  if (out.length < 8 || out.length > 15) return null;
  return out;
}

/** A link that opens WhatsApp with the message pre-typed. */
export function whatsappLink(phone: string, message: string): string | null {
  const number = normalisePhone(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Fills {{placeholders}} in a message template. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    key in values ? values[key] : `{{${key}}}`,
  );
}
