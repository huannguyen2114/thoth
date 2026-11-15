"use client";

import type { ContentId } from "@thoth/core";
import { Button } from "@thoth/ui";
import Link from "next/link";
import { useState, useTransition } from "react";
import { practiceWeakSpotAction } from "./actions";

export function PracticeButton({ contentId, topic }: { contentId: ContentId; topic: string }) {
  const [state, setState] = useState<"idle" | "started" | { error: string }>("idle");
  const [pending, start] = useTransition();
  if (state === "started") {
    return (
      <Link href={`/content/${contentId}`} className="type-label text-accent-text">
        Quiz being written. Open it
      </Link>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        onClick={() =>
          start(async () => {
            const r = await practiceWeakSpotAction(contentId, topic);
            setState(r.ok ? "started" : { error: r.error });
          })
        }
        disabled={pending}
      >
        {pending ? "Starting" : "Practice"}
      </Button>
      {typeof state === "object" && <span className="type-caption text-danger">{state.error}</span>}
    </div>
  );
}
