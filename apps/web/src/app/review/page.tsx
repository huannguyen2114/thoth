import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DueToday } from "@/features/flashcards/due-today";
import { AppShell } from "../_components/app-shell";

export const metadata: Metadata = { title: "Due today" };

export default function ReviewPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="type-display-lg text-ink">Due today</h1>
          <p className="text-ink-muted">Cards from every deck that are ready to review.</p>
        </header>
        <Suspense
          fallback={
            <div className="h-64 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />
          }
        >
          <DueSession />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function DueSession() {
  await connection();
  return <DueToday />;
}
