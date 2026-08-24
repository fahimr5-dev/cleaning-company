/**
 * End-to-end test of Staff & HR and Inventory.
 *
 *     npm run build && npm start
 *     npm run test:e2e:hr
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const executablePath = process.env.CHROMIUM_PATH || undefined;
const ROLE = process.env.E2E_ROLE ?? "owner";

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

async function toast(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const texts = await page.locator("[data-sonner-toast]").allInnerTexts();
    if (texts.length) return texts.join(" | ");
    await page.waitForTimeout(250);
  }
  return "";
}
async function dismissToasts() {
  await page.locator("[data-sonner-toast]").first().click().catch(() => {});
  await page.waitForTimeout(400);
}
/** Clicks a button that must raise a toast, retrying until it does. */
async function clickForToast(selector, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.locator(selector).first().click({ timeout: 5000 }).catch(() => {});
    const text = await toast(3000);
    if (text) return text;
  }
  return "";
}

/** Server-rendered pages are visible before React attaches; retry the click. */
async function clickUntil(selector, appears, tries = 10) {
  for (let i = 0; i < tries; i++) {
    await page.locator(selector).first().click({ timeout: 5000 }).catch(() => {});
    if (await page.locator(appears).count()) return true;
    await page.waitForTimeout(500);
  }
  return false;
}
const numberIn = (s) => Number(String(s).replace(/[^0-9.-]/g, ""));

/* ============================== STAFF & HR ================================= */

await page.goto(`${BASE}/en/staff`, { waitUntil: "domcontentloaded" });
const staffBody = await page.locator("body").innerText();

check("the staff page renders", staffBody.includes("Staff & HR"), staffBody.slice(0, 150));

const staffRows = await page.locator('[data-testid="staff-row"]').count();
check("staff are listed", staffRows > 0, `found ${staffRows}`);

// Worst compliance first is the reason to open this screen.
const compliance = await page.locator('[data-testid="staff-row"]')
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-compliance")));
const rank = { EXPIRED: 0, MISSING: 1, EXPIRING: 2, VALID: 3 };
check(
  "the worst compliance problems are listed first",
  compliance.every((c, i) => i === 0 || rank[compliance[i - 1]] <= rank[c]),
  compliance.join(", "),
);

check(
  "somebody with lapsed papers is flagged as unable to work",
  compliance.includes("EXPIRED"),
  `states seen: ${[...new Set(compliance)].join(", ")}`,
);
check("the page warns about it up front", await page.locator('[data-testid="blocked-warning"]').count() > 0);

/* --------------------------- the salary restriction ----------------------- */

const salaryCells = await page.locator('[data-testid="salary-cell"]').count();
if (ROLE === "owner") {
  check("the owner sees the salary column", salaryCells > 0, `${salaryCells} cells`);
} else {
  check("an operations manager sees NO salary column", salaryCells === 0, `${salaryCells} cells`);
}

/* --------------------------- filtering the list --------------------------- */

await page.locator('[data-testid="staff-filter-EXPIRED"]').click();
await page.waitForTimeout(900);
const expiredOnly = await page.locator('[data-testid="staff-row"]')
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-compliance")));
check(
  "the Expired filter shows only expired papers",
  expiredOnly.length > 0 && expiredOnly.every((c) => c === "EXPIRED"),
  expiredOnly.join(", ") || "none",
);
await page.locator('[data-testid="staff-filter-ALL"]').click();
await page.waitForTimeout(900);

/* ------------------------------ timesheets -------------------------------- */

const queued = await page.locator('[data-testid="timesheet-row"]').count();
const queuedTotal = Number(await page.locator('[data-testid="timesheet-list"]').getAttribute("data-queued") ?? queued);
check("hours clocked away from the property are queued", queued > 0, `${queued} queued`);
check(
  "a longer queue says how many are not shown, rather than truncating in silence",
  queuedTotal <= 8 || (await page.locator('[data-testid="timesheet-more"]').count()) > 0,
  `${queuedTotal} queued, ${queued} shown`,
);

if (queued > 0) {
  const opened = await clickUntil('[data-testid="review-entry"]', "#review-note");
  check("a queued entry can be opened for review", opened);
  if (opened) {
    await page.locator("#review-note").fill("E2E: called the team lead, parked around the corner.");
    await page.locator('[data-testid="confirm-approve-hours"]').click();
    const t = await toast();
    check("approving makes those hours payable", /approved/i.test(t), t || "no toast");
    await dismissToasts();
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: "domcontentloaded" });
    const after = Number(await page.locator('[data-testid="timesheet-list"]').getAttribute("data-queued"));
    check("the reviewed entry leaves the queue", after === queuedTotal - 1, `${queuedTotal} then ${after}`);
  }
}

/* -------------------------------- leave ----------------------------------- */

