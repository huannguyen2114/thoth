"use client";

import { landing } from "@content/landing";
import { cx } from "@thoth/ui";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { spring } from "@/motion/tokens";

/**
 * Small, working copies of Thoth's Learn tools (Notes, Quiz, Flashcards, Mind map, Exam), drawn
 * like the app's panels: the same headers, toolbars, chips and buttons. The "Drop anything"
 * section and the live demo both use them, so the landing page shows the app, not a sketch.
 */

const tools = landing.tools;

/** How a tool shows a citation: the chip text for spot `i`, and what clicking it does. */
export interface Cites {
  /** The source's short title, shown in the chip like the app ("Consensus… · p. 4"). */
  source: string;
  label(i: number): string;
  onCite?: (i: number) => void;
}

export function CiteChip({ cites, spot }: { cites: Cites; spot: number }) {
  const short = cites.source.length > 18 ? `${cites.source.slice(0, 16)}…` : cites.source;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      transition={spring.snappy}
      onClick={() => cites.onCite?.(spot)}
      className="mx-0.5 inline-flex items-center rounded-pill border border-accent px-2 align-baseline type-caption text-accent-text hover:bg-accent-tint"
      aria-label={`Go to ${cites.label(spot)} in the source`}
    >
      {short} · {cites.label(spot)}
    </motion.button>
  );
}

