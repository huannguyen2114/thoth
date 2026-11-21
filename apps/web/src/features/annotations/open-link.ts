"use client";

import {
  type CitationRef,
  type Locator,
  locatorParam,
  parseLink,
  type ResolvedLink,
} from "@thoth/core";
import type { JumpTarget } from "@/features/content-viewer/viewer-context";
import { resolveLinkAction } from "./actions";
import { annotationStore } from "./store";

/** The jump for a stored locator. Paragraph locators carry their 1-based number (ADR-0019). */
export function refOfLocator(l: Locator | null | undefined): CitationRef | null {
  if (!l) return null;
  if (l.type === "page") return { type: "page", page: l.page };
  if (l.type === "time") return { type: "time", sec: l.startSec };
  return l.paragraph ? { type: "paragraph", index: l.paragraph } : null;
}

/** `/content/<id>?…` for a link into another content. The content page reads these (doc 21). */
export function contentHref(r: ResolvedLink): string {
  switch (r.kind) {
    case "content": {
      const q = new URLSearchParams();
      if (r.locator) q.set("at", locatorParam(r.locator));
      if (r.quote) q.set("q", r.quote);
      const s = q.toString();
      return `/content/${r.contentId}${s ? `?${s}` : ""}`;
    }
    case "annotation":
      return `/content/${r.contentId}?ann=${encodeURIComponent(r.annotationId)}`;
    case "set": {
      const q = new URLSearchParams({ set: r.setId });
      if (r.quote) q.set("q", r.quote);
      return `/content/${r.contentId}?${q}`;
    }
    case "space":
      return `/spaces/${r.spaceId}`;
  }
}

/** The viewer jump for a link into the content on screen. */
export function jumpOf(r: ResolvedLink): JumpTarget | null {
  switch (r.kind) {
    case "content":
      return r.quote
        ? { kind: "quote", quote: r.quote, near: refOfLocator(r.locator) }
        : r.locator
          ? { kind: "cite", ref: refOfLocator(r.locator) ?? { type: "page", page: 1 } }
          : null;
    case "annotation":
      return { kind: "annotation", id: r.annotationId, near: refOfLocator(r.locator) };
    case "set":
      return { kind: "set", setId: r.setId, quote: r.quote };
    case "space":
      return null;
  }
}

export interface OpenLinkContext {
  /** The content on screen, or null on a page without one (a space). */
  contentId: string | null;
  /** Jumps the viewer on screen. Absent outside the content page. */
  jumpTo?: ((t: JumpTarget) => void) | undefined;
  navigate: (href: string) => void;
}

/**
 * Opens a `thoth:` link chip: a jump when it points into the content on screen, otherwise a
 * page change. Resolves to an error message when the target is gone (a broken chip).
 */
export async function openThothLink(href: string, ctx: OpenLinkContext): Promise<string | null> {
  const parsed = parseLink(href);
  if (!parsed.ok) return "This link is not valid.";
  const a = parsed.value;

  // Fast paths that need no server round trip.
  if (a.kind === "content" && a.contentId === ctx.contentId && ctx.jumpTo) {
    const t = jumpOf({
      kind: "content",
      contentId: a.contentId,
      title: "",
      locator: a.locator,
      ...(a.quote ? { quote: a.quote.exact } : {}),
    });
    if (t) ctx.jumpTo(t);
    return null;
  }
  if (a.kind === "annotation" && ctx.contentId && ctx.jumpTo) {
    const local = annotationStore(ctx.contentId).state.items.find((x) => x.id === a.annotationId);
    if (local) {
      ctx.jumpTo({ kind: "annotation", id: local.id, near: refOfLocator(local.anchor.locator) });
      return null;
    }
  }

  const r = await resolveLinkAction(href).catch(() => null);
  if (!r) return "Could not reach the server.";
  if (!r.ok) return r.error;
  const target = r.value;
  if (target.kind !== "space" && target.contentId === ctx.contentId && ctx.jumpTo) {
    const t = jumpOf(target);
    if (t) ctx.jumpTo(t);
    return null;
  }
  ctx.navigate(contentHref(target));
  return null;
}
