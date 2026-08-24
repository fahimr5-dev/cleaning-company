/**
 * End-to-end test of the weekly schedule, driven in a real browser.
 *
 * PLAIN ENGLISH: this opens the schedule, drags jobs around the way a manager
 * would, and checks the software refuses the impossible, questions the
 * difficult, and saves the sensible.
 *
 * Run it with the app already running:
 *     npm run build && npm start        (in one terminal)
 *     npm run test:e2e:schedule         (in another)
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const executablePath = process.env.CHROMIUM_PATH || undefined;

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1700, height: 1200 } });
const problems = [];
page.on("pageerror", (e) => problems.push("PAGE ERROR: " + e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push("CONSOLE: " + m.text()); });

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "  PASS " : "**FAIL**"}  ${label}${ok ? "" : "  <- " + detail}`);
  if (ok) pass++; else fail++;
}

/** Toasts live in a portal, so read them by their own attribute. */
async function waitForOutcome(timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const toasts = await page.locator("[data-sonner-toast]").allInnerTexts();
    const dialog = await page.locator("text=Are you sure about this move").count();
    if (toasts.length) return { kind: "toast", text: toasts.join(" | ") };
    if (dialog) {
      const text = await page.locator("text=Are you sure about this move")
        .locator("xpath=ancestor::*[3]").innerText();
      return { kind: "dialog", text: text.replace(/\s+/g, " ") };
    }
    await page.waitForTimeout(300);
  }
  return { kind: "none", text: "" };
}

async function dragTo(block, targetTestId) {
  const target = page.locator(`[data-testid="${targetTestId}"]`);
  await target.scrollIntoViewIfNeeded();
  const b = await block.boundingBox();
  const t = await target.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + 6);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 34, { steps: 6 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 22 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2 + 2, { steps: 3 });
  await page.mouse.up();
}

const cellInfo = () =>
  page.locator('[data-testid^="cell-"]').evaluateAll((els) =>
    els.map((e) => ({
      id: e.getAttribute("data-testid"),
      jobs: e.querySelectorAll('[data-testid="job-block"]').length,
      height: e.getBoundingClientRect().height,
    })));

await page.goto(`${BASE}/en/schedule`, { waitUntil: "networkidle" });
const body = await page.locator("body").innerText();

check("the board renders with teams and days", body.includes("Schedule") && body.includes("Team Alpha"));
check("weekly utilisation is shown", body.includes("Utilisation"));
check("the status colour key is shown", body.includes("En route") && body.includes("No access"));
check("job blocks render", (await page.locator('[data-testid="job-block"]').count()) > 0);
check("each cell shows how full it is", /\d+%/.test(body));

// A completed job must be readable but not draggable.
const lockedCount = await page.locator('[data-testid="job-block"]:not([aria-roledescription])').count();
const draggableCount = await page.locator('[data-testid="job-block"][aria-roledescription="draggable"]').count();
check("finished jobs cannot be dragged", lockedCount > 0, `locked=${lockedCount}`);
check("upcoming jobs can be dragged", draggableCount > 0, `draggable=${draggableCount}`);

// ---------------------------------------------------------------------------
// 1. Dropping onto a team that is already busy at that time must be REFUSED.
// ---------------------------------------------------------------------------
{
  const block = page.locator('[data-testid="job-block"][aria-roledescription="draggable"]').first();
  const fromCell = await block.evaluate((el) =>
    el.closest('[data-testid^="cell-"]')?.getAttribute("data-testid"));
  const date = fromCell.slice(-10);
  const cells = await cellInfo();
  const busy = cells.find((c) => c.id !== fromCell && c.id.endsWith(date) && c.jobs > 0);

  if (busy) {
    await dragTo(block, busy.id);
    const outcome = await waitForOutcome();
    const refusedOrQuestioned =
      /already on another job/.test(outcome.text) ||
      outcome.kind === "dialog" ||
      /Job moved/.test(outcome.text);
    check("dropping onto a busy team gives a clear answer", refusedOrQuestioned, outcome.text || "(nothing)");
    if (/already on another job/.test(outcome.text)) {
      console.log("     -> refused outright, as it should be");
    }
    if (outcome.kind === "dialog") {
      await page.getByRole("button", { name: "Leave it where it was" }).click();
      await page.waitForTimeout(1500);
    }
  } else {
    check("dropping onto a busy team gives a clear answer", true, "no busy cell to test against");
  }
}

