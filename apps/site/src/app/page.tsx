import { landing } from "@content/landing";
import Link from "next/link";
import { Download } from "@/components/download";
import { Bento } from "@/components/landing/bento";
import { DropAnything } from "@/components/landing/drop-anything";
import { Hero } from "@/components/landing/hero";
import { ScrollStory } from "@/components/landing/scroll-story";
import { Footer } from "@/components/sections";
import { SiteHeader } from "@/components/site-header";

/** The landing page (Phase 12, doc 23): short, playful and interactive. Details live on /features. */
export default function Home() {
  const providers = ["Claude", "OpenAI", "OpenRouter", "Ollama", "LM Studio", "Your own model"];
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />

        <div
          className="overflow-hidden border-y border-border-subtle bg-surface-200 py-5"
          aria-label="Works with"
        >
          <div className="marquee gap-12 pr-12">
            {[...providers, ...providers, ...providers, ...providers].map((p, i) => (
              <span key={`${p}-${i}`} className="type-heading-3 whitespace-nowrap text-ink-muted">
                {p} <span className="text-accent">✦</span>
              </span>
            ))}
          </div>
        </div>

        <section className="px-4 py-24 md:px-6 md:py-32">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 text-center">
            <div className="flex flex-col gap-3">
              <p className="type-overline text-accent-text">Drop anything</p>
              <h2 className="type-hero-sm text-balance text-ink">
                One source in. Everything you need out.
              </h2>
            </div>
            <DropAnything />
          </div>
        </section>

        <section className="bg-surface-200">
          <div className="mx-auto max-w-6xl px-4 pt-24 text-center md:px-6">
            <p className="type-overline text-accent-text">How it works</p>
            <h2 className="type-hero-sm text-balance text-ink">One lecture, start to finish.</h2>
          </div>
          <ScrollStory />
        </section>

        <section className="px-4 py-24 md:px-6 md:py-32">
          <div className="mx-auto flex max-w-6xl flex-col gap-12">
            <div className="flex flex-col gap-3 text-center">
              <p className="type-overline text-accent-text">Try it</p>
              <h2 className="type-hero-sm text-balance text-ink">Go on, play with it.</h2>
            </div>
            <Bento />
          </div>
        </section>

        <section className="px-4 pb-24 md:px-6">
          <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 overflow-hidden rounded-xl tone-peach px-6 py-20 text-center">
            <div aria-hidden="true" className="glow glow--accent -bottom-24 left-1/3 size-96" />
            <h2 className="relative type-hero-sm text-balance">Open source, free, and yours.</h2>
            <p className="relative type-body-lg max-w-xl opacity-80">{landing.sub}</p>
            <div className="relative">
              <Download />
            </div>
            <Link
              href="/features/"
              className="relative type-label underline-offset-4 hover:underline"
            >
              See every feature in detail →
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
