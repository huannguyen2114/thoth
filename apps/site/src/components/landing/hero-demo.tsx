"use client";

import { type AnswerPart, type DemoSample, landing } from "@content/landing";
import { cx } from "@thoth/ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { spring } from "@/motion/tokens";
import {
  ArrowUpIcon,
  CalendarIcon,
  CardsIcon,
  ChartIcon,
  ChevronIcon,
  ClockIcon,
  CommentIcon,
  DownloadIcon,
  ExpandIcon,
  FolderIcon,
  GearIcon,
  LayoutIcon,
  ListIcon,
  MonitorIcon,
  PenIcon,
  PlusIcon,
  PointerIcon,
  RectIcon,
  SearchIcon,
  SidebarIcon,
  XIcon,
} from "./app-icons";

type Token = { word: string; n: number } | { cite: string; at: number; n: number };
interface Turn {
  id: number;
  q: string;
  tokens: Token[];
}

/** Splits an answer into words and citation chips, the units it streams in. */
function tokenize(parts: AnswerPart[]): Token[] {
  let n = 0;
  return parts.flatMap((p): Token[] =>
    typeof p === "string"
      ? p
          .split(/(?<=\s)/)
          .filter(Boolean)
          .map((word) => ({ word, n: n++ }))
      : [{ cite: p.cite, at: p.at, n: n++ }],
  );
}

const clock = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

