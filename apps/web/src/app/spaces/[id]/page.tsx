import {
  getSpaceOverview,
  listSpaceChats,
  listSpaces,
  listTags,
  type SpaceId,
  tagsByContent,
} from "@thoth/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppShell } from "@/app/_components/app-shell";
import { SpaceChat } from "@/features/chat/space-chat-view";
import { RefreshWhileBusy } from "@/features/library/refresh-while-busy";
import { NotesEditor } from "@/features/notes/tool";
import { listExamsAction } from "@/features/quiz/exam/actions";
import { ExamsPanel } from "@/features/quiz/exam/exams-panel";
import { SpaceContents } from "@/features/spaces/space-contents";
import { SpaceHeader } from "@/features/spaces/space-header";
import { isSpaceTab } from "@/features/spaces/space-tabs";
import { SpaceWorkspace } from "@/features/spaces/space-workspace";
import { SpaceWhiteboard } from "@/features/whiteboard/tool";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Space" };

/**
 * /spaces/[id]: the space workspace (doc 22): Overview, Chat, Notes, Board, Contents, Exams.
 * `?tab=` picks the tab. A full-screen page (`bleed`) so Chat, Notes and Board fill the height.
 */
export default function SpacePage({ params, searchParams }: PageProps<"/spaces/[id]">) {
  return (
    <Suspense fallback={<SpaceSkeleton />}>
      <AppShell bleed>
        <div className="h-full contain-inline-size">
          <Space params={params} searchParams={searchParams} />
        </div>
      </AppShell>
    </Suspense>
  );
}

async function Space({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const spaceId = (await params).id as SpaceId;
  const tab = (await searchParams).tab;
  const c = await getContainer();
  const r = await getSpaceOverview(c, spaceId);
  if (!r.ok) notFound();
  const { space, contents, available } = r.value;
  const [chats, spaces, tags, byContent, exams] = await Promise.all([
    listSpaceChats(c, spaceId),
    listSpaces(c),
    listTags(c),
    tagsByContent(c),
    listExamsAction(space.id),
  ]);
  const ready = contents.filter((x) => x.status === "ready");
  const busy = contents.some((x) => x.status === "pending" || x.status === "processing");
  const readyList = ready.map((x) => ({ id: x.id, title: x.title }));

  return (
    <>
      <RefreshWhileBusy busy={busy} />
      <SpaceWorkspace
        spaceId={space.id}
        initialTab={isSpaceTab(tab) ? tab : "overview"}
        header={
          <SpaceHeader
            space={{
              id: space.id,
              name: space.name,
              description: space.description,
              color: space.color,
              icon: space.icon,
            }}
          />
        }
        panels={{
          chat: (
            <SpaceChat
              spaceId={space.id}
              readyCount={ready.length}
              initialChats={chats.map((x) => ({
                id: x.id,
                title: x.title,
                instructions: x.instructions,
              }))}
            />
          ),
          notes: (
            <div className="h-full rounded-lg border border-border-subtle bg-surface-200 p-4">
              <NotesEditor ownerKey={`space:${space.id}`} />
            </div>
          ),
          board: <SpaceWhiteboard spaceId={space.id} contents={readyList} />,
          contents: (
            <SpaceContents
              spaceId={space.id}
              contents={contents.map((x) => ({
                id: x.id,
                title: x.title,
                kind: x.kind,
                status: x.status,
                tags: byContent.get(x.id) ?? [],
              }))}
              available={available.map((x) => ({ id: x.id, title: x.title }))}
              spaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
              tags={tags}
            />
          ),
          exams: <ExamsPanel spaceId={space.id} contents={readyList} initial={exams} />,
        }}
      />
    </>
  );
}

function SpaceSkeleton() {
  return (
    <div
      className="flex h-dvh flex-col gap-4 p-8"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="h-10 w-1/2 animate-pulse rounded-md bg-surface-300" />
      <div className="h-8 w-2/3 animate-pulse rounded-md bg-surface-300" />
      <div className="h-64 w-full animate-pulse rounded-lg bg-surface-300" />
    </div>
  );
}
