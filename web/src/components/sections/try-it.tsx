"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { BasePayButton } from "@base-org/account-ui/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNetwork } from "@/components/network-provider";
import { useRiskScoreDemo } from "@/hooks/use-risk-score-demo";
import { easExplorerUrl, basescanTxUrl, toApiNetwork } from "@/lib/vouch402";
import { truncateHex } from "@/lib/format";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
// Same real, checkable address used as the Hero's proof card — a
// convenient, honest default rather than an artificial placeholder.
const DEFAULT_ADDRESS = "0x53a79B109fa77c05B043e73A284a22b57c6263b0";

export function TryIt() {
  const t = useTranslations("tryIt");
  const tSelectors = useTranslations("selectors");
  const { theme } = useTheme();
  const { network } = useNetwork();
  const { phase, run, reset } = useRiskScoreDemo();
  const [address, setAddress] = useState(DEFAULT_ADDRESS);
  const [addressTouched, setAddressTouched] = useState(false);

  const apiNetwork = toApiNetwork(network);
  const addressValid = ADDRESS_PATTERN.test(address.trim());
  const busy = phase.status !== "idle" && phase.status !== "done" && phase.status !== "error";

  function handlePayClick() {
    setAddressTouched(true);
    if (!addressValid || busy) return;
    void run(address.trim(), network);
  }

  return (
    <section id="try-it" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>
          <p className="prose-column mt-3 text-muted-foreground">{t("subtitle")}</p>
          <p className="prose-column mt-1 text-xs text-muted-foreground">
            {t("networkNote", { network: network === "testnet" ? tSelectors("testnet") : tSelectors("mainnet") })}
          </p>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <label htmlFor="try-it-address" className="text-sm font-medium">
              {t("addressLabel")}
            </label>
            <input
              id="try-it-address"
              type="text"
              value={address}
              disabled={busy}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => setAddressTouched(true)}
              placeholder={t("addressPlaceholder")}
              spellCheck={false}
              className="data mt-2 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            />
            {addressTouched && !addressValid && <p className="mt-1.5 text-xs text-error">{t("addressInvalid")}</p>}

            <div className="mt-5">
              <BasePayButton colorScheme={(theme as "light" | "dark" | "system" | undefined) ?? "system"} onClick={handlePayClick} />
            </div>
          </div>

          <DemoStatus phase={phase} apiNetwork={apiNetwork} onReset={reset} t={t} />
        </div>
      </div>
    </section>
  );
}

function DemoStatus({
  phase,
  apiNetwork,
  onReset,
  t,
}: {
  phase: ReturnType<typeof useRiskScoreDemo>["phase"];
  apiNetwork: ReturnType<typeof toApiNetwork>;
  onReset: () => void;
  t: ReturnType<typeof useTranslations<"tryIt">>;
}) {
  if (phase.status === "idle") return null;

  if (phase.status === "quoting") {
    return <StatusPanel>{t("phase.quoting")}</StatusPanel>;
  }

  if (phase.status === "awaiting-payment") {
    return <StatusPanel>{t("phase.awaitingPayment", { amount: phase.amount, payTo: truncateHex(phase.payTo) })}</StatusPanel>;
  }

  if (phase.status === "confirming" || phase.status === "fulfilling") {
    return (
      <StatusPanel>
        {t(phase.status === "confirming" ? "phase.confirming" : "phase.fulfilling")}
        <a
          href={basescanTxUrl(apiNetwork, phase.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="data mt-2 block text-xs text-primary hover:underline"
        >
          {truncateHex(phase.txHash)}
        </a>
      </StatusPanel>
    );
  }

  if (phase.status === "error") {
    return (
      <StatusPanel tone="error">
        <p className="font-medium">{t("phase.error")}</p>
        <p className="mt-1 text-sm">{phase.message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onReset}>
          {t("phase.tryAgain")}
        </Button>
      </StatusPanel>
    );
  }

  // phase.status === "done"
  const { result, txHash } = phase;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{t("result.title")}</span>
        <Badge variant="outline" className="gap-1 border-success/30 text-success">
          fulfilled
        </Badge>
      </div>

      <dl className="mt-4 space-y-3 text-sm">
        <Row label="address" value={truncateHex(result.address)} />
        <Row label={t("result.score")} value={`${result.score}/100`} strong />
        <Row label={t("result.walletAgeDays")} value={String(result.signals.walletAgeDays)} />
        <Row label={t("result.txCount")} value={String(result.signals.txCount)} />
        <Row label={t("result.uniqueContractInteractions")} value={String(result.signals.uniqueContractInteractions)} />
        <Row label={t("result.flagged")} value={result.signals.flagged ? t("result.yes") : t("result.no")} />
        <Row label="attestationUid" value={truncateHex(result.attestationUid)} />
      </dl>

      <div className="mt-4 flex flex-wrap gap-4 text-xs">
        <a href={basescanTxUrl(apiNetwork, txHash)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          {t("result.viewTx")}
        </a>
        <a
          href={easExplorerUrl(apiNetwork, result.attestationUid)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {t("result.viewAttestation")}
        </a>
        <button type="button" onClick={onReset} className="text-muted-foreground hover:text-foreground hover:underline">
          {t("phase.tryAgain")}
        </button>
      </div>
    </div>
  );
}

function StatusPanel({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "error" }) {
  return (
    <div
      className={
        tone === "error"
          ? "rounded-xl border border-error/30 bg-error/5 p-5 text-error sm:p-6"
          : "rounded-xl border border-border bg-card p-5 text-sm text-foreground sm:p-6"
      }
    >
      {children}
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`data truncate ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}
