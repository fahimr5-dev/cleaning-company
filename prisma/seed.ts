/**
 * CleanOS demo data.
 *
 * PLAIN ENGLISH: this fills an empty database with a believable month-by-month
 * history for a Dubai cleaning company — 20 clients, 4 teams, 200 jobs, plus the
 * invoices, ratings, complaints and stock movements those jobs would have
 * produced — so every screen has something real in it the first time you open it.
 *
 * Run it with:  npm run db:seed
 * It wipes the demo data and rebuilds it, so it is safe to run again.
 *
 * The numbers are deliberately reproducible: the same seed always produces the
 * same 200 jobs, so a figure you see on the dashboard today is the same one you
 * see tomorrow.
 */

import { PrismaClient } from "@prisma/client";
import type { Frequency, JobStatus, Team, Zone } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { priceService, totalsFor, type RateCardRule } from "../src/lib/pricing";
import { aed, vatOn } from "../src/lib/money";

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env — variables already in the environment */
}

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL (or DIRECT_URL) is not set. Copy .env.example to .env first.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// ---------------------------------------------------------------------------
// Reproducible randomness. A fixed starting number means "random" choices come
// out the same every run.
// ---------------------------------------------------------------------------
let _seed = 20260101;
function rnd(): number {
  _seed |= 0;
  _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p: number) => rnd() < p;

// ---------------------------------------------------------------------------
// Dates. "Today" is the day you run the seed, so the calendar always has jobs
// in the past, jobs today and jobs coming up.
// ---------------------------------------------------------------------------
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const day = (offset: number) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offset);
  return d;
};
const at = (d: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const out = new Date(d);
  out.setHours(h, m, 0, 0);
  return out;
};
const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);
/** Weekend is Friday(5) + Saturday(6), matching the founder's confirmed setting. */
const isWeekend = (d: Date) => d.getDay() === 5 || d.getDay() === 6;

// Fixed IDs for the demo logins so they survive a re-seed.
const USER_IDS = {
  owner: "00000000-0000-4000-8000-000000000001",
  ops: "00000000-0000-4000-8000-000000000002",
  cleaner: "00000000-0000-4000-8000-000000000003",
  client: "00000000-0000-4000-8000-000000000004",
} as const;

export const DEMO_LOGINS = [
  { key: "owner", email: "owner@cleanos.demo", role: "OWNER", name: "Fahim Rahman" },
  { key: "ops", email: "ops@cleanos.demo", role: "OPS_MANAGER", name: "Layla Haddad" },
  { key: "cleaner", email: "cleaner@cleanos.demo", role: "CLEANER", name: "Maria Santos" },
  { key: "client", email: "client@cleanos.demo", role: "CLIENT", name: "Omar Al Suwaidi" },
] as const;

async function wipe() {
  // Deleted child-first so foreign keys never complain.
  const order = [
    "equipmentMaintenance", "equipment", "jobConsumable", "stockMovement", "inventoryItem",
    "messageLog", "messageTemplate", "campaignRecipient", "campaign", "clientRiskFlag",
    "npsResponse", "ticketAttachment", "ticketComment",
    "dunningEvent", "packageUsage", "clientPackage", "package",
    "creditNoteLine", "creditNote", "payment", "invoiceLine", "invoice",
    "rating", "ticket",
    "timeEntry", "jobPhoto", "jobChecklistItem", "jobAssignment", "jobLine", "job",
    "recurringSeries", "checklistTemplateItem", "checklistTemplate",
    "leaveRequest", "teamMember", "team",
    "complianceAlert", "staffDocument", "staff",
    "referral", "quoteLine", "quote", "leadActivity", "lead",
    "clientProperty", "client",
    "marketingSpend", "frequencyModifier", "rateCardItem", "rateCard", "serviceType",
    "zoneTravelTime", "zone", "documentCounter", "auditLog", "user", "organization",
  ] as const;
  for (const model of order) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[model].deleteMany({});
  }
}

