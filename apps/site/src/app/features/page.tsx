import { site } from "@content/site";
import type { Metadata } from "next";
import { Gallery } from "@/components/gallery";
import {
  Closing,
  Faq,
  FeatureRow,
  Footer,
  Models,
  Privacy,
  Section,
  Shortcuts,
} from "@/components/sections";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Features · Thoth" };

/** /features: the full, documented tour, with real screenshots of the current app (ADR-0044). */
export default function FeaturesPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Section id="features" n="01" kicker="Features" title="Everything Thoth does, in detail.">
          <div className="flex flex-col gap-24 md:gap-32">
            {site.features.map((f, i) => (
              <FeatureRow key={f.id} feature={f} flip={i % 2 === 1} />
            ))}
          </div>
        </Section>
        <Section
          id="gallery"
          n="02"
          kicker="In the app"
          title="Straight from the app."
          lead="These screenshots are taken from Thoth itself, fresh with every release. Click one to see it large."
        >
          <Gallery />
        </Section>
        <Section
          id="models"
          n="03"
          kicker="Your model"
          title="You choose who does the thinking."
          lead="Thoth has no model of its own and no account. Point it at one you trust, and change your mind per task."
        >
          <Models />
        </Section>
        <Section id="privacy" n="04" kicker="Privacy" title="It stays on your computer.">
          <Privacy />
        </Section>
        <Section
          id="keyboard"
          n="05"
          kicker="Keyboard"
          title="Built for the keyboard."
          lead="Every action is in the command palette, with its shortcut beside it."
        >
          <Shortcuts />
        </Section>
        <Section id="faq" n="06" kicker="Questions" title="Good to know.">
          <Faq />
        </Section>
        <Closing />
      </main>
      <Footer />
    </>
  );
}
