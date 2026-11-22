"use client";

import { landing } from "@content/landing";
import { cx } from "@thoth/ui";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { spring } from "@/motion/tokens";

type Output = (typeof landing.outputs)[number];

/**
 * "Drop anything": drag (or tap) a source onto the target and it bursts into the five things
 * Thoth makes from it. Tap a card to open it with a shared-element morph.
 */
export function DropAnything() {
  const [dropped, setDropped] = useState<string | null>(null);
  const [open, setOpen] = useState<Output | null>(null);
  const [over, setOver] = useState(false);
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isOver = (x: number, y: number) => {
    const r = target.current?.getBoundingClientRect();
    return !!r && x > r.left && x < r.right && y > r.top && y < r.bottom;
  };

  return (
    <div className="flex flex-col items-center gap-10">
      <div className="flex flex-wrap justify-center gap-3">
        {landing.sources.map((s) => (
          <motion.button
            key={s.id}
            type="button"
            drag
            dragSnapToOrigin
            dragElastic={0.6}
            whileDrag={{ scale: 1.1, rotate: -4, zIndex: 20 }}
            whileTap={{ scale: 0.94 }}
            transition={spring.snappy}
            onDrag={(_, info) => setOver(isOver(info.point.x, info.point.y - window.scrollY))}
            onDragEnd={(_, info) => {
              setOver(false);
              if (isOver(info.point.x, info.point.y - window.scrollY)) setDropped(s.label);
            }}
            onClick={() => setDropped(s.label)}
            className={cx(
              "cursor-grab touch-none rounded-pill border border-border-control bg-surface-200 px-5 py-2.5 type-label text-ink shadow-hearth-sm active:cursor-grabbing",
              dropped === s.label && "border-accent",
            )}
          >
            {s.label}
          </motion.button>
        ))}
      </div>

      <motion.div
        ref={target}
        animate={{ scale: over ? 1.06 : 1 }}
        transition={spring.bouncy}
        className={cx(
          "flex size-40 items-center justify-center rounded-pill border-2 border-dashed text-center type-label",
          over ? "border-accent tone-peach" : "border-border-control text-ink-muted",
        )}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={dropped ?? "empty"}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={spring.bouncy}
            className="px-4"
          >
            {dropped ? `Your ${dropped}` : "Drag a source here, or tap one"}
          </motion.span>
        </AnimatePresence>
      </motion.div>

      <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-5">
        <AnimatePresence>
          {dropped &&
            landing.outputs.map((o, i) => (
              <motion.button
                key={`${dropped}-${o.id}`}
                type="button"
                layoutId={`out-${o.id}`}
                initial={{ opacity: 0, y: -120, scale: 0.3, rotate: (i - 2) * 12 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: (i - 2) * 2 }}
                exit={{ opacity: 0, scale: 0.5 }}
                whileHover={{ y: -6, rotate: 0 }}
                whileTap={{ scale: 0.95 }}
                transition={{ ...spring.bouncy, delay: i * 0.06 }}
                onClick={() => setOpen(o)}
                className={cx(
                  "flex min-h-36 flex-col items-start gap-2 rounded-lg p-4 text-left shadow-hearth-md",
                  o.tone,
                )}
              >
                <span className="type-heading-3">{o.title}</span>
                <span className="type-caption opacity-80">{o.blurb}</span>
              </motion.button>
            ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center bg-scrim p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(null)}
          >
            <motion.div
              layoutId={`out-${open.id}`}
              transition={spring.smooth}
              className={cx(
                "flex w-full max-w-lg flex-col gap-4 rounded-xl p-6 shadow-hearth-lg",
                open.tone,
              )}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={open.title}
            >
              <div className="flex items-center justify-between">
                <span className="type-heading-1">{open.title}</span>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="btn btn--ghost btn--sm"
                >
                  Close
                </button>
              </div>
              <div className="flex flex-col gap-2 rounded-lg bg-surface-100 p-4 text-ink">
                {open.preview.map((line, i) => (
                  <motion.p
                    key={line}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...spring.smooth, delay: 0.15 + i * 0.12 }}
                    className={i === 0 ? "type-body-strong" : "type-body"}
                  >
                    {line}
                  </motion.p>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
