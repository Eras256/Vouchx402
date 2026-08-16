"use client";

import { useTranslations } from "next-intl";
import { PitchSlide } from "./pitch-slide";

export function PitchProblem() {
  const t = useTranslations("pitch");

  return (
    <PitchSlide id="problem" eyebrow={t("problem.eyebrow")} index={2}>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("problem.title")}</h2>
      <p className="prose-column mt-6 text-muted-foreground">{t("intro")}</p>
    </PitchSlide>
  );
}