const leaveRows = await page.locator('[data-testid="leave-row"]').count();
if (leaveRows > 0) {
  const before = leaveRows;
  const t = await clickForToast('[data-testid="approve-leave"]');
  check("leave can be approved, and says if jobs are affected", /approved/i.test(t), t || "no toast");
  await dismissToasts();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "domcontentloaded" });
  const after = await page.locator('[data-testid="leave-row"]').count();
  check("the decided request leaves the queue", after === before - 1, `${before} then ${after}`);
} else {
  check("the leave queue says plainly when it is empty",
    await page.locator('[data-testid="leave-empty"]').count() > 0);
}

/* --------------------------- one person's file ---------------------------- */

const href = await page.locator('[data-testid="staff-row"] a[href*="/staff/"]').first().getAttribute("href");
await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
const detail = await page.locator("body").innerText();

check("the staff file renders", detail.includes("Legal documents"), detail.slice(0, 150));
check("documents are listed with their state",
  await page.locator('[data-testid="document-row"]').count() > 0);

const remaining = numberIn(await page.locator('[data-testid="leave-remaining"]').innerText());
check("the leave balance is a real number", Number.isFinite(remaining), String(remaining));

if (ROLE === "owner") {
  check("the owner sees the pay panel", detail.includes("Basic salary"), "no pay panel");
} else {
  check("an operations manager is told plainly why pay is hidden",
    await page.locator('[data-testid="salary-hidden"]').count() > 0);
  check("no salary figure leaks onto the page", !detail.includes("Basic salary"));
}

/* ---------------------- renewing a document clears warnings ---------------- */

if (ROLE === "owner") {
  const opened = await clickUntil('[data-testid="document-row"] button', "#doc-expires");
  check("a document can be opened for editing", opened);
  if (opened) {
    const future = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
    await page.locator("#doc-expires").fill(future);
    await page.waitForTimeout(400);
    const warned = await page.locator("body").innerText();
    check(
      "changing the expiry explains that the warnings restart",
      /warnings again from scratch/i.test(warned),
      "no explanation shown",
    );
    await page.locator('[data-testid="save-document"]').click();
    const t = await toast();
    check("the renewed document saves", /saved/i.test(t), t || "no toast");
    await dismissToasts();
  }
}

/* =============================== INVENTORY ================================= */

await page.goto(`${BASE}/en/inventory`, { waitUntil: "domcontentloaded" });
const stockBody = await page.locator("body").innerText();

check("the inventory page renders", stockBody.includes("Inventory"), stockBody.slice(0, 150));

const itemRows = await page.locator('[data-testid="item-row"]').count();
check("stock items are listed", itemRows > 0, `found ${itemRows}`);

const levels = await page.locator('[data-testid="item-row"]')
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-level")));
const levelRank = { OUT_OF_STOCK: 0, REORDER: 1, LOW: 2, OK: 3 };
check(
  "anything you cannot work without is listed first",
  levels.every((l, i) => i === 0 || levelRank[levels[i - 1]] <= levelRank[l]),
  levels.join(", "),
);

check("the ledger explains where the numbers came from",
  await page.locator('[data-testid="ledger-row"]').count() > 0);
check("machines are listed",
  await page.locator('[data-testid="equipment-row"]').count() > 0);

/* ------------------- a stock movement changes the number ------------------ */

const firstQty = numberIn(await page.locator('[data-testid="on-hand"]').first().innerText());
const opened = await clickUntil('[data-testid="item-row"] button', "#movement-qty");
check("a stock movement can be recorded", opened);

if (opened) {
  await page.locator('[data-testid="movement-PURCHASE"]').click();
  await page.locator("#movement-qty").fill("7");
  await page.waitForTimeout(300);
  const preview = await page.locator("body").innerText();
  check(
    "it shows what will be on the shelf afterwards, before you save",
    preview.includes(String(firstQty + 7)),
    `expected ${firstQty + 7} in the preview`,
  );

  await page.locator('[data-testid="save-movement"]').click();
  const t = await toast();
  check("the movement is confirmed with the new quantity", /on the shelf/i.test(t), t || "no toast");

  await dismissToasts();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "domcontentloaded" });
  const afterQty = numberIn(await page.locator('[data-testid="on-hand"]').first().innerText());
  check(
    "the quantity rose by exactly what was bought",
    afterQty === firstQty + 7,
    `${firstQty} + 7 != ${afterQty}`,
  );
}

/* ------------------------------ Arabic RTL -------------------------------- */

await page.goto(`${BASE}/ar/staff`, { waitUntil: "domcontentloaded" });
const dir = await page.locator("html").getAttribute("dir");
const arabic = await page.locator("body").innerText();
check("the Arabic staff page is right-to-left", dir === "rtl", `dir=${dir}`);
check("it is actually translated",
  arabic.includes("الموظفون") && !arabic.includes("Legal documents"));

console.log("");
if (problems.length) {
  console.log("Browser problems:");
  for (const p of [...new Set(problems)].slice(0, 8)) console.log("   " + p);
}
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
