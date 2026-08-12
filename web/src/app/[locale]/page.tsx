import { Hero } from "@/components/sections/hero";
import { HowItWorks } from "@/components/sections/how-it-works";
import { LiveActivity } from "@/components/sections/live-activity";
import { ApiReference } from "@/components/sections/api-reference";

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <LiveActivity />
      <ApiReference />
    </>
  );
}
