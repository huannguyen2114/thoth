"use client";

import { landing } from "@content/landing";
import type { ShotId } from "@content/site";
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
import { Shot } from "@/components/shot";
import { spring } from "@/motion/tokens";

const BEATS = landing.story.length;

/**
 * "How it works": the real app, one screen per beat. A pinned window scrubs through actual
 * screenshots of Thoth (taken from the current app by site-shots.ts) as you scroll, so what
 * the visitor sees is exactly what they get.
 */
export function ScrollStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 200, damping: 30, mass: 0.4 });
  const [beat, setBeat] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) =>
    setBeat(Math.min(BEATS - 1, Math.max(0, Math.floor(v * BEATS)))),
  );

  return (
    <div ref={ref} className="relative" style={{ height: `${BEATS * 85}vh` }}>
      <div className="sticky top-0 flex h-dvh items-center">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-4 md:grid-cols-12 md:px-6">
          <ol className="flex flex-col gap-5 md:col-span-4">
            {landing.story.map((s, i) => (
              <motion.li
                key={s.title}
                animate={{ opacity: i === beat ? 1 : 0.35, x: i === beat ? 0 : -6 }}
                transition={spring.smooth}
                className={cx("flex gap-4", i !== beat && "hidden md:flex")}
              >
                <span
                  className={cx(
                    "mt-1 flex size-7 shrink-0 items-center justify-center rounded-pill type-label transition-colors duration-200",
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

          <div className="md:col-span-8">
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-200 shadow-hearth-lg">
              <div
                className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-2"
                aria-hidden="true"
              >
                <span className="size-2.5 rounded-pill bg-danger/50" />
                <span className="size-2.5 rounded-pill bg-warning/50" />
                <span className="size-2.5 rounded-pill bg-success/50" />
                <span className="ml-3 type-caption text-ink-subtle">Thoth</span>
              </div>
              <div className="relative aspect-video">
                {landing.story.map((s, i) => (
                  <Screen key={s.shot} p={p} i={i} shot={s.shot} label={s.title} />
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-center gap-2" aria-hidden="true">
              {landing.story.map((s, i) => (
                <motion.span
                  key={s.shot}
                  animate={{ width: i === beat ? 24 : 8, opacity: i === beat ? 1 : 0.4 }}
                  transition={spring.snappy}
                  className="h-2 rounded-pill bg-accent"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One screen of the story: fades and settles in for its beat, then out. */
function Screen({
  p,
  i,
  shot,
  label,
}: {
  p: MotionValue<number>;
  i: number;
  shot: ShotId;
  label: string;
}) {
  const a = i / BEATS;
  const b = (i + 1) / BEATS;
  const first = i === 0;
  const lastBeat = i === BEATS - 1;
  const opacity = useTransform(
    p,
    [a - 0.03, a + 0.03, b - 0.03, b + 0.03],
    [first ? 1 : 0, 1, 1, lastBeat ? 1 : 0],
  );
  const scale = useTransform(p, [a - 0.03, a + 0.06, b], [1.04, 1, 1.02]);
  const y = useTransform(p, [a - 0.03, a + 0.06], [first ? 0 : 24, 0]);
  return (
    <motion.div style={{ opacity, scale, y }} className="absolute inset-0 overflow-hidden">
      <Shot
        id={shot}
        alt={`Thoth: ${label}`}
        className="rounded-none border-0 object-cover object-top-left shadow-none"
      />
    </motion.div>
  );
}
