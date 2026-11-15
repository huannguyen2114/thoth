import { Suspense } from "react";
import { CreateSpaceForm } from "@/features/spaces/create-space-form";
import { SpacesList, SpacesListSkeleton } from "@/features/spaces/spaces-list";
import { AppShell } from "./_components/app-shell";

export default function HomePage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-12">
        <section className="flex flex-col items-center gap-6 pt-8 text-center">
          <h1 className="type-display-lg text-ink">What should we learn?</h1>
          <div className="composer w-full">
            <input
              className="composer__input"
              placeholder="Paste a YouTube link, upload a PDF, or ask anything"
              aria-label="Add learning material"
              disabled
            />
          </div>
          <p className="type-caption text-ink-muted">Uploads arrive in Phase 2.</p>
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
