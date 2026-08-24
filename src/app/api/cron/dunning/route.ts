import { NextResponse, type NextRequest } from "next/server";
import { runDunning, refreshOverdueInvoices } from "@/lib/dunning";

/**
 * The scheduled job that chases unpaid invoices.
 *
 * PLAIN ENGLISH: something has to wake up once a day and send the reminders.
 * On Vercel that is a Cron Job pointed at this address.
 *
 * It is protected by CRON_SECRET so that nobody on the internet can trigger
 * your reminder emails by visiting a URL. Without that secret set, this refuses
 * to run at all rather than being left open.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "\n!! CRON_SECRET is not set, so the payment-reminder job is REFUSING to run.\n" +
        "   That is deliberate: without it, anyone could trigger your reminder\n" +
        "   emails. See .env.example, Section 5.\n",
    );
    return NextResponse.json(
      { error: "This scheduled job is not configured yet (CRON_SECRET is missing)." },
      { status: 503 },
    );
  }

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const header = request.headers.get("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : request.nextUrl.searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const overdue = await refreshOverdueInvoices();
  const dunning = await runDunning();

  return NextResponse.json({
    ok: true,
    markedOverdue: overdue,
    ...dunning,
  });
}
