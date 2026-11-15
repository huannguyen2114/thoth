"use client";

import type { Chapter, Content, Segment } from "@thoth/core";
import { cx } from "@thoth/ui";
import { useCallback, useState } from "react";
import type { ChatSummary } from "@/features/chat/use-chat";
import { LearnPanel } from "@/features/learn-panel/learn-panel";
import { SourceOutline } from "./source-outline";
import { SourceViewer } from "./source-viewer";
import { Tabs } from "./tabs";
import { ViewerProvider } from "./viewer-context";

type MobileView = "source" | "learn";

/**
 * The content page body: source column (viewer + Chapters/Transcript) and the Learn panel.
 * From `lg` up they sit side by side; below it a Source | Learn switch shows one at a time,
 * and a citation click switches back to the source.
 */
export function ContentWorkspace({
  content,
  segments,
  chapters,
  chats,
}: {
  content: Content;
  segments: Segment[];
  chapters: Chapter[];
  chats: ChatSummary[];
}) {
  const [view, setView] = useState<MobileView>("source");
  const showSource = useCallback(() => setView("source"), []);
  const isVideo = content.kind === "youtube";

  return (
    <ViewerProvider onJump={showSource}>
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 flex-col gap-2 border-b border-border-subtle px-4 pt-4 lg:pb-3">
          <h1 className="type-heading-3 truncate text-ink" title={content.title}>
            {content.title}
          </h1>
          {content.status !== "ready" && <StatusNote content={content} />}
          <Tabs
            label="Page view"
            idPrefix="workspace"
            className="border-b-0 lg:hidden"
            items={[
              { id: "source", label: "Source" },
              { id: "learn", label: "Learn" },
            ]}
            selected={view}
            onSelect={setView}
          />
        </header>

        <div className="flex min-h-0 flex-1">
          <div
            id="workspace-panel-source"
            className={cx(
              "min-h-0 min-w-0 flex-1 flex-col gap-3 p-4",
              view === "source" ? "flex" : "hidden lg:flex",
            )}
          >
            {isVideo ? (
              <div className="shrink-0">
                <SourceViewer content={content} segments={segments} />
              </div>
            ) : (
              <div className="min-h-0 flex-3 overflow-y-auto pr-1">
                <SourceViewer content={content} segments={segments} />
              </div>
            )}
            <div className={cx("flex min-h-0 flex-col", isVideo ? "flex-1" : "flex-2")}>
              <SourceOutline kind={content.kind} chapters={chapters} segments={segments} />
            </div>
          </div>

          <aside
            id="workspace-panel-learn"
            aria-label="Learn panel"
            className={cx(
              "min-h-0 w-full flex-col border-border-subtle lg:w-96 lg:border-l xl:w-md 2xl:w-lg",
              view === "learn" ? "flex" : "hidden lg:flex",
            )}
          >
            <LearnPanel contentId={content.id} initialChats={chats} />
          </aside>
        </div>
      </div>
    </ViewerProvider>
  );
}

function StatusNote({ content }: { content: Content }) {
  if (content.status === "failed") {
    return (
      <div className="callout callout--danger max-w-none" role="alert">
        <div>
          <p className="callout__title">This source could not be processed.</p>
          <p className="callout__text">{content.error ?? "Add it again to retry."}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="callout callout--info max-w-none" role="note">
      <div>
        <p className="callout__title">Still processing.</p>
        <p className="callout__text">
          Chat and tools work once the text is ready. Reload in a moment.
        </p>
      </div>
    </div>
  );
}
