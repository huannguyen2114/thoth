"use client";

import hotspots from "@content/hotspots.json";
import { landing } from "@content/landing";
import type { ShotId } from "@content/site";
import { cx } from "@thoth/ui";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Shot } from "@/components/shot";
import { spring } from "@/motion/tokens";

type Story = (typeof landing.story)[number];
type Step = Story["steps"][number];
type Box = { x: number; y: number; w: number; h: number };

const BEATS = landing.story.length;
const SPOTS = hotspots as Record<string, Record<string, Box>>;
const spotOf = (s: Step): Box | null =>
  "at" in s && s.at ? (SPOTS[s.shot]?.[s.at] ?? null) : null;

/**
 * "How it works": scroll moves between five beats; each beat plays a short walkthrough over
 * real screenshots of the app: a cursor moves to the real button (positions recorded by
 * site-shots.ts), clicks, and a tip explains. Click a beat to jump to it.
 */
export function ScrollStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [beat, setBeat] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) =>
    setBeat(Math.min(BEATS - 1, Math.max(0, Math.floor(v * BEATS)))),
  );

  function goTo(i: number) {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + span * ((i + 0.5) / BEATS), behavior: "smooth" });
  }

  const story = landing.story[beat] ?? landing.story[0];

  return (
    <div ref={ref} className="relative" style={{ height: `${BEATS * 100}vh` }}>
      <div className="sticky top-0 flex h-dvh items-center">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-4 md:grid-cols-12 md:px-6">
          <ol className="flex flex-col gap-2 md:col-span-4">
            {landing.story.map((s, i) => (
              <li key={s.title}>
                <motion.button
                  type="button"
                  onClick={() => goTo(i)}
                  animate={{ opacity: i === beat ? 1 : 0.45 }}
                  whileTap={{ scale: 0.98 }}
                  transition={spring.smooth}
                  className={cx(
                    "relative flex w-full gap-4 rounded-lg p-3 text-left",
                    i !== beat && "hidden md:flex",
                  )}
                >
                  {i === beat && (
                    <motion.span
                      layoutId="story-active"
                      transition={spring.smooth}
                      className="absolute inset-0 rounded-lg bg-surface-200 shadow-hearth-sm"
                    />
                  )}
                  <span
                    className={cx(
                      "relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-pill type-label",
                      i === beat ? "bg-accent text-on-accent" : "bg-neutral-tint text-ink-muted",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="relative flex flex-col gap-1">
                    <span className="type-heading-3 text-ink">{s.title}</span>
                    {i === beat && <span className="type-body text-ink-muted">{s.body}</span>}
                  </span>
                </motion.button>
              </li>
            ))}
          </ol>

          <div className="md:col-span-8">
            <Walkthrough key={beat} story={story} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Plays one beat: frames cross-fade, the cursor travels to each hotspot, clicks, and tips. */
function Walkthrough({ story }: { story: Story }) {
  const reduce = useReducedMotion();
  const steps = story.steps as readonly Step[];
  const [i, setI] = useState(0);
  const [click, setClick] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    const at = (ms: number, fn: () => void) => {
      t += ms;
      timers.push(setTimeout(fn, t));
    };
    steps.forEach((s, n) => {
      at(n === 0 ? 500 : 1500, () => setI(n));
      if ("click" in s && s.click) at(900, () => setClick((c) => c + 1));
    });
    at(2600, () => setRun((r) => r + 1));
    return () => timers.forEach(clearTimeout);
  }, [steps, run]);

  useEffect(() => setI(0), [run]);

  const step = steps[i] ?? steps[0];
  if (!step) return null;
  const spot = spotOf(step);
  const frames = [...new Set(steps.map((s) => s.shot))] as ShotId[];
  const cx_ = spot ? (spot.x + spot.w / 2) * 100 : 50;
  const cy_ = spot ? (spot.y + spot.h / 2) * 100 : 50;
  const right = cx_ > 62;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-200 shadow-hearth-lg">
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-2">
          <span className="size-2.5 rounded-pill bg-danger/50" />
          <span className="size-2.5 rounded-pill bg-warning/50" />
          <span className="size-2.5 rounded-pill bg-success/50" />
          <span className="ml-3 type-caption text-ink-subtle">Thoth</span>
          <button
            type="button"
            onClick={() => setRun((r) => r + 1)}
            className="ml-auto rounded-pill px-2 py-0.5 type-caption text-ink-muted hover:bg-neutral-tint"
          >
            Replay
          </button>
        </div>
        <div className="relative aspect-shot overflow-hidden">
          {frames.map((f) => (
            <motion.div
              key={f}
              className="absolute inset-0"
              initial={false}
              animate={{ opacity: f === step.shot ? 1 : 0, scale: f === step.shot ? 1 : 1.015 }}
              transition={spring.smooth}
            >
              <Shot id={f} alt="" className="rounded-none border-0 shadow-none" priority />
            </motion.div>
          ))}

          {/* What the step points at */}
          <AnimatePresence>
            {spot && (
              <motion.span
                key={`${step.shot}-${i}`}
                initial={{ opacity: 0, scale: 1.2 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={spring.snappy}
                className="pointer-events-none absolute rounded-md ring-2 ring-accent ring-offset-2 ring-offset-transparent"
                style={{
                  left: `${spot.x * 100}%`,
                  top: `${spot.y * 100}%`,
                  width: `${spot.w * 100}%`,
                  height: `${spot.h * 100}%`,
                }}
              />
            )}
          </AnimatePresence>

          {/* The cursor */}
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute z-10"
            initial={false}
            animate={{ left: `${cx_}%`, top: `${cy_}%` }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 18 }}
          >
            <motion.span
              key={click}
              initial={{ scale: 0.2, opacity: click ? 0.7 : 0 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute -top-3 -left-3 size-6 rounded-pill bg-accent"
            />
            <motion.svg
              key={`c${click}`}
              width="22"
              height="22"
              viewBox="0 0 22 22"
              initial={{ scale: click ? 0.82 : 1 }}
              animate={{ scale: 1 }}
              transition={spring.bouncy}
              className="drop-shadow-md"
            >
              <path
                d="M3 2l15 9-6.5 1.6L8.6 19z"
                fill="var(--color-surface-100)"
                stroke="var(--color-ink)"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </motion.svg>
            <AnimatePresence mode="wait">
              <motion.span
                key={`${run}-${i}`}
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={spring.snappy}
                className={cx(
                  "absolute top-6 whitespace-nowrap rounded-pill bg-primary px-3 py-1.5 type-label text-on-primary shadow-hearth-md",
                  right ? "right-2" : "left-4",
                )}
              >
                {step.tip}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
      <div className="flex justify-center gap-2" aria-hidden="true">
        {steps.map((s, n) => (
          <motion.span
            // biome-ignore lint/suspicious/noArrayIndexKey: steps never reorder
            key={n}
            animate={{ width: n === i ? 24 : 8, opacity: n === i ? 1 : 0.35 }}
            transition={spring.snappy}
            className="h-2 rounded-pill bg-accent"
          />
        ))}
      </div>
    </div>
  );
}
