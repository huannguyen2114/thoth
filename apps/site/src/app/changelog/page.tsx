import type { Metadata } from "next";
import { Footer, Section, WhatsNew } from "@/components/sections";
import { SiteHeader } from "@/components/site-header";
import { buildData } from "@/lib/build-data";

export const metadata: Metadata = { title: "Changelog · Thoth" };

/** /changelog: What's new, read from the roadmap at build time (ADR-0044). */
export default function ChangelogPage() {
  const { version, releases } = buildData();
  return (
    <>
      <SiteHeader />
      <main>
        <Section
          id="whats-new"
          n=""
          kicker="Changelog"
          title="Built in the open, a phase at a time."
        >
          <WhatsNew version={version} releases={releases} />
        </Section>
      </main>
      <Footer />
    </>
  );
}
