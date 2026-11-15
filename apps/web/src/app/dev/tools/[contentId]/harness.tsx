"use client";

import type { ContentId } from "@thoth/core";
import { useState } from "react";
import { learnTools } from "@/features/learn-panel/registry";

export function DevToolsHarness({ contentId }: { contentId: ContentId }) {
  const [lastCite, setLastCite] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-8">
      <p className="type-caption text-ink-muted">
        Content: <code className="code">{contentId}</code>
        {lastCite && <> · last citation clicked: {lastCite}</>}
      </p>
      {learnTools.map((tool) => (
        <section key={tool.id} className="flex flex-col gap-3">
          <h2 className="type-overline text-ink-muted">{tool.label}</h2>
          <tool.Panel contentId={contentId} onCite={setLastCite} />
        </section>
      ))}
    </div>
  );
}
