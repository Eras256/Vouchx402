"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../messages/en.json";
import esMessages from "../../messages/es.json";
import { locales, defaultLocale, isLocale, type Locale } from "@/i18n/locales";

const MESSAGES: Record<Locale, typeof enMessages> = { en: enMessages, es: esMessages };

const STORAGE_KEY = "vouch402-locale";
// Same reasoning as network-provider.tsx: the browser's "storage" event
// only fires in *other* tabs, so a same-tab custom event is needed for
// every subscriber (every component reading the locale) to re-render
// the instant the selector is clicked, with no navigation involved.
const LOCAL_EVENT = "vouch402-locale-change";

function getSnapshot(): Locale {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isLocale(stored) ? stored : defaultLocale;
}

// Server (and the client's very first render, before hydration) has no
// localStorage: English is the correct default here regardless, per the
// explicit "default en inglés" requirement, so there's no mismatch to
// paper over, same shape as network-provider.tsx's testnet default.
function getServerSnapshot(): Locale {
  return defaultLocale;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCAL_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCAL_EVENT, callback);
  };
}

function setStoredLocale(next: Locale) {
  window.localStorage.setItem(STORAGE_KEY, next);
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  locales: readonly Locale[];
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

/**
 * Owns the site's language, entirely client-side: no `/en`/`/es` URL
 * prefix, no server-resolved request locale. `NextIntlClientProvider`
 * is re-rendered with new `locale`/`messages` props the instant
 * `setLocale` is called, so every `useTranslations()` consumer in the
 * tree updates immediately, no page navigation or reload. Built on
 * `useSyncExternalStore` for the same reason network-provider.tsx is:
 * the actual React primitive for subscribing to state that lives
 * outside React (localStorage), not a useState+useEffect pair.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // <html lang> can't be driven by a provider nested inside <body>, so
  // it's kept in sync imperatively instead. Harmless no-op on the
  // server/first paint (still "en", matching the default).
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale: setStoredLocale, locales }}>
      {/* Fixed, explicit timeZone: this app doesn't localize any
          date/time value through next-intl's own formatters (dates
          shown anywhere are formatted directly), but next-intl warns
          hard about an unset timeZone regardless, since the server's
          local zone and a visitor's browser zone can otherwise differ
          and cause a hydration mismatch. Pinning it removes the warning
          at its actual cause rather than suppressing the symptom. */}
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useLocalePreference(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocalePreference must be used within a LocaleProvider");
  return ctx;
}
