/**
 * End-to-end test of the retention screens and the public rating page.
 *
 *     npm run build && npm start
 *     npm run test:e2e:retention
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const executablePath = process.env.CHROMIUM_PATH || undefined;

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-AE" });
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push("PAGE ERROR: " + e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push("CONSOLE: " + m.text()); });

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "  PASS " : "**FAIL**"}  ${label}${ok ? "" : "  <- " + detail}`);
  if (ok) pass++; else fail++;
}

async function toast(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const texts = await page.locator("[data-sonner-toast]").allInnerTexts();
    if (texts.length) return texts.join(" | ");
    await page.waitForTimeout(250);
  }
  return "";
}
/**
 * Clicks a button that must produce a toast, retrying until it does.
 *
 * A page rendered on the server is visible before React has attached its click
 * handlers, so the very first click can land on nothing. Retrying is what a
 * real person does anyway.
 */
async function clickForToast(selector, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.locator(selector).click({ timeout: 5000 }).catch(() => {});
    const text = await toast(4000);
    if (text) return text;
  }
  return "";
}

async function dismissToasts() {
  await page.locator("[data-sonner-toast]").first().click().catch(() => {});
  await page.waitForTimeout(400);
}

/* ---------------------------- the retention page -------------------------- */

await page.goto(`${BASE}/en/retention`, { waitUntil: "domcontentloaded" });
const body = await page.locator("body").innerText();

check("the retention page renders", body.includes("Retention"), body.slice(0, 200));
check("it shows the average rating", body.includes("Average rating"));
check("it shows the NPS panel", body.includes("Would they recommend you?"));
check("it shows the referral panel", body.includes("Referrals"));

// The seed rates most jobs, so an average must actually be there.
const avgCard = await page.locator('p:text-is("Average rating")').locator("xpath=following-sibling::p[1]").innerText();
const avg = Number(avgCard);
check("the average rating is a real number out of five", avg > 0 && avg <= 5, avgCard);

const ratingRows = await page.locator('[data-testid="rating-row"]').count();
check("recent ratings are listed", ratingRows > 0, `found ${ratingRows}`);

// A low rating must carry the complaint ticket it opened.
const lowWithTicket = await page.locator('[data-testid="rating-row"]').evaluateAll((els) =>
  els.filter((e) => Number(e.getAttribute("data-stars")) < 4)
     .map((e) => /TKT-/.test(e.textContent ?? "")));
check(
  "every low rating shown has opened a complaint ticket",
  lowWithTicket.length === 0 || lowWithTicket.every(Boolean),
  `${lowWithTicket.filter(Boolean).length}/${lowWithTicket.length} had a ticket`,
);

/* -------------------------- rebuilding the risk list ---------------------- */

const before = await page.locator('[data-testid="risk-row"]').count();
const rebuiltToast = await clickForToast('[data-testid="rebuild-risk"]');
check("rebuilding the risk list reports what it checked", /Checked \d+ clients/.test(rebuiltToast), rebuiltToast || "no toast");

await dismissToasts();
await page.waitForTimeout(1200);
await page.reload({ waitUntil: "domcontentloaded" });
const after = await page.locator('[data-testid="risk-row"]').count();
check("the risk list is populated after rebuilding", after > 0, `${before} before, ${after} after`);

// Scores must be inside the documented 0-100 range and sorted worst first.
const scores = await page.locator('[data-testid="risk-score"]').allInnerTexts()
  .then((t) => t.map((s) => Number(s.replace(/\D/g, ""))));
check("every risk score is between 0 and 100", scores.every((s) => s >= 0 && s <= 100), scores.join(", "));
check(
  "the worst-risk client is listed first",
  scores.every((s, i) => i === 0 || scores[i - 1] >= s),
  scores.join(", "),
);

// Running it twice must not duplicate the warnings.
await clickForToast('[data-testid="rebuild-risk"]');
await dismissToasts();
await page.waitForTimeout(1200);
await page.reload({ waitUntil: "domcontentloaded" });
const third = await page.locator('[data-testid="risk-row"]').count();
check("rebuilding twice does not duplicate warnings", third === after, `${after} then ${third}`);

/* ------------------------- handling one warning --------------------------- */

