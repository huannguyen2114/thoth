"use client";

import {
  type AnnotationColor,
  type AnnotationPayload,
  linkLabel,
  type NewAnnotationInput,
  type NormRect,
  type TextQuote,
} from "@thoth/core";
import { cx } from "@thoth/ui";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Command, useCommands } from "@/app/_components/commands";
import type { AnnotationDto } from "@/features/annotations/actions";
import {
  type AnchorRect,
  AnnotationToolbar,
  type PassageActions,
} from "@/features/annotations/annotation-toolbar";
import { AnnotationsList } from "@/features/annotations/annotations-list";
import { BacklinksButton, useAnnotationBacklinks } from "@/features/annotations/backlinks";
import { COLOR_NAMES, COLORS } from "@/features/annotations/colors";
import { hitRects, inkBox, shapeBox, toPageRects } from "@/features/annotations/geometry";
import {
  ArrowIcon,
  CommentIcon,
  DownloadIcon,
  EllipseIcon,
  ListIcon,
  PenIcon,
  RectIcon,
  RedoIcon,
  SelectIcon,
  UndoIcon,
} from "@/features/annotations/icons";
import { useAnnotations } from "@/features/annotations/store";
import { usePassage } from "@/features/annotations/use-passage";
import { DRAW_TOOLS, PdfOverlay, type PdfTool } from "./pdf-overlay";
import { pageAnchor } from "./text-viewer";
import { flash, revealInScroller, useViewer } from "./viewer-context";
import "./pdf.css";

type PdfJs = typeof import("pdfjs-dist");

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      pdfjs: PdfJs;
      doc: PDFDocumentProxy;
      pages: { page: number; ratio: number }[];
    }
  | { status: "error" };

/** A passage selected in the text layer. */
interface PdfSelection {
  page: number;
  quote: TextQuote;
  rects: NormRect[];
}

type Popover =
  | { kind: "selection"; anchor: AnchorRect; sel: PdfSelection }
  | { kind: "annotation"; anchor: AnchorRect; id: string }
  | { kind: "note"; anchor: AnchorRect; page: number; x: number; y: number };

/** One undoable change. Re-creating an annotation gives it a new id, so `id` is updated. */
type Op = { kind: "added" | "removed"; input: NewAnnotationInput; id: string | null };

const inputOf = (a: AnnotationDto): NewAnnotationInput => ({
  kind: a.kind,
  anchor: a.anchor,
  color: a.color,
  comment: a.comment,
  payload: a.payload,
});

/** The page an annotation is drawn on. */
const pageOf = (a: AnnotationDto): number | null =>
  a.payload?.page ??
  a.anchor.rects?.[0]?.page ??
  (a.anchor.locator?.type === "page" ? a.anchor.locator.page : null);

const onPage = (a: AnnotationDto, page: number) =>
  a.payload ? a.payload.page === page : (a.anchor.rects ?? []).some((r) => r.page === page);

/** Page-space box of an annotation on a page, for hit tests and placing its popover. */
function boxOf(a: AnnotationDto, page: number): NormRect | null {
  if (a.payload?.type === "ink") return inkBox(a.payload);
  if (a.payload?.type === "shape") return shapeBox(a.payload);
  const rs = (a.anchor.rects ?? []).filter((r) => r.page === page);
  if (rs.length === 0) return null;
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  const x2 = Math.max(...rs.map((r) => r.x + r.w));
  const y2 = Math.max(...rs.map((r) => r.y + r.h));
  return { page, x, y, w: x2 - x, h: y2 - y };
}

const TOOLS: { id: PdfTool; label: string; Icon: () => React.JSX.Element }[] = [
  { id: "select", label: "Select text", Icon: SelectIcon },
  { id: "pen", label: "Pen", Icon: PenIcon },
  { id: "rect", label: "Rectangle", Icon: RectIcon },
  { id: "ellipse", label: "Ellipse", Icon: EllipseIcon },
  { id: "arrow", label: "Arrow", Icon: ArrowIcon },
  { id: "note", label: "Comment pin", Icon: CommentIcon },
];

/**
 * A stored PDF rendered with pdf.js: one canvas per page, drawn only when the page scrolls
 * near the view, with a text layer for selection and an SVG overlay for annotations (doc 21).
 * Registers `showPage`, `showAnnotation` and `showQuote` with the viewer.
 */
