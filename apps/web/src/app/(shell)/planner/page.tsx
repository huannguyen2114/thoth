import { listRecentContents, listSpaces } from "@thoth/core";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppPage } from "@/app/_components/app-shell";
import { PlannerApp } from "@/features/planner/planner-app";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Planner" };

export default function PlannerPage() {
  return (
    <AppPage>
      <Suspense
        fallback={
          <div className="mx-auto h-64 max-w-5xl animate-pulse rounded-lg bg-surface-300" />
        }
      >
        <Planner />
      </Suspense>
    </AppPage>
  );
}

/** What a plan can cover: spaces, and every content that has finished processing. */
async function Planner() {
  await connection();
  const c = await getContainer();
  const [spaces, contents] = await Promise.all([listSpaces(c), listRecentContents(c, 500)]);
  return (
    <PlannerApp
      spaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
      contents={contents
        .filter((x) => x.status === "ready")
        .map((x) => ({ id: x.id, title: x.title, spaceId: x.spaceId }))}
    />
  );
}
