import { getSpaceOverview, type SpaceId } from "@thoth/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppShell } from "@/app/_components/app-shell";
import { listExamsAction } from "@/features/quiz/exam/actions";
import { ExamsPanel } from "@/features/quiz/exam/exams-panel";
import { SpaceContents } from "@/features/spaces/space-contents";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Space" };

/** /spaces/[id]: the contents of a space and its exams (ADR-0018). */
export default function SpacePage({ params }: PageProps<"/spaces/[id]">) {
  return (
    <Suspense fallback={<div className="h-dvh animate-pulse bg-surface-100" />}>
      <AppShell>
        <div className="mx-auto flex max-w-3xl flex-col gap-12">
          <Space params={params} />
        </div>
      </AppShell>
    </Suspense>
  );
}

async function Space({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const spaceId = (await params).id as SpaceId;
  const c = await getContainer();
  const r = await getSpaceOverview(c, spaceId);
  if (!r.ok) notFound();
  const { space, contents, available } = r.value;
  const item = (x: (typeof contents)[number]) => ({ id: x.id, title: x.title, kind: x.kind });
  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="type-overline text-ink-muted">Space</p>
        <h1 className="type-display-lg text-ink">{space.name}</h1>
        {space.description && <p className="text-ink-muted">{space.description}</p>}
      </header>
      <SpaceContents
        spaceId={space.id}
        contents={contents.map(item)}
        available={available.map(item)}
      />
      <ExamsPanel
        spaceId={space.id}
        contents={contents
          .filter((x) => x.status === "ready")
          .map((x) => ({ id: x.id, title: x.title }))}
        initial={await listExamsAction(space.id)}
      />
    </>
  );
}