async function main() {
  console.log("Clearing existing demo data…");
  await wipe();

  // -------------------------------------------------------------------------
  // 1. Company settings
  // -------------------------------------------------------------------------
  const org = await prisma.organization.create({
    data: {
      name: "Sparkle Facilities Management LLC",
      nameAr: "سباركل لإدارة المرافق ذ.م.م",
      legalName: "Sparkle Facilities Management LLC",
      trn: "100123456700003",
      vatRateBps: 500,
      weekendDays: [5, 6], // Friday + Saturday
      timezone: "Asia/Dubai",
      addressLine1: "Office 1204, Clover Bay Tower",
      addressLine2: "Business Bay",
      city: "Dubai",
      emirate: "Dubai",
      poBox: "294093",
      phone: "+971 4 123 4567",
      whatsappNumber: "+971501234567",
      email: "hello@sparkleclean.ae",
      website: "https://sparkleclean.ae",
      invoiceFooterEn: "Payment due within 7 days. Bank transfer or card accepted. TRN 100123456700003.",
      invoiceFooterAr: "الدفع مستحق خلال ٧ أيام. نقبل التحويل البنكي أو البطاقة. الرقم الضريبي ١٠٠١٢٣٤٥٦٧٠٠٠٠٣",
      bankName: "Emirates NBD",
      bankAccountName: "Sparkle Facilities Management LLC",
      bankIban: "AE070331234567890123456",
      rescheduleCutoffHours: 24,
      lateCancellationFeeBps: 0, // founder confirmed: no cancellation fees today
      lateCancellationFeeFlatFils: 0,
      geofenceRadiusMeters: 200,
      ratingRequestDelayMinutes: 120,
      reCleanRatingThreshold: 4,
      googleReviewUrl: "https://g.page/r/sparkleclean-dubai/review",
      referralDiscountType: "FIXED",
      referrerRewardValue: aed(50),
      refereeRewardValue: aed(50),
      dunningOffsetsDays: [0, 3, 7],
      autoPauseOverdueClients: false,
      autoPauseAfterDays: 14,
      complianceAlertDays: [60, 30, 7],
      complianceAlertEmail: "owner@cleanos.demo",
      lowStockAlertEmail: "ops@cleanos.demo",
    },
  });

  // -------------------------------------------------------------------------
  // 2. Service areas and how long it takes to drive between them
  // -------------------------------------------------------------------------
  const zoneSpec = [
    { nameEn: "Dubai Marina", nameAr: "دبي مارينا", cluster: "W", lat: 25.0805, lng: 55.1403 },
    { nameEn: "Jumeirah Lakes Towers", nameAr: "أبراج بحيرات جميرا", cluster: "W", lat: 25.0693, lng: 55.1401 },
    { nameEn: "Jumeirah Village Circle", nameAr: "قرية جميرا الدائرية", cluster: "W", lat: 25.0559, lng: 55.2094 },
    { nameEn: "Al Barsha", nameAr: "البرشاء", cluster: "W", lat: 25.1119, lng: 55.1962 },
    { nameEn: "Downtown Dubai", nameAr: "وسط مدينة دبي", cluster: "C", lat: 25.1972, lng: 55.2744 },
    { nameEn: "Business Bay", nameAr: "الخليج التجاري", cluster: "C", lat: 25.1857, lng: 55.2766 },
    { nameEn: "Jumeirah", nameAr: "جميرا", cluster: "C", lat: 25.2048, lng: 55.2405 },
    { nameEn: "Deira", nameAr: "ديرة", cluster: "E", lat: 25.2697, lng: 55.3095 },
    { nameEn: "Mirdif", nameAr: "مردف", cluster: "E", lat: 25.2172, lng: 55.4208 },
    { nameEn: "Dubai Silicon Oasis", nameAr: "واحة دبي للسيليكون", cluster: "E", lat: 25.1279, lng: 55.3861 },
  ];

  const zones: Zone[] = [];
  for (let i = 0; i < zoneSpec.length; i++) {
    const z = zoneSpec[i];
    zones.push(
      await prisma.zone.create({
        data: { nameEn: z.nameEn, nameAr: z.nameAr, emirate: "Dubai", sortOrder: i },
      }),
    );
  }

  const clusterOf = (id: string) => zoneSpec[zones.findIndex((z) => z.id === id)].cluster;
  const travelRows: { fromZoneId: string; toZoneId: string; minutes: number }[] = [];
  for (const from of zones) {
    for (const to of zones) {
      const a = clusterOf(from.id);
      const b = clusterOf(to.id);
      let minutes: number;
      if (from.id === to.id) minutes = 10;
      else if (a === b) minutes = 20;
      // West <-> East is the long cross-city run, e.g. Marina -> Mirdif.
      else if ((a === "W" && b === "E") || (a === "E" && b === "W")) minutes = 45;
      else minutes = 30;
      travelRows.push({ fromZoneId: from.id, toZoneId: to.id, minutes });
    }
  }
  await prisma.zoneTravelTime.createMany({ data: travelRows });

  // -------------------------------------------------------------------------
  // 3. Services and the rate card
  // -------------------------------------------------------------------------
  const serviceSpec = [
    { code: "REGULAR", nameEn: "Regular Cleaning", nameAr: "تنظيف دوري", category: "CORE", mins: 120, cleaners: 2,
      descEn: "Kitchen, bathrooms, bedrooms and floors, on a schedule that suits you.",
      descAr: "المطبخ والحمامات وغرف النوم والأرضيات، وفق جدول يناسبك." },
    { code: "DEEP", nameEn: "Deep Cleaning", nameAr: "تنظيف عميق", category: "CORE", mins: 300, cleaners: 3,
      descEn: "Inside the oven, inside the fridge, inside the cupboards, descaled tiles and grouting.",
      descAr: "داخل الفرن والثلاجة والخزائن، وإزالة الترسبات من البلاط والفواصل." },
    { code: "MOVE_IN_OUT", nameEn: "Move In / Move Out", nameAr: "تنظيف عند الانتقال", category: "CORE", mins: 360, cleaners: 3,
      descEn: "An empty property returned to handover condition, ready for your landlord's inspection.",
      descAr: "إعادة العقار الفارغ إلى حالة التسليم، جاهزاً لمعاينة المالك." },
    { code: "POST_CONSTRUCTION", nameEn: "Post-Construction Cleaning", nameAr: "تنظيف ما بعد البناء", category: "CORE", mins: 480, cleaners: 4,
      descEn: "Fine dust, paint and adhesive residue removed after a fit-out or renovation.",
      descAr: "إزالة الغبار الدقيق وبقايا الطلاء واللاصق بعد التشطيب أو التجديد." },
    { code: "AC_DUCT", nameEn: "AC Duct Cleaning", nameAr: "تنظيف مجاري التكييف", category: "ADDON", mins: 180, cleaners: 2,
      descEn: "Priced per vent. Recommended once a year in Dubai, more often if you have pets.",
      descAr: "السعر لكل فتحة. يُنصح به مرة سنوياً في دبي، وأكثر إن كان لديك حيوانات أليفة." },
    { code: "SOFA_CARPET", nameEn: "Sofa & Carpet Shampoo", nameAr: "تنظيف الأرائك والسجاد", category: "ADDON", mins: 120, cleaners: 2,
      descEn: "Hot-water extraction, priced per seat or per rug. Dries in three to four hours.",
      descAr: "تنظيف بالاستخلاص الساخن، السعر لكل مقعد أو سجادة. يجف خلال ٣ إلى ٤ ساعات." },
  ] as const;

  const services: Record<string, { id: string; code: string; defaultCleaners: number }> = {};
  for (let i = 0; i < serviceSpec.length; i++) {
    const s = serviceSpec[i];
    const row = await prisma.serviceType.create({
      data: {
        code: s.code,
        nameEn: s.nameEn,
        nameAr: s.nameAr,
        category: s.category,
        descriptionEn: s.descEn,
        descriptionAr: s.descAr,
        defaultDurationMinutes: s.mins,
        defaultCleaners: s.cleaners,
        sortOrder: i,
      },
    });
    services[s.code] = { id: row.id, code: row.code, defaultCleaners: row.defaultCleaners };
  }

  const rateCard = await prisma.rateCard.create({
    data: {
      name: "2026 Standard Rate Card",
      isActive: true,
      effectiveFrom: day(-365),
      notes: "Prices are VAT-exclusive. 5% VAT is added on the invoice.",
    },
  });

  // basePrice / perBedroom / perBathroom / perSqm / perUnit / minimum, all in dirhams.
  const rateSpec: Array<{
    code: string; property: "APARTMENT" | "VILLA" | "OFFICE"; model: RateCardRule["pricingModel"];
    base: number; bed?: number; bath?: number; sqm?: number; unit?: number; min: number;
    mBase: number; mBed?: number; mBath?: number; m100?: number; mUnit?: number;
  }> = [
    { code: "REGULAR", property: "APARTMENT", model: "PER_ROOM", base: 90, bed: 25, bath: 20, min: 120, mBase: 60, mBed: 20, mBath: 15 },
    { code: "REGULAR", property: "VILLA", model: "PER_ROOM", base: 150, bed: 30, bath: 25, min: 250, mBase: 90, mBed: 25, mBath: 20 },
    { code: "REGULAR", property: "OFFICE", model: "PER_SQM", base: 100, sqm: 0.6, min: 200, mBase: 60, m100: 25 },
    { code: "DEEP", property: "APARTMENT", model: "PER_ROOM", base: 350, bed: 120, bath: 100, min: 500, mBase: 150, mBed: 50, mBath: 40 },
    { code: "DEEP", property: "VILLA", model: "PER_ROOM", base: 700, bed: 150, bath: 120, min: 1200, mBase: 210, mBed: 60, mBath: 45 },
    { code: "DEEP", property: "OFFICE", model: "PER_SQM", base: 400, sqm: 2.5, min: 800, mBase: 120, m100: 60 },
    { code: "MOVE_IN_OUT", property: "APARTMENT", model: "PER_ROOM", base: 450, bed: 150, bath: 120, min: 650, mBase: 180, mBed: 60, mBath: 45 },
    { code: "MOVE_IN_OUT", property: "VILLA", model: "PER_ROOM", base: 900, bed: 180, bath: 140, min: 1500, mBase: 240, mBed: 70, mBath: 50 },
    { code: "MOVE_IN_OUT", property: "OFFICE", model: "PER_SQM", base: 500, sqm: 3, min: 1000, mBase: 150, m100: 70 },
    { code: "POST_CONSTRUCTION", property: "APARTMENT", model: "PER_ROOM", base: 700, bed: 200, bath: 160, min: 1000, mBase: 240, mBed: 75, mBath: 60 },
    { code: "POST_CONSTRUCTION", property: "VILLA", model: "PER_ROOM", base: 1500, bed: 250, bath: 200, min: 2500, mBase: 300, mBed: 90, mBath: 70 },
    { code: "POST_CONSTRUCTION", property: "OFFICE", model: "PER_SQM", base: 800, sqm: 4.5, min: 1500, mBase: 180, m100: 90 },
    { code: "AC_DUCT", property: "APARTMENT", model: "PER_UNIT", base: 0, unit: 90, min: 350, mBase: 45, mUnit: 25 },
    { code: "AC_DUCT", property: "VILLA", model: "PER_UNIT", base: 0, unit: 90, min: 450, mBase: 60, mUnit: 25 },
    { code: "AC_DUCT", property: "OFFICE", model: "PER_UNIT", base: 0, unit: 110, min: 600, mBase: 60, mUnit: 25 },
    { code: "SOFA_CARPET", property: "APARTMENT", model: "PER_UNIT", base: 0, unit: 60, min: 200, mBase: 30, mUnit: 20 },
    { code: "SOFA_CARPET", property: "VILLA", model: "PER_UNIT", base: 0, unit: 60, min: 300, mBase: 30, mUnit: 20 },
    { code: "SOFA_CARPET", property: "OFFICE", model: "PER_UNIT", base: 0, unit: 70, min: 350, mBase: 30, mUnit: 20 },
  ];

  const rules = new Map<string, RateCardRule>();
  for (const r of rateSpec) {
    const created = await prisma.rateCardItem.create({
      data: {
        rateCardId: rateCard.id,
        serviceTypeId: services[r.code].id,
        propertyType: r.property,
        pricingModel: r.model,
        basePriceFils: aed(r.base),
        perBedroomFils: aed(r.bed ?? 0),
        perBathroomFils: aed(r.bath ?? 0),
        perSqmFils: aed(r.sqm ?? 0),
        perUnitFils: aed(r.unit ?? 0),
        minimumChargeFils: aed(r.min),
        minutesBase: r.mBase,
        minutesPerBedroom: r.mBed ?? 0,
        minutesPerBathroom: r.mBath ?? 0,
        minutesPer100Sqm: r.m100 ?? 0,
        minutesPerUnit: r.mUnit ?? 0,
      },
    });
    rules.set(`${r.code}|${r.property}`, created as unknown as RateCardRule);
  }

  const frequencyDiscountBps: Record<string, number> = {
    ONE_OFF: 0, WEEKLY: 1500, BI_WEEKLY: 1000, MONTHLY: 500,
  };
  await prisma.frequencyModifier.createMany({
    data: Object.entries(frequencyDiscountBps).map(([frequency, discountBps]) => ({
      rateCardId: rateCard.id, frequency: frequency as Frequency, discountBps,
    })),
  });

  // -------------------------------------------------------------------------
  // 4. Logins
  // -------------------------------------------------------------------------
  for (const login of DEMO_LOGINS) {
    await prisma.user.create({
      data: {
        id: USER_IDS[login.key],
        email: login.email,
        fullName: login.name,
        role: login.role,
        locale: "EN",
        phone: "+9715012345" + (10 + DEMO_LOGINS.indexOf(login)),
      },
    });
  }

  // -------------------------------------------------------------------------
  // 5. Employees, their documents, and the four teams
  // -------------------------------------------------------------------------
  const staffSpec = [
    { first: "Maria", last: "Santos", nat: "Philippines", pos: "TEAM_LEAD", userId: USER_IDS.cleaner },
    { first: "Grace", last: "Wanjiru", nat: "Kenya", pos: "TEAM_LEAD" },
    { first: "Bimala", last: "Thapa", nat: "Nepal", pos: "TEAM_LEAD" },
    { first: "Anjali", last: "Nair", nat: "India", pos: "TEAM_LEAD" },
    { first: "Rosalie", last: "Cruz", nat: "Philippines", pos: "CLEANER" },
    { first: "Jenelyn", last: "Reyes", nat: "Philippines", pos: "CLEANER" },
    { first: "Sunita", last: "Gurung", nat: "Nepal", pos: "CLEANER" },
    { first: "Kamala", last: "Rai", nat: "Nepal", pos: "CLEANER" },
    { first: "Faith", last: "Achieng", nat: "Kenya", pos: "CLEANER" },
    { first: "Mercy", last: "Njoki", nat: "Kenya", pos: "CLEANER" },
    { first: "Priya", last: "Menon", nat: "India", pos: "CLEANER" },
    { first: "Lakshmi", last: "Iyer", nat: "India", pos: "CLEANER" },
    { first: "Shanti", last: "Perera", nat: "Sri Lanka", pos: "CLEANER" },
    { first: "Nilanthi", last: "Fernando", nat: "Sri Lanka", pos: "CLEANER" },
    { first: "Rahul", last: "Sharma", nat: "India", pos: "DRIVER" },
    { first: "Layla", last: "Haddad", nat: "Lebanon", pos: "OFFICE", userId: USER_IDS.ops },
  ] as const;

  const staff = [];
  for (let i = 0; i < staffSpec.length; i++) {
    const s = staffSpec[i];
    const row = await prisma.staff.create({
      data: {
        employeeNo: `EMP-${String(i + 1).padStart(4, "0")}`,
        userId: "userId" in s ? s.userId : null,
        firstName: s.first,
        lastName: s.last,
        phone: `+9715${int(20, 89)}${int(1000000, 9999999)}`,
        email: `${s.first.toLowerCase()}.${s.last.toLowerCase()}@sparkleclean.ae`,
        nationality: s.nat,
        position: s.pos,
        employmentStatus: "ACTIVE",
        hiredAt: day(-int(120, 1200)),
        basicSalaryFils: aed(s.pos === "OFFICE" ? 9000 : s.pos === "TEAM_LEAD" ? 3200 : 2400),
        allowancesFils: aed(s.pos === "OFFICE" ? 3000 : 600),
        iban: `AE${int(100000000000000000, 999999999999999999)}`,
        wpsLabourCardNo: String(int(10000000, 99999999)),
        annualLeaveDays: 30,
        emergencyContactName: "Next of kin",
        emergencyContactPhone: "+971500000000",
      },
    });
    staff.push(row);

    // Visa / Emirates ID / medical fitness. A few are made to expire soon so the
    // 60/30/7-day compliance alerts have something real to fire on.
    const soon = i < 4 ? [55, 28, 6, 90][i] : int(120, 700);
    await prisma.staffDocument.createMany({
      data: [
        { staffId: row.id, type: "VISA", number: `784-${int(1980, 2004)}-${int(1000000, 9999999)}-${int(1, 9)}`, issuedAt: day(-700), expiresAt: day(soon) },
        { staffId: row.id, type: "EMIRATES_ID", number: `784-${int(1980, 2004)}-${int(1000000, 9999999)}-${int(1, 9)}`, issuedAt: day(-700), expiresAt: day(soon + int(5, 40)) },
        { staffId: row.id, type: "MEDICAL_FITNESS", issuedAt: day(-360), expiresAt: day(int(30, 400)) },
      ],
    });
  }

  const teamSpec = [
    { name: "Team Alpha", nameAr: "فريق ألفا", color: "#2563EB", zone: "Dubai Marina" },
    { name: "Team Bravo", nameAr: "فريق برافو", color: "#16A34A", zone: "Business Bay" },
    { name: "Team Charlie", nameAr: "فريق تشارلي", color: "#EA580C", zone: "Mirdif" },
    { name: "Team Delta", nameAr: "فريق دلتا", color: "#9333EA", zone: "Al Barsha" },
  ];

  const teams: Team[] = [];
  for (let i = 0; i < teamSpec.length; i++) {
    const t = teamSpec[i];
    const team = await prisma.team.create({
      data: {
        name: t.name,
        nameAr: t.nameAr,
        colorHex: t.color,
        homeZoneId: zones.find((z) => z.nameEn === t.zone)!.id,
        capacityMinutesPerDay: 480,
        workingDays: [0, 1, 2, 3, 4], // Sunday–Thursday, because the weekend is Fri+Sat
        shiftStart: "08:00",
        shiftEnd: "18:00",
      },
    });
    teams.push(team);

    // Each team: one lead plus three cleaners.
    await prisma.teamMember.create({ data: { teamId: team.id, staffId: staff[i].id, isLead: true } });
    for (let m = 0; m < 3; m++) {
      const cleaner = staff[4 + i * 3 + m];
      if (cleaner) await prisma.teamMember.create({ data: { teamId: team.id, staffId: cleaner.id } });
    }
  }

  // A couple of approved leave requests so the capacity view has a gap in it.
  await prisma.leaveRequest.createMany({
    data: [
      { staffId: staff[6].id, type: "ANNUAL", startDate: day(8), endDate: day(22), days: 15, reason: "Annual leave to Nepal", status: "APPROVED", decidedAt: day(-3) },
      { staffId: staff[9].id, type: "SICK", startDate: day(-2), endDate: day(1), days: 4, reason: "Flu", status: "APPROVED", decidedAt: day(-2) },
      { staffId: staff[11].id, type: "ANNUAL", startDate: day(30), endDate: day(45), days: 16, reason: "Family visit", status: "PENDING" },
    ],
  });

  // -------------------------------------------------------------------------
  // 6. Checklists
  // -------------------------------------------------------------------------
  const checklistSpec: Record<string, Array<[string, string, string, boolean]>> = {
    REGULAR: [
      ["Kitchen", "Wipe all counters and splashback", "مسح جميع الأسطح", true],
      ["Kitchen", "Clean sink and taps", "تنظيف الحوض والصنابير", true],
      ["Kitchen", "Wipe outside of appliances", "مسح الأجهزة من الخارج", true],
      ["Bathrooms", "Scrub toilet, bath and shower", "تنظيف المرحاض والحمام", true],
      ["Bathrooms", "Polish mirrors and glass", "تلميع المرايا والزجاج", true],
      ["Bathrooms", "Replace towels if provided", "تبديل المناشف إن وجدت", false],
      ["Bedrooms", "Make beds / change linen", "ترتيب الأسرة وتغيير الملاءات", true],
      ["Bedrooms", "Dust all surfaces", "إزالة الغبار عن جميع الأسطح", true],
      ["Living", "Vacuum all floors and rugs", "كنس جميع الأرضيات والسجاد", true],
      ["Living", "Mop hard floors", "مسح الأرضيات الصلبة", true],
      ["Finish", "Empty all bins", "إفراغ جميع سلال المهملات", true],
      ["Finish", "Before and after photos taken", "التقاط صور قبل وبعد", true],
    ],
    DEEP: [
      ["Kitchen", "Degrease oven inside and out", "تنظيف الفرن من الداخل والخارج", true],
      ["Kitchen", "Clean inside fridge", "تنظيف الثلاجة من الداخل", true],
      ["Kitchen", "Clean inside all cupboards", "تنظيف جميع الخزائن من الداخل", true],
      ["Kitchen", "Descale sink and taps", "إزالة الترسبات من الحوض", true],
      ["Bathrooms", "Descale shower screens and tiles", "إزالة الترسبات من البلاط", true],
      ["Bathrooms", "Clean and disinfect grouting", "تنظيف وتعقيم الفواصل", true],
      ["Bedrooms", "Clean inside wardrobes", "تنظيف الخزائن من الداخل", true],
      ["Bedrooms", "Wipe skirting boards", "مسح ألواح القاعدة", true],
      ["Whole home", "Clean interior windows and tracks", "تنظيف النوافذ الداخلية", true],
      ["Whole home", "Wipe doors, frames and handles", "مسح الأبواب والمقابض", true],
      ["Whole home", "Dust AC vents and light fittings", "تنظيف فتحات التكييف والإنارة", true],
      ["Finish", "Before and after photos taken", "التقاط صور قبل وبعد", true],
    ],
    OFFICE: [
      ["Workstations", "Wipe desks and monitors", "مسح المكاتب والشاشات", true],
      ["Workstations", "Empty bins and replace liners", "إفراغ السلال وتبديل الأكياس", true],
      ["Meeting rooms", "Clean tables and whiteboards", "تنظيف الطاولات واللوحات", true],
      ["Pantry", "Clean counters, sink and microwave", "تنظيف الأسطح والحوض والميكروويف", true],
      ["Pantry", "Restock supplies if provided", "إعادة تعبئة المستلزمات", false],
      ["Washrooms", "Clean and disinfect all fixtures", "تنظيف وتعقيم جميع التجهيزات", true],
      ["Washrooms", "Restock soap and paper", "إعادة تعبئة الصابون والورق", true],
      ["Floors", "Vacuum carpets, mop hard floors", "كنس السجاد ومسح الأرضيات", true],
      ["Reception", "Polish glass doors and entrance", "تلميع الأبواب الزجاجية", true],
      ["Finish", "Lock up and set alarm", "الإغلاق وتفعيل الإنذار", true],
    ],
  };

  const templates: Record<string, { id: string }> = {};
  for (const [key, items] of Object.entries(checklistSpec)) {
    const serviceCode = key === "OFFICE" ? "REGULAR" : key;
    const tpl = await prisma.checklistTemplate.create({
      data: {
        serviceTypeId: services[serviceCode].id,
        propertyType: key === "OFFICE" ? "OFFICE" : null,
        nameEn: key === "OFFICE" ? "Office Cleaning Checklist" : `${key === "DEEP" ? "Deep" : "Regular"} Cleaning Checklist`,
        nameAr: key === "OFFICE" ? "قائمة تنظيف المكاتب" : key === "DEEP" ? "قائمة التنظيف العميق" : "قائمة التنظيف الدوري",
        items: {
          create: items.map(([section, en, ar, mandatory], i) => ({
            section, labelEn: en, labelAr: ar, isMandatory: mandatory, sortOrder: i,
            requiresPhoto: en.includes("photos"),
          })),
        },
      },
      include: { items: true },
    });
    templates[key] = tpl;
  }
  const templateItems: Record<string, Array<{ id: string; section: string | null; labelEn: string; labelAr: string; isMandatory: boolean; sortOrder: number }>> = {};
  for (const key of Object.keys(checklistSpec)) {
    templateItems[key] = await prisma.checklistTemplateItem.findMany({
      where: { templateId: templates[key].id }, orderBy: { sortOrder: "asc" },
    });
  }

  console.log("Creating clients and properties…");

  // -------------------------------------------------------------------------
  // 7. Clients and their properties
  // -------------------------------------------------------------------------
  const residentialNames = [
    ["Omar Al Suwaidi", "عمر السويدي"], ["Sarah Whitfield", "سارة ويتفيلد"],
    ["Rajesh Kumar", "راجيش كومار"], ["Fatima Al Mansoori", "فاطمة المنصوري"],
    ["James O'Connor", "جيمس أوكونور"], ["Aisha Bakr", "عائشة بكر"],
    ["Daniel Meyer", "دانيال ماير"], ["Noura Al Hashimi", "نورة الهاشمي"],
    ["Priyanka Deshpande", "بريانكا ديشباندي"], ["Thomas Berg", "توماس بيرغ"],
    ["Huda Salem", "هدى سالم"], ["Michael Chen", "مايكل تشين"],
    ["Yasmin Farouk", "ياسمين فاروق"], ["Elena Petrova", "إيلينا بيتروفا"],
  ];
  const commercialNames = [
    ["Meridian Consulting FZ-LLC", "ميريديان للاستشارات"],
    ["Gulf Trade Logistics LLC", "الخليج للتجارة واللوجستيات"],
    ["Beacon Dental Clinic", "عيادة بيكون لطب الأسنان"],
    ["Nexa Coworking", "نيكسا لمساحات العمل"],
    ["Aurora Real Estate Brokers", "أورورا للوساطة العقارية"],
    ["Cedar Kitchen Catering", "سيدار للتموين"],
  ];
  const leadSources = ["GOOGLE", "INSTAGRAM", "REFERRAL", "WALK_IN", "REPEAT", "FACEBOOK", "PARTNER"] as const;

  type SeedClient = {
    id: string; type: string; billingMode: string; propertyId: string;
    propertyType: "APARTMENT" | "VILLA" | "OFFICE";
    bedrooms: number; bathrooms: number; sqm: number; zoneId: string; contactName: string;
  };
  const clients: SeedClient[] = [];

  for (let i = 0; i < 20; i++) {
    const isCommercial = i >= 14;
    const [nameEn] = isCommercial ? commercialNames[i - 14] : residentialNames[i];
    const zone = pick(zones);
    const propertyType: "APARTMENT" | "VILLA" | "OFFICE" = isCommercial ? "OFFICE" : chance(0.35) ? "VILLA" : "APARTMENT";
    const bedrooms = propertyType === "OFFICE" ? 0 : propertyType === "VILLA" ? int(3, 5) : int(1, 3);
    const bathrooms = propertyType === "OFFICE" ? int(2, 4) : Math.max(1, bedrooms + (chance(0.5) ? 1 : 0));
    const sqm = propertyType === "OFFICE" ? int(120, 600) : propertyType === "VILLA" ? int(280, 550) : int(60, 180);
    const firstName = nameEn.split(" ")[0];

    const client = await prisma.client.create({
      data: {
        clientNo: `CL-2026-${String(i + 1).padStart(4, "0")}`,
        userId: i === 0 ? USER_IDS.client : null,
        type: isCommercial ? "COMMERCIAL" : "RESIDENTIAL",
        companyName: isCommercial ? nameEn : null,
        contactName: isCommercial ? `${pick(["Ahmed", "Sana", "Vikram", "Dana"])} ${pick(["Khalil", "Rao", "Aziz", "Baig"])}` : nameEn,
        email: `${firstName.toLowerCase().replace(/[^a-z]/g, "")}${i}@example.ae`,
        phone: `+9715${int(20, 89)}${int(1000000, 9999999)}`,
        whatsappPhone: `+9715${int(20, 89)}${int(1000000, 9999999)}`,
        locale: chance(0.25) ? "AR" : "EN",
        trn: isCommercial ? `100${int(100000000000, 999999999999)}` : null,
        billingMode: isCommercial ? "MONTHLY_CONSOLIDATED" : "PER_JOB",
        paymentTermsDays: isCommercial ? 30 : 7,
        referralCode: `${firstName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6)}-${int(1000, 9999)}`,
        status: "ACTIVE",
        leadSource: pick(leadSources),
        acquiredAt: day(-int(30, 400)),
        properties: {
          create: {
            label: isCommercial ? `${nameEn} — ${zone.nameEn}` : `${propertyType === "VILLA" ? "Villa" : "Apartment"} — ${zone.nameEn}`,
            propertyType,
            zoneId: zone.id,
            buildingName: pick(["Marina Heights", "Bay Square Building 6", "The Onyx Tower", "Al Fattan Plaza", "Executive Bay B", "Warda Apartments"]),
            unitNumber: `${int(1, 40)}0${int(1, 9)}`,
            addressLine1: `${zone.nameEn}, Dubai`,
            city: "Dubai",
            emirate: "Dubai",
            makaniNumber: `${int(10000000, 99999999)}${int(10, 99)}`,
            bedrooms: propertyType === "OFFICE" ? null : bedrooms,
            bathrooms,
            sqm,
            accessNotes: pick([
              "Concierge holds the key, ask for Unit access at reception.",
              "Use service lift at the back of the building.",
              "Gate code required, park in visitor bay 12.",
              "Client works from home, ring the bell before entering.",
            ]),
            gateCode: chance(0.4) ? String(int(1000, 9999)) : null,
            parkingNotes: pick(["Visitor parking level B2", "Street parking only", "Bay 14 reserved for service"]),
            hasPets: chance(0.3),
            petNotes: chance(0.3) ? pick(["One friendly cat, keep balcony door shut.", "Small dog, will bark. Keep in bedroom."]) : null,
            chemicalAllergies: chance(0.15) ? "No bleach or strong ammonia — client is asthmatic." : null,
            keyHeldByCompany: chance(0.25),
            keyTag: chance(0.25) ? `KEY-${int(100, 999)}` : null,
            isDefault: true,
          },
        },
      },
      include: { properties: true },
    });

    clients.push({
      id: client.id,
      type: client.type,
      billingMode: client.billingMode,
      propertyId: client.properties[0].id,
      propertyType,
      bedrooms,
      bathrooms,
      sqm,
      zoneId: zone.id,
      contactName: client.contactName,
    });
  }

  // A referral chain so the referral report is not empty.
  await prisma.referral.create({
    data: {
      code: "OMAR-1042",
      referrerClientId: clients[0].id,
      refereeClientId: clients[3].id,
      status: "REWARDED",
      referrerRewardFils: aed(50),
      refereeDiscountFils: aed(50),
      referrerRewardedAt: day(-40),
      refereeDiscountedAt: day(-40),
      attributedRevenueFils: aed(2400),
    },
  });
  await prisma.client.update({ where: { id: clients[3].id }, data: { referredByClientId: clients[0].id, leadSource: "REFERRAL" } });

  // -------------------------------------------------------------------------
  // 8. Leads across the pipeline
  // -------------------------------------------------------------------------
  const leadNames = [
    "Hassan Al Balushi", "Chloe Dubois", "Arjun Pillai", "Mariam Zayed", "Peter Novak",
    "Ritu Agarwal", "Khalid Al Marri", "Sophie Laurent", "Ibrahim Toure", "Nadia Rahman",
    "Marco Rossi", "Zainab Ali", "Kevin Murphy", "Leila Cherif", "Vikram Bose", "Anna Kowalski",
  ];
  const statuses = ["NEW", "NEW", "NEW", "CONTACTED", "CONTACTED", "CONTACTED", "QUOTED", "QUOTED", "QUOTED", "QUOTED", "WON", "WON", "WON", "LOST", "LOST", "LOST"] as const;
  const lostReasons = ["PRICE_TOO_HIGH", "WENT_WITH_COMPETITOR", "NO_RESPONSE", "OUT_OF_SERVICE_AREA"] as const;

  for (let i = 0; i < leadNames.length; i++) {
    const status = statuses[i];
    const zone = pick(zones);
    const propertyType = pick(["APARTMENT", "VILLA", "OFFICE"] as const);
    const bedrooms = propertyType === "OFFICE" ? null : int(1, 5);
    const bathrooms = propertyType === "OFFICE" ? int(2, 4) : Math.max(1, (bedrooms ?? 1));
    const sqm = propertyType === "OFFICE" ? int(100, 500) : null;
    const serviceCode = pick(["REGULAR", "DEEP", "MOVE_IN_OUT"] as const);
    const rule = rules.get(`${serviceCode}|${propertyType}`)!;
    const priced = priceService(rule, { bedrooms, bathrooms, sqm });

    const lead = await prisma.lead.create({
      data: {
        referenceNo: `LD-2026-${String(i + 1).padStart(4, "0")}`,
        fullName: leadNames[i],
        phone: `+9715${int(20, 89)}${int(1000000, 9999999)}`,
        email: `${leadNames[i].split(" ")[0].toLowerCase()}@example.com`,
        locale: chance(0.2) ? "AR" : "EN",
        source: pick(leadSources),
        status,
        lostReason: status === "LOST" ? pick(lostReasons) : null,
        lostNote: status === "LOST" ? "Recorded from the follow-up call." : null,
        boardPosition: i,
        propertyType,
        zoneId: zone.id,
        addressLine: `${zone.nameEn}, Dubai`,
        bedrooms, bathrooms, sqm,
        serviceTypeId: services[serviceCode].id,
        frequency: pick(["ONE_OFF", "WEEKLY", "BI_WEEKLY", "MONTHLY"] as const),
        preferredDate: day(int(1, 21)),
        estimateFils: priced.netFils,
        firstContactedAt: status === "NEW" ? null : day(-int(1, 20)),
        createdAt: day(-int(1, 45)),
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: status === "NEW" ? "NOTE" : "CALL",
        body: status === "NEW"
          ? "Enquiry received from the website quote calculator."
          : `Called the client. ${status === "LOST" ? "Not proceeding." : "Interested, follow up scheduled."}`,
      },
    });
  }

  console.log("Creating 200 jobs…");

  // -------------------------------------------------------------------------
  // 9. Recurring schedules
  // -------------------------------------------------------------------------
  const recurringClients = clients.slice(0, 8);
  const seriesByClient = new Map<string, string>();
  for (const c of recurringClients) {
    const frequency = pick(["WEEKLY", "BI_WEEKLY", "MONTHLY"] as const);
    const rule = rules.get(`REGULAR|${c.propertyType}`)!;
    const priced = priceService(rule, { bedrooms: c.bedrooms, bathrooms: c.bathrooms, sqm: c.sqm });
    const series = await prisma.recurringSeries.create({
      data: {
        clientId: c.id,
        propertyId: c.propertyId,
        serviceTypeId: services.REGULAR.id,
        teamId: pick(teams).id,
        frequency,
        interval: 1,
        daysOfWeek: [pick([0, 1, 2, 3, 4])],
        startDate: day(-90),
        timeOfDay: pick(["08:00", "09:00", "10:00", "13:00", "14:00"]),
        durationMinutes: priced.minutes,
        cleanersRequired: services.REGULAR.defaultCleaners,
        priceFils: priced.netFils,
        status: "ACTIVE",
        generatedUntil: day(30),
      },
    });
    seriesByClient.set(c.id, series.id);
  }

  // -------------------------------------------------------------------------
  // 10. 200 jobs spread from 90 days ago to 30 days ahead
  // -------------------------------------------------------------------------
  const TOTAL_JOBS = 200;
  let jobSeq = 0;
  let invoiceSeq = 0;
  let paymentSeq = 0;
  let ticketSeq = 0;

  const completedJobs: Array<{ id: string; clientId: string; netFils: number; vatFils: number; totalFils: number; end: Date; serviceCode: string; teamId: string }> = [];

  // How many minutes of work each team already has on each day. The key is
  // "teamId|2026-08-24". This is what stops a team being booked for 20 hours.
  const bookedMinutes = new Map<string, number>();
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  /**
   * Finds a team with room for a job of this length, starting from the day we
   * wanted it on. Jobs stack one after another from the 08:00 shift start, and
   * spill to the next day when every team is full — exactly how a real
   * dispatcher fills a week.
   */
  function placeJob(preferred: Date, minutes: number) {
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const date = new Date(preferred);
      date.setDate(date.getDate() + dayOffset);
      if (isWeekend(date)) continue;

      // Try the least-loaded team first so work spreads out evenly.
      const candidates = [...teams].sort(
        (a, b) =>
          (bookedMinutes.get(`${a.id}|${dayKey(date)}`) ?? 0) -
          (bookedMinutes.get(`${b.id}|${dayKey(date)}`) ?? 0),
      );

      for (const team of candidates) {
        const key = `${team.id}|${dayKey(date)}`;
        const used = bookedMinutes.get(key) ?? 0;
        // A job longer than a whole working day (a post-construction villa, for
        // example) can never "fit" — so give it a team that is otherwise free
        // and let it take the whole day.
        const fits = used + minutes <= team.capacityMinutesPerDay;
        if (!fits && used > 0) continue;

        bookedMinutes.set(key, used + minutes);
        return { team, date, start: addMinutes(at(date, team.shiftStart), used) };
      }
    }

    // Everything is full for a fortnight — put it on the least-loaded team and
    // let the over-booking show up honestly on the capacity view.
    const team = teams[0];
    const date = isWeekend(preferred) ? day(1) : preferred;
    const key = `${team.id}|${dayKey(date)}`;
    const used = bookedMinutes.get(key) ?? 0;
    bookedMinutes.set(key, used + minutes);
    return { team, date, start: addMinutes(at(date, team.shiftStart), used) };
  }

  // Decide WHEN the 200 jobs happen before creating any of them, so the spread
  // is deliberate rather than luck. A guaranteed batch lands today, otherwise
  // the dashboard and the calendar can look empty on the day you first open it.
  const JOBS_TODAY = 12;
  const offsets: number[] = Array.from({ length: JOBS_TODAY }, () => 0);
  while (offsets.length < TOTAL_JOBS) {
    const r = rnd();
    if (r < 0.45) offsets.push(-int(1, 30));       // recent past: fresh history
    else if (r < 0.65) offsets.push(-int(31, 90)); // older past: trend data
    else offsets.push(int(1, 30));                 // upcoming work
  }
  // Shuffle so job numbers are not issued in date order, as in real life.
  for (let i = offsets.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [offsets[i], offsets[j]] = [offsets[j], offsets[i]];
  }

  for (let i = 0; i < TOTAL_JOBS; i++) {
    const offset = offsets[i];
    let date = day(offset);
    // Teams work Sunday–Thursday, so nudge any job that landed on the Friday or
    // Saturday weekend forward to the next working day. Jobs booked for today
    // stay put: weekend call-outs do happen.
    let guard = 0;
    while (offset !== 0 && isWeekend(date) && guard++ < 3) {
      date = day(offset + guard);
    }

    const client = pick(clients);
    const isRecurring = seriesByClient.has(client.id) && chance(0.6);
    const serviceCode = isRecurring
      ? "REGULAR"
      : pick(["REGULAR", "REGULAR", "DEEP", "MOVE_IN_OUT", "AC_DUCT", "SOFA_CARPET", "POST_CONSTRUCTION"] as const);
    const rule = rules.get(`${serviceCode}|${client.propertyType}`)!;
    const units = serviceCode === "AC_DUCT" ? int(4, 14) : serviceCode === "SOFA_CARPET" ? int(3, 8) : 0;
    const priced = priceService(rule, {
      bedrooms: client.bedrooms, bathrooms: client.bathrooms, sqm: client.sqm, units,
    });

    const frequency = isRecurring ? "WEEKLY" : "ONE_OFF";
    const totals = totalsFor([priced.netFils], isRecurring ? frequencyDiscountBps[frequency] : 0, org.vatRateBps);

    // Fit the job into a team's actual working day instead of dropping it on a
    // random team at a random time. Without this, four teams end up "253%
    // utilised" and the capacity figure means nothing.
    const placement = placeJob(date, priced.minutes);
    const team = placement.team;
    const start = placement.start;
    const end = addMinutes(start, priced.minutes);
    date = placement.date;

    // Status follows the calendar: past jobs are done, future jobs are booked.
    let status: JobStatus;
    if (offset < 0) {
      status = chance(0.06) ? "CANCELLED" : chance(0.04) ? "NO_ACCESS" : "COMPLETED";
    } else if (offset === 0) {
      // A believable snapshot of a day in progress: some done, one or two on
      // the road, the rest still to come.
      status = pick([
        "COMPLETED", "COMPLETED", "COMPLETED",
        "IN_PROGRESS", "EN_ROUTE",
        "SCHEDULED", "SCHEDULED", "SCHEDULED",
      ] as const);
    } else {
      status = "SCHEDULED";
    }

    jobSeq++;
    const job = await prisma.job.create({
      data: {
        jobNo: `JOB-2026-${String(jobSeq).padStart(6, "0")}`,
        clientId: client.id,
        propertyId: client.propertyId,
        serviceTypeId: services[serviceCode].id,
        teamId: team.id,
        seriesId: isRecurring ? seriesByClient.get(client.id) : null,
        status,
        scheduledStart: start,
        scheduledEnd: end,
        actualStart: status === "COMPLETED" || status === "IN_PROGRESS" ? addMinutes(start, int(-8, 22)) : null,
        actualEnd: status === "COMPLETED" ? addMinutes(end, int(-25, 30)) : null,
        durationMinutes: priced.minutes,
        cleanersRequired: services[serviceCode].defaultCleaners,
        subtotalFils: totals.subtotalFils,
        discountFils: totals.discountFils,
        vatRateBps: org.vatRateBps,
        vatFils: totals.vatFils,
        totalFils: totals.totalFils,
        cancelledAt: status === "CANCELLED" ? addMinutes(start, -int(60, 4000)) : null,
        cancellationReason: status === "CANCELLED" ? pick(["Client travelling", "Rescheduled by client", "Building maintenance"]) : null,
        noAccessNote: status === "NO_ACCESS" ? "Nobody answered, concierge had no key." : null,
        checklistTemplateId: templates[client.propertyType === "OFFICE" ? "OFFICE" : serviceCode === "DEEP" ? "DEEP" : "REGULAR"].id,
        lines: {
          create: {
            serviceTypeId: services[serviceCode].id,
            descriptionEn: `${serviceSpec.find((s) => s.code === serviceCode)!.nameEn} — ${client.propertyType.toLowerCase()}`,
            descriptionAr: serviceSpec.find((s) => s.code === serviceCode)!.nameAr,
            quantity: units || 1,
            unitPriceFils: units ? Math.round(priced.netFils / units) : priced.netFils,
            lineTotalFils: priced.netFils,
          },
        },
      },
    });

    // Who actually went.
    const members = await prisma.teamMember.findMany({ where: { teamId: team.id, leftAt: null } });
    for (const m of members.slice(0, services[serviceCode].defaultCleaners)) {
      await prisma.jobAssignment.create({ data: { jobId: job.id, staffId: m.staffId, isLead: m.isLead } });
    }

    // The checklist, copied onto the job.
    const tplKey = client.propertyType === "OFFICE" ? "OFFICE" : serviceCode === "DEEP" ? "DEEP" : "REGULAR";
    const items = templateItems[tplKey];
    await prisma.jobChecklistItem.createMany({
      data: items.map((it) => ({
        jobId: job.id,
        templateItemId: it.id,
        section: it.section,
        labelEn: it.labelEn,
        labelAr: it.labelAr,
        isMandatory: it.isMandatory,
        sortOrder: it.sortOrder,
        isChecked: status === "COMPLETED",
        checkedAt: status === "COMPLETED" ? end : null,
        checkedByStaffId: status === "COMPLETED" && members[0] ? members[0].staffId : null,
      })),
    });

    // Timesheets with GPS, including a few that landed outside the geofence.
    if (status === "COMPLETED" && members[0]) {
      const far = chance(0.08);
      const distanceIn = far ? int(260, 1400) : int(3, 180);
      await prisma.timeEntry.create({
        data: {
          staffId: members[0].staffId,
          jobId: job.id,
          clockInAt: addMinutes(start, int(-10, 18)),
          clockInLat: 25.1 + rnd() * 0.2,
          clockInLng: 55.15 + rnd() * 0.3,
          clockInAccuracyM: int(4, 30),
          clockInDistanceM: distanceIn,
          clockInFlagged: distanceIn > org.geofenceRadiusMeters,
          clockOutAt: addMinutes(end, int(-15, 25)),
          clockOutLat: 25.1 + rnd() * 0.2,
          clockOutLng: 55.15 + rnd() * 0.3,
          clockOutDistanceM: int(3, 180),
          clockOutFlagged: false,
          minutesWorked: priced.minutes + int(-15, 25),
          source: "MOBILE",
          reviewStatus: distanceIn > org.geofenceRadiusMeters ? "PENDING" : "NOT_REQUIRED",
        },
      });
    }

    if (status === "COMPLETED") {
      completedJobs.push({
        id: job.id, clientId: client.id, netFils: totals.netFils, vatFils: totals.vatFils,
        totalFils: totals.totalFils, end, serviceCode, teamId: team.id,
      });
      await prisma.client.update({ where: { id: client.id }, data: { lastJobAt: end } });
    }
  }

  console.log(`Created ${jobSeq} jobs (${completedJobs.length} completed). Invoicing them…`);

  // -------------------------------------------------------------------------
  // 11. Invoices and payments for completed work
  // -------------------------------------------------------------------------
  const perJobClients = new Set(clients.filter((c) => c.billingMode === "PER_JOB").map((c) => c.id));

  // Residential: one invoice per completed job.
  for (const j of completedJobs.filter((j) => perJobClients.has(j.clientId))) {
    invoiceSeq++;
    const issueDate = j.end;
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + 7);
    const overdue = dueDate < TODAY;
    const paid = chance(overdue ? 0.72 : 0.55);
    const partial = !paid && chance(0.2);
    const amountPaid = paid ? j.totalFils : partial ? Math.round(j.totalFils / 2) : 0;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo: `INV-2026-${String(invoiceSeq).padStart(6, "0")}`,
        type: "STANDARD",
        clientId: j.clientId,
        status: paid ? "PAID" : partial ? "PARTIALLY_PAID" : overdue ? "OVERDUE" : "ISSUED",
        issueDate,
        dueDate,
        vatRateBps: org.vatRateBps,
        subtotalFils: j.netFils,
        vatFils: j.vatFils,
        totalFils: j.totalFils,
        amountPaidFils: amountPaid,
        balanceFils: j.totalFils - amountPaid,
        supplierName: org.name,
        supplierTrn: org.trn,
        supplierAddress: `${org.addressLine1}, ${org.addressLine2}, ${org.city}`,
        sentAt: issueDate,
        paidAt: paid ? addMinutes(issueDate, int(60, 8000)) : null,
        lines: {
          create: {
            jobId: j.id,
            serviceTypeId: services[j.serviceCode].id,
            descriptionEn: serviceSpec.find((s) => s.code === j.serviceCode)!.nameEn,
            descriptionAr: serviceSpec.find((s) => s.code === j.serviceCode)!.nameAr,
            quantity: 1,
            unitPriceFils: j.netFils,
            vatRateBps: org.vatRateBps,
            vatFils: j.vatFils,
            lineTotalFils: j.netFils,
          },
        },
      },
    });
    await prisma.job.update({ where: { id: j.id }, data: { invoiceId: invoice.id } });

    if (amountPaid > 0) {
      paymentSeq++;
      await prisma.payment.create({
        data: {
          paymentNo: `PAY-2026-${String(paymentSeq).padStart(6, "0")}`,
          invoiceId: invoice.id,
          clientId: j.clientId,
          method: pick(["CARD_STRIPE", "CASH", "BANK_TRANSFER"] as const),
          status: "SUCCEEDED",
          amountFils: amountPaid,
          receivedAt: addMinutes(issueDate, int(60, 8000)),
          reference: chance(0.5) ? `REF-${int(100000, 999999)}` : null,
          reconciledAt: chance(0.8) ? addMinutes(issueDate, int(100, 9000)) : null,
        },
      });
    }

    // The three dunning reminders for anything still owing.
    if (!paid) {
      for (let step = 0; step < org.dunningOffsetsDays.length; step++) {
        const when = new Date(dueDate);
        when.setDate(when.getDate() + org.dunningOffsetsDays[step]);
        await prisma.dunningEvent.create({
          data: {
            invoiceId: invoice.id,
            step: step + 1,
            offsetDays: org.dunningOffsetsDays[step],
            channel: "BOTH",
            scheduledFor: when,
            status: when < TODAY ? "SENT" : "SCHEDULED",
            sentAt: when < TODAY ? when : null,
          },
        });
      }
    }
  }

  // Commercial: one consolidated invoice per client per month.
  const consolidated = new Map<string, typeof completedJobs>();
  for (const j of completedJobs.filter((j) => !perJobClients.has(j.clientId))) {
    const key = `${j.clientId}|${j.end.getFullYear()}-${j.end.getMonth()}`;
    if (!consolidated.has(key)) consolidated.set(key, []);
    consolidated.get(key)!.push(j);
  }
  for (const [key, jobs] of consolidated) {
    const [clientId] = key.split("|");
    const monthEnd = new Date(jobs[0].end.getFullYear(), jobs[0].end.getMonth() + 1, 0);
    const dueDate = new Date(monthEnd);
    dueDate.setDate(dueDate.getDate() + 30);
    const net = jobs.reduce((s, j) => s + j.netFils, 0);
    const vat = vatOn(net, org.vatRateBps);
    const total = net + vat;
    const paid = dueDate < TODAY && chance(0.7);

    invoiceSeq++;
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo: `INV-2026-${String(invoiceSeq).padStart(6, "0")}`,
        type: "CONSOLIDATED",
        clientId,
        status: paid ? "PAID" : dueDate < TODAY ? "OVERDUE" : "ISSUED",
        issueDate: monthEnd,
        dueDate,
        periodStart: new Date(jobs[0].end.getFullYear(), jobs[0].end.getMonth(), 1),
        periodEnd: monthEnd,
        vatRateBps: org.vatRateBps,
        subtotalFils: net,
        vatFils: vat,
        totalFils: total,
        amountPaidFils: paid ? total : 0,
        balanceFils: paid ? 0 : total,
        supplierName: org.name,
        supplierTrn: org.trn,
        supplierAddress: `${org.addressLine1}, ${org.addressLine2}, ${org.city}`,
        sentAt: monthEnd,
        paidAt: paid ? dueDate : null,
        lines: {
          create: jobs.map((j) => ({
            jobId: j.id,
            serviceTypeId: services[j.serviceCode].id,
            descriptionEn: `${serviceSpec.find((s) => s.code === j.serviceCode)!.nameEn} — ${j.end.toISOString().slice(0, 10)}`,
            quantity: 1,
            unitPriceFils: j.netFils,
            vatRateBps: org.vatRateBps,
            vatFils: j.vatFils,
            lineTotalFils: j.netFils,
          })),
        },
      },
    });
    await prisma.job.updateMany({ where: { id: { in: jobs.map((j) => j.id) } }, data: { invoiceId: invoice.id } });
    if (paid) {
      paymentSeq++;
      await prisma.payment.create({
        data: {
          paymentNo: `PAY-2026-${String(paymentSeq).padStart(6, "0")}`,
          invoiceId: invoice.id, clientId, method: "BANK_TRANSFER", status: "SUCCEEDED",
          amountFils: total, receivedAt: dueDate, reference: `TT-${int(100000, 999999)}`,
          reconciledAt: dueDate,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 12. Prepaid packages
  // -------------------------------------------------------------------------
  const pkg = await prisma.package.create({
    data: {
      code: "REG10", nameEn: "10 Regular Cleans", nameAr: "١٠ جلسات تنظيف دوري",
      serviceTypeId: services.REGULAR.id, sessions: 10,
      priceFils: aed(1620), listPriceFils: aed(1800), validityDays: 365,
    },
  });
  for (const c of clients.slice(0, 4)) {
    const used = int(1, 8);
    await prisma.clientPackage.create({
      data: {
        packageNo: `PKG-2026-${String(clients.indexOf(c) + 1).padStart(4, "0")}`,
        clientId: c.id, packageId: pkg.id, sessionsTotal: 10, sessionsUsed: used,
        pricePaidFils: aed(1620), purchasedAt: day(-int(30, 200)), expiresAt: day(int(100, 300)),
        status: "ACTIVE",
      },
    });
  }

  // -------------------------------------------------------------------------
  // 13. Ratings, and the complaint tickets that low ratings create
  // -------------------------------------------------------------------------
  console.log("Adding ratings and tickets…");
  for (const j of completedJobs) {
    if (!chance(0.78)) continue;
    // Mostly happy, with a realistic tail of unhappy jobs.
    const stars = chance(0.62) ? 5 : chance(0.65) ? 4 : chance(0.6) ? 3 : chance(0.5) ? 2 : 1;
    const rating = await prisma.rating.create({
      data: {
        jobId: j.id,
        clientId: j.clientId,
        stars,
        punctualityStars: Math.min(5, Math.max(1, stars + (chance(0.3) ? 1 : 0))),
        qualityStars: stars,
        comment: stars >= 4
          ? pick(["Spotless as always, thank you.", "Great job, very thorough.", "The team was polite and quick.", null])
          : pick(["Bathroom was not properly done.", "Team arrived late and rushed.", "Missed under the beds entirely."]),
        token: `rt_${j.id.slice(0, 8)}${int(100000, 999999)}`,
        requestSentAt: addMinutes(j.end, org.ratingRequestDelayMinutes),
        submittedAt: addMinutes(j.end, org.ratingRequestDelayMinutes + int(30, 3000)),
        googleReviewShownAt: stars === 5 ? addMinutes(j.end, org.ratingRequestDelayMinutes + 60) : null,
        googleReviewClickedAt: stars === 5 && chance(0.3) ? addMinutes(j.end, org.ratingRequestDelayMinutes + 90) : null,
      },
    });

    if (stars < org.reCleanRatingThreshold) {
      ticketSeq++;
      await prisma.ticket.create({
        data: {
          ticketNo: `TKT-2026-${String(ticketSeq).padStart(4, "0")}`,
          type: "LOW_RATING",
          severity: stars === 1 ? "HIGH" : stars === 2 ? "MEDIUM" : "LOW",
          status: chance(0.5) ? "RESOLVED" : "OPEN",
          jobId: j.id,
          clientId: j.clientId,
          ratingId: rating.id,
          subject: `${stars}-star rating on ${j.id.slice(0, 8)}`,
          description: rating.comment ?? "Low rating received, no comment left.",
          reCleanOffered: stars <= 2,
          resolution: chance(0.5) ? "Free re-clean offered and completed. Client satisfied." : null,
          resolvedAt: chance(0.5) ? addMinutes(j.end, 4000) : null,
        },
      });
    }
  }

  // A couple of field-reported issues so the ops queue is not only ratings.
  for (const type of ["DAMAGE", "NO_ACCESS", "ON_SITE_COMPLAINT"] as const) {
    ticketSeq++;
    await prisma.ticket.create({
      data: {
        ticketNo: `TKT-2026-${String(ticketSeq).padStart(4, "0")}`,
        type,
        severity: type === "DAMAGE" ? "HIGH" : "MEDIUM",
        status: "OPEN",
        clientId: pick(clients).id,
        raisedByStaffId: staff[0].id,
        subject: type === "DAMAGE" ? "Chipped bathroom tile found on arrival"
          : type === "NO_ACCESS" ? "No answer at the door, concierge had no key"
          : "Client unhappy with balcony finish",
        description: "Reported from the mobile app by the team lead on site.",
      },
    });
  }

  // -------------------------------------------------------------------------
  // 14. Inventory and equipment
  // -------------------------------------------------------------------------
  const itemSpec = [
    ["CHEM-001", "Multi-surface cleaner", "منظف متعدد الأسطح", "LITRE", 12, 20, 1450],
    ["CHEM-002", "Glass cleaner", "منظف الزجاج", "LITRE", 8, 15, 1200],
    ["CHEM-003", "Bathroom descaler", "مزيل الترسبات", "LITRE", 4, 12, 1850],
    ["CHEM-004", "Floor disinfectant", "مطهر الأرضيات", "LITRE", 26, 20, 1600],
    ["CHEM-005", "Oven degreaser", "مزيل الدهون للأفران", "LITRE", 3, 8, 2400],
    ["CONS-001", "Microfibre cloths", "مناشف ميكروفايبر", "PIECE", 140, 100, 350],
    ["CONS-002", "Bin liners (large)", "أكياس قمامة كبيرة", "BOX", 18, 10, 2200],
    ["CONS-003", "Scouring pads", "إسفنج جلي", "PIECE", 64, 50, 200],
    ["CONS-004", "Rubber gloves", "قفازات مطاطية", "PIECE", 22, 40, 700],
    ["CONS-005", "Mop heads", "رؤوس ممسحة", "PIECE", 9, 15, 1900],
  ] as const;

  for (const [sku, en, ar, unit, qty, reorder, cost] of itemSpec) {
    const item = await prisma.inventoryItem.create({
      data: {
        sku, nameEn: en, nameAr: ar, unit, category: sku.startsWith("CHEM") ? "Chemicals" : "Consumables",
        currentQty: qty, reorderLevel: reorder, unitCostFils: cost,
        supplier: pick(["Gulf Hygiene Supplies", "Al Maha Trading", "CleanPro FZE"]),
        storageLocation: "Al Quoz store",
      },
    });
    await prisma.stockMovement.createMany({
      data: [
        { itemId: item.id, type: "PURCHASE", quantity: qty + 40, unitCostFils: cost, reference: `PO-${int(1000, 9999)}`, occurredAt: day(-60) },
        { itemId: item.id, type: "ISSUE_TO_TEAM", quantity: -20, teamId: teams[0].id, occurredAt: day(-30) },
        { itemId: item.id, type: "ISSUE_TO_TEAM", quantity: -20, teamId: teams[1].id, occurredAt: day(-14) },
      ],
    });
  }

  const equipmentSpec = [
    ["EQ-001", "Karcher T10/1 vacuum", "مكنسة كارشر"], ["EQ-002", "Karcher T10/1 vacuum", "مكنسة كارشر"],
    ["EQ-003", "Numatic Henry vacuum", "مكنسة نوماتيك"], ["EQ-004", "Numatic Henry vacuum", "مكنسة نوماتيك"],
    ["EQ-005", "Carpet extractor Puzzi 10/1", "جهاز استخلاص السجاد"], ["EQ-006", "Steam cleaner SC4", "منظف بالبخار"],
    ["EQ-007", "Pressure washer K5", "غسالة ضغط"], ["EQ-008", "AC duct brush machine", "آلة تنظيف مجاري التكييف"],
  ] as const;
  for (let i = 0; i < equipmentSpec.length; i++) {
    const [tag, en, ar] = equipmentSpec[i];
    const lastMaint = day(-int(20, 160));
    const eq = await prisma.equipment.create({
      data: {
        assetTag: tag, nameEn: en, nameAr: ar, category: en.includes("vacuum") ? "Vacuums" : "Machines",
        serialNumber: `SN${int(100000, 999999)}`,
        purchaseDate: day(-int(200, 900)), purchaseCostFils: aed(int(900, 6500)),
        assignedTeamId: teams[i % teams.length].id,
        status: i === 6 ? "IN_REPAIR" : "IN_SERVICE",
        maintenanceIntervalDays: 180,
        lastMaintenanceAt: lastMaint,
        nextMaintenanceDueAt: new Date(lastMaint.getTime() + 180 * 86400000),
      },
    });
    await prisma.equipmentMaintenance.create({
      data: {
        equipmentId: eq.id, type: "SCHEDULED", performedAt: lastMaint,
        costFils: aed(int(80, 450)), vendor: "Gulf Machine Services",
        notes: "Filter replaced, brushes checked.",
      },
    });
  }

  // -------------------------------------------------------------------------
  // 15. Marketing spend (the top half of the CAC report)
  // -------------------------------------------------------------------------
  const spendRows = [];
  for (let m = 0; m < 6; m++) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - m, 1);
    for (const source of ["GOOGLE", "INSTAGRAM", "FACEBOOK"] as const) {
      spendRows.push({
        source, year: d.getFullYear(), month: d.getMonth() + 1,
        amountFils: aed(source === "GOOGLE" ? int(3000, 6000) : int(800, 2500)),
      });
    }
  }
  await prisma.marketingSpend.createMany({ data: spendRows, skipDuplicates: true });

  // -------------------------------------------------------------------------
  // 16. Message templates used by later phases
  // -------------------------------------------------------------------------
  await prisma.messageTemplate.createMany({
    data: [
      { code: "QUOTE_SENT", description: "Sent within 60 seconds of a website enquiry", channel: "BOTH",
        subjectEn: "Your cleaning quote from Sparkle", subjectAr: "عرض السعر الخاص بك من سباركل",
        bodyEn: "Hi {{name}}, thank you for your enquiry. Your quote for {{service}} is {{total}}. It is valid until {{validUntil}}. Reply to this message to book.",
        bodyAr: "مرحباً {{name}}، شكراً لتواصلك. عرض السعر لخدمة {{service}} هو {{total}}، صالح حتى {{validUntil}}." },
      { code: "BOOKING_CONFIRMED", description: "Confirmation once a job is scheduled", channel: "BOTH",
        subjectEn: "Your booking is confirmed", subjectAr: "تم تأكيد حجزك",
        bodyEn: "Hi {{name}}, your {{service}} is confirmed for {{date}} at {{time}}. Our team will call on arrival.",
        bodyAr: "مرحباً {{name}}، تم تأكيد خدمة {{service}} بتاريخ {{date}} الساعة {{time}}." },
      { code: "INVOICE_ISSUED", description: "Invoice with the Stripe payment link", channel: "BOTH",
        subjectEn: "Invoice {{invoiceNo}} from Sparkle", subjectAr: "الفاتورة {{invoiceNo}} من سباركل",
        bodyEn: "Hi {{name}}, invoice {{invoiceNo}} for {{total}} is attached. Pay by card here: {{payLink}}",
        bodyAr: "مرحباً {{name}}، الفاتورة {{invoiceNo}} بقيمة {{total}} مرفقة. للدفع بالبطاقة: {{payLink}}" },
      { code: "PAYMENT_REMINDER", description: "Dunning reminder at due date, +3 and +7 days", channel: "BOTH",
        subjectEn: "Reminder: invoice {{invoiceNo}}", subjectAr: "تذكير: الفاتورة {{invoiceNo}}",
        bodyEn: "Hi {{name}}, invoice {{invoiceNo}} for {{balance}} is now due. Pay here: {{payLink}}",
        bodyAr: "مرحباً {{name}}، الفاتورة {{invoiceNo}} بقيمة {{balance}} مستحقة الآن." },
      { code: "RATING_REQUEST", description: "Sent 2 hours after a job is completed", channel: "BOTH",
        subjectEn: "How did we do?", subjectAr: "كيف كان أداؤنا؟",
        bodyEn: "Hi {{name}}, how was today's clean? Tap to rate us: {{ratingLink}}",
        bodyAr: "مرحباً {{name}}، كيف كان التنظيف اليوم؟ قيّمنا هنا: {{ratingLink}}" },
      { code: "GOOGLE_REVIEW", description: "Shown to clients who rate 5 stars", channel: "BOTH",
        subjectEn: "Thank you! Would you share that on Google?", subjectAr: "شكراً لك! هل تشاركها على جوجل؟",
        bodyEn: "Thank you for the 5 stars, {{name}}! It would mean a lot if you shared it here: {{googleLink}}",
        bodyAr: "شكراً لتقييمك، {{name}}! يسعدنا مشاركتك هنا: {{googleLink}}" },
      { code: "WINBACK", description: "Offer to clients inactive 60+ days", channel: "BOTH",
        subjectEn: "We miss you — 20% off your next clean", subjectAr: "اشتقنا إليك — خصم ٢٠٪",
        bodyEn: "Hi {{name}}, it has been a while. Here is 20% off your next booking: {{offerLink}}",
        bodyAr: "مرحباً {{name}}، لم نرك منذ فترة. خصم ٢٠٪ على حجزك القادم: {{offerLink}}" },
      { code: "VISA_EXPIRY_ALERT", description: "Internal alert to the admin at 60/30/7 days", channel: "EMAIL",
        subjectEn: "Action needed: {{documentType}} expires in {{days}} days", subjectAr: "مطلوب إجراء: {{documentType}}",
        bodyEn: "{{staffName}}'s {{documentType}} expires on {{expiryDate}} ({{days}} days). Start renewal now.",
        bodyAr: "{{documentType}} الخاص بـ {{staffName}} ينتهي في {{expiryDate}}." },
    ],
  });

  // -------------------------------------------------------------------------
  // 17. Point the document counters at the numbers we just used, so the app
  //     carries on from here instead of reissuing an existing invoice number.
  // -------------------------------------------------------------------------
  const year = TODAY.getFullYear();
  await prisma.documentCounter.createMany({
    data: [
      { prefix: "JOB", year, lastNumber: jobSeq },
      { prefix: "INV", year, lastNumber: invoiceSeq },
      { prefix: "PAY", year, lastNumber: paymentSeq },
      { prefix: "TKT", year, lastNumber: ticketSeq },
      { prefix: "CL", year, lastNumber: clients.length },
      { prefix: "LD", year, lastNumber: leadNames.length },
      { prefix: "QT", year, lastNumber: 0 },
      { prefix: "CN", year, lastNumber: 0 },
      { prefix: "EMP", year, lastNumber: staff.length },
    ],
  });

  // -------------------------------------------------------------------------
  // 18. Create the four demo LOGINS in Supabase Auth.
  // -------------------------------------------------------------------------
  await createAuthUsers();

  const counts = {
    clients: await prisma.client.count(),
    properties: await prisma.clientProperty.count(),
    teams: await prisma.team.count(),
    staff: await prisma.staff.count(),
    jobs: await prisma.job.count(),
    leads: await prisma.lead.count(),
    invoices: await prisma.invoice.count(),
    payments: await prisma.payment.count(),
    ratings: await prisma.rating.count(),
    tickets: await prisma.ticket.count(),
  };
  console.log("\nDemo data ready:");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(12)} ${v}`);
}

/**
 * Creates the four demo logins in Supabase Auth so you can actually sign in.
 *
 * This needs SUPABASE_SERVICE_ROLE_KEY. If it is missing we do NOT pretend it
 * worked — we print exactly what to do by hand.
 */
async function createAuthUsers() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.SEED_DEMO_PASSWORD ?? "CleanOS!2026";

  if (!url || !serviceKey) {
    console.log("\n" + "=".repeat(70));
    console.log("!! TODO — DEMO LOGINS WERE NOT CREATED");
    console.log("=".repeat(70));
    console.log("NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set,");
    console.log("so this script could not create the sign-in accounts.");
    console.log("The database has all its demo data, but you cannot log in yet.");
    console.log("");
    console.log("Fix it by putting both keys in .env and running `npm run db:seed` again,");
    console.log("or add these four users by hand in Supabase > Authentication > Users,");
    console.log("using these EXACT ids and emails:");
    for (const l of DEMO_LOGINS) {
      console.log(`   ${USER_IDS[l.key]}   ${l.email.padEnd(22)} (${l.role})`);
    }
    console.log("=".repeat(70) + "\n");
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  for (const login of DEMO_LOGINS) {
    const id = USER_IDS[login.key];
    // Remove any previous demo account with this id, then recreate it, so the
    // id in Supabase Auth always matches the id in our users table.
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
    const { error } = await admin.auth.admin.createUser({
      id,
      email: login.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: login.name, role: login.role },
    });
    if (error) {
      console.error(`  !! Could not create ${login.email}: ${error.message}`);
    } else {
      console.log(`  Login ready: ${login.email} / ${password}  (${login.role})`);
    }
  }
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
