import { type ContentId, listChats } from "@thoth/core";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppPage } from "@/app/_components/app-shell";
import { ContentWorkspace } from "@/features/workspace/content-workspace";
import { getContainer } from "@/server/container";

/**
 * /content/[id]: the content page. Sidebar (the shell layout), source viewer with Chapters and
 * Transcript, and the Learn panel with chat. See docs/technical_design/07-content-page-and-chat.md.
 */
export default function ContentPage({ params, searchParams }: PageProps<"/content/[id]">) {
  // The Suspense boundary wraps the page body; the workspace reads search params, which are
  // runtime data on a dynamic route and must not block the prerendered shell.
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <AppPage bleed>
        {/* contain-inline-size stops long nowrap content (the title) from widening the main column. */}
        <div className="h-full contain-inline-size">
          <Workspace params={params} searchParams={searchParams} />
        </div>
      </AppPage>
    </Suspense>
  );
}

async function Workspace({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const id = (await params).id as ContentId;
  const at = (await searchParams).at;
  const c = await getContainer();
  const content = await c.contents.get(id);
  if (!content) notFound();
  const [segments, chapters, chats] = await Promise.all([
    c.segments.listByContent(id),
    c.chapters.listByContent(id),
    listChats(c, id),
  ]);
  return (
    <ContentWorkspace
      content={content}
      segments={segments}
      chapters={chapters}
      chats={chats.map((x) => ({ id: x.id, title: x.title, instructions: x.instructions }))}
      initialCite={typeof at === "string" ? at : undefined}
    />
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="flex h-dvh gap-4 p-4" role="status" aria-busy="true" aria-label="Loading">
      <div className="flex flex-1 flex-col gap-4">
        <div className="h-8 w-2/3 animate-pulse rounded-md bg-surface-300" />
        <div className="aspect-video w-full animate-pulse rounded-lg bg-surface-300" />
      </div>
      <div className="hidden w-96 animate-pulse rounded-lg bg-surface-300 lg:block" />
    </div>
  );
}