/**
 * A working miniature of Thoth's content workspace (a recreation, no server), drawn with the
 * app's own Hearth classes and icons: sidebar, content header, docked panels, chat. Pick a
 * sample, ask a suggested question, and click a citation to jump the source.
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
  const total = last?.tokens.length ?? 0;
  const streaming = shown < total;

  useEffect(() => {
    if (shown >= total) return;
    const t = setTimeout(() => setShown((n) => (reduce ? total : n + 1)), 40);
    return () => clearTimeout(t);
  }, [shown, total, reduce]);

  useEffect(() => {
    if (shown === 0 && total === 0) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [shown, total]);

  // The lecture plays slowly on its own, so the demo feels alive.
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
  const viewerTab = sample.kind === "video" ? "Video" : "PDF";

  return (
    <div className="flex flex-col gap-3">
      {/* Sample picker, outside the app frame */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="type-label text-ink-muted">Try it with</span>
        <div
          role="tablist"
          aria-label="Example source"
          className="flex rounded-pill bg-surface-200 p-1 shadow-hearth-sm"
        >
          {samples.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === sampleId}
              onClick={() => pick(s.id)}
              className="relative rounded-pill px-4 py-1.5 type-label text-ink-muted aria-selected:text-ink"
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
      </div>

      {/* The app window */}
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-100 text-left shadow-hearth-lg">
        <div className="flex">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Content header */}
            <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={sample.title}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={spring.snappy}
                  className="truncate type-heading-3 text-ink"
                >
                  {sample.title}
                </motion.p>
              </AnimatePresence>
              <span className="ml-auto hidden items-center gap-4 type-label text-ink lg:flex">
                <span className="flex items-center gap-1.5">
                  <LayoutIcon /> Layout <ChevronIcon />
                </span>
                <span className="flex items-center gap-1.5">
                  <PlusIcon /> Add panel <ChevronIcon />
                </span>
              </span>
            </div>

            <div className="grid min-h-0 md:grid-cols-5">
              {/* Left group: viewer, then chapters */}
              <div className="flex min-w-0 flex-col border-border-subtle md:col-span-3 md:border-r">
                <PanelTabs tabs={[viewerTab]} />
                <div className="p-3">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={sample.id}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={spring.smooth}
                    >
                      {sample.kind === "video" ? (
                        <VideoViewer
                          pos={pos}
                          length={sample.length}
                          flash={flash}
                          title={sample.title}
                        />
                      ) : (
                        <PdfViewer
                          page={pos}
                          pages={sample.length}
                          flash={flash}
                          chapters={sample.chapters}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
                <PanelTabs
                  tabs={["Chapters", sample.kind === "video" ? "Transcript" : "Text"]}
                  extra="Auto scroll"
                />
                <ol className="flex max-h-52 flex-col overflow-y-auto px-2 py-2">
                  {sample.chapters.map((c, i) => (
                    <li key={c.at}>
                      <button
                        type="button"
                        onClick={() => jump(c.at)}
                        className="relative flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left"
                      >
                        {i === active && (
                          <motion.span
                            layoutId="chapter-active"
                            transition={spring.smooth}
                            className="absolute inset-0 rounded-md bg-accent-tint"
                          />
                        )}
                        <span className="relative type-caption text-ink-muted tabular-nums">
                          {sample.kind === "video" ? clock(c.at) : `p. ${c.at}`}
                        </span>
                        <span className="relative type-label text-ink">{c.title}</span>
                        <span className="relative type-caption text-ink-muted">{c.summary}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Right group: chat */}
              <div className="flex min-h-96 min-w-0 flex-col md:col-span-2">
                <PanelTabs tabs={["Chat"]} />
                <div className="flex items-center gap-4 border-b border-border-subtle px-4 py-2 type-caption text-ink">
                  <span className="truncate">{last ? last.q : "New chat"}</span>
                  <span className="ml-auto">History</span>
                  <span className="hidden text-ink-muted sm:inline">New chat</span>
                </div>
                <div
                  ref={scroller}
                  className="flex max-h-80 flex-1 flex-col gap-3 overflow-y-auto p-4"
                >
                  {turns.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-4 text-center">
                      <p className="type-heading-3 text-ink">Ask about this source</p>
                      <p className="type-caption text-ink-muted">
                        Every answer cites the page or moment it comes from. Click a citation to
                        jump there.
                      </p>
                      <Suggestions
                        sample={sample}
                        asked={asked}
                        touched={touched}
                        disabled={streaming}
                        onAsk={ask}
                      />
                    </div>
                  ) : (
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
                          <p className="ml-auto max-w-xs rounded-lg bg-accent-tint px-3 py-1.5 type-body text-ink">
                            {t.q}
                          </p>
                          <p className="type-body text-ink">
                            {t.tokens.slice(0, t === last ? shown : t.tokens.length).map((tok) =>
                              "word" in tok ? (
                                <span key={tok.n}>{tok.word}</span>
                              ) : (
                                <motion.button
                                  key={tok.n}
                                  type="button"
                                  initial={{ scale: 0.6, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  whileTap={{ scale: 0.9 }}
                                  transition={spring.bouncy}
                                  onClick={() => jump(tok.at)}
                                  className="badge badge--neutral mx-0.5 cursor-pointer align-baseline hover:underline"
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
                  )}
                </div>
                {turns.length > 0 && (
                  <div className="px-4 pb-2">
                    <Suggestions
                      sample={sample}
                      asked={asked}
                      touched
                      disabled={streaming}
                      onAsk={ask}
                    />
                  </div>
                )}
                <div className="px-3 pb-3">
                  <div className="composer">
                    <span className="composer__input type-body text-ink-subtle">Ask anything</span>
                    <span className="composer__send" aria-hidden="true">
                      <ArrowUpIcon />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="text-center type-caption text-ink-subtle">
        A live recreation of the app. {landing.exampleNote}
      </p>
    </div>
  );
}

function Suggestions({
  sample,
  asked,
  touched,
  disabled,
  onAsk,
}: {
  sample: DemoSample;
  asked: Set<string>;
  touched: boolean;
  disabled: boolean;
  onAsk: (q: string, a: AnswerPart[]) => void;
}) {
  const left = sample.questions.filter((x) => !asked.has(x.q));
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {left.map((x, i) => (
        <motion.button
          key={x.q}
          type="button"
          layout
          whileTap={{ scale: 0.94 }}
          transition={spring.snappy}
          disabled={disabled}
          onClick={() => onAsk(x.q, x.answer)}
          className="relative rounded-md border border-border-control bg-surface-100 px-3 py-1 type-caption text-ink disabled:opacity-50"
        >
          {!touched && i === 0 && (
            <span className="absolute -inset-1 animate-ping rounded-md border-2 border-accent/40" />
          )}
          {x.q}
        </motion.button>
      ))}
    </div>
  );
}

/** A dock panel's tab strip, like dockview in the app: tabs, a close mark, maximise on the right. */
function PanelTabs({ tabs, extra }: { tabs: string[]; extra?: string }) {
  return (
    <div className="flex items-center gap-4 border-b border-border-subtle px-3">
      {tabs.map((t, i) => (
        <span
          key={t}
          className={cx(
            "flex items-center gap-1.5 py-2 type-label",
            i === 0 ? "border-b-2 border-ink text-ink" : "text-ink-muted",
          )}
        >
          {t}
          {i === 0 && (
            <span className="text-ink-muted">
              <XIcon />
            </span>
          )}
        </span>
      ))}
      <span className="ml-auto flex items-center gap-3 text-ink-muted">
        {extra && (
          <span className="flex items-center gap-1.5 type-caption">
            <span className="h-3.5 w-6 rounded-pill bg-accent p-0.5">
              <span className="ml-auto block size-2.5 rounded-pill bg-surface-100" />
            </span>
            {extra}
          </span>
        )}
        <ExpandIcon />
      </span>
    </div>
  );
}

function Sidebar() {
  const nav: [ReactNode, string][] = [
    [<PlusIcon key="a" />, "Add content"],
    [<CardsIcon key="b" />, "Review"],
    [<CalendarIcon key="c" />, "Planner"],
    [<ClockIcon key="d" />, "History"],
    [<ChartIcon key="e" />, "Progress"],
  ];
  return (
    <aside className="hidden w-52 shrink-0 flex-col gap-3 border-r border-border-subtle bg-surface-200 p-3 lg:flex">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-6 items-center justify-center rounded-sm bg-primary font-serif text-on-primary type-label">
          T
        </span>
        <span className="type-heading-3 text-ink">Thoth</span>
        <span className="ml-auto text-ink-muted">
          <SidebarIcon />
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-100 px-2.5 py-1.5 type-caption text-ink-muted">
        <SearchIcon /> Search <kbd className="ml-auto type-caption">⌘K</kbd>
      </div>
      <nav className="flex flex-col gap-0.5">
        {nav.map(([icon, label]) => (
          <span
            key={label}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 type-caption text-ink"
          >
            {icon}
            {label}
          </span>
        ))}
      </nav>
      <p className="mt-2 type-overline text-ink-muted">Spaces</p>
      <span className="flex items-center gap-2 rounded-md bg-accent-tint px-2 py-1.5 type-caption text-ink">
        <FolderIcon /> Distributed systems
      </span>
      <span className="mt-auto flex items-center gap-2 px-2 py-1 type-caption text-ink">
        <MonitorIcon /> System theme
      </span>
      <span className="flex items-center gap-2 px-2 py-1 type-caption text-ink">
        <GearIcon /> Settings
      </span>
    </aside>
  );
}

function VideoViewer({
  pos,
  length,
  flash,
  title,
}: {
  pos: number;
  length: number;
  flash: number;
  title: string;
}) {
  const pct = (pos / length) * 100;
  return (
    <div className="player flex aspect-video flex-col justify-between rounded-md p-3">
      <span className="type-caption opacity-80">{title}</span>
      <div className="flex flex-1 items-center justify-center">
        <span className="flex size-12 items-center justify-center rounded-pill bg-danger text-on-accent">
          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
          </svg>
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="relative h-1.5 rounded-pill bg-current/25">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-pill bg-danger"
            animate={{ width: `${pct}%` }}
            transition={spring.smooth}
          />
          <motion.div
            key={flash}
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-danger"
            initial={{ scale: flash ? 2 : 1 }}
            animate={{ left: `${pct}%`, scale: 1 }}
            transition={spring.bouncy}
          />
        </div>
        <span className="type-caption tabular-nums opacity-80">
          {clock(pos)} / {clock(length)}
        </span>
      </div>
    </div>
  );
}

function PdfViewer({
  page,
  pages,
  flash,
  chapters,
}: {
  page: number;
  pages: number;
  flash: number;
  chapters: DemoSample["chapters"];
}) {
  const heading = [...chapters].reverse().find((c) => c.at <= page)?.title ?? "";
  const tools = [
    ["select", PointerIcon],
    ["pen", PenIcon],
    ["shape", RectIcon],
    ["comment", CommentIcon],
  ] as const;
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-2">
      <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-100 px-2 py-1 text-ink-muted">
        {tools.map(([id, T], i) => (
          <span key={id} className={cx("rounded-sm p-1", i === 0 && "bg-neutral-tint text-ink")}>
            <T />
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1 type-caption text-ink">
          <ListIcon /> Annotations
        </span>
        <DownloadIcon />
      </div>
      <div className="relative aspect-video overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`${page}-${flash}`}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={spring.smooth}
            className="absolute inset-x-4 inset-y-0 flex flex-col gap-2 bg-surface-100 p-4 shadow-hearth-sm"
          >
            <span className="type-caption text-ink-muted">
              Page {page} of {pages}
            </span>
            <span className="type-label text-ink">{heading}</span>
            <span className="h-1.5 w-full rounded-sm bg-neutral-tint" />
            <span className="h-1.5 w-11/12 rounded-sm bg-neutral-tint" />
            <motion.span
              key={flash}
              initial={{ backgroundColor: "var(--color-accent-muted)" }}
              animate={{ backgroundColor: "var(--color-warning-tint)" }}
              transition={{ duration: 1.2 }}
              className="h-1.5 w-4/5 rounded-sm"
            />
            <span className="h-1.5 w-full rounded-sm bg-neutral-tint" />
            <span className="h-1.5 w-2/3 rounded-sm bg-neutral-tint" />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
