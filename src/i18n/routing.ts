import { defineRouting } from "next-intl/routing";

/**
 * The two languages the app speaks.
 *
 * PLAIN ENGLISH: every page lives under a language prefix — /en/dashboard and
 * /ar/dashboard are the same screen in two languages. Arabic pages render
 * right-to-left automatically.
 */
export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];

/** Arabic reads right-to-left; English reads left-to-right. */
export function directionOf(locale: string): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
