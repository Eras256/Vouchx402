"use client";

import { useTranslations } from "next-intl";

const STEP_KEYS = ["quote", "pay", "fulfill", "attest", "dispute"] as const;

export function HowItWorks() {
  const t = useTranslations("howItWorks");

  return (
    <section id="how-it-works" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>
          <p className="prose-column mt-3 text-muted-foreground">{t("subtitle")}</p>
        </div>

        {/* A real, ordered process: numbering is functional here, not
            decorative, per the design brief. */}
        <ol className="mt-12 space-y-8 sm:space-y-10">
          {STEP_KEYS.map((key, i) => (
            <li key={key} className="flex gap-4 sm:gap-6">
              <div
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-sm font-semibold text-primary sm:size-10"
              >
                {i + 1}
              </div>
              <div className="pt-1">
                <h3 className="font-medium">{t(`steps.${key}.title`)}</h3>
                <p className="prose-column mt-1 text-sm text-muted-foreground">{t(`steps.${key}.description`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
