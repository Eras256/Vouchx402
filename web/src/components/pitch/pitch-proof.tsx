import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { truncateHex } from "@/lib/format";

const SETTLED_PAYMENT_TX = "0x6e44081aa3f05c73f6c9c32dc456f0231c3a690a33159765917ff096d138659c";
const FULFILLMENT_TX = "0xe2b5002c923bd9b49afce698f9d0f7ebef66d24f8c1eafd22c0a64e7c5f7ebb7";
const FULFILLMENT_SCHEMA = "0xfbd6000caf2aaa6f7e269c74b45a0f891ddfe3381356d8ebaefc46b1a524abac";
const DISPUTE_SCHEMA = "0x1920040cef7ce73e197d5a104e1c72e21d4787c8c095e9dba0584a8fee94fa18";

export function PitchProof() {
  const t = useTranslations("pitch.proof");

  const rows = [
    { label: t("settledPayment"), href: `https://basescan.org/tx/${SETTLED_PAYMENT_TX}`, value: SETTLED_PAYMENT_TX },
    { label: t("fulfillmentTx"), href: `https://basescan.org/tx/${FULFILLMENT_TX}`, value: FULFILLMENT_TX },
    {
      label: t("fulfillmentSchema"),
      href: `https://base.easscan.org/schema/view/${FULFILLMENT_SCHEMA}`,
      value: FULFILLMENT_SCHEMA,
    },
    { label: t("disputeSchema"), href: `https://base.easscan.org/schema/view/${DISPUTE_SCHEMA}`, value: DISPUTE_SCHEMA },
  ];

  return (
    <section id="proof" className="border-t border-border">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>
        <p className="prose-column mt-3 text-muted-foreground">{t("subtitle")}</p>

        <div className="mt-10 divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((row) => (
            <a
              key={row.label}
              href={row.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50 sm:p-5"
            >
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className="data flex items-center gap-1.5 truncate text-sm text-foreground">
                {truncateHex(row.value)}
                <ArrowUpRight
                  className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                  aria-hidden="true"
                />
              </span>
            </a>
          ))}
          <a
            href="https://vouch402.fly.dev/v1/metrics"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50 sm:p-5"
          >
            <span>
              <span className="block text-sm text-muted-foreground">{t("liveMetrics")}</span>
              <span className="mt-0.5 block max-w-md text-xs text-muted-foreground/80">
                {t("liveMetricsDescription")}
              </span>
            </span>
            <ArrowUpRight
              className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden="true"
            />
          </a>
        </div>
      </div>
    </section>
  );
}
