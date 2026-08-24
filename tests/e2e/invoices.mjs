/**
 * End-to-end test of the invoicing screens.
 *
 *     npm run build && npm start
 *     npm run test:e2e:invoices
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const executablePath = process.env.CHROMIUM_PATH || undefined;

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: "en-AE",
});
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push("PAGE ERROR: " + e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push("CONSOLE: " + m.text()); });

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "  PASS " : "**FAIL**"}  ${label}${ok ? "" : "  <- " + detail}`);
  if (ok) pass++; else fail++;
}

/** Sonner toasts live outside the page body text, so read them directly. */
async function toast(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const texts = await page.locator("[data-sonner-toast]").allInnerTexts();
    if (texts.length) return texts.join(" | ");
    await page.waitForTimeout(250);
  }
  return "";
}

const money = (s) => Number(String(s).replace(/[^0-9.]/g, ""));

/* ------------------------------- the list -------------------------------- */

await page.goto(`${BASE}/en/invoices`, { waitUntil: "domcontentloaded" });
const list = await page.locator("body").innerText();

check("the invoice list renders", list.includes("Invoices"), list.slice(0, 200));
check("aged receivables are shown", list.includes("Aged receivables"));

const buckets = {};
for (const key of ["CURRENT", "DAYS_0_30", "DAYS_31_60", "DAYS_60_PLUS"]) {
  buckets[key] = money(await page.locator(`[data-testid="aging-${key}"] dd`).innerText());
}
const bucketSum = Object.values(buckets).reduce((a, b) => a + b, 0);
const outstandingCard = money(
  await page.locator('p:text-is("Outstanding")').locator("xpath=following-sibling::p[1]").innerText(),
);
check(
  "the aging buckets add up to the outstanding total",
  Math.abs(bucketSum - outstandingCard) < 0.05,
  `buckets ${bucketSum.toFixed(2)} vs card ${outstandingCard.toFixed(2)}`,
);

const rowCount = await page.locator('[data-testid="invoice-row"]').count();
check("invoice rows render", rowCount > 0, `found ${rowCount}`);

// Filtering by Overdue must return overdue rows and nothing else.
await page.locator('[data-testid="invoice-filter-OVERDUE"]').click();
await page.waitForTimeout(900);
const overdueStatuses = await page.locator('[data-testid="invoice-row"]')
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
check(
  "the Overdue filter shows only overdue invoices",
  overdueStatuses.length > 0 && overdueStatuses.every((s) => s === "OVERDUE"),
  `statuses: ${[...new Set(overdueStatuses)].join(", ") || "none"}`,
);

// Back to unpaid, and pick one with a balance to work on.
await page.locator('[data-testid="invoice-filter-UNPAID"]').click();
await page.waitForTimeout(900);
const target = await page.locator('[data-testid="invoice-row"] a[href*="/invoices/"]').first().getAttribute("href");
check("an unpaid invoice can be opened", Boolean(target), String(target));
if (!target) {
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(1);
}

/* ------------------------------ the invoice ------------------------------ */

await page.goto(`${BASE}${target}`, { waitUntil: "domcontentloaded" });
const detail = await page.locator("body").innerText();

check("the invoice page renders", detail.includes("Balance due"), detail.slice(0, 200));
check("the tax details are frozen onto the invoice", detail.includes("TRN"), "no TRN shown");

const total = money(await page.locator('[data-testid="invoice-total"]').innerText());
const balanceBefore = money(await page.locator('[data-testid="invoice-balance"]').innerText());
check("the invoice has a total", total > 0, String(total));
check("the invoice has money outstanding", balanceBefore > 0, String(balanceBefore));

// The VAT arithmetic on screen must be internally consistent: subtotal − discount + VAT = total.
const rowValue = async (label) => {
  const cell = page.locator(`tfoot tr:has-text("${label}") td`).last();
  return (await cell.count()) ? money(await cell.innerText()) : 0;
};
const subtotal = await rowValue("Subtotal before VAT");
const discount = await rowValue("Discount");
const vat = await rowValue("VAT at");
check(
  "subtotal minus discount plus VAT equals the total",
  Math.abs(subtotal - discount + vat - total) < 0.02,
  `${subtotal} - ${discount} + ${vat} != ${total}`,
);

