import { useTranslations } from "next-intl";
import { CodeBlock } from "@/components/docs/code-block";

const STEP_KEYS = ["quote", "pay", "fetch", "verify"] as const;

// Byte-identical to README.md's "Try it" section: the real example, not
// a new one invented for this page.
const CURL_EXAMPLE = `# 1. Unpaid request -> 402 with payment requirements
curl https://vouch402.fly.dev/v1/risk-score/0x53a79B109fa77c05B043e73A284a22b57c6263b0

# 2. Pay the quoted USDC amount on-chain to \`payTo\` (any standard ERC-20
#    transfer works; see docs/TECHNICAL_SPEC.md for why this isn't the
#    EIP-3009/facilitator "exact" scheme). Then retry with proof:
curl https://vouch402.fly.dev/v1/risk-score/0x53a79B109fa77c05B043e73A284a22b57c6263b0 \\
  -H "X-PAYMENT: $(echo -n '{"resourceId":"0x...","txHash":"0x...","payer":"0x..."}' | base64)"`;

export function PitchHowItWorks() {
  const t = useTranslations("pitch.howItWorks");

  return (
    <section id="how-it-works" className="border-t border-border">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>
        <p className="prose-column mt-3 text-muted-foreground">{t("subtitle")}</p>

        <ol className="mt-10 space-y-6">
          {STEP_KEYS.map((key, i) => (
            <li key={key} className="flex gap-4">
              <div
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-sm font-semibold text-primary"
              >
                {i + 1}
              </div>
              <div className="pt-0.5">
                <h3 className="font-medium">{t(`steps.${key}.title`)}</h3>
                <p className="prose-column mt-1 text-sm text-muted-foreground">{t(`steps.${key}.description`)}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-sm font-medium text-muted-foreground">{t("codeLabel")}</p>
        <div className="mt-3">
          <CodeBlock code={CURL_EXAMPLE} language="bash" />
        </div>
      </div>
    </section>
  );
}