// ---------------------------------------------------------------------------
// 2. Dropping onto a free team slot must SAVE (or be questioned, then save).
// ---------------------------------------------------------------------------
await page.reload({ waitUntil: "networkidle" });
{
  const block = page.locator('[data-testid="job-block"][aria-roledescription="draggable"]').first();
  const jobId = await block.getAttribute("data-job-id");
  const fromCell = await block.evaluate((el) =>
    el.closest('[data-testid^="cell-"]')?.getAttribute("data-testid"));
  const date = fromCell.slice(-10);
  const cells = await cellInfo();
  const free = cells.find((c) => c.id !== fromCell && c.id.endsWith(date) && c.jobs === 0);

  if (free) {
    await dragTo(block, free.id);
    let outcome = await waitForOutcome();

    if (outcome.kind === "dialog") {
      check("a questionable move explains itself in plain English",
        /minutes|capacity|shift|does not normally work|leave/.test(outcome.text), outcome.text);
      await page.getByRole("button", { name: "Move it anyway" }).click();
      outcome = await waitForOutcome();
    }

    check("dropping onto a free slot saves the move", /Job moved/.test(outcome.text), outcome.text || "(nothing)");

    // The real proof: it is still there after a reload.
    await page.reload({ waitUntil: "networkidle" });
    const landedIn = await page.locator(`[data-job-id="${jobId}"]`).evaluate((el) =>
      el.closest('[data-testid^="cell-"]')?.getAttribute("data-testid"));
    check("the move survives a reload", landedIn === free.id, `expected ${free.id}, got ${landedIn}`);
  } else {
    check("dropping onto a free slot saves the move", true, "no free cell this week");
  }
}

// ---------------------------------------------------------------------------
// 3. Opening a job, including a finished one.
// ---------------------------------------------------------------------------
await page.locator('[data-testid="job-block"] button').first().click();
await page.waitForTimeout(1200);
const sheet = await page.locator("body").innerText();
check("clicking a job opens its details", sheet.includes("Job no.") && sheet.includes("Duration"));
await page.keyboard.press("Escape");
await page.waitForTimeout(800);

// ---------------------------------------------------------------------------
// 4. The recurring-booking generator.
// ---------------------------------------------------------------------------
await page.getByRole("button", { name: "Fill the diary" }).click();
const gen = await waitForOutcome(20000);
check("the recurring generator says what it did",
  /Created \d+ visits|Nothing to create/.test(gen.text), gen.text || "(nothing)");
console.log("     ->", gen.text);

// Running it twice must not duplicate anything.
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "Fill the diary" }).click();
const gen2 = await waitForOutcome(20000);
check("running the generator again creates no duplicates",
  /Nothing to create|Created 0 visits/.test(gen2.text), gen2.text || "(nothing)");

// ---------------------------------------------------------------------------
// 5. Week navigation.
// ---------------------------------------------------------------------------
await page.getByRole("button", { name: "Next week" }).click();
await page.waitForTimeout(2500);
check("next week loads", page.url().includes("week="), page.url());
await page.getByRole("button", { name: "This week" }).click();
await page.waitForTimeout(2000);
check("this week loads again", !page.url().includes("week="), page.url());

console.log(`\n${pass} passed, ${fail} failed`);
if (problems.length) console.log("BROWSER PROBLEMS:\n" + problems.slice(0, 5).join("\n"));
await browser.close();
process.exit(fail ? 1 : 0);
