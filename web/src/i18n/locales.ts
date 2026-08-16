// Single source of truth for the two locales this site supports. No
// URL prefix, no per-request server resolution: locale is a client-side
// preference now (see locale-provider.tsx), this file just names the
// options so the selectors don't hardcode them in two places.
export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(value: string | null): value is Locale {
  return (locales as readonly string[]).includes(value ?? "");
}
