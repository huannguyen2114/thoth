import type { Metadata } from "next";
import { Suspense } from "react";
import { ProgressView } from "@/features/progress/progress-view";
import { AppShell } from "../_components/app-shell";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="type-display-lg text-ink">Progress</h1>
          <p className="text-ink-muted">Your quiz and exam results by topic, weakest first.</p>
        </header>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-surface-300" />}>
          <ProgressView />
        </Suspense>
      </div>
    </AppShell>
  );
}
