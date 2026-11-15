"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import { pageAnchor } from "./text-viewer";
import { flash, useViewer } from "./viewer-context";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; doc: PDFDocumentProxy; pages: { page: number; ratio: number }[] }
  | { status: "error" };

/**
 * A stored PDF rendered with pdf.js, one canvas per page, drawn only when the page scrolls
 * near the view. Registers `showPage` with the viewer for `[p.N]` citations.
 */
export function PdfViewer({ url }: { url: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const { register, setPosition } = useViewer();
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
        if (!cancelled) setState({ status: "ready", doc, pages });
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

  useEffect(() => {
    register({
      showPage: (page) => {
        const el = document.getElementById(pageAnchor(page));
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        flash(el, "ring");
      },
    });
    return () => register(null);
  }, [register]);

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
  return (
    <div className="flex flex-col gap-4">
      {state.pages.map(({ page, ratio }) => (
        <PdfPage key={page} doc={state.doc} page={page} ratio={ratio} onVisible={onVisible} />
      ))}
    </div>
  );
}

function PdfPage({
  doc,
  page,
  ratio,
  onVisible,
}: {
  doc: PDFDocumentProxy;
  page: number;
  ratio: number;
  onVisible: (page: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: { cancel(): void; promise: Promise<void> } | null = null;
    (async () => {
      const el = box.current;
      const cv = canvas.current;
      if (!el || !cv) return;
      const p = await doc.getPage(page);
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const viewport = p.getViewport({ scale: (el.clientWidth * dpr) / base.width });
      cv.width = Math.floor(viewport.width);
      cv.height = Math.floor(viewport.height);
      task = p.render({ canvas: cv, viewport });
      await task.promise.catch(() => {});
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, doc, page]);

  return (
    <div
      ref={box}
      id={pageAnchor(page)}
      className="relative w-full scroll-mt-4 overflow-hidden rounded-lg border border-border-subtle bg-surface-200 shadow-hearth-sm transition-colors"
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label={`Page ${page}`}
    >
      <canvas ref={canvas} className="block h-full w-full" />
    </div>
  );
}