/** A tool panel's heading row, like the app's: a serif title, a quiet status, an action. */
function ToolHead({
  title,
  status,
  action,
}: {
  title: string;
  status?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="type-heading-2 text-ink">{title}</span>
      {status && <span className="type-caption text-ink-muted">{status}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

// ---- Notes -------------------------------------------------------------------------------

export type NoteBlock =
  | { id: string; kind: "p" | "li" | "h"; text: string; spot?: number }
  | { id: string; kind: "quote"; text: string; spot?: number };

export const startingNotes = (): NoteBlock[] => [
  { id: "h", kind: "h", text: tools.notes.title },
  ...tools.notes.blocks.map((b, i) => ({ ...b, id: `n${i}` }) as NoteBlock),
];

const TOOLBAR = ["B", "I", "<>", "H1", "H2", "H3", "•", "1.", "“", "{}"];

/**
 * The notes editor: the app's toolbar, quoted passages with a link back, and lines you can type.
 * Pass `blocks` and `setBlocks` to share the notes with something else (the demo's chapters).
 */
export function NotesTool({
  cites,
  blocks: shared,
  setBlocks: setShared,
}: {
  cites: Cites;
  blocks?: NoteBlock[];
  setBlocks?: (f: (b: NoteBlock[]) => NoteBlock[]) => void;
}) {
  const [own, setOwn] = useState<NoteBlock[]>(startingNotes);
  const blocks = shared ?? own;
  const setBlocks = setShared ?? setOwn;
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(true);
  const next = useRef(1);

  useEffect(() => {
    if (saved) return;
    const t = setTimeout(() => setSaved(true), 700);
    return () => clearTimeout(t);
  }, [saved]);

  return (
    <div className="flex flex-col gap-3 text-ink">
      <ToolHead
        title="Notes"
        status={saved ? "Saved" : "Saving…"}
        action={<span className="btn btn--secondary btn--sm">Draft notes with Claude</span>}
      />
      <div className="flex flex-wrap items-center gap-0.5 text-ink-muted" aria-hidden="true">
        {TOOLBAR.map((t) => (
          <span key={t} className="grid h-7 min-w-7 place-items-center rounded-sm px-1 type-label">
            {t}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {blocks.map((b) => (
            <motion.div
              key={b.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={spring.smooth}
            >
              {b.kind === "h" ? (
                <p className="type-heading-2">{b.text}</p>
              ) : b.kind === "quote" ? (
                <p className="rounded-md bg-accent-tint px-4 py-3 type-body text-accent-text">
                  {b.text}
                  {b.spot !== undefined && <CiteChip cites={cites} spot={b.spot} />}
                </p>
              ) : (
                <p className={cx("type-body", b.kind === "li" && "flex gap-2")}>
                  {b.kind === "li" && <span aria-hidden="true">•</span>}
                  <span>
                    {b.text}
                    {b.spot !== undefined && <CiteChip cites={cites} spot={b.spot} />}
                  </span>
                </p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text) return;
            setBlocks((bs) => [...bs, { id: `t${next.current++}`, kind: "p", text }]);
            setDraft("");
            setSaved(false);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a note and press Enter"
            aria-label="Type a note"
            className="w-full bg-transparent py-1 type-body text-ink outline-none placeholder:text-ink-subtle"
          />
        </form>
      </div>
    </div>
  );
}

// ---- Quiz --------------------------------------------------------------------------------

/** The quiz player: progress, a question card, radio choices, Check answer, then feedback. */
export function QuizTool({ cites }: { cites: Cites }) {
  const qs = tools.quiz;
  const [n, setN] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const done = n >= qs.length;
  const q = qs[Math.min(n, qs.length - 1)];
  if (!q) return null;
  const right = checked && picked === q.correct;

  return (
    <div className="flex flex-col gap-3 text-ink">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="type-overline text-ink-muted">Quiz 1: Consensus</span>
          <span className="type-caption text-ink-muted">
            {done ? "Finished" : `Question ${n + 1} of ${qs.length}`}
          </span>
        </div>
        <span className="type-label text-ink-muted">Back to quizzes</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-pill bg-neutral-tint"
        role="progressbar"
        aria-label="Quiz progress"
        aria-valuemin={0}
        aria-valuemax={qs.length}
        aria-valuenow={n + (checked ? 1 : 0)}
      >
        <motion.div
          className="h-full rounded-pill bg-accent"
          animate={{ width: `${((n + (checked ? 1 : 0)) / qs.length) * 100}%` }}
          transition={spring.smooth}
        />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring.bouncy}
            className="flex flex-col items-start gap-3 rounded-lg tone-sage p-5"
          >
            <span className="type-heading-1">
              {score} of {qs.length} right
            </span>
            <span className="type-body opacity-80">
              Your weak spots go to Progress, and to tomorrow's plan.
            </span>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                setN(0);
                setPicked(null);
                setChecked(false);
                setScore(0);
              }}
            >
              Try again
            </button>
          </motion.div>
        ) : (
          <motion.div
            key={n}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={spring.smooth}
            className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-100 p-4"
          >
            <span className="badge badge--neutral self-start">Multiple choice</span>
            <p className="type-heading-3">{q.q}</p>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label={q.q}>
              {q.choices.map((c, i) => {
                const good = checked && i === q.correct;
                const bad = checked && picked === i && i !== q.correct;
                return (
                  <motion.button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={picked === i}
                    disabled={checked}
                    onClick={() => setPicked(i)}
                    animate={bad ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
                    transition={bad ? { duration: 0.4 } : spring.snappy}
                    className={cx(
                      "flex items-center gap-3 rounded-md border px-3 py-2.5 text-left type-body transition-colors",
                      good
                        ? "border-success bg-success-tint"
                        : bad
                          ? "border-danger bg-danger-tint"
                          : picked === i
                            ? "border-accent"
                            : "border-border-control hover:bg-surface-200",
                    )}
                  >
                    <span
                      className={cx(
                        "grid size-4 shrink-0 place-items-center rounded-pill border",
                        picked === i ? "border-accent" : "border-border-control",
                      )}
                    >
                      {picked === i && <span className="size-2 rounded-pill bg-accent" />}
                    </span>
                    {c}
                  </motion.button>
                );
              })}
            </div>
            <AnimatePresence>
              {checked && (
                <motion.p
                  initial={{ opacity: 0, y: 6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={spring.bouncy}
                  className={cx(
                    "rounded-md px-3 py-2 type-body",
                    right ? "bg-success-tint" : "bg-danger-tint",
                  )}
                >
                  <span className="type-body-strong">{right ? "Correct. " : "Not quite. "}</span>
                  {q.why}
                  <CiteChip cites={cites} spot={q.spot} />
                </motion.p>
              )}
            </AnimatePresence>
            <div className="flex justify-end">
              {checked ? (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => {
                    setN((x) => x + 1);
                    setPicked(null);
                    setChecked(false);
                  }}
                >
                  {n + 1 < qs.length ? "Next question" : "See results"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={picked === null}
                  className="btn btn--primary btn--sm disabled:opacity-50"
                  onClick={() => {
                    setChecked(true);
                    if (picked === q.correct) setScore((s) => s + 1);
                  }}
                >
                  Check answer
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Flashcards --------------------------------------------------------------------------

const RATINGS = [
  { label: "Again", next: "1 min", cls: "bg-danger-tint" },
  { label: "Hard", next: "1 day", cls: "bg-warning-tint" },
  { label: "Good", next: "3 days", cls: "bg-success-tint" },
  { label: "Easy", next: "8 days", cls: "bg-info-tint" },
] as const;

/** The review session: a card that flips in 3D, four tinted ratings, and the next card. */
export function FlashcardsTool({ cites }: { cites: Cites }) {
  const cards = tools.cards;
  const [n, setN] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const done = n >= cards.length;
  const card = cards[n % cards.length];
  if (!card) return null;

  return (
    <div className="flex flex-col gap-3 text-ink">
      <ToolHead
        title="Flashcards"
        status={done ? "All done for today" : `${cards.length - n} due`}
      />
      <div className="perspective relative h-48">
        <AnimatePresence mode="popLayout" initial={false}>
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={spring.bouncy}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg tone-sky p-4 text-center"
            >
              <span className="type-heading-2">Done for today</span>
              <span className="type-caption opacity-80">The next card is back {last}.</span>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => {
                  setN(0);
                  setFlipped(false);
                }}
              >
                Review again
              </button>
            </motion.div>
          ) : (
            <motion.button
              key={n}
              type="button"
              onClick={() => setFlipped((f) => !f)}
              initial={{ y: 30, opacity: 0, scale: 0.94 }}
              animate={{ y: 0, opacity: 1, scale: 1, rotateY: flipped ? 180 : 0 }}
              exit={{ x: 260, rotate: 14, opacity: 0 }}
              transition={spring.smooth}
              className="preserve-3d absolute inset-0 cursor-pointer"
              aria-label={flipped ? `Answer: ${card.back}` : `Question: ${card.front}. Flip.`}
            >
              <span className="backface-hidden absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-100 p-5 text-center shadow-hearth-sm">
                <span className="type-overline text-ink-muted">Question</span>
                <span className="type-heading-3">{card.front}</span>
                <span className="type-caption text-ink-subtle">Click to flip</span>
              </span>
              <span className="backface-hidden flip-back absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-100 p-5 text-center shadow-hearth-sm">
                <span className="type-overline text-ink-muted">Answer</span>
                <span className="type-body">{card.back}</span>
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      {/* The source link sits under the card: a button can't hold another button. */}
      <span
        className={cx(
          "self-center type-caption text-ink-muted transition-opacity",
          flipped && !done ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        From the source <CiteChip cites={cites} spot={card.spot} />
      </span>
      <motion.div
        animate={{ opacity: flipped && !done ? 1 : 0.4 }}
        transition={spring.snappy}
        className="grid grid-cols-4 gap-2"
      >
        {RATINGS.map((r) => (
          <motion.button
            key={r.label}
            type="button"
            disabled={!flipped || done}
            whileTap={{ scale: 0.92 }}
            transition={spring.snappy}
            onClick={() => {
              setLast(`in ${r.next}`);
              setFlipped(false);
              setN((x) => x + 1);
            }}
            className={cx(
              "flex flex-col items-center rounded-md px-2 py-1.5 text-ink disabled:cursor-default",
              r.cls,
            )}
          >
            <span className="type-label">{r.label}</span>
            <span className="type-caption opacity-70">{r.next}</span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

// ---- Mind map ----------------------------------------------------------------------------

const SPOTS = [
  [20, 22],
  [80, 22],
  [80, 78],
  [20, 78],
] as const;
const NODE_TONES = ["tone-sky", "tone-sage", "tone-butter", "tone-lilac"];

/** The whiteboard with a mind map: grow it, then drag any node; every node links back. */
export function MindMapTool({ cites }: { cites: Cites }) {
  const box = useRef<HTMLDivElement>(null);
  const [grown, setGrown] = useState(true);
  const [pos, setPos] = useState<[number, number][]>(SPOTS.map(([x, y]) => [x, y]));

  function drag(i: number, e: React.PointerEvent) {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = Math.min(88, Math.max(12, ((ev.clientX - r.left) / r.width) * 100));
      const y = Math.min(88, Math.max(12, ((ev.clientY - r.top) / r.height) * 100));
      setPos((p) => p.map((q, k) => (k === i ? [x, y] : q)));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  return (
    <div className="flex flex-col gap-3 text-ink">
      <ToolHead
        title="Whiteboard"
        action={
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => {
              setGrown(false);
              setPos(SPOTS.map(([x, y]) => [x, y]));
              setTimeout(() => setGrown(true), 250);
            }}
          >
            Make a mind map
          </button>
        }
      />
      <div
        ref={box}
        className="dot-grid-board relative h-64 touch-none overflow-hidden rounded-lg border border-border-subtle bg-surface-100"
      >
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {grown &&
            pos.map(([x, y], i) => (
              <motion.line
                key={tools.map.children[i]?.label}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1, x1: "50%", y1: "50%", x2: `${x}%`, y2: `${y}%` }}
                transition={{ ...spring.smooth, delay: i * 0.06 }}
                stroke="currentColor"
                strokeOpacity={0.35}
                strokeWidth={2}
              />
            ))}
        </svg>
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-pill tone-peach px-4 py-2 type-label shadow-hearth-sm">
          {tools.map.root}
        </span>
        <AnimatePresence>
          {grown &&
            tools.map.children.map((c, i) => (
              <motion.div
                key={c.label}
                onPointerDown={(e) => drag(i, e)}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ ...spring.bouncy, delay: 0.1 + i * 0.07 }}
                style={{ left: `${pos[i]?.[0]}%`, top: `${pos[i]?.[1]}%` }}
                className={cx(
                  "absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 shadow-hearth-sm select-none active:cursor-grabbing",
                  NODE_TONES[i],
                )}
              >
                <span className="type-label whitespace-nowrap">{c.label}</span>
                <span className="type-caption opacity-70">{cites.label(c.spot)}</span>
              </motion.div>
            ))}
        </AnimatePresence>
      </div>
      <span className="type-caption text-ink-muted">
        Drag the nodes. Each one keeps a link back to the source.
      </span>
    </div>
  );
}

// ---- Exam --------------------------------------------------------------------------------

/** An exam's result: the score ring, and each topic's score, weakest last. */
export function ExamTool() {
  const e = tools.exam;
  const pct = Math.round(e.score * 100);
  const r = 22;
  return (
    <div className="flex flex-col gap-3 text-ink">
      <div className="flex items-center gap-4 rounded-lg tone-sage p-4">
        <svg width="76" height="76" viewBox="0 0 52 52" aria-hidden="true" className="-rotate-90">
          <circle
            cx="26"
            cy="26"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.18}
            strokeWidth="6"
          />
          <motion.circle
            cx="26"
            cy="26"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: e.score }}
            viewport={{ once: true }}
            transition={{ ...spring.gentle, delay: 0.1 }}
          />
        </svg>
        <div className="flex flex-col">
          <span className="type-overline opacity-75">
            {e.title} · {e.questions} questions · {e.minutes} min
          </span>
          <span className="type-display-lg">{pct}%</span>
        </div>
      </div>
      <span className="type-heading-3">By topic</span>
      <div className="flex flex-col gap-2">
        {e.topics.map((t, i) => (
          <div key={t.name} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate type-label">{t.name}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-pill bg-neutral-tint">
              <motion.span
                className={cx(
                  "block h-full rounded-pill",
                  t.score < 0.7 ? "bg-warning" : "bg-success",
                )}
                initial={{ width: 0 }}
                whileInView={{ width: `${t.score * 100}%` }}
                viewport={{ once: true }}
                transition={{ ...spring.smooth, delay: 0.15 + i * 0.08 }}
              />
            </span>
            <span className="w-10 text-right type-caption tabular-nums">
              {Math.round(t.score * 100)}%
            </span>
          </div>
        ))}
      </div>
      <span className="self-start rounded-pill tone-butter px-3 py-1 type-label">
        Weak spot: {e.topics[e.topics.length - 1]?.name}. It's in tomorrow's plan.
      </span>
    </div>
  );
}
