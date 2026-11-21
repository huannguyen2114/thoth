"use client";

import { citationToken, parseLink } from "@thoth/core";
import Link from "next/link";

/**
 * A `thoth:` link as a chip (ADR-0038, doc 22). Until Lane 3's `ThothLink` lands this is the
 * space chat's own small chip; the orchestrator swaps it at merge. A content link opens the
 * content at the cited page, time or paragraph (`/content/<id>?at=[p.3]`).
 */
export function SpaceLinkChip({ href, label }: { href: string; label: string }) {
  const r = parseLink(href);
  const target = r.ok ? hrefFor(r.value) : null;
  const className =
    "type-caption mx-0.5 inline-flex max-w-full items-baseline gap-1 rounded-sm bg-neutral-tint px-1.5 align-baseline text-ink-muted no-underline transition-colors hover:bg-accent-tint hover:text-accent-text";
  if (!target) {
    return (
      <span className={className} title="This link no longer points anywhere.">
        <s>{label}</s>
      </span>
    );
  }
  return (
    <Link href={target} className={className} title={`Open ${label}`}>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function hrefFor(anchor: Extract<ReturnType<typeof parseLink>, { ok: true }>["value"]): string {
  switch (anchor.kind) {
    case "content": {
      const at = anchor.locator ? `?at=${encodeURIComponent(citationToken(anchor.locator))}` : "";
      return `/content/${anchor.contentId}${at}`;
    }
    case "space":
      return `/spaces/${anchor.spaceId}`;
    case "set":
    case "annotation":
      // Opened by Lane 3's chip; here they fall back to nothing better than the home page.
      return "/";
  }
}
