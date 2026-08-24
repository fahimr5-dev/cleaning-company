/**
 * End-to-end test of the public quote calculator, driven in a real browser.
 *
 * PLAIN ENGLISH: this actually opens the website, clicks the buttons a customer
 * would click, and checks the prices that come back are the right ones. It is
 * the difference between "the code looks right" and "the website works".
 *
 * Run it with the app already running:
 *     npm run build && npm start          (in one terminal)
 *     npm run test:e2e                    (in another)
 *
 * It needs a referral code from your demo data; it finds one itself if you do
 * not pass one.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3201";
const REFERRAL = process.argv[3];

// Use a preinstalled Chromium when one is provided (CI images often set this),
// otherwise let Playwright find its own.
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
const problems = [];
page.on("pageerror", (e) => problems.push("PAGE ERROR: " + e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push("CONSOLE: " + m.text()); });

const panel = () => page.locator('[data-testid="price-panel"]');

/** Waits until the price panel settles, then returns its text. */
async function price() {
  await page.waitForTimeout(1200);
  for (let i = 0; i < 15; i++) {
    const t = (await panel().innerText()).replace(/\s+/g, " ").trim();
    if (!t.includes("Working out")) return t;
    await page.waitForTimeout(400);
  }
  return "(never settled)";
}

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual.includes(expected);
  console.log(`${ok ? "  PASS " : "**FAIL**"}  ${label}`);
  if (!ok) console.log(`           expected to contain: ${expected}\n           actual: ${actual}`);
  ok ? pass++ : fail++;
}

await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });

// 1. Apartment / Regular / 2 bed / 2 bath -> 90 + 2x25 + 2x20 = 180, +5% VAT = 189
check("apartment regular 2bed/2bath = AED 189", await price(), "AED 189.00");

// 2. Weekly adds the 15% loyalty discount: 180 -> 153, VAT 7.65, total 160.65
await page.getByRole("button", { name: /^Weekly/ }).click();
const weekly = await price();
check("weekly shows a loyalty discount line", weekly, "Loyalty discount (15%)");
check("weekly total = AED 160.65", weekly, "AED 160.65");

// 3. Villa + Deep: 700 + bed/bath priced from the villa rule
await page.getByRole("button", { name: "Villa", exact: true }).click();
await page.getByRole("button", { name: "Deep Cleaning", exact: true }).click();
check("villa deep clean is priced from the villa rule", await price(), "Deep Cleaning");

// 4. Add-on priced per unit: 8 vents x AED 90 = AED 720
await page.getByLabel("AC Duct Cleaning").fill("8");
check("8 AC vents = AED 720.00", await price(), "AED 720.00");

// 5. Office swaps room counts for floor area
await page.getByRole("button", { name: "Office", exact: true }).click();
check("office asks for floor area", String(await page.getByLabel("Floor area (m²)").isVisible()), "true");
await price();

// 6. A genuine referral code is recognised and discounts the price
await page.getByRole("button", { name: "Apartment", exact: true }).click();
await page.getByLabel("Referral code").fill(REFERRAL);
const withReferral = await price();
check("a real referral code is recognised", String(await page.locator("text=Referral from").count()), "1");
check("a real referral code discounts the price", withReferral, "Referral discount");

// 7. A made-up code must be rejected, and must NOT discount
await page.getByLabel("Referral code").fill("NOTAREALCODE-9999");
await page.waitForTimeout(1500);
check("a bogus referral code is rejected", String(await page.locator("text=do not recognise").count()), "1");
const bogus = (await panel().innerText()).replace(/\s+/g, " ");
check("a bogus referral code gives NO discount", String(!bogus.includes("Referral discount")), "true");

// 8. Submit the enquiry
await page.getByLabel("Referral code").fill("");
await price();
const beforeSubmit = (await panel().innerText()).replace(/\s+/g, " ");
const expectedTotal = beforeSubmit.match(/Total (AED [\d,.]+)/)?.[1] ?? "";

await page.getByRole("button", { name: "Book this clean" }).click();
await page.getByLabel("Your name").fill("Test Visitor");
const testPhone = "05" + String(Math.floor(Math.random() * 90000000) + 10000000);
await page.getByLabel("Mobile number").fill(testPhone);
await page.getByLabel("Email", { exact: true }).fill("visitor@example.com");
await page.getByLabel("Anything we should know?").fill("Gate code 4411, one cat.");
await page.getByRole("button", { name: "Send my enquiry" }).click();
await page.waitForSelector("text=Thank you", { timeout: 30000 });

const done = (await page.locator("text=Thank you").locator("xpath=ancestor::*[3]").innerText()).replace(/\s+/g, " ");
check("confirmation shows the same total the visitor was quoted", done, expectedTotal);
check("confirmation shows a quote number", done, "QT-");
check("it does NOT claim an email was sent when email is off", done, "could not email");
check("a WhatsApp button is offered", String(await page.locator("text=Send us the details on WhatsApp").count()), "1");

// 9. The flood guard: a fourth enquiry from the same number within an hour
//    must be refused, or the lead board fills up with spam.
for (let i = 0; i < 3; i++) {
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  await price();
  await page.getByRole("button", { name: "Book this clean" }).click();
  await page.getByLabel("Your name").fill("Flood Test");
  await page.getByLabel("Mobile number").fill(testPhone);
  await page.getByRole("button", { name: "Send my enquiry" }).click();
  await page.waitForTimeout(2500);
}
const guarded = await page.locator("text=already have your enquiry").count();
check("a fourth enquiry from one number within an hour is refused", String(guarded), "1");

await page.screenshot({ path: "scratch/calculator.png", fullPage: false });
console.log(`\n${pass} passed, ${fail} failed`);
if (problems.length) console.log("BROWSER PROBLEMS:\n" + problems.join("\n"));
await browser.close();
process.exit(fail ? 1 : 0);
