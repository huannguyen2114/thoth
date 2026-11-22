"use client";

import { landing } from "@content/landing";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Download } from "@/components/download";
import { spring } from "@/motion/tokens";
import { HeroDemo } from "./hero-demo";

const WORD_COUNT = landing.rotatingWords.length;

/** The landing hero: a headline with a rotating word, stickers, and the live demo. */
export function Hero() {
  const words = landing.rotatingWords;
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % WORD_COUNT), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative overflow-hidden px-4 pt-14 pb-24 md:px-6 md:pt-20">
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
            <span className="relative inline-flex justify-center whitespace-nowrap text-accent-text">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={words[i]}
                  initial={{ y: "60%", opacity: 0, filter: "blur(6px)" }}
                  animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                  exit={{ y: "-60%", opacity: 0, filter: "blur(6px)" }}
                  transition={spring.smooth}
                  className="inline-block"
                >
                  {words[i]}
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
