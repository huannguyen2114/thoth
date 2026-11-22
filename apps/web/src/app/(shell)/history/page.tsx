import type { Metadata } from "next";
import { AppPage } from "@/app/_components/app-shell";
import { PageHeader } from "@/app/_components/page-header";
import { HistoryIcon } from "@/features/history/history-icon";
import { HistoryView } from "@/features/history/history-view";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <AppPage>
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <PageHeader
          icon={<HistoryIcon />}
          tone="tone-lilac"
          title="History"
          sub="Everything you studied, newest first."
        />
        <HistoryView />
      </div>
    </AppPage>
  );
}
