"use client";

import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { useActivity } from "@/hooks/use-live-data";
import { truncateHex, formatRelativeTime } from "@/lib/format";
import type { ActivityItem, FulfillmentStatusCode } from "@/lib/vouch402";

// Same mainnet-only scope as LiveStats; see live-stats.tsx / DECISION_LOG.md.
const NETWORK = "base" as const;
const LIMIT = 10;

// fulfilled=success/green, disputed=warning/amber, error=error/red: the
// three status colors stay separate from --primary per the design brief.
// Timeout reads closer to "something didn't complete cleanly" than a hard
// failure, so it shares the dispute/warning color rather than error.
const STATUS_STYLE: Record<FulfillmentStatusCode, string> = {
  0: "border-success/30 bg-success/10 text-success",
  1: "border-warning/30 bg-warning/10 text-warning",
  2: "border-error/30 bg-error/10 text-error",
};
const DISPUTE_STYLE = "border-warning/30 bg-warning/10 text-warning";

function ActivityRow({ item, locale }: { item: ActivityItem; locale: string }) {
  const t = useTranslations("recentActivity");
  const time = formatRelativeTime(item.createdAt, locale);

  return (
    <li className="flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        {item.kind === "fulfillment" ? (
          <Badge variant="outline" className={STATUS_STYLE[item.status]}>
            {t(`fulfillmentStatus.${item.status}`)}
          </Badge>
        ) : (
          <Badge variant="outline" className={DISPUTE_STYLE}>
            {t(`disputeReason.${item.reasonCode}`) /* label reused as the row's headline reason */}
          </Badge>
        )}
        <span className="data truncate text-sm text-foreground">
          {item.kind === "fulfillment" ? truncateHex(item.payer) : truncateHex(item.disputant)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <span className="text-xs whitespace-nowrap text-muted-foreground">{time}</span>
        <a
          href={item.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs whitespace-nowrap text-primary hover:underline"
        >
          {t("viewOnExplorer")}
        </a>
      </div>
    </li>
  );
}

export function RecentActivity() {
  const t = useTranslations("recentActivity");
  const locale = useLocale();
  const { data, error, loading } = useActivity(NETWORK, LIMIT);

  return (
    <div className="mt-16">
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>
      <p className="prose-column mt-3 text-muted-foreground">{t("subtitle")}</p>

      <div className="mt-8 rounded-md border border-border">
        {error ? (
          <p className="p-6 text-sm text-error">{t("loadError")}</p>
        ) : loading || !data ? (
          <p className="p-6 text-sm text-muted-foreground">—</p>
        ) : data.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="px-4 sm:px-6">
            {data.map((item) => (
              <ActivityRow key={item.uid} item={item} locale={locale} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
