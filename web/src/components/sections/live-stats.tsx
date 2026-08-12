"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { useMetrics } from "@/hooks/use-live-data";

// Always mainnet, not the network selector — see DECISION_LOG.md
// ("Network selector scope for 7c, clarified"): the accumulated testnet
// data is development noise, and letting the selector drive this section
// would present that noise with the same visual weight as the real
// mainnet activity it exists to demonstrate.
const NETWORK = "base" as const;

const STAT_KEYS = ["uniquePayers", "totalRequestsServed", "totalVolumeUsdc", "attestationCount", "disputeCount"] as const;

export function LiveStats() {
  const t = useTranslations("liveStats");
  const { data, error, loading } = useMetrics(NETWORK);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>
        <Badge variant="outline" className="border-primary/30 text-primary">
          {t("mainnetBadge")}
        </Badge>
      </div>
      <p className="prose-column mt-3 text-muted-foreground">{t("subtitle")}</p>
      <p className="prose-column mt-1 text-xs text-muted-foreground">{t("mainnetNote")}</p>

      {error ? (
        <p className="mt-8 text-sm text-error">{t("loadError")}</p>
      ) : (
        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
          {STAT_KEYS.map((key, i) => (
            <div
              key={key}
              // 5 items doesn't divide evenly into 2 or 3 columns, which
              // otherwise leaves an empty, borderless-looking gap cell in
              // the last row at the mobile/tablet breakpoints (caught by
              // screenshot, not assumed) — span the last item to fill it:
              // 2-col row of [1,2][3,4][5→span2] and 3-col row of
              // [1,2,3][4,5→span2] both fill exactly. Reset at lg, where
              // 5 columns already fits all 5 items in one full row.
              className={`bg-card px-4 py-5 ${i === STAT_KEYS.length - 1 ? "col-span-2 lg:col-span-1" : ""}`}
            >
              <dt className="text-xs text-muted-foreground">{t(`stats.${key}`)}</dt>
              <dd className="data mt-1.5 text-2xl font-semibold" aria-live="polite">
                {loading || !data ? "—" : data[key]}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
