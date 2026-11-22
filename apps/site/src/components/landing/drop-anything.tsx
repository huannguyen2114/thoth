"use client";

import { landing } from "@content/landing";
import { cx } from "@thoth/ui";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { spring } from "@/motion/tokens";
import {
  type Cites,
  ExamTool,
  FlashcardsTool,
  MindMapTool,
  NotesTool,
  QuizTool,
} from "./app-tools";

type Source = (typeof landing.sources)[number];
type OutputId = (typeof landing.outputs)[number]["id"];

/**
 * "Drop anything": pick a source and the example is already there. Each output tab opens the
 * real tool, drawn like the app's panel, and its citation chips point back into the source.
 */
export function DropAnything() {
  const [sourceId, setSourceId] = useState<Source["id"]>("pdf");
  const [out, setOut] = useState<OutputId>("notes");
  const [jump, setJump] = useState<{ spot: number; n: number } | null>(null);
  const source = landing.sources.find((s) => s.id === sourceId) ?? landing.sources[0];
  if (!source) return null;

  const cites: Cites = {
    source: source.title,
    label: (i) => source.spots[i] ?? "",
    onCite: (spot) => setJump((j) => ({ spot, n: (j?.n ?? 0) + 1 })),
  };

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div
        role="tablist"
        aria-label="Source"
        className="flex rounded-pill bg-surface-200 p-1 shadow-hearth-sm"
      >
        {landing.sources.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === sourceId}
            onClick={() => {
              setSourceId(s.id);
              setJump(null);
            }}
            className="relative rounded-pill px-5 py-2 type-label text-ink-muted aria-selected:text-ink"
          >
            {s.id === sourceId && (
              <motion.span
                layoutId="drop-source"
                transition={spring.snappy}
                className="absolute inset-0 rounded-pill bg-surface-100 shadow-hearth-sm"
              />
            )}
            <span className="relative">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="grid w-full items-start gap-6 text-left lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-3 lg:sticky lg:top-24">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={source.id}
              initial={{ opacity: 0, y: 16, rotate: -2 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, y: -12, rotate: 2 }}
              transition={spring.smooth}
              className="w-full"
            >
              <SourceCard source={source} jump={jump} />
            </motion.div>
          </AnimatePresence>
          <motion.span
            aria-hidden="true"
            animate={{ y: [0, 4, 0] }}
            transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            className="type-heading-2 text-accent-text lg:hidden"
          >
            ↓
          </motion.span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-100 shadow-hearth-lg">
          <div
            role="tablist"
            aria-label="What Thoth makes"
            className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle px-3"
          >
            {landing.outputs.map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={o.id === out}
                onClick={() => setOut(o.id)}
                className="relative flex shrink-0 items-center gap-2 px-2 py-3 type-label text-ink-muted aria-selected:text-ink"
              >
                <span className={cx("size-2.5 rounded-pill", o.tone)} aria-hidden="true" />
                {o.title}
                {o.id === out && (
                  <motion.span
                    layoutId="drop-output"
                    transition={spring.snappy}
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-pill bg-accent"
                  />
                )}
              </button>
            ))}
          </div>
          <div className="h-136 overflow-y-auto p-4 md:h-128 md:p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${source.id}-${out}`}
                role="tabpanel"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={spring.smooth}
              >
                {out === "notes" && <NotesTool cites={cites} />}
                {out === "quiz" && <QuizTool cites={cites} />}
                {out === "cards" && <FlashcardsTool cites={cites} />}
                {out === "map" && <MindMapTool cites={cites} />}
                {out === "exam" && <ExamTool />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The source, drawn small: a PDF page, a video, or a web page. A citation click lights it up. */
function SourceCard({
  source,
  jump,
}: {
  source: Source;
  jump: { spot: number; n: number } | null;
}) {
  const at = jump ? source.spots[jump.spot] : null;
  const lines = [92, 100, 84, 96, 70, 88, 60];
  const lit = jump ? (jump.spot * 2 + 1) % lines.length : -1;
  return (
    <div className="relative flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-100 p-4 shadow-hearth-md">
      {source.id === "youtube" ? (
        <div className="relative grid aspect-video place-items-center overflow-hidden rounded-lg tone-peach">
          <span className="grid size-12 place-items-center rounded-pill bg-surface-100 text-accent-text shadow-hearth-sm">
            ▶
          </span>
          <span className="absolute right-2 bottom-2 rounded-sm bg-surface-100 px-1.5 type-caption text-ink tabular-nums">
            {at ?? "18:14"}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-200 p-3">
          {source.id === "web" && (
            <div className="mb-1 flex items-center gap-1.5">
              <span className="size-2 rounded-pill bg-danger" />
              <span className="size-2 rounded-pill bg-warning" />
              <span className="size-2 rounded-pill bg-success" />
              <span className="ml-1 h-4 flex-1 rounded-pill bg-surface-100" />
            </div>
          )}
          <span className="h-2.5 w-2/3 rounded-pill bg-ink-muted opacity-60" />
          {lines.map((w, i) => (
            <motion.span
              key={`${w}-${i.toString()}`}
              animate={{ opacity: i === lit ? 1 : 0.55 }}
              transition={spring.smooth}
              className={cx("h-1.5 rounded-pill", i === lit ? "bg-accent" : "bg-neutral-tint")}
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      )}
      <div className="flex flex-col">
        <span className="type-label text-ink">{source.title}</span>
        <span className="type-caption text-ink-muted">{source.meta}</span>
      </div>
      <AnimatePresence>
        {at && jump && (
          <motion.span
            key={jump.n}
            initial={{ opacity: 0, scale: 0.7, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring.bouncy}
            className="absolute -top-3 right-4 rounded-pill bg-accent px-3 py-1 type-label text-on-accent shadow-hearth-md"
          >
            Jumped to {at}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