export function PdfViewer({ url, contentId }: { url: string; contentId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const { register, setPosition } = useViewer();
  const ann = useAnnotations(contentId);
  const passage = usePassage(contentId);
  const [tool, setTool] = useState<PdfTool>("select");
  const [penColor, setPenColor] = useState<AnnotationColor>("blue");
  const [pop, setPop] = useState<Popover | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const undoStack = useRef<Op[]>([]);
  const redoStack = useRef<Op[]>([]);
  const [, bumpHistory] = useState(0);

  const onVisible = useCallback(
    (page: number) => setPosition({ type: "page", page }),
    [setPosition],
  );

  useEffect(() => {
    let cancelled = false;
    let task: { destroy(): Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const loading = pdfjs.getDocument({ url });
        task = loading;
        const doc = await loading.promise;
        // Page sizes up front, so placeholders hold their space and jumps land exactly.
        const pages: { page: number; ratio: number }[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
          pages.push({ page: i, ratio: vp.width / vp.height });
        }
        if (!cancelled) setState({ status: "ready", pdfjs, doc, pages });
      } catch (cause) {
        console.error("PDF failed to load", cause);
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);

  const ready = state.status === "ready";
  const doc = state.status === "ready" ? state.doc : null;

  // ---------- Jumps ----------
  const pendingPage = useRef<number | null>(null);
  const pendingAnn = useRef<string | null>(null);
  const latest = useRef({ items: ann.items, status: ann.status, doc });
  latest.current = { items: ann.items, status: ann.status, doc };

  const showPageNow = useCallback((page: number) => {
    const el = document.getElementById(pageAnchor(page));
    if (!el) {
      pendingPage.current = page;
      return;
    }
    revealInScroller(el);
    flash(el, "ring");
  }, []);

  const showAnnotationNow = useCallback((id: string): boolean => {
    const a = latest.current.items.find((x) => x.id === id);
    if (!a) return false;
    const page = pageOf(a);
    const el = page ? document.getElementById(pageAnchor(page)) : null;
    if (!page || !el) return false;
    const box = boxOf(a, page);
    revealInScroller(el, box ? box.y * el.clientHeight - 64 : 0);
    window.setTimeout(() => {
      for (const node of el.querySelectorAll(`[data-annotation-id="${CSS.escape(id)}"] > *`)) {
        node.classList.remove("annotation-flash");
        void (node as SVGElement).getBoundingClientRect();
        node.classList.add("annotation-flash");
        window.setTimeout(() => node.classList.remove("annotation-flash"), 1400);
      }
    }, 250);
    return true;
  }, []);

  useEffect(() => {
    register({
      showPage: showPageNow,
      showAnnotation: (id) => {
        const { status, doc } = latest.current;
        if (status !== "ready" || !doc || !showAnnotationNow(id)) {
          // Not loaded yet (a link opened this page): shown once the pages and marks exist.
          if (status !== "ready" || !doc) {
            pendingAnn.current = id;
            return true;
          }
          return false;
        }
        return true;
      },
      showQuote: (quote) => {
        const d = latest.current.doc;
        if (!d) return false;
        void findPageOf(d, quote).then((page) => page && showPageNow(page));
        return true;
      },
    });
    return () => register(null);
  }, [register, showPageNow, showAnnotationNow]);

  useEffect(() => {
    if (!ready) return;
    const page = pendingPage.current;
    if (page !== null) {
      pendingPage.current = null;
      showPageNow(page);
    }
    const id = pendingAnn.current;
    if (id && ann.status === "ready") {
      pendingAnn.current = null;
      if (!showAnnotationNow(id)) {
        const a = ann.items.find((x) => x.id === id);
        const p = a ? pageOf(a) : null;
        if (p) showPageNow(p);
      }
    }
  }, [ready, ann.status, ann.items, showPageNow, showAnnotationNow]);

  // ---------- Create, with undo and redo ----------
  const { create, remove, update } = ann;
  const record = (op: Op) => {
    undoStack.current.push(op);
    redoStack.current = [];
    bumpHistory((n) => n + 1);
  };
  const add = async (input: NewAnnotationInput) => {
    const a = await create(input);
    if (a) record({ kind: "added", input, id: a.id });
    return a;
  };
  const del = async (a: AnnotationDto) => {
    const gone = await remove(a.id);
    if (gone) record({ kind: "removed", input: inputOf(gone), id: null });
  };
  const step = async (from: Op[], to: Op[]) => {
    const op = from.pop();
    if (!op) return;
    bumpHistory((n) => n + 1);
    const undoingAdd = (op.kind === "added") === (from === undoStack.current);
    if (undoingAdd) {
      if (op.id) await remove(op.id);
      to.push({ ...op, id: null });
    } else {
      const a = await create(op.input);
      to.push({ ...op, id: a?.id ?? null });
    }
    bumpHistory((n) => n + 1);
  };
  const undo = () => void step(undoStack.current, redoStack.current);
  const redo = () => void step(redoStack.current, undoStack.current);
  // Removing an annotation re-created by redo needs its new id on the undo entry.
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;

  const onDraw = (payload: AnnotationPayload) =>
    void add({
      kind: payload.type,
      anchor: {
        kind: "content",
        contentId,
        locator: { type: "page", page: payload.page },
      },
      color: penColor,
      payload,
    });

  // ---------- Selection and clicks ----------
  const readSelection = useCallback((): { sel: PdfSelection; anchor: AnchorRect } | null => {
    const s = window.getSelection();
    const box = root.current;
    if (!s || s.isCollapsed || s.rangeCount === 0 || !box) return null;
    const range = s.getRangeAt(0);
    const startNode = range.startContainer;
    const startEl = startNode.nodeType === 1 ? (startNode as Element) : startNode.parentElement;
    const layer = startEl?.closest(".pdf-text-layer");
    const pageEl = layer?.closest<HTMLElement>("[data-pdf-page]");
    if (!layer || !pageEl || !box.contains(layer)) return null;
    const raw = range.toString();
    const exact = raw.replace(/\s+/g, " ").trim().slice(0, 2000);
    if (!exact) return null;
    const page = Number(pageEl.dataset.pdfPage);
    const full = layer.textContent ?? "";
    const before = document.createRange();
    before.setStart(layer, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    const quote: TextQuote = {
      exact,
      prefix: full.slice(Math.max(0, start - 32), start),
      suffix: full.slice(start + raw.length, start + raw.length + 32),
    };
    const clientRects = [...range.getClientRects()];
    const rects: NormRect[] = [];
    for (const el of box.querySelectorAll<HTMLElement>("[data-pdf-page]")) {
      const pb = el.getBoundingClientRect();
      const mine = clientRects.filter((r) => {
        const cy = r.top + r.height / 2;
        return cy >= pb.top && cy <= pb.bottom;
      });
      if (mine.length) rects.push(...toPageRects(mine, pb, Number(el.dataset.pdfPage)));
    }
    if (rects.length === 0) return null;
    const b = range.getBoundingClientRect();
    return {
      sel: { page, quote, rects },
      anchor: { left: b.left, top: b.top, width: b.width, height: b.height },
    };
  }, []);

  const showSelectionBar = useCallback(() => {
    window.setTimeout(() => {
      const r = readSelection();
      if (r) setPop({ kind: "selection", ...r });
    }, 0);
  }, [readSelection]);

  // A selection that collapses closes its bar.
  useEffect(() => {
    if (pop?.kind !== "selection") return;
    const onChange = () => {
      if (window.getSelection()?.isCollapsed) setPop(null);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [pop?.kind]);

  function onPageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!window.getSelection()?.isCollapsed) return;
    const pageEl = (e.target as Element).closest<HTMLElement>("[data-pdf-page]");
    if (!pageEl) return;
    const page = Number(pageEl.dataset.pdfPage);
    const pb = pageEl.getBoundingClientRect();
    const x = (e.clientX - pb.left) / pb.width;
    const y = (e.clientY - pb.top) / pb.height;
    if (tool === "note") {
      setPop({ kind: "note", anchor: { left: e.clientX, top: e.clientY, width: 0, height: 0 }, page, x, y });
      return;
    }
    if (tool !== "select") return;
    const hit = [...ann.items]
      .reverse()
      .find((a) => {
        if (!onPage(a, page)) return false;
        if (!a.payload) return hitRects((a.anchor.rects ?? []).filter((r) => r.page === page), x, y);
        const b = boxOf(a, page);
        return b ? hitRects([b], x, y, 0.012) : false;
      });
    if (!hit) return;
    const b = boxOf(hit, page);
    const anchor = b
      ? {
          left: pb.left + b.x * pb.width,
          top: pb.top + b.y * pb.height,
          width: b.w * pb.width,
          height: b.h * pb.height,
        }
      : { left: e.clientX, top: e.clientY, width: 0, height: 0 };
    setPop({ kind: "annotation", anchor, id: hit.id });
  }

  // ---------- Toolbar actions ----------
  const title = ann.title;
  const closePop = useCallback(() => setPop(null), []);
  const clearSelection = () => window.getSelection()?.removeAllRanges();

  const highlightFrom = (sel: PdfSelection, color: AnnotationColor, comment: string | null = null) =>
    add({
      kind: "highlight",
      anchor: {
        kind: "content",
        contentId,
        locator: { type: "page", page: sel.page },
        quote: sel.quote,
        rects: sel.rects,
      },
      color,
      comment,
    });

  const current =
    pop?.kind === "annotation" ? (ann.items.find((a) => a.id === pop.id) ?? null) : null;
  const quotedIn = useAnnotationBacklinks(contentId, current?.id ?? null);

  let actions: PassageActions | null = null;
  if (pop?.kind === "selection") {
    const { sel } = pop;
    actions = {
      onColor: (c) => {
        void highlightFrom(sel, c);
        clearSelection();
        setPop(null);
      },
      onComment: (text) => {
        void highlightFrom(sel, "yellow", text.trim() || null);
        clearSelection();
        setPop(null);
      },
      onAddToNotes: () => {
        void highlightFrom(sel, "yellow").then((a) => {
          if (a) passage.addToNotes(sel.quote.exact, `thoth:a/${a.id}`, linkLabel(title, `p.${sel.page}`));
        });
        clearSelection();
        setPop(null);
      },
      onFlashcard: async (suggest) => {
        const a = await highlightFrom(sel, "yellow");
        if (!a) return { ok: false, message: "The highlight was not saved, so no card was made." };
        clearSelection();
        return passage.flashcard({ annotationId: a.id }, suggest);
      },
    };
  } else if (pop?.kind === "annotation" && current) {
    const page = pageOf(current);
    actions = {
      onColor: (c) => void update(current.id, { color: c }),
      onComment: (text) => void update(current.id, { comment: text.trim() || null }),
      onAddToNotes: () => {
        passage.addToNotes(
          current.anchor.quote?.exact ?? current.comment ?? (current.kind === "ink" ? "Drawing" : "Shape"),
          `thoth:a/${current.id}`,
          linkLabel(title, page ? `p.${page}` : null),
        );
        setPop(null);
      },
      onFlashcard: (suggest) => passage.flashcard({ annotationId: current.id }, suggest),
      onDelete: () => {
        void del(current);
        setPop(null);
      },
    };
  } else if (pop?.kind === "note") {
    const { page, x, y } = pop;
    actions = {
      onComment: (text) => {
        if (!text.trim()) return;
        void add({
          kind: "comment",
          anchor: {
            kind: "content",
            contentId,
            locator: { type: "page", page },
            rects: [{ page, x: Math.min(x, 0.98), y: Math.min(y, 0.98), w: 0.02, h: 0.02 }],
          },
          color: "yellow",
          comment: text.trim(),
        });
        setPop(null);
        setTool("select");
      },
      onAddToNotes: () => {
        passage.addToNotes(`Page ${page}`, `thoth:c/${contentId}?at=p.${page}`, linkLabel(title, `p.${page}`));
        setPop(null);
      },
      onFlashcard: async () => ({ ok: false, message: "Select some text to make a card from it." }),
    };
  }

  // ---------- Palette ----------
  const exportHref = `/api/content/${encodeURIComponent(contentId)}/annotated.pdf`;
  const commands = useMemo<Command[]>(
    () => [
      {
        id: "pdf.download-annotated",
        label: "Download annotated PDF",
        group: "PDF",
        keywords: ["export", "annotations", "highlights", "save"],
        run: () => {
          const a = document.createElement("a");
          a.href = exportHref;
          a.download = "";
          a.click();
        },
      },
      {
        id: "pdf.undo",
        label: "PDF: Undo annotation",
        group: "PDF",
        keywords: ["undo", "drawing", "highlight"],
        run: () => undoRef.current(),
      },
      {
        id: "pdf.redo",
        label: "PDF: Redo annotation",
        group: "PDF",
        keywords: ["redo"],
        run: () => redoRef.current(),
      },
      ...TOOLS.map((t) => ({
        id: `pdf.tool.${t.id}`,
        label: `PDF: ${t.label}`,
        group: "PDF",
        keywords: ["annotate", "draw", "tool"],
        run: () => setTool(t.id),
      })),
    ],
    [exportHref],
  );
  useCommands("PDF", commands);

  if (state.status === "loading") {
    return <div className="aspect-3/4 w-full animate-pulse rounded-lg bg-surface-300" />;
  }
  if (state.status === "error") {
    return (
      <div className="callout callout--danger max-w-none" role="alert">
        <div>
          <p className="callout__title">The PDF did not open.</p>
          <p className="callout__text">
            The file may be missing or damaged. Try uploading it again.
          </p>
        </div>
      </div>
    );
  }

  const drawing = DRAW_TOOLS.includes(tool);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: local undo and redo keys while the PDF has focus; the toolbar has buttons for both
    <div
      ref={root}
      className="flex flex-col gap-3"
      onKeyDown={(e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (!mod || e.key.toLowerCase() !== "z") return;
        if ((e.target as Element).closest("textarea, input, [contenteditable='true']")) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }}
    >
      <div
        role="toolbar"
        aria-label="PDF tools"
        className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-lg border border-border-subtle bg-surface-200 p-1 shadow-hearth-sm select-none"
      >
        <div className="flex items-center gap-0.5" role="group" aria-label="Tool">
          {TOOLS.map((t) => (
            <IconButton
              key={t.id}
              label={t.label}
              pressed={tool === t.id}
              onClick={() => {
                setTool(t.id);
                setPop(null);
              }}
            >
              <t.Icon />
            </IconButton>
          ))}
        </div>
        {(drawing || tool === "note") && (
          <div className="flex items-center gap-0.5" role="group" aria-label="Pen colour">
            {COLOR_NAMES.map((c) => (
              <IconButton
                key={c}
                label={`Pen colour ${COLORS[c].label}`}
                pressed={penColor === c}
                onClick={() => setPenColor(c)}
              >
                <span className={cx("size-3.5 rounded-pill", COLORS[c].swatch)} />
              </IconButton>
            ))}
          </div>
        )}
        <span className="mx-0.5 h-5 w-px bg-border-subtle" aria-hidden="true" />
        <IconButton label="Undo" onClick={undo} disabled={undoStack.current.length === 0}>
          <UndoIcon />
        </IconButton>
        <IconButton label="Redo" onClick={redo} disabled={redoStack.current.length === 0}>
          <RedoIcon />
        </IconButton>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <BacklinksButton contentId={contentId} />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-expanded={listOpen}
            onClick={() => setListOpen((v) => !v)}
          >
            <ListIcon />
            Annotations
            {ann.items.length > 0 && (
              <span className="badge badge--neutral tabular-nums">{ann.items.length}</span>
            )}
          </button>
          <a className="btn btn--ghost btn--sm" href={exportHref} download aria-label="Download annotated PDF" title="Download annotated PDF">
            <DownloadIcon />
          </a>
        </div>
      </div>

      {listOpen && (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-border-subtle bg-surface-200">
          <AnnotationsList contentId={contentId} onPicked={() => setListOpen(false)} />
        </div>
      )}

      {ann.error && (
        <div className="callout callout--danger max-w-none" role="alert">
          <div>
            <p className="callout__title">That change was not saved</p>
            <p className="callout__text">{ann.error}</p>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={ann.dismissError}>
            Dismiss
          </button>
        </div>
      )}

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: clicking a mark opens its toolbar; every mark is also in the Annotations list */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: see above */}
      <div
        className="flex flex-col gap-4"
        onPointerUp={tool === "select" ? showSelectionBar : undefined}
        onKeyUp={(e) => e.shiftKey && showSelectionBar()}
        onClick={onPageClick}
      >
        {state.pages.map(({ page, ratio }) => (
          <PdfPage
            key={page}
            pdfjs={state.pdfjs}
            doc={state.doc}
            page={page}
            ratio={ratio}
            onVisible={onVisible}
            annotations={ann.items.filter((a) => onPage(a, page))}
            tool={tool}
            color={penColor}
            onDraw={onDraw}
          />
        ))}
      </div>

      {pop && actions && (
        <AnnotationToolbar
          key={pop.kind === "annotation" ? pop.id : pop.kind}
          anchor={pop.anchor}
          current={current}
          actions={actions}
          quotedIn={quotedIn}
          onOpenBacklink={(s) => {
            passage.openBacklink(s);
            setPop(null);
          }}
          onClose={closePop}
          startCommenting={pop.kind === "note"}
        />
      )}
    </div>
  );
}

/** The first page whose text contains the passage (whitespace ignored). */
async function findPageOf(doc: PDFDocumentProxy, quote: string): Promise<number | null> {
  const want = quote.replace(/\s+/g, "").toLowerCase();
  if (!want) return null;
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    const text = tc.items
      .map((it) => ("str" in it ? it.str : ""))
      .join("")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (text.includes(want)) return i;
  }
  return null;
}

function IconButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "grid size-8 place-items-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-surface-300 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent pointer-coarse:size-11",
        pressed && "bg-surface-300 text-ink",
      )}
    >
      {children}
    </button>
  );
}

