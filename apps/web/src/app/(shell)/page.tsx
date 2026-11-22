import { listRecentContents } from "@thoth/core";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppPage } from "@/app/_components/app-shell";
import { Reveal } from "@/app/_components/motion/primitives";
import { Habits } from "@/features/habits/heatmap";
import { ContinueLearning } from "@/features/home/continue-learning";
import { TodayStrip } from "@/features/home/today-strip";
import { AddContentComposer } from "@/features/library/add-content-composer";
import { RecentsList, RecentsListSkeleton } from "@/features/library/recents-list";
import { TodayCard } from "@/features/planner/today-card";
import { CreateSpaceForm } from "@/features/spaces/create-space-form";
import { SpacesList, SpacesListSkeleton } from "@/features/spaces/spaces-list";
import { getContainer } from "@/server/container";

/** The newest ready content, for the strip's Continue tile. */
async function Strip() {
  await connection();
  const [last] = (await listRecentContents(await getContainer(), 10)).filter(
    (c) => c.status === "ready",
  );
  return <TodayStrip last={last ? { id: last.id, title: last.title } : null} />;
}

/**
 * Home. Hearth (ADR-0047): a warm greeting with the composer, today at a glance, then your
 * library. Modern (ADR-0050): one question and the composer first, like a chat app, then
 * continue learning and the library. `hearth-only` and `modern-only` pick the parts by look.
 */
export default function HomePage() {
  return (
    <AppPage>
      <div className="home mx-auto flex max-w-4xl flex-col gap-12">
        <section className="home-hero relative flex flex-col items-center gap-6 pt-6 text-center">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-10 h-72">
            <div className="glow glow--accent top-0 left-1/4 size-72" />
            <div className="glow glow--peach top-6 right-1/4 size-64" />
          </div>
          <h1 className="hearth-only relative type-hero-sm text-balance text-ink">
            What should we learn?
          </h1>
          <h1 className="modern-only relative type-hero-sm text-balance text-ink">
            What do you want to learn today?
          </h1>
          <p className="hearth-only relative type-body-lg max-w-xl text-ink-muted">
            Add a lecture, a PDF or a web page. Thoth turns it into chapters, answers with
            citations, notes, quizzes and flashcards.
          </p>
          <div className="home-composer glass relative w-full rounded-xl p-4 text-left">
            <AddContentComposer />
          </div>
        </section>

        <div className="modern-only">
          <Suspense fallback={null}>
            <ContinueLearning />
          </Suspense>
        </div>

        <div className="hearth-only flex flex-col gap-12">
          <Suspense
            fallback={<div className="h-28 rounded-xl bg-surface-300" aria-hidden="true" />}
          >
            <Strip />
          </Suspense>
          <TodayCard />
          <Reveal>
            <section className="flex flex-col gap-3" aria-label="Study activity">
              <Habits compact />
            </section>
          </Reveal>
        </div>

        <Reveal>
          <section className="flex flex-col gap-4" aria-labelledby="recents-heading">
            <h2 id="recents-heading" className="type-heading-1 text-ink">
              Recents
            </h2>
            <Suspense fallback={<RecentsListSkeleton />}>
              <RecentsList />
            </Suspense>
          </section>
        </Reveal>

        <Reveal>
          <section className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-4">
              <h2 className="type-heading-1 text-ink">Spaces</h2>
            </div>
            <CreateSpaceForm />
            <Suspense fallback={<SpacesListSkeleton />}>
              <SpacesList />
            </Suspense>
          </section>
        </Reveal>
      </div>
    </AppPage>
  );
}
