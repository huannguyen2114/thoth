"use client";

import { landing } from "@content/landing";
import { cx } from "@thoth/ui";
import {
  type MotionValue,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useRef, useState } from "react";

const BEATS = landing.story.length;

/** A window of the scroll progress for one beat: 0 before it, 1 inside, back to 0 after. */
function useBeat(p: MotionValue<number>, i: number, keep = false) {
  const a = i / BEATS;
  const b = (i + 1) / BEATS;
  return useTransform(
    p,
    keep ? [a - 0.04, a + 0.06] : [a - 0.04, a + 0.06, b - 0.02, b + 0.06],
    keep ? [0, 1] : [0, 1, 1, 0],
  );
}

/**
 * One lecture follows you down the page: as you scroll, a pinned stage turns it into chapters,
 * an answer with a citation, a quiz card and a mind map. It scrubs with the scroll, so it moves
 * at the reader's pace.
 */
export function ScrollStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 200, damping: 30, mass: 0.4 });
  const [beat, setBeat] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) =>
    setBeat(Math.min(BEATS - 1, Math.floor(v * BEATS))),
  );

  // The lecture and its chapters stay on stage until the mind map takes over.
  const lecture = useTransform(p, [-0.1, 0.02, 0.72, 0.8], [0, 1, 1, 0]);
  const chapters = useTransform(p, [0.16, 0.26, 0.72, 0.8], [0, 1, 1, 0]);
  const chat = useBeat(p, 2);
  const quiz = useBeat(p, 3);
  const map = useBeat(p, 4, true);
  const flip = useTransform(p, [0.66, 0.74], [0, 180]);
  const draw = useTransform(p, [0.8, 0.95], [0, 1]);
  const lectureScale = useTransform(p, [0, 0.2, 0.8, 1], [0.9, 1, 1, 0.8]);
  const lectureX = useTransform(p, [0.75, 0.9], ["0%", "-30%"]);

  return (
    <div ref={ref} className="relative" style={{ height: `${BEATS * 90}vh` }}>
      <div className="sticky top-0 flex h-dvh items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 md:grid-cols-2 md:px-6">
          <ol className="flex flex-col gap-6">
            {landing.story.map((s, i) => (
              <motion.li
                key={s.title}
                animate={{ opacity: i === beat ? 1 : 0.35, x: i === beat ? 0 : -8 }}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                className="flex gap-4"
              >
                <span
                  className={cx(
                    "mt-1 flex size-7 shrink-0 items-center justify-center rounded-pill type-label",
                    i === beat ? "bg-accent text-on-accent" : "bg-neutral-tint text-ink-muted",
                  )}
                >
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="type-heading-2 text-ink">{s.title}</h3>
                  <p className="type-body text-ink-muted">{s.body}</p>
                </div>
              </motion.li>
            ))}
          </ol>

          <div aria-hidden="true" className="relative h-96 md:h-[28rem]">
            {/* 1. The lecture */}
            <motion.div
              style={{ opacity: lecture, scale: lectureScale, x: lectureX }}
              className="absolute left-0 top-0 flex w-64 flex-col gap-3 rounded-lg tone-sky p-4 shadow-hearth-md"
            >
              <span className="type-label">Lecture 3 · Thermodynamics</span>
              <div className="flex h-16 items-end gap-1">
                {Array.from({ length: 20 }, (_, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative bars
                    key={i}
                    className="w-full rounded-sm bg-current opacity-40"
                    style={{ height: `${25 + ((i * 41) % 70)}%` }}
                  />
                ))}
              </div>
            </motion.div>

            {/* 2. Chapters peel off */}
            <motion.ul
              style={{ opacity: chapters }}
              className="absolute right-0 top-4 flex w-56 flex-col gap-2"
            >
              {[
                "00:00 Heat flows downhill",
                "03:21 The second law",
                "10:12 Engines",
                "18:00 Entropy",
              ].map((c, i) => (
                <motion.li
                  key={c}
                  style={{ x: useTransform(p, [0.2, 0.3 + i * 0.02], [-120, 0]) }}
                  className="rounded-md tone-peach px-3 py-2 type-label shadow-hearth-sm"
                >
                  {c}
                </motion.li>
              ))}
            </motion.ul>

            {/* 3. A question and an answer */}
            <motion.div
              style={{ opacity: chat, y: useTransform(p, [0.38, 0.46], [40, 0]) }}
              className="absolute inset-x-6 bottom-6 flex flex-col gap-2 rounded-lg bg-surface-200 p-4 shadow-hearth-lg"
            >
              <p className="ml-auto rounded-lg bg-accent-tint px-3 py-1.5 type-body text-ink">
                Why does entropy grow?
              </p>
              <p className="type-body text-ink">
                There are far more disordered states than ordered ones{" "}
                <span className="badge badge--accent">03:21</span>
              </p>
            </motion.div>

            {/* 4. A quiz card flips */}
            <motion.div
              style={{ opacity: quiz }}
              className="perspective absolute inset-x-10 top-10 h-48"
            >
              <motion.div style={{ rotateY: flip }} className="preserve-3d relative size-full">
                <div className="backface-hidden absolute inset-0 flex flex-col justify-center gap-2 rounded-lg tone-sage p-5 shadow-hearth-md">
                  <span className="type-overline">Quiz</span>
                  <span className="type-heading-2">Can an engine be 100% efficient?</span>
                </div>
                <div className="backface-hidden absolute inset-0 flex flex-col justify-center gap-2 rounded-lg tone-sage p-5 shadow-hearth-md [transform:rotateY(180deg)]">
                  <span className="type-overline">Answer</span>
                  <span className="type-heading-2">
                    No: some heat always flows to the cold side.
                  </span>
                </div>
              </motion.div>
            </motion.div>

            {/* 5. A mind map grows */}
            <motion.svg
              style={{ opacity: map }}
              viewBox="0 0 400 300"
              className="absolute inset-0 size-full text-accent"
            >
              {[
                [200, 150, 80, 60],
                [200, 150, 330, 70],
                [200, 150, 90, 240],
                [200, 150, 320, 240],
              ].map(([x1, y1, x2, y2]) => (
                <motion.line
                  key={`${x2}-${y2}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="currentColor"
                  strokeWidth={2}
                  style={{ pathLength: draw }}
                />
              ))}
              {[
                [200, 150, "Thermodynamics", "tone-peach"],
                [80, 60, "Heat flow", "tone-sky"],
                [330, 70, "Second law", "tone-sage"],
                [90, 240, "Engines", "tone-butter"],
                [320, 240, "Entropy", "tone-lilac"],
              ].map(([x, y, label, tone]) => (
                <foreignObject
                  key={label as string}
                  x={(x as number) - 70}
                  y={(y as number) - 18}
                  width={140}
                  height={36}
                >
                  <div
                    className={cx(
                      "flex h-full items-center justify-center rounded-pill type-label shadow-hearth-sm",
                      tone as string,
                    )}
                  >
                    {label}
                  </div>
                </foreignObject>
              ))}
            </motion.svg>
          </div>
        </div>
      </div>
    </div>
  );
}
