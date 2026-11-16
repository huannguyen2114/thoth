import { Suspense } from "react";
import { Habits } from "@/features/habits/heatmap";
import { AddContentComposer } from "@/features/library/add-content-composer";
import { RecentsList, RecentsListSkeleton } from "@/features/library/recents-list";
import { CreateSpaceForm } from "@/features/spaces/create-space-form";
import { SpacesList, SpacesListSkeleton } from "@/features/spaces/spaces-list";
import { AppShell } from "./_components/app-shell";

export default function HomePage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-12">
        <section className="flex flex-col items-center gap-6 pt-8 text-center">
          <h1 className="type-display-lg text-ink">What should we learn?</h1>
          <AddContentComposer />
        </section>

        <section className="flex flex-col gap-3" aria-label="Study activity">
          <Habits compact />
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="recents-heading">
          <h2 id="recents-heading" className="type-heading-2 text-ink">
            Recents
          </h2>
          <Suspense fallback={<RecentsListSkeleton />}>
            <RecentsList />
          </Suspense>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-4">
            <h2 className="type-heading-2 text-ink">Spaces</h2>
          </div>
          <CreateSpaceForm />
          <Suspense fallback={<SpacesListSkeleton />}>
            <SpacesList />
          </Suspense>
        </section>
      </div>
    </AppShell>
  );
}
