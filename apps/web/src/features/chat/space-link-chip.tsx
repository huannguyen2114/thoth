"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { openThothLink } from "@/features/annotations/open-link";
import { BROKEN_CHIP_CLASS, cleanLabel, LINK_CHIP_CLASS } from "@/features/notes/editor/thoth-link";

/**
 * A `thoth:` link in a space chat answer (ADR-0038, ADR-0039, doc 22). It looks and opens like
 * the notes editor's `ThothLink` chip: `openThothLink` resolves the target and opens the content
 * at the cited page, time, paragraph, highlight or summary passage. A gone target turns the chip
 * into a struck-through one with the reason as its tooltip.
 */
export function SpaceLinkChip({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const [broken, setBroken] = useState<string | null>(null);
  const text = cleanLabel(label);
  if (broken) {
    return (
      <span className={BROKEN_CHIP_CLASS} title={broken}>
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={LINK_CHIP_CLASS}
      title={`Open ${text}`}
      onClick={async () => {
        const error = await openThothLink(href, { contentId: null, navigate: router.push });
        if (error) setBroken(error);
      }}
    >
      {text}
    </button>
  );
}
