import { NextResponse, type NextRequest } from "next/server";
import { sendRatingRequests } from "@/lib/ratings";
import { sendNpsSurveys } from "@/lib/nps";
import { detectChurnRisk } from "@/lib/churn";
import { sweepPendingReferrals } from "@/lib/referrals";
import { runComplianceAlerts, runLowStockAlerts } from "@/lib/compliance";

/**
 * The nightly housekeeping job.
 *
 * PLAIN ENGLISH: once a day this sends the "how did we do?" messages that are
 * now due, sends the quarterly survey to anyone due one, rebuilds the list of
 * clients who look like they are leaving, pays out any referral that has
 * quietly qualified since yesterday, warns you about visas and Emirates IDs
 * that are about to expire, and tells you what needs ordering.
 *
 * Protected by CRON_SECRET, the same as the payment reminders. Without that
 * secret set it refuses to run rather than being left open.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "\n!! CRON_SECRET is not set, so the retention job is REFUSING to run.\n" +
        "   That is deliberate: without it, anyone could trigger your customer\n" +
        "   emails. See .env.example, Section 5.\n",
    );
    return NextResponse.json(
      { error: "This scheduled job is not configured yet (CRON_SECRET is missing)." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization");
  const provided = header?.startsWith("Bearer ")
    ? header.slice(7)
    : request.nextUrl.searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  // Run in order, not in parallel: the risk sweep reads what the others write.
  const ratings = await sendRatingRequests();
  const nps = await sendNpsSurveys();
  const referrals = await sweepPendingReferrals();
  const risk = await detectChurnRisk();
  const compliance = await runComplianceAlerts();
  const stock = await runLowStockAlerts();

  return NextResponse.json({ ok: true, ratings, nps, referrals, risk, compliance, stock });
}
