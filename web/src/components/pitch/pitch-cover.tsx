import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { PitchSlide } from "./pitch-slide";

const GITHUB_URL = "https://github.com/Eras256/Vouchx402";

export function PitchCover() {
  const t = useTranslations("pitch");

  const links = [
    { label: t("cover.links.github"), href: GITHUB_URL },
    { label: t("cover.links.docs"), href: `${GITHUB_URL}/blob/master/docs/TECHNICAL_SPEC.md` },
    { label: t("cover.links.sdk"), href: "https://www.npmjs.com/package/vouch402-sdk" },
  ];

  return (
    <PitchSlide id="cover" eyebrow={t("cover.eyebrow")} index={1}>
      <Badge variant="secondary" className="mb-4 gap-1.5 border-success/30 bg-success/10 text-success">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
        {t("eyebrow")}
      </Badge>

      <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
      <p className="mt-3 text-lg text-muted-foreground sm:text-xl">{t("subtitle")}</p>
      <p className="prose-column mt-6 text-muted-foreground">{t("cover.summary")}</p>

      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="data text-sm text-primary hover:underline"
          >
            {link.label}
          </a>
        ))}
      </div>
    </PitchSlide>
  );
}
