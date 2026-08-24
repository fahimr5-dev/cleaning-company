/**
 * End-to-end test of the cleaner's mobile view, at a real phone size.
 *
 *     npm run build && npm start
 *     npm run test:e2e:field
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const executablePath = process.env.CHROMIUM_PATH || undefined;

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, // iPhone-sized
  isMobile: true,
  hasTouch: true,
  // Grant location and pretend to be standing in Dubai Marina.
  permissions: ["geolocation"],
  geolocation: { latitude: 25.0805, longitude: 55.1403 },
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

async function toast(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const texts = await page.locator("[data-sonner-toast]").allInnerTexts();
    if (texts.length) return texts.join(" | ");
    await page.waitForTimeout(250);
  }
  return "";
}

await page.goto(`${BASE}/en/field`, { waitUntil: "networkidle" });
const day = await page.locator("body").innerText();

check("the day list renders", day.includes("Today's jobs"));
check("it shows a summary of the day", day.includes("Jobs") && day.includes("Hours"));

const cards = await page.locator('[data-testid="field-job"]').count();
check("job cards render", cards > 0, `found ${cards}`);
if (cards === 0) {
  console.log("\n(no jobs today for this cleaner — nothing further to test)");
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
}

// Open the first job that is not already finished. Navigate by address rather
// than by tapping, so a mis-aimed tap cannot look like a broken page.
const candidates = await page.locator('[data-testid="field-job"]').evaluateAll((els) =>
  els.map((e) => ({ href: e.getAttribute("href"), status: e.getAttribute("data-status") })));
// Status is shown as an icon, not as text, so select on the real value.
// Prefer one nobody has arrived at yet, so clocking IN is exercised rather
// than clocking out of a job the seed already started.
const open =
  candidates.find((c) => c.status === "SCHEDULED") ??
  candidates.find((c) => c.status === "EN_ROUTE" || c.status === "IN_PROGRESS");
check("there is an unfinished job to work through", Boolean(open),
  `statuses seen: ${candidates.map((c) => c.status).join(", ")}`);
if (!open) {
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(1);
}
await page.goto(`${BASE}${open.href}`, { waitUntil: "networkidle" });

const detail = await page.locator("body").innerText();
check("the job detail opens", detail.includes("Checklist") && detail.includes("Photos"));
check("directions link is offered", (await page.locator("text=Get directions").count()) > 0);
check("a way to report a problem is offered", detail.includes("Report a problem"));

// --- the completion gate -------------------------------------------------
const items = await page.locator('[data-testid="checklist-item"]').count();
check("the checklist renders", items > 0, `found ${items}`);

const outstanding = await page.locator('[data-testid="checklist-item"][data-mandatory="true"][data-checked="false"]').count();
const finishBtn = page.locator('[data-testid="complete-job"]');

if (outstanding > 0) {
  check("Finish is blocked while required items are unticked", await finishBtn.isDisabled(),
    `${outstanding} outstanding but the button was enabled`);
}

// --- clocking in ---------------------------------------------------------
const clockIn = page.getByRole("button", { name: "Clock in" });
check("a clock-in button is offered on an unfinished job", (await clockIn.count()) > 0);
if (await clockIn.count()) {
  await clockIn.click();
  const t1 = await toast(15000);
  check("clocking in works and reports back", /Clocked in/.test(t1), t1 || "(no toast)");
  // Standing at the property, so it must NOT be flagged as far away.
  check("standing at the address is not flagged", !/away|could not read/i.test(t1), t1);
  await page.waitForTimeout(1500);
}

// --- ticking the checklist ----------------------------------------------
const unchecked = page.locator('[data-testid="checklist-item"][data-checked="false"]');
const toTick = Math.min(await unchecked.count(), 30);
for (let i = 0; i < toTick; i++) {
  const next = page.locator('[data-testid="checklist-item"][data-checked="false"]').first();
  if (!(await next.count())) break;
  await next.click();
  await page.waitForTimeout(450);
}
await page.reload({ waitUntil: "networkidle" });

const stillOutstanding = await page.locator('[data-testid="checklist-item"][data-mandatory="true"][data-checked="false"]').count();
check("ticks are saved (they survive a reload)", stillOutstanding === 0, `${stillOutstanding} still unticked`);

// --- finishing -----------------------------------------------------------
const finish = page.locator('[data-testid="complete-job"]');
check("a finish button is present", (await finish.count()) > 0);
if (await finish.count()) {
  check("Finish becomes available once required items are ticked", !(await finish.isDisabled()));
  await finish.click();
  const t2 = await toast(15000);
  check("finishing the job works", /Job finished/.test(t2), t2 || "(no toast)");

  await page.reload({ waitUntil: "networkidle" });
  check("the job is now marked completed", (await page.locator("body").innerText()).includes("Completed"));
}

// --- reporting a problem -------------------------------------------------
await page.getByRole("button", { name: "Report a problem" }).click();
await page.waitForTimeout(800);
check("the problem form opens", (await page.locator("text=What happened?").count()) > 0);
await page.getByRole("button", { name: "Damage found" }).click();
await page.getByLabel("In a few words").fill("Chipped tile in the bathroom");
await page.getByLabel("What should the office know?").fill("Found on arrival, before we started.");
await page.getByRole("button", { name: "Send to office" }).click();
const t3 = await toast(15000);
check("the problem is reported and gets a ticket number", /Reported — ticket TKT-/.test(t3), t3 || "(no toast)");

await page.screenshot({ path: "scratch/field.png", fullPage: false });
console.log(`\n${pass} passed, ${fail} failed`);
if (problems.length) console.log("BROWSER PROBLEMS:\n" + problems.slice(0, 5).join("\n"));
await browser.close();
process.exit(fail ? 1 : 0);
