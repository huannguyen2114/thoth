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
      <Tile
        className="tone-lilac md:col-span-3"
        title="Mind maps you can move"
        hint="Drag the ideas around"
      >
        <MindMap />
      </Tile>
      <Tile className="tone-butter md:col-span-4" title="A model for each task" hint="Switch them">
        <Models />
      </Tile>
      <Tile className="tone-peach md:col-span-2" title="Private by default">
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

function Node({
  x,
  y,
  label,
  onMove,
  bounds,
}: {
  x: number;
  y: number;
  label: string;
  onMove: (x: number, y: number) => void;
  bounds: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <motion.div
      drag
      dragConstraints={bounds}
      dragElastic={0.2}
      dragMomentum={false}
      whileDrag={{ scale: 1.1, zIndex: 10 }}
      whileTap={{ scale: 1.05 }}
      onDrag={(_, info) => onMove(info.offset.x, info.offset.y)}
      onDragEnd={() => onMove(0, 0)}
      style={{ left: x, top: y }}
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-pill bg-surface-100 px-3 py-1.5 type-label text-ink shadow-hearth-sm active:cursor-grabbing"
    >
      {label}
    </motion.div>
  );
}

function MindMap() {
  const bounds = useRef<HTMLDivElement>(null);
  const base = [
    { label: landing.mindmap[0] ?? "", x: 160, y: 90 },
    { label: landing.mindmap[1] ?? "", x: 60, y: 28 },
    { label: landing.mindmap[2] ?? "", x: 262, y: 34 },
    { label: landing.mindmap[3] ?? "", x: 262, y: 150 },
  ];
  const [offsets, setOffsets] = useState(base.map(() => ({ x: 0, y: 0 })));
  const move = (i: number) => (x: number, y: number) =>
    setOffsets((o) => o.map((v, j) => (j === i ? { x, y } : v)));
  const pos = base.map((n, i) => ({
    x: n.x + (offsets[i]?.x ?? 0),
    y: n.y + (offsets[i]?.y ?? 0),
  }));
  const root = pos[0] ?? { x: 0, y: 0 };
  return (
    <div ref={bounds} className="relative h-44 w-80">
      <svg className="absolute inset-0 size-full overflow-visible text-current" aria-hidden="true">
        {pos.slice(1).map((p, i) => (
          <motion.line
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed node list
            key={i}
            animate={{ x1: root.x, y1: root.y, x2: p.x, y2: p.y }}
            transition={spring.snappy}
            stroke="currentColor"
            strokeOpacity={0.5}
            strokeWidth={2}
          />
        ))}
      </svg>
      {base.map((n, i) => (
        <Node key={n.label} x={n.x} y={n.y} label={n.label} onMove={move(i)} bounds={bounds} />
      ))}
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
