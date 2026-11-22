"use client";

import { landing } from "@content/landing";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Download } from "@/components/download";
import { spring } from "@/motion/tokens";
import { HeroDemo } from "./hero-demo";

const WORD_COUNT = landing.rotatingWords.length;
/** The longest rotating word: it sizes the slot, so swapping words never reflows the line. */
const LONGEST = landing.rotatingWords.reduce((a, w) => (w.length > a.length ? w : a), "");

type Glyph = "play" | "book" | "page";
/** Each rotating word's tile: a tone, an icon, and which way it leans. */
const LOOK: Record<string, { tone: string; glyph: Glyph }> = {
  lecture: { tone: "tone-peach", glyph: "play" },
  textbook: { tone: "tone-butter", glyph: "book" },
  paper: { tone: "tone-sky", glyph: "page" },
  PDF: { tone: "tone-sage", glyph: "page" },
  video: { tone: "tone-lilac", glyph: "play" },
};

/** A small icon in the word's tile, sized to the headline (em units). */
function WordGlyph({ glyph }: { glyph: Glyph }) {
  return (
    <svg viewBox="0 0 16 16" className="word-tile__glyph" aria-hidden="true">
      {glyph === "play" ? (
        <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
      ) : glyph === "book" ? (
        <path
          d="M2.5 3.5c2-.8 3.8-.6 5.5.6 1.7-1.2 3.5-1.4 5.5-.6v9c-2-.8-3.8-.6-5.5.6-1.7-1.2-3.5-1.4-5.5-.6zM8 4.1v9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M4 2h5.5L12.5 5v9H4zM9.5 2v3h3M6 8h4.5M6 10.5h4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** The word on its tile. The invisible copy sizes the slot; the visible one animates. */
function WordTile({ word, tone, glyph }: { word: string; tone: string; glyph: Glyph }) {
  return (
    <span className={`word-tile ${tone}`}>
      <WordGlyph glyph={glyph} />
      {word}
    </span>
  );
}

/** The landing hero: a headline with a rotating word, stickers, and the live demo. */
export function Hero() {
  const words = landing.rotatingWords;
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % WORD_COUNT), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative overflow-clip px-4 pt-14 pb-24 md:px-6 md:pt-20">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="glow glow--accent -top-24 left-1/4 size-96" />
        <div className="glow glow--peach top-10 right-10 size-80" />
        <div className="glow glow--sky top-96 -left-20 size-96" />
        <div className="dot-grid absolute inset-0" />
      </div>

      <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-7 text-center">
        <motion.div
          initial="hidden"
          animate="shown"
          variants={{ shown: { transition: { staggerChildren: 0.08 } } }}
          className="flex flex-wrap justify-center gap-2"
        >
          {landing.stickers.map((s, n) => (
            <motion.span
              key={s}
              variants={{
                hidden: { opacity: 0, y: 12, scale: 0.8 },
                shown: { opacity: 1, y: 0, scale: 1 },
              }}
              whileHover={{ rotate: n % 2 ? 3 : -3, scale: 1.06 }}
              transition={spring.bouncy}
              className={`rounded-pill px-3 py-1 type-label shadow-hearth-sm ${["tone-peach", "tone-sage", "tone-sky", "tone-lilac"][n % 4]}`}
              style={{ rotate: (n % 2 ? 1 : -1) * 2 }}
            >
              {s}
            </motion.span>
          ))}
        </motion.div>

        <h1
          className="type-hero-sm text-balance text-ink md:type-hero"
          aria-label={`${landing.headline.before} ${words.join(", ")} ${landing.headline.after}`}
        >
          <span aria-hidden="true">
            {landing.headline.before}{" "}
            <span className="relative inline-flex justify-center whitespace-nowrap">
              <span className="invisible">
                <WordTile word={LONGEST} tone="" glyph="book" />
              </span>
              <AnimatePresence initial={false}>
                <motion.span
                  key={words[i]}
                  initial={{ y: "70%", opacity: 0, rotate: 0, scale: 0.8 }}
                  animate={{ y: "0%", opacity: 1, rotate: i % 2 ? 3 : -3, scale: 1 }}
                  exit={{ y: "-70%", opacity: 0, rotate: 0, scale: 0.8 }}
                  transition={spring.bouncy}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <WordTile
                    word={words[i] ?? ""}
                    tone={LOOK[words[i] ?? ""]?.tone ?? "tone-peach"}
                    glyph={LOOK[words[i] ?? ""]?.glyph ?? "page"}
                  />
                </motion.span>
              </AnimatePresence>
            </span>{" "}
            {landing.headline.after}
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.2 }}
          className="type-body-lg max-w-2xl text-pretty text-ink-muted"
        >
          {landing.sub}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.3 }}
        >
          <Download />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 60, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...spring.gentle, delay: 0.35 }}
        className="relative mx-auto mt-14 max-w-6xl"
      >
        <HeroDemo />
      </motion.div>
    </section>
  );
}
