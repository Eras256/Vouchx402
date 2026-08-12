import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GithubIcon } from "@/components/layout/github-icon";
import { easExplorerUrl } from "@/lib/vouch402";
import { truncateHex } from "@/lib/format";

const GITHUB_URL = "https://github.com/Eras256/Vouchx402";

// A real, independently-verified mainnet fulfillment attestation (see
// DECISION_LOG.md "First real mainnet activity on the live deployment")
// — not a mockup. Becomes the latest live one once 7c wires /v1/activity
// in; kept as a real, checkable value in the meantime rather than a
// placeholder, per the brief's own "a live, real attestation UID
// resolving on screen beats a generic headline" guidance.
const PROOF = {
  address: "0x53a79B109fa77c05B043e73A284a22b57c6263b0",
  score: 95,
  attestationUid: "0xc15b1139d2b9af18ba81004532229c3d4ccbbdd176410e6b59f7eec20a9d9909",
  network: "base" as const,
};

export function Hero() {
  const t = useTranslations("hero");

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16">
        <div>
          <Badge variant="secondary" className="mb-4 gap-1.5 border-success/30 bg-success/10 text-success">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex size-1.5 rounded-full bg-success" />
            </span>
            {t("eyebrow")}
          </Badge>

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Vouch402</h1>
          <p className="prose-column mt-4 text-lg text-muted-foreground sm:text-xl">{t("tagline")}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" nativeButton={false} render={<Link href="/#live-activity">{t("primaryCta")}</Link>} />
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                  <GithubIcon className="size-4" aria-hidden="true" />
                  {t("secondaryCta")}
                </a>
              }
            />
          </div>
        </div>

        {/* The "concrete proof" panel — a real attestation, not a mockup */}
        <a
          href={easExplorerUrl(PROOF.network, PROOF.attestationUid)}
          target="_blank"
          rel="noopener noreferrer"
          className="group block rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md motion-reduce:transition-none sm:p-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">X402ServiceFulfillment</span>
            <Badge variant="outline" className="gap-1 border-success/30 text-success">
              fulfilled
            </Badge>
          </div>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">address</dt>
              <dd className="data truncate">{truncateHex(PROOF.address)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">score</dt>
              <dd className="data font-semibold">{PROOF.score}/100</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">attestationUid</dt>
              <dd className="data truncate">{truncateHex(PROOF.attestationUid)}</dd>
            </div>
          </dl>

          <p className="mt-4 flex items-center gap-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:opacity-100">
            View on EAS explorer
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </p>
        </a>
      </div>
    </section>
  );
}
