import { Hero } from "@/components/sections/hero";
import { HowItWorks } from "@/components/sections/how-it-works";
import { ApiReference } from "@/components/sections/api-reference";

// Live stats + Recent activity feed (checkpoint 7c) land between
// HowItWorks and ApiReference, per the IA order in the frontend spec —
// including a `#live-activity` section id, which is what the Hero's
// primary CTA and the navbar's "Live activity" link already point at
// (see DECISION_LOG.md: those anchors are inert, not broken, until 7c).
export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <ApiReference />
    </>
  );
}