/* ---------------------------- record a payment ---------------------------- */

// Pay half, so PARTIALLY_PAID is exercised as well as the balance maths.
const half = Math.round((balanceBefore / 2) * 100) / 100;
await page.getByRole("button", { name: "Record a payment" }).first().click();
await page.waitForTimeout(500);
await page.locator("#pay-amount").fill(String(half));
await page.locator("#pay-ref").fill("E2E-TEST-REF");
await page.getByRole("button", { name: "Record payment" }).click();

const paidToast = await toast();
check("the payment is confirmed with its number", /PAY-/.test(paidToast), paidToast || "no toast");

await page.waitForTimeout(1500);
await page.reload({ waitUntil: "domcontentloaded" });
const balanceAfter = money(await page.locator('[data-testid="invoice-balance"]').innerText());
check(
  "the balance drops by exactly what was paid",
  Math.abs(balanceBefore - half - balanceAfter) < 0.02,
  `${balanceBefore} - ${half} != ${balanceAfter}`,
);

const afterText = await page.locator("body").innerText();
check("the payment appears in the payment list", afterText.includes("E2E-TEST-REF"));
check("the invoice now reads as part paid", afterText.includes("Part paid"), "status did not change");

/* ------------------------------ reconcile it ------------------------------ */

await page.getByRole("button", { name: "Mark reconciled" }).first().click();
const reconciledToast = await toast();
check("a payment can be reconciled", /reconciled/i.test(reconciledToast), reconciledToast || "no toast");

/* ------------------------------- credit note ------------------------------ */

await page.waitForTimeout(1200);
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Issue a credit note" }).click();
await page.waitForTimeout(500);
// Over-credit on purpose: the screen must refuse rather than unbalance the books.
await page.locator("#credit-amount").fill(String(total + 100));
await page.locator("#credit-reason").fill("E2E over-credit attempt");
const issueButton = page.getByRole("button", { name: "Issue credit note" });
check(
  "crediting more than the invoice is blocked",
  await issueButton.isDisabled(),
  "the button stayed enabled",
);

await page.locator("#credit-amount").fill("10.00");
await page.waitForTimeout(300);
await issueButton.click();
const creditToast = await toast();
check("a valid credit note is issued", /CN-/.test(creditToast), creditToast || "no toast");

/* ----------------------------- the PDF invoice ---------------------------- */

const invoiceId = target.split("/").pop();
const pdf = await page.request.get(`${BASE}/api/invoice/${invoiceId}/pdf`);
const pdfBody = await pdf.body();
check("the invoice PDF downloads", pdf.status() === 200, `status ${pdf.status()}`);
check(
  "it is a real PDF, not an error page",
  pdfBody.subarray(0, 5).toString() === "%PDF-" && pdfBody.length > 5000,
  `${pdfBody.length} bytes, starts "${pdfBody.subarray(0, 5).toString()}"`,
);

/* --------------------------- the month-end run ---------------------------- */

await page.goto(`${BASE}/en/invoices`, { waitUntil: "domcontentloaded" });
await page.locator('[data-testid="run-monthly"]').click();
const runToast = await toast(20000);
check(
  "the monthly billing run reports what it did",
  /invoices for|Nothing to invoice/i.test(runToast),
  runToast || "no toast",
);

// Pressing it a second time must not invoice the same jobs again.
await page.waitForTimeout(1500);
await page.locator("[data-sonner-toast]").first().click().catch(() => {});
await page.waitForTimeout(500);
await page.locator('[data-testid="run-monthly"]').click();
const secondRun = await toast(20000);
check(
  "running it twice invoices nothing the second time",
  /Nothing to invoice/i.test(secondRun),
  secondRun || "no toast",
);

/* ------------------------------- Arabic RTL ------------------------------- */

await page.goto(`${BASE}/ar/invoices`, { waitUntil: "domcontentloaded" });
const dir = await page.locator("html").getAttribute("dir");
const arabic = await page.locator("body").innerText();
check("the Arabic invoice list is right-to-left", dir === "rtl", `dir=${dir}`);
check("it is actually translated", arabic.includes("الفواتير") && !arabic.includes("Aged receivables"));

console.log("");
if (problems.length) {
  console.log("Browser problems:");
  for (const p of [...new Set(problems)]) console.log("   " + p);
}
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
