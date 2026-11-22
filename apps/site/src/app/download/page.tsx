import { downloadUrl, REPO_URL, site } from "@content/site";
import type { Metadata } from "next";
import { Download } from "@/components/download";
import { Faq, Footer, Section } from "@/components/sections";
import { SiteHeader } from "@/components/site-header";
import { buildData } from "@/lib/build-data";

export const metadata: Metadata = { title: "Download · Thoth" };

/** /download: the installer for your system, every other one, and building from source. */
export default function DownloadPage() {
  const { version } = buildData();
  return (
    <>
      <SiteHeader />
      <main>
        <Section
          id="download"
          n=""
          kicker={`Version ${version}`}
          title="Get Thoth for your computer."
        >
          <div className="flex flex-col items-start gap-10">
            <Download />
            <ul className="grid w-full gap-3 md:grid-cols-2">
              {site.platforms.map((p) => (
                <li key={p.id}>
                  <a
                    href={downloadUrl(p)}
                    className="card flex items-center justify-between no-underline"
                  >
                    <span className="type-label text-ink">{p.label}</span>
                    <span className="type-code text-ink-muted">{p.asset}</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="type-body text-ink-muted">
              Prefer to build it yourself? The source and instructions are on{" "}
              <a className="text-accent-text" href={REPO_URL}>
                GitHub
              </a>
              .
            </p>
          </div>
        </Section>
        <Section id="faq" n="" kicker="Questions" title="Good to know.">
          <Faq />
        </Section>
      </main>
      <Footer />
    </>
  );
}
