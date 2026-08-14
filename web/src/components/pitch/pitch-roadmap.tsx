import { useTranslations } from "next-intl";
import { PitchSlide } from "./pitch-slide";

export function PitchRoadmap() {
  const t = useTranslations("pitch.roadmap");

  return (
    <PitchSlide id="roadmap" eyebrow={t("eyebrow")} index={6}>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>
      <p className="prose-column mt-6 text-muted-foreground">{t("body1")}</p>

      <div className="prose-column mt-6 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-foreground sm:p-5">
        {t("body2")}
      </div>
    </PitchSlide>
  );
}
