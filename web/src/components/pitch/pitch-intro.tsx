import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

export function PitchIntro() {
  const t = useTranslations("pitch");

  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
      <Badge variant="secondary" className="mb-4 gap-1.5 border-success/30 bg-success/10 text-success">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
        {t("eyebrow")}
      </Badge>

      <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
      <p className="mt-3 text-lg text-muted-foreground sm:text-xl">{t("subtitle")}</p>
      <p className="prose-column mt-6 text-muted-foreground">{t("intro")}</p>
    </section>
  );
}
