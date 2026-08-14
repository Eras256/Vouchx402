import { getTranslations } from "next-intl/server";
import { PitchCover } from "@/components/pitch/pitch-cover";
import { PitchProblem } from "@/components/pitch/pitch-problem";
import { PitchHowItWorks } from "@/components/pitch/pitch-how-it-works";
import { PitchProof } from "@/components/pitch/pitch-proof";
import { PitchEcosystem } from "@/components/pitch/pitch-ecosystem";
import { PitchRoadmap } from "@/components/pitch/pitch-roadmap";
import { PitchLinks } from "@/components/pitch/pitch-links";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pitch" });
  const title = t("metaTitle");
  const description = t("intro");
  return {
    title,
    description,
    openGraph: { title, description, siteName: "Vouch402", type: "website", images: ["/opengraph-image.png"] },
    twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image.png"] },
  };
}

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
