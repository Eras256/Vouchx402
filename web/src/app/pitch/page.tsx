import { PitchCover } from "@/components/pitch/pitch-cover";
import { PitchProblem } from "@/components/pitch/pitch-problem";
import { PitchHowItWorks } from "@/components/pitch/pitch-how-it-works";
import { PitchProof } from "@/components/pitch/pitch-proof";
import { PitchEcosystem } from "@/components/pitch/pitch-ecosystem";
import { PitchRoadmap } from "@/components/pitch/pitch-roadmap";
import { PitchLinks } from "@/components/pitch/pitch-links";

// Locale is a client-side preference now (no /en, /es route segment),
// so metadata (rendered server-side, before any client JS runs) can't
// react to it: kept in English, the site default, same as the rest of
// the pre-hydration shell. The page body itself still translates live.
export const metadata = {
  title: "Vouch402 Pitch",
  description: "x402-metered on-chain risk intelligence for autonomous agents on Base.",
  openGraph: {
    title: "Vouch402 Pitch",
    description: "x402-metered on-chain risk intelligence for autonomous agents on Base.",
    siteName: "Vouch402",
    type: "website",
    images: ["/opengraph-image.png"],
  },
  twitter: {
    card: "summary_large_image" as const,
    title: "Vouch402 Pitch",
    description: "x402-metered on-chain risk intelligence for autonomous agents on Base.",
    images: ["/opengraph-image.png"],
  },
};

export default function PitchPage() {
  return (
    <div className="bg-muted">
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8 sm:space-y-6 sm:px-6 sm:py-12">
        <PitchCover />
        <PitchProblem />
        <PitchHowItWorks />
        <PitchProof />
        <PitchEcosystem />
        <PitchRoadmap />
        <PitchLinks />
      </div>
    </div>
  );
}
