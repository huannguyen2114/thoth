import type { ContentId } from "@thoth/core";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DevToolsHarness } from "./harness";

/**
 * Dev-only harness: renders every Learn tool for one content, outside the real Learn panel.
 * Lanes C and D test here before Lane B ships the content page. Try /dev/tools/sample-pdf.
 */
export default function DevToolsPage({ params }: PageProps<"/dev/tools/[contentId]">) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <h1 className="type-heading-1 text-ink">Learn tools harness</h1>
      <Suspense fallback={<p className="text-ink-muted">Loading</p>}>
        <Tools params={params} />
      </Suspense>
    </main>
  );
}

async function Tools({ params }: { params: Promise<{ contentId: string }> }) {
  await connection();
  if (process.env.NODE_ENV === "production") notFound();
  const { contentId } = await params;
  return <DevToolsHarness contentId={contentId as ContentId} />;
}
