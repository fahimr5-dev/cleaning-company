"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, MessageCircle, Check, AlertTriangle } from "lucide-react";
import { calculateQuoteAction, submitLeadAction, type SubmitLeadResult } from "@/app/actions/quote";
import type { QuoteResult } from "@/lib/quote";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * The instant-quote calculator.
 *
 * PLAIN ENGLISH: the visitor picks what they need and sees a real price
 * immediately. That price is worked out on our server from the rate card, not
 * in the browser, so nobody can change the numbers by fiddling with the page.
 */

type Service = {
  code: string;
  nameEn: string;
  nameAr: string;
  category: "CORE" | "ADDON";
  propertyTypes: string[];
};

const PROPERTY_TYPES = ["APARTMENT", "VILLA", "OFFICE"] as const;
type PropertyType = (typeof PROPERTY_TYPES)[number];

const SOURCES = [
  "GOOGLE", "INSTAGRAM", "FACEBOOK", "TIKTOK", "REFERRAL", "WALK_IN", "REPEAT", "OTHER",
] as const;

export function QuoteCalculator({
  locale,
  services,
  frequencies,
  zones,
}: {
  locale: "en" | "ar";
  services: Service[];
  frequencies: { value: string; discountBps: number }[];
  zones: { id: string; nameEn: string; nameAr: string }[];
  vatRateBps: number;
}) {
  const t = useTranslations("marketing.calculator");
  const tf = useTranslations("frequency");
  const tp = useTranslations("propertyType");
  const ts = useTranslations("leadSource");

  const name = (s: { nameEn: string; nameAr: string }) => (locale === "ar" ? s.nameAr : s.nameEn);

  const coreServices = useMemo(() => services.filter((s) => s.category === "CORE"), [services]);
  const addOnServices = useMemo(() => services.filter((s) => s.category === "ADDON"), [services]);

  // ---- what the visitor has chosen ----
  const [propertyType, setPropertyType] = useState<PropertyType>("APARTMENT");
  const [serviceCode, setServiceCode] = useState(coreServices[0]?.code ?? "");
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(2);
  const [sqm, setSqm] = useState(150);
  const [frequency, setFrequency] = useState(frequencies[0]?.value ?? "ONE_OFF");
  const [addOns, setAddOns] = useState<Record<string, number>>({});
  const [referralCode, setReferralCode] = useState("");

  // ---- the price we got back ----
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [pricing, startPricing] = useTransition();

  // ---- the contact step ----
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<string>("GOOGLE");
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<SubmitLeadResult, { ok: true }> | null>(null);

  const isOffice = propertyType === "OFFICE";

  // Services are not available for every property type — keep the choice valid.
  const availableCore = coreServices.filter((s) => s.propertyTypes.includes(propertyType));
  useEffect(() => {
    if (!availableCore.some((s) => s.code === serviceCode) && availableCore[0]) {
      setServiceCode(availableCore[0].code);
    }
  }, [propertyType, availableCore, serviceCode]);

  const payload = useMemo(
    () => ({
      propertyType,
      serviceCode,
      bedrooms: isOffice ? undefined : bedrooms,
      bathrooms,
      sqm: isOffice ? sqm : undefined,
      frequency,
      addOns: Object.entries(addOns)
        .filter(([, units]) => units > 0)
        .map(([code, units]) => ({ code, units })),
      referralCode: referralCode.trim() || null,
    }),
    [propertyType, serviceCode, bedrooms, bathrooms, sqm, isOffice, frequency, addOns, referralCode],
  );

  // Re-price whenever a choice changes. Debounced so dragging a number field
  // does not fire a request per keystroke.
  useEffect(() => {
    if (!serviceCode) return;
    const timer = setTimeout(() => {
      startPricing(async () => {
        const result = await calculateQuoteAction(payload);
        if (result.ok) {
          setQuote(result.quote);
          setPriceError(null);
        } else {
          setQuote(null);
          setPriceError(result.error);
        }
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [payload, serviceCode]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    startSubmit(async () => {
      const result = await submitLeadAction({
        ...payload,
        fullName, phone, email, zoneId, preferredDate, notes, source, locale, website,
      });
      if (result.ok) setDone(result);
      else setSubmitError(result.error);
    });
  }

  // ---------------------------------------------------------------- success --
  if (done) {
    return (
      <Card className="border-green-300 dark:border-green-800">
        <CardContent className="space-y-4 p-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
            <Check className="size-6" aria-hidden />
          </span>
          <div>
            <h3 className="text-lg font-semibold">{t("done.title")}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("done.body", { quoteNo: done.quoteNo })}
            </p>
          </div>

          <p className="text-2xl font-semibold tabular-nums">
            {formatMoney(done.totalFils, locale)}
          </p>

          {/* We never claim an email was sent when it was not. */}
          {done.emailSent ? (
            <p className="text-muted-foreground text-sm">{t("done.emailed")}</p>
          ) : done.emailProblem ? (
            <Alert>
              <AlertTriangle className="size-4" aria-hidden />
              <AlertDescription>{t("done.emailFailed")}</AlertDescription>
            </Alert>
          ) : null}

          {done.whatsappUrl ? (
            <Button
              render={<a href={done.whatsappUrl} target="_blank" rel="noopener noreferrer" />}
              className="w-full"
              size="lg"
            >
              <MessageCircle className="size-4" aria-hidden />
              {t("done.whatsapp")}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  // ------------------------------------------------------------- calculator --
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Property type */}
        <Choice
          label={t("propertyType")}
          options={PROPERTY_TYPES.map((v) => ({ value: v, label: tp(v) }))}
          value={propertyType}
          onChange={(v) => setPropertyType(v as PropertyType)}
        />

        {/* Service */}
        <Choice
          label={t("service")}
          options={availableCore.map((s) => ({ value: s.code, label: name(s) }))}
          value={serviceCode}
          onChange={setServiceCode}
        />

        {/* Size */}
        {isOffice ? (
          <NumberField
            id="sqm" label={t("sqm")} value={sqm} onChange={setSqm}
            min={10} max={20000} step={10}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="bedrooms" label={t("bedrooms")} value={bedrooms} onChange={setBedrooms} min={0} max={20} />
            <NumberField id="bathrooms" label={t("bathrooms")} value={bathrooms} onChange={setBathrooms} min={1} max={20} />
          </div>
        )}
        {isOffice ? (
          <NumberField id="bathrooms-office" label={t("bathrooms")} value={bathrooms} onChange={setBathrooms} min={1} max={20} />
        ) : null}

        {/* Frequency, with the loyalty discount shown on the button */}
        <Choice
          label={t("frequency")}
          options={frequencies.map((f) => ({
            value: f.value,
            label: tf(f.value),
            hint: f.discountBps > 0 ? `-${f.discountBps / 100}%` : undefined,
          }))}
          value={frequency}
          onChange={setFrequency}
        />

        {/* Add-ons */}
        {addOnServices.filter((s) => s.propertyTypes.includes(propertyType)).length > 0 ? (
          <div>
            <Label className="mb-2 block">{t("addOns")}</Label>
            <div className="space-y-2">
              {addOnServices
                .filter((s) => s.propertyTypes.includes(propertyType))
                .map((s) => {
                  const units = addOns[s.code] ?? 0;
                  return (
                    <div key={s.code} className="flex items-center gap-2 rounded-lg border p-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm">{name(s)}</span>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        value={units}
                        aria-label={name(s)}
                        onChange={(e) =>
                          setAddOns((prev) => ({ ...prev, [s.code]: Math.max(0, Number(e.target.value) || 0) }))
                        }
                        className="border-input h-8 w-20 rounded-md border bg-transparent px-2 text-sm tabular-nums"
                      />
                      <span className="text-muted-foreground w-14 shrink-0 text-xs">{t("units")}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : null}

        {/* Referral code */}
        <div>
          <Label htmlFor="referral">{t("referralCode")}</Label>
          <Input
            id="referral"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            placeholder={t("referralPlaceholder")}
            className="mt-1.5 font-mono"
            dir="ltr"
            maxLength={32}
          />
          {quote?.referral ? (
            <p className="mt-1.5 text-xs text-green-700 dark:text-green-400">
              {t("referralApplied", { name: quote.referral.referrerName })}
            </p>
          ) : referralCode.trim().length > 3 && quote && !quote.referral ? (
            <p className="text-muted-foreground mt-1.5 text-xs">{t("referralUnknown")}</p>
          ) : null}
        </div>

        {/* ---- the price ---- */}
        <div data-testid="price-panel" className="bg-muted/60 rounded-lg p-4">
          {priceError ? (
            <Alert variant="destructive">
              <AlertDescription>{priceError}</AlertDescription>
            </Alert>
          ) : quote ? (
            <div className={cn("space-y-1.5 transition-opacity", pricing && "opacity-50")}>
              {quote.lines.map((line) => (
                <Row
                  key={line.serviceCode}
                  label={`${name(line)}${line.quantity > 1 ? ` × ${line.quantity}` : ""}`}
                  value={formatMoney(line.lineTotalFils, locale)}
                  muted
                />
              ))}
              {quote.frequencyDiscountFils > 0 ? (
                <Row
                  label={t("frequencyDiscount", { percent: quote.frequencyDiscountBps / 100 })}
                  value={`-${formatMoney(quote.frequencyDiscountFils, locale)}`}
                  tone="green"
                />
              ) : null}
              {quote.referralDiscountFils > 0 ? (
                <Row
                  label={t("referralDiscount")}
                  value={`-${formatMoney(quote.referralDiscountFils, locale)}`}
                  tone="green"
                />
              ) : null}
              <Row label={t("vat", { percent: quote.vatRateBps / 100 })} value={formatMoney(quote.vatFils, locale)} muted />
              <div className="mt-2 flex items-baseline justify-between border-t pt-2">
                <span className="font-medium">{t("total")}</span>
                <span className="text-2xl font-semibold tabular-nums">
                  {formatMoney(quote.totalFils, locale)}
                </span>
              </div>
              <p className="text-muted-foreground pt-1 text-xs">
                {t("duration", { hours: (quote.durationMinutes / 60).toFixed(1), cleaners: quote.cleanersRequired })}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("calculating")}
            </p>
          )}
        </div>

        {/* ---- contact step ---- */}
        {!showForm ? (
          <Button
            className="w-full"
            size="lg"
            disabled={!quote || Boolean(priceError)}
            onClick={() => setShowForm(true)}
          >
            {t("bookCta")}
          </Button>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="fullName" label={t("yourName")} value={fullName} onChange={setFullName} required autoComplete="name" />
              <Field id="phone" label={t("phone")} value={phone} onChange={setPhone} required type="tel" dir="ltr" placeholder="+971 50 123 4567" autoComplete="tel" />
            </div>
            <Field id="email" label={t("email")} value={email} onChange={setEmail} type="email" dir="ltr" placeholder="you@example.com" autoComplete="email" hint={t("emailHint")} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="zone">{t("area")}</Label>
                <select
                  id="zone"
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  className="border-input mt-1.5 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                >
                  <option value="">{t("areaPlaceholder")}</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{locale === "ar" ? z.nameAr : z.nameEn}</option>
                  ))}
                </select>
              </div>
              <Field id="preferredDate" label={t("preferredDate")} value={preferredDate} onChange={setPreferredDate} type="date" />
            </div>

            <div>
              <Label htmlFor="source">{t("source")}</Label>
              <select
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="border-input mt-1.5 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>{ts(s)}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="notes">{t("notes")}</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1.5" maxLength={2000} />
            </div>

            {/* Hidden from people, irresistible to bots. */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="website">Leave this empty</label>
              <input id="website" name="website" tabIndex={-1} autoComplete="off"
                value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>

            {submitError ? (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? (
                <><Loader2 className="size-4 animate-spin" aria-hidden />{t("sending")}</>
              ) : (
                t("submit")
              )}
            </Button>
            <p className="text-muted-foreground text-center text-xs">{t("privacy")}</p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------- small parts ------------------------------ */

function Row({
  label, value, muted, tone,
}: { label: string; value: string; muted?: boolean; tone?: "green" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={cn("min-w-0 truncate", muted && "text-muted-foreground", tone === "green" && "text-green-700 dark:text-green-400")}>
        {label}
      </span>
      <span className={cn("shrink-0 tabular-nums", tone === "green" && "text-green-700 dark:text-green-400")}>
        {value}
      </span>
    </div>
  );
}

function Choice({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm transition-colors",
              value === option.value
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent",
            )}
          >
            {option.label}
            {option.hint ? (
              <span className={cn("ms-1.5 text-xs", value === option.value ? "opacity-80" : "text-green-700 dark:text-green-400")}>
                {option.hint}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberField({
  id, label, value, onChange, min, max, step = 1,
}: {
  id: string; label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        className="mt-1.5 tabular-nums"
      />
    </div>
  );
}

function Field({
  id, label, value, onChange, hint, ...rest
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; hint?: string;
} & Omit<React.ComponentProps<typeof Input>, "onChange" | "value" | "id">) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5" {...rest} />
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}
