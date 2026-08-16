"use client";

import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { PitchSlide } from "./pitch-slide";
import { Badge } from "@/components/ui/badge";

const GITHUB_URL = "https://github.com/Eras256/Vouchx402";
const PLUGIN_URL = `${GITHUB_URL}/blob/master/plugins/vouch402.md`;
const PR_URL = "https://github.com/base/skills/pull/152";

const CONTRIBUTIONS = [
  {
    key: "easSdk",
    url: "https://github.com/ethereum-attestation-service/eas-sdk/issues/132",
    kind: "security" as const,
  },
  {
    key: "foundry",
    url: "https://github.com/foundry-rs/foundry/issues/16209",
    kind: "docs" as const,
  },
] as const;

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

      <div className="mt-6 rounded-xl border border-border bg-muted/50 p-5 sm:p-6">
        <h3 className="font-medium">{t("contributions.title")}</h3>
        <p className="prose-column mt-2 text-sm text-muted-foreground">{t("contributions.subtitle")}</p>
        <ul className="mt-4 space-y-4">
          {CONTRIBUTIONS.map((item) => (
            <li key={item.key} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    item.kind === "security"
                      ? "border-error/30 text-error"
                      : "border-muted-foreground/30 text-muted-foreground"
                  }
                >
                  {t(`contributions.${item.kind}Label`)}
                </Badge>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="data inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {t(`contributions.${item.key}.link`)}
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              </div>
              <p className="prose-column mt-1.5 text-sm text-muted-foreground">
                {t(`contributions.${item.key}.description`)}
              </p>
            </li>
          ))}
        </ul>
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
