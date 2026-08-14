import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { PitchSlide } from "./pitch-slide";

const GITHUB_URL = "https://github.com/Eras256/Vouchx402";
const PLUGIN_URL = `${GITHUB_URL}/blob/master/plugins/vouch402.md`;
const PR_URL = "https://github.com/base/skills/pull/152";

const PACKAGES = [
  { key: "sdk", name: "vouch402-sdk", url: "https://www.npmjs.com/package/vouch402-sdk" },
  { key: "cli", name: "vouch402", url: "https://www.npmjs.com/package/vouch402" },
  { key: "mcpServer", name: "vouch402-mcp-server", url: "https://www.npmjs.com/package/vouch402-mcp-server" },
] as const;

export function PitchEcosystem() {
  const t = useTranslations("pitch.ecosystem");

  return (
    <PitchSlide id="ecosystem" eyebrow={t("eyebrow")} index={5}>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>
      <p className="prose-column mt-3 text-muted-foreground">{t("subtitle")}</p>

      <div className="mt-10 rounded-xl border border-border bg-muted/50 p-5 sm:p-6">
        <h3 className="font-medium">{t("plugin.title")}</h3>
        <p className="prose-column mt-2 text-sm text-muted-foreground">{t("plugin.description")}</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a
            href={PLUGIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {t("plugin.pluginLink")}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
          <a
            href={PR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {t("plugin.prLink")}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      <h3 className="mt-8 font-medium">{t("packages.title")}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {PACKAGES.map((pkg) => (
          <a
            key={pkg.key}
            href={pkg.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col rounded-xl border border-border bg-muted/50 p-4 transition-colors hover:border-primary/40 sm:p-5"
          >
            <span className="data flex items-center gap-1 text-sm font-medium text-foreground">
              {pkg.name}
              <ArrowUpRight
                className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden="true"
              />
            </span>
            <span className="mt-2 text-sm text-muted-foreground">{t(`packages.${pkg.key}`)}</span>
          </a>
        ))}
      </div>
    </PitchSlide>
  );
}