// Wait for the dialog rather than assuming the click took, for the same reason.
for (let i = 0; i < 10; i++) {
  await page.locator('[data-testid="resolve-flag"]').first().click({ timeout: 5000 }).catch(() => {});
  if (await page.locator("#flag-note").count()) break;
  await page.waitForTimeout(500);
}
await page.locator("#flag-note").fill("E2E: called the client, moved them to Thursdays.");
await page.locator('[data-testid="confirm-actioned"]').click();
const resolvedToast = await toast();
check("a warning can be handled and closed", /closed/i.test(resolvedToast), resolvedToast || "no toast");

/* ----------------------------- the campaign gate -------------------------- */

await dismissToasts();
await page.waitForTimeout(1200);
await page.reload({ waitUntil: "domcontentloaded" });
for (let i = 0; i < 10; i++) {
  await page.locator('[data-testid="build-winback"]').click({ timeout: 5000 }).catch(() => {});
  if (await page.locator('[data-testid="create-campaign"]').count()) break;
  await page.waitForTimeout(600);
}
await page.waitForTimeout(2500);

const emptyAudience = await page.locator('[data-testid="winback-empty"]').count();
if (emptyAudience > 0) {
  check("the win-back builder says plainly when nobody is due", true);
} else {
  const countText = await page.locator('[data-testid="winback-count"]').innerText();
  check("the win-back builder shows exactly who would be messaged", /\d+ of \d+ selected/.test(countText), countText);

  await page.locator('[data-testid="create-campaign"]').click();
  const draftToast = await toast();
  check(
    "creating the list sends nothing — it only drafts",
    /Nothing has been sent yet/i.test(draftToast),
    draftToast || "no toast",
  );

  await dismissToasts();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "domcontentloaded" });

  const draftRows = await page.locator('[data-testid="campaign-row"][data-status="DRAFT"]').count();
  check("the campaign is waiting as a draft", draftRows > 0, `${draftRows} drafts`);

  // Approval is a separate, deliberate second click.
  await page.locator('[data-testid="approve-campaign"]').first().click();
  await page.waitForTimeout(600);
  const warning = await page.locator("body").innerText();
  check(
    "approving warns that it cannot be taken back",
    /cannot be taken back/i.test(warning),
    "no warning shown",
  );
  await page.keyboard.press("Escape");
}

/* --------------------------- the public rating page ----------------------- */

const invented = await page.request.get(`${BASE}/en/rate/${"0".repeat(32)}`);
check("an invented rating link is refused with a 404", invented.status() === 404, `status ${invented.status()}`);

// A real, unanswered rating link from the seed must open and accept a rating.
const pendingToken = process.env.E2E_RATING_TOKEN;
if (pendingToken) {
  await page.goto(`${BASE}/en/rate/${pendingToken}`, { waitUntil: "domcontentloaded" });
  const ratePage = await page.locator("body").innerText();
  check("a real rating link opens without any login", /how did we do/i.test(ratePage), ratePage.slice(0, 120));

  for (let i = 0; i < 10; i++) {
    await page.locator('[data-testid="overall-5"]').click({ timeout: 5000 }).catch(() => {});
    if (await page.locator("#rating-comment").count()) break;
    await page.waitForTimeout(500);
  }
  check("choosing stars reveals the detail questions", await page.locator("#rating-comment").count() > 0);

  await page.locator("#rating-comment").fill("E2E: spotless, thank you.");
  await page.locator('[data-testid="submit-rating"]').click();
  await page.waitForTimeout(2500);
  const thanks = await page.locator("body").innerText();
  check("submitting five stars thanks the client", /thank you/i.test(thanks), thanks.slice(0, 120));
  check("five stars asks for a Google review", /google/i.test(thanks), "no Google prompt");

  await page.goto(`${BASE}/en/rate/${pendingToken}`, { waitUntil: "domcontentloaded" });
  const second = await page.locator("body").innerText();
  check("the same link cannot be used twice", /already rated/i.test(second), second.slice(0, 120));
}

console.log("");
if (problems.length) {
  console.log("Browser problems:");
  for (const p of [...new Set(problems)].slice(0, 8)) console.log("   " + p);
}
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
