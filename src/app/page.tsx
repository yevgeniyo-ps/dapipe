import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { TrivyDemo } from "@/components/landing/trivy-demo";
import { Pricing } from "@/components/landing/pricing";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { Footer } from "@/components/landing/footer";

export default function HomePage() {
  return (
    <main className="flex-1">
      <Hero />
      <HowItWorks />
      <TrivyDemo />
      <Pricing />
      <WaitlistForm />
      <Footer />
    </main>
  );
}
