import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/docs/code-block";
import { API_BASE_URL } from "@/lib/vouch402";

// Curl examples are code, not prose — kept in English regardless of site
// language, same convention as the Docs page (see messages/*.json
// "docs.sourceNote"). Verified against src/server/app.ts's actual request
// handling, not guessed: the two-step 402 -> pay -> retry flow for
// risk-score, the real ?network= filter on metrics, and the real
// { refUID, reasonCode, details, signature } dispute body shape.
const ENDPOINTS = [
  {
    key: "riskScore",
    curl: `# 1. Ask without payment — get the exact x402 price + resourceId back as a 402
curl ${API_BASE_URL}/v1/risk-score/0x53a79B109fa77c05B043e73A284a22b57c6263b0

# 2. Pay the quoted USDC amount on-chain, then retry with proof of payment
curl ${API_BASE_URL}/v1/risk-score/0x53a79B109fa77c05B043e73A284a22b57c6263b0 \\
  -H "X-PAYMENT: $(echo -n '{"resourceId":"...","txHash":"0x...","payer":"0x..."}' | base64)"`,
  },
  {
    key: "metrics",
    curl: `curl "${API_BASE_URL}/v1/metrics?network=base"`,
  },
  {
    key: "disputes",
    curl: `curl -X POST ${API_BASE_URL}/v1/disputes \\
  -H "Content-Type: application/json" \\
  -d '{
    "refUID": "0x...",
    "reasonCode": 0,
    "details": "The returned score does not reflect on-chain history",
    "signature": "0x..."
  }'`,
  },
] as const;

export function ApiReference() {
  const t = useTranslations("apiReference");

  return (
    <section id="api-reference" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>
          <p className="prose-column mt-3 text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mt-12 space-y-10">
          {ENDPOINTS.map(({ key, curl }) => (
            <div key={key}>
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge className="font-mono text-xs" variant={t(`endpoints.${key}.method`) === "GET" ? "secondary" : "default"}>
                  {t(`endpoints.${key}.method`)}
                </Badge>
                <code className="data text-sm">{t(`endpoints.${key}.path`)}</code>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t(`endpoints.${key}.description`)}</p>
              <div className="mt-3">
                <CodeBlock code={curl} language="bash" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
