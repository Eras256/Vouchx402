import { useTranslations } from "next-intl";

export function PitchRoadmap() {
  const t = useTranslations("pitch.roadmap");

  return (
    <section id="roadmap" className="border-t border-border">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>
        <p className="prose-column mt-6 text-muted-foreground">{t("body1")}</p>
        <p className="prose-column mt-4 text-muted-foreground">{t("body2")}</p>
      </div>
    </section>
  );
}
