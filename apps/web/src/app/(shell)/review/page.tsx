import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppPage } from "@/app/_components/app-shell";
import { CardsIcon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { DueToday } from "@/features/flashcards/due-today";

export const metadata: Metadata = { title: "Due today" };

export default function ReviewPage() {
  return (
    <AppPage>
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <PageHeader
          icon={<CardsIcon />}
          tone="tone-sky"
          title="Due today"
          sub="Cards from every deck that are ready to review."
        />
        <Suspense
          fallback={
            <div className="h-64 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />
          }
        >
          <DueSession />
        </Suspense>
      </div>
    </AppPage>
  );
}

async function DueSession() {
  await connection();
  return <DueToday />;
}
