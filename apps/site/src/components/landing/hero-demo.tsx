"use client";

import { type AnswerPart, type DemoSample, landing } from "@content/landing";
import { cx } from "@thoth/ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { spring } from "@/motion/tokens";

type Token = { word: string } | { cite: string; at: number };
interface Turn {
  id: number;
  q: string;
  tokens: Token[];
}

/** Splits an answer into words and citation chips, the units it streams in. */
function tokenize(parts: AnswerPart[]): Token[] {
  return parts.flatMap((p): Token[] =>
    typeof p === "string"
      ? p
          .split(/(?<=\s)/)
          .filter(Boolean)
          .map((word) => ({ word }))
      : [{ cite: p.cite, at: p.at }],
  );
}

const clock = (sec: number) => {
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
};

/**
 * A working miniature of Thoth's workspace (a recreation, no server): pick a sample, ask a
 * suggested question, watch the answer stream in, and click a citation to jump the source.
 */
export function HeroDemo() {
  const samples = landing.samples;
  const [sampleId, setSampleId] = useState<DemoSample["id"]>("lecture");
  const sample = samples.find((s) => s.id === sampleId) ?? (samples[0] as DemoSample);
  const [pos, setPos] = useState(sample.kind === "video" ? 0 : 1);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [shown, setShown] = useState(0);
  const [touched, setTouched] = useState(false);
  const [flash, setFlash] = useState(0);
  const nextId = useRef(1);
  const reduce = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);

  const last = turns[turns.length - 1];
  const streaming = last ? shown < last.tokens.length : false;

  // Stream the newest answer token by token.
  useEffect(() => {
    if (!last || shown >= last.tokens.length) return;
    const t = setTimeout(() => setShown((n) => n + (reduce ? last.tokens.length : 1)), 45);
    return () => clearTimeout(t);
  }, [last, shown, reduce]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [shown, turns.length]);

  // The video plays slowly on its own, so the demo feels alive.
  useEffect(() => {
    if (sample.kind !== "video") return;
    const t = setInterval(() => setPos((p) => (p + 1) % sample.length), 1000);
    return () => clearInterval(t);
  }, [sample]);

  function pick(id: DemoSample["id"]) {
    const s = samples.find((x) => x.id === id);
    if (!s || s.id === sampleId) return;
    setSampleId(id);
    setPos(s.kind === "video" ? 0 : 1);
    setTurns([]);
    setShown(0);
  }

  function ask(q: string, answer: AnswerPart[]) {
    if (streaming) return;
    setTouched(true);
    setTurns((t) => [...t.slice(-1), { id: nextId.current++, q, tokens: tokenize(answer) }]);
    setShown(0);
  }

  function jump(at: number) {
    setPos(at);
    setFlash((f) => f + 1);
  }

  const active = useMemo(
    () => sample.chapters.reduce((acc, c, i) => (c.at <= pos ? i : acc), 0),
    [sample, pos],
  );
  const asked = new Set(turns.map((t) => t.q));

  return (
    <div className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface-200 text-left shadow-hearth-lg">
      {/* Window bar with the sample tabs */}
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-3 rounded-pill bg-danger/60" />
          <span className="size-3 rounded-pill bg-warning/60" />
          <span className="size-3 rounded-pill bg-success/60" />
        </span>
        <div role="tablist" aria-label="Sample source" className="ml-2 flex gap-1">
          {samples.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === sampleId}
              onClick={() => pick(s.id)}
              className="relative rounded-pill px-3 py-1 type-label text-ink-muted aria-selected:text-ink"
            >
              {s.id === sampleId && (
                <motion.span
                  layoutId="sample-pill"
                  transition={spring.snappy}
                  className="absolute inset-0 rounded-pill bg-surface-100 shadow-hearth-sm"
                />
              )}
              <span className="relative">{s.tab}</span>
            </button>
          ))}
        </div>
        <span className="ml-auto hidden type-caption text-ink-subtle sm:inline">
          A live recreation · try it
        </span>
      </div>

      <div className="grid md:grid-cols-5">
        {/* Source and chapters */}
        <div className="flex flex-col gap-4 border-border-subtle p-4 md:col-span-3 md:border-r">
          <p className="type-heading-3 text-ink">{sample.title}</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={sample.id}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={spring.smooth}
            >
              {sample.kind === "video" ? (
                <VideoViewer pos={pos} length={sample.length} flash={flash} />
              ) : (
                <PdfViewer page={pos} pages={sample.length} flash={flash} />
              )}
            </motion.div>
          </AnimatePresence>
          <ol className="flex flex-col">
            {sample.chapters.map((c, i) => (
              <li key={c.at}>
                <button
                  type="button"
                  onClick={() => jump(c.at)}
                  className="relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-left"
                >
                  {i === active && (
                    <motion.span
                      layoutId="chapter-active"
                      transition={spring.smooth}
                      className="absolute inset-0 rounded-md tone-peach"
                    />
                  )}
                  <span className="relative type-caption text-ink-muted tabular-nums">
                    {sample.kind === "video" ? clock(c.at) : `p.${c.at}`}
                  </span>
                  <span className="relative type-label text-ink">{c.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        {/* Chat */}
        <div className="flex min-h-96 flex-col gap-3 p-4 md:col-span-2">
          <p className="type-label text-ink-muted">Chat</p>
          <div ref={scroller} className="flex max-h-72 flex-1 flex-col gap-3 overflow-y-auto">
            {turns.length === 0 && (
              <p className="type-body text-ink-muted">
                Ask about this {sample.kind === "video" ? "lecture" : "chapter"}. Every answer
                points to where it came from.
              </p>
            )}
            <AnimatePresence initial={false}>
              {turns.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={spring.smooth}
                  className="flex flex-col gap-2"
                >
                  <p className="ml-auto max-w-xs rounded-lg rounded-br-sm bg-accent-tint px-3 py-2 type-body text-ink">
                    {t.q}
                  </p>
                  <p className="type-body text-ink">
                    {t.tokens.slice(0, t === last ? shown : t.tokens.length).map((tok, i) =>
                      "word" in tok ? (
                        <span key={i}>{tok.word}</span>
                      ) : (
                        <motion.button
                          key={i}
                          type="button"
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          whileTap={{ scale: 0.9 }}
                          transition={spring.bouncy}
                          onClick={() => jump(tok.at)}
                          className="badge badge--accent mx-0.5 cursor-pointer align-baseline"
                          aria-label={`Go to ${tok.cite} in the source`}
                        >
                          {tok.cite}
                        </motion.button>
                      ),
                    )}
                    {t === last && streaming && (
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-accent align-middle" />
                    )}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="flex flex-wrap gap-2">
            {sample.questions
              .filter((x) => !asked.has(x.q))
              .map((x, i) => (
                <motion.button
                  key={x.q}
                  type="button"
                  layout
                  whileTap={{ scale: 0.94 }}
                  transition={spring.snappy}
                  disabled={streaming}
                  onClick={() => ask(x.q, x.answer)}
                  className={cx(
                    "relative rounded-pill border border-border-control bg-surface-100 px-3 py-1.5 type-label text-ink disabled:opacity-50",
                  )}
                >
                  {!touched && i === 0 && (
                    <span className="absolute -inset-1 animate-ping rounded-pill border-2 border-accent/50" />
                  )}
                  {x.q}
                </motion.button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoViewer({ pos, length, flash }: { pos: number; length: number; flash: number }) {
  const pct = (pos / length) * 100;
  return (
    <div className="flex flex-col gap-3 rounded-lg tone-sky p-4">
      <div className="flex h-28 items-end gap-1" aria-hidden="true">
        {Array.from({ length: 36 }, (_, i) => (
          <motion.span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative bars
            key={i}
            className="w-full rounded-sm bg-current opacity-40"
            animate={{ height: `${20 + ((i * 37 + pos * 13) % 70)}%` }}
            transition={spring.smooth}
          />
        ))}
      </div>
      <div className="relative h-2 rounded-pill bg-current/15">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-pill bg-accent"
          animate={{ width: `${pct}%` }}
          transition={spring.smooth}
        />
        <motion.div
          key={flash}
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent shadow-hearth-md"
          initial={{ scale: flash ? 1.8 : 1 }}
          animate={{ left: `${pct}%`, scale: 1 }}
          transition={spring.bouncy}
        />
      </div>
      <p className="type-caption tabular-nums">
        {clock(pos)} / {clock(length)}
      </p>
    </div>
  );
}

function PdfViewer({ page, pages, flash }: { page: number; pages: number; flash: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg tone-butter p-4">
      <div className="relative h-44 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`${page}-${flash}`}
            initial={{ y: 60, opacity: 0, rotate: -2 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: -60, opacity: 0, rotate: 2 }}
            transition={spring.smooth}
            className="absolute inset-x-6 inset-y-0 flex flex-col gap-2 rounded-md bg-surface-100 p-4 shadow-hearth-md"
          >
            <span className="type-caption text-ink-muted">Page {page}</span>
            <span className="h-3 w-3/4 rounded-sm bg-neutral-tint" />
            <span className="h-2 w-full rounded-sm bg-neutral-tint" />
            <span className="h-2 w-5/6 rounded-sm bg-accent-tint" />
            <span className="h-2 w-full rounded-sm bg-neutral-tint" />
            <span className="h-2 w-2/3 rounded-sm bg-neutral-tint" />
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="type-caption tabular-nums">
        Page {page} of {pages}
      </p>
    </div>
  );
}
