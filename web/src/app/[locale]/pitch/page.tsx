import { getTranslations } from "next-intl/server";
import { PitchIntro } from "@/components/pitch/pitch-intro";
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
    <>
      <PitchIntro />
      <PitchHowItWorks />
      <PitchProof />
      <PitchEcosystem />
      <PitchRoadmap />
      <PitchLinks />
    </>
  );
}
