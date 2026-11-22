import type { Metadata } from "next";
import { Suspense } from "react";
import { AppPage } from "@/app/_components/app-shell";
import { ChartIcon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { Habits } from "@/features/habits/heatmap";
import { ProgressView } from "@/features/progress/progress-view";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <AppPage>
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <PageHeader
          icon={<ChartIcon />}
          tone="tone-sage"
          title="Progress"
          sub="Your quiz and exam results by topic, weakest first."
        />
        <section className="flex flex-col gap-4" aria-labelledby="habits-heading">
          <h2 id="habits-heading" className="type-heading-2 text-ink">
            Study habits
          </h2>
          <Habits />
        </section>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-surface-300" />}>
          <ProgressView />
        </Suspense>
      </div>
    </AppPage>
  );
}