function PdfPage({
  pdfjs,
  doc,
  page,
  ratio,
  onVisible,
  annotations,
  tool,
  color,
  onDraw,
}: {
  pdfjs: PdfJs;
  doc: PDFDocumentProxy;
  page: number;
  ratio: number;
  onVisible: (page: number) => void;
  annotations: AnnotationDto[];
  tool: PdfTool;
  color: AnnotationColor;
  onDraw: (payload: AnnotationPayload) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  // Draw once the page is within a screen of the view.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setNear(true);
      },
      { rootMargin: "100% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Report the page as current when most of it is visible.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) onVisible(page);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [page, onVisible]);

  // The text layer scales with the page through one CSS variable (pdf.js 6), so a resized
  // panel needs no new text layer.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let baseWidth = 0;
    void doc.getPage(page).then((p) => {
      baseWidth = p.getViewport({ scale: 1 }).width;
      el.style.setProperty("--total-scale-factor", String(el.clientWidth / baseWidth));
    });
    const ro = new ResizeObserver(() => {
      if (baseWidth) el.style.setProperty("--total-scale-factor", String(el.clientWidth / baseWidth));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc, page]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: { cancel(): void; promise: Promise<void> } | null = null;
    let text: { cancel(): void } | null = null;
    (async () => {
      const el = box.current;
      const cv = canvas.current;
      const tl = textLayer.current;
      if (!el || !cv || !tl) return;
      const p = await doc.getPage(page);
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const viewport = p.getViewport({ scale: (el.clientWidth * dpr) / base.width });
      cv.width = Math.floor(viewport.width);
      cv.height = Math.floor(viewport.height);
      task = p.render({ canvas: cv, viewport });
      tl.replaceChildren();
      const layer = new pdfjs.TextLayer({
        textContentSource: p.streamTextContent(),
        container: tl,
        viewport: base,
      });
      text = layer;
      await Promise.all([task.promise.catch(() => {}), layer.render().catch(() => {})]);
      if (cancelled) return;
      // A drag that leaves the text keeps selecting text, not the whole page.
      const end = document.createElement("div");
      end.className = "endOfContent";
      tl.append(end);
      tl.dataset.ready = "true";
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      text?.cancel();
    };
  }, [near, doc, page, pdfjs]);

  return (
    <div
      ref={box}
      id={pageAnchor(page)}
      data-pdf-page={page}
      className="pdf-page relative w-full scroll-mt-4 overflow-hidden rounded-lg border border-border-subtle bg-surface-200 shadow-hearth-sm transition-colors"
      style={{ aspectRatio: ratio }}
      aria-label={`Page ${page}`}
      role="region"
    >
      <canvas ref={canvas} className="block h-full w-full" aria-hidden="true" />
      <PdfOverlay
        page={page}
        ratio={ratio}
        annotations={annotations}
        tool={tool}
        color={color}
        onDraw={onDraw}
      />
      <div
        ref={textLayer}
        className="pdf-text-layer"
        onPointerDown={(e) => e.currentTarget.classList.add("selecting")}
        onPointerUp={(e) => e.currentTarget.classList.remove("selecting")}
      />
    </div>
  );
}
