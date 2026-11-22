"use client";

import { landing } from "@content/landing";
import { cx } from "@thoth/ui";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { spring } from "@/motion/tokens";

/** Small things to play with: each one is a real Thoth idea, at toy size. */
export function Bento() {
  return (
    <div className="grid gap-4 md:grid-cols-6">
      <Tile
        className="tone-sky md:col-span-3 md:row-span-2"
        title="Flashcards that come back on time"
        hint="Tap to flip, then rate it"
      >
        <Flashcard />
      </Tile>
      <Tile className="tone-sage md:col-span-3" title="Quizzes that explain" hint="Pick an answer">
        <Quiz />
      </Tile>
      <Tile className="tone-peach md:col-span-3" title="Notes that link back" hint="Add a passage">
        <Notes />
      </Tile>
      <Tile
        className="tone-lilac md:col-span-6"
        title="A whiteboard for the big picture"
        hint="Make a map, add stickies, drag anything"
      >
        <Whiteboard />
      </Tile>
      <Tile className="tone-butter md:col-span-4" title="A model for each task" hint="Switch them">
        <Models />
      </Tile>
      <Tile className="tone-sage md:col-span-2" title="Private by default">
        <Privacy />
      </Tile>
    </div>
  );
}

function Tile({
  className,
  title,
  hint,
  children,
}: {
  className: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={spring.gentle}
      className={cx("flex flex-col gap-4 overflow-hidden rounded-xl p-6", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="type-heading-2">{title}</h3>
        {hint && <span className="type-caption opacity-70">{hint}</span>}
      </div>
      <div className="flex flex-1 items-center justify-center">{children}</div>
    </motion.div>
  );
}

function Flashcard() {
  const { front, back, next } = landing.flashcard;
  const [flipped, setFlipped] = useState(false);
  const [rated, setRated] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  function rate(r: string) {
    setRated(r);
    setTimeout(() => {
      setRated(null);
      setFlipped(false);
      setRound((n) => n + 1);
    }, 1600);
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5">
      <div className="perspective relative h-56 w-full">
        <AnimatePresence mode="popLayout">
          {!rated && (
            <motion.button
              key={round}
              type="button"
              onClick={() => setFlipped((f) => !f)}
              initial={{ y: 40, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1, rotateY: flipped ? 180 : 0 }}
              exit={{ x: 300, rotate: 18, opacity: 0 }}
              whileTap={{ scale: 0.97 }}
              transition={spring.smooth}
              className="preserve-3d absolute inset-0 cursor-pointer"
              aria-label={flipped ? `Answer: ${back}` : `Question: ${front}. Tap to flip.`}
            >
              <span className="backface-hidden absolute inset-0 flex items-center justify-center rounded-lg bg-surface-100 p-6 text-center type-heading-2 text-ink shadow-hearth-md">
                {front}
              </span>
              <span className="backface-hidden absolute inset-0 flex items-center justify-center rounded-lg bg-surface-100 p-6 text-center type-heading-2 text-ink shadow-hearth-md [transform:rotateY(180deg)]">
                {back}
              </span>
            </motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {rated && (
            <motion.p
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={spring.bouncy}
              className="absolute inset-0 flex items-center justify-center text-center type-heading-2"
            >
              Next review {next[rated as keyof typeof next]}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <motion.div
        animate={{ opacity: flipped && !rated ? 1 : 0, y: flipped && !rated ? 0 : 8 }}
        transition={spring.snappy}
        className="flex gap-2"
      >
        {Object.keys(next).map((r) => (
          <motion.button
            key={r}
            type="button"
            disabled={!flipped || !!rated}
            whileTap={{ scale: 0.92 }}
            transition={spring.snappy}
            onClick={() => rate(r)}
            className="btn btn--secondary btn--sm"
          >
            {r}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

function Quiz() {
  const { q, choices, correct } = landing.quiz;
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="flex w-full flex-col gap-3">
      <p className="type-body-strong">{q}</p>
      {choices.map((c, i) => {
        const right = picked !== null && i === correct;
        const wrong = picked === i && i !== correct;
        return (
          <motion.button
            key={c}
            type="button"
            onClick={() => setPicked(i)}
            animate={wrong ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0, scale: right ? 1.02 : 1 }}
            whileTap={{ scale: 0.97 }}
            transition={wrong ? { duration: 0.4 } : spring.bouncy}
            className={cx(
              "rounded-md border px-4 py-2.5 text-left type-label transition-colors",
              right
                ? "border-success bg-surface-100 text-ink"
                : wrong
                  ? "border-danger bg-surface-100 text-ink"
                  : "border-border-control bg-surface-100/70 text-ink",
            )}
          >
            {c} {right && "✓"}
          </motion.button>
        );
      })}
      <AnimatePresence>
        {picked !== null && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.smooth}
            className="type-caption"
          >
            {picked === correct ? landing.quiz.right : landing.quiz.wrong}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function Models() {
  const [choice, setChoice] = useState(landing.models.map(() => 0));
  return (
    <div className="flex w-full flex-col gap-3">
      {landing.models.map((m, i) => (
        <div key={m.task} className="flex items-center justify-between gap-4">
          <span className="type-label">{m.task}</span>
          <div className="flex rounded-pill bg-surface-100/70 p-1">
            {m.options.map((o, j) => (
              <button
                key={o}
                type="button"
                onClick={() => setChoice((c) => c.map((v, k) => (k === i ? j : v)))}
                className="relative rounded-pill px-4 py-1.5 type-label text-ink"
                aria-pressed={choice[i] === j}
              >
                {choice[i] === j && (
                  <motion.span
                    layoutId={`model-${m.task}`}
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-pill bg-surface-100 shadow-hearth-sm"
                  />
                )}
                <span className="relative">{o}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Counter({ to }: { to: number }) {
  const v = useMotionValue(to + 9);
  const shown = useTransform(v, (n) => Math.round(n));
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const unsub = shown.on("change", (n) => {
      if (ref.current) ref.current.textContent = String(n);
    });
    const c = animate(v, to, { duration: 1.4, ease: "easeOut" });
    return () => {
      c.stop();
      unsub();
    };
  }, [v, shown, to]);
  return <span ref={ref}>{to + 9}</span>;
}

function Privacy() {
  return (
    <div className="grid w-full grid-cols-2 gap-3">
      {["accounts", "telemetry"].map((l) => (
        <div key={l} className="flex flex-col rounded-lg bg-surface-100/70 p-3">
          <span className="type-display-lg">
            <Counter to={0} />
          </span>
          <span className="type-label opacity-80">{l}</span>
        </div>
      ))}
    </div>
  );
}

/** Notes: send a passage from the example chapter to your notes, or type your own line. */
function Notes() {
  const book = landing.samples.find((x) => x.kind === "pdf");
  const passages = [
    { page: 2, text: book?.pages?.[1]?.text[0] ?? "" },
    { page: 4, text: book?.pages?.[3]?.text[1] ?? "" },
  ];
  const [notes, setNotes] = useState<{ id: number; text: string; page?: number }[]>([]);
  const [draft, setDraft] = useState("");
  const next = useRef(1);
  const added = new Set(notes.map((n) => n.text));
  const add = (text: string, page?: number) =>
    setNotes((n) => [...n, { id: next.current++, text, ...(page ? { page } : {}) }]);
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        {passages.map((p) => (
          <div
            key={p.page}
            className="flex flex-col gap-2 rounded-lg bg-surface-100/80 p-3 text-ink"
          >
            <span className="type-caption text-ink-muted">Example chapter · p. {p.page}</span>
            <span className="type-caption">{p.text}</span>
            <motion.button
              type="button"
              disabled={added.has(p.text)}
              whileTap={{ scale: 0.94 }}
              transition={spring.snappy}
              onClick={() => add(p.text, p.page)}
              className="btn btn--secondary btn--sm self-start disabled:opacity-50"
            >
              {added.has(p.text) ? "Added" : "Add to notes"}
            </motion.button>
          </div>
        ))}
      </div>
      <div className="flex min-h-48 flex-col gap-2 rounded-lg bg-surface-100 p-3 text-ink shadow-hearth-sm">
        <span className="type-label">My notes</span>
        <AnimatePresence initial={false}>
          {notes.map((n) => (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, x: -40, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={spring.bouncy}
              className={cx(
                "type-caption",
                n.page !== undefined && "border-l-2 border-accent pl-2 italic text-ink-muted",
              )}
            >
              {n.text}{" "}
              {n.page !== undefined && (
                <span className="badge badge--neutral not-italic">p. {n.page}</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {notes.length === 0 && (
          <span className="type-caption text-ink-subtle">Nothing yet. Add a passage, or type.</span>
        )}
        <form
          className="mt-auto"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) add(draft.trim());
            setDraft("");
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a note and press Enter"
            aria-label="Type a note"
            className="w-full rounded-md border border-border-control bg-surface-100 px-2 py-1.5 type-caption text-ink"
          />
        </form>
      </div>
    </div>
  );
}

type El = {
  id: string;
  kind: "node" | "sticky";
  label: string;
  x: number;
  y: number;
  tone: string;
};

const STICKY_TONES = ["tone-butter", "tone-peach", "tone-sky", "tone-sage"];

/** Whiteboard: grow a mind map from the source, add stickies, drag anything; lines follow. */
function Whiteboard() {
  const box = useRef<HTMLDivElement>(null);
  const [els, setEls] = useState<El[]>([
    { id: "root", kind: "node", label: landing.mindmap[0] ?? "", x: 50, y: 50, tone: "tone-peach" },
  ]);
  const stickies = useRef(0);
  const root = els.find((e) => e.id === "root");
  const hasMap = els.some((e) => e.kind === "node" && e.id !== "root");

  function makeMap() {
    if (hasMap) return;
    const spots = [
      [22, 22],
      [78, 22],
      [78, 78],
    ];
    const tones = ["tone-sky", "tone-sage", "tone-butter"];
    setEls((es) => [
      ...es,
      ...landing.mindmap.slice(1).map((label, i) => ({
        id: `n${i}`,
        kind: "node" as const,
        label,
        x: spots[i]?.[0] ?? 50,
        y: spots[i]?.[1] ?? 50,
        tone: tones[i] ?? "tone-sky",
      })),
    ]);
  }

  function addSticky() {
    const n = stickies.current++;
    setEls((es) => [
      ...es,
      {
        id: `s${n}`,
        kind: "sticky",
        label:
          ["Ask: what is a quorum?", "Review terms", "Exam: Friday", "FLP = no guarantee"][n % 4] ??
          "",
        x: 12 + ((n * 23) % 70),
        y: 70 - ((n * 17) % 40),
        tone: STICKY_TONES[n % STICKY_TONES.length] ?? "tone-butter",
      },
    ]);
  }

  function drag(id: string, e: React.PointerEvent) {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = Math.min(95, Math.max(5, ((ev.clientX - r.left) / r.width) * 100));
      const y = Math.min(92, Math.max(8, ((ev.clientY - r.top) / r.height) * 100));
      setEls((es) => es.map((x_) => (x_.id === id ? { ...x_, x, y } : x_)));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          transition={spring.snappy}
          onClick={makeMap}
          disabled={hasMap}
          className="btn btn--primary btn--sm disabled:opacity-50"
        >
          Make a mind map
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          transition={spring.snappy}
          onClick={addSticky}
          className="btn btn--secondary btn--sm"
        >
          Add sticky
        </motion.button>
        <button
          type="button"
          onClick={() => setEls((es) => es.filter((e) => e.id === "root"))}
          className="btn btn--ghost btn--sm"
        >
          Clear
        </button>
      </div>
      <div
        ref={box}
        className="dot-grid-board relative h-72 w-full touch-none overflow-hidden rounded-lg bg-surface-100/70"
      >
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {root &&
            els
              .filter((e) => e.kind === "node" && e.id !== "root")
              .map((e) => (
                <motion.line
                  key={e.id}
                  initial={{ pathLength: 0 }}
                  animate={{
                    pathLength: 1,
                    x1: `${root.x}%`,
                    y1: `${root.y}%`,
                    x2: `${e.x}%`,
                    y2: `${e.y}%`,
                  }}
                  transition={spring.snappy}
                  stroke="currentColor"
                  strokeOpacity={0.5}
                  strokeWidth={2}
                />
              ))}
        </svg>
        <AnimatePresence>
          {els.map((e, i) => (
            <motion.div
              key={e.id}
              onPointerDown={(ev) => drag(e.id, ev)}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, rotate: e.kind === "sticky" ? (i % 2 ? 2 : -2) : 0 }}
              exit={{ scale: 0, opacity: 0 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 1.08, zIndex: 10 }}
              transition={{ ...spring.bouncy, delay: e.kind === "node" ? i * 0.06 : 0 }}
              style={{ left: `${e.x}%`, top: `${e.y}%` }}
              className={cx(
                "absolute -translate-x-1/2 -translate-y-1/2 cursor-grab select-none shadow-hearth-sm active:cursor-grabbing",
                e.kind === "node"
                  ? "rounded-pill px-4 py-2 type-label"
                  : "w-36 rounded-md p-3 type-caption",
                e.tone,
              )}
            >
              {e.label}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
