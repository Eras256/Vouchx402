import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  // Always-prefixed routes (/en/..., /es/...) per the Phase 7 spec, no
  // unprefixed default locale.
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
