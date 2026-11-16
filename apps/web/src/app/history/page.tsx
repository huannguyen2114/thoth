import type { Metadata } from "next";
import { HistoryView } from "@/features/history/history-view";
import { AppShell } from "../_components/app-shell";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="type-display-lg text-ink">History</h1>
          <p className="text-ink-muted">Everything you studied, newest first.</p>
        </header>
        <HistoryView />
      </div>
    </AppShell>
  );
}
