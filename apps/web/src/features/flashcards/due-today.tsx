import { listDueCards } from "@thoth/core";
import Link from "next/link";
import { getContainer } from "@/server/container";
import { ReviewSession } from "./review-session";

/** Server Component: reads the due cards, then hands them to the shared review UI. */
export async function DueToday() {
  const c = await getContainer();
  const due = await listDueCards({ flashcards: c.flashcards, studySets: c.studySets });
  if (due.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border-subtle bg-surface-200 p-6">
        <h2 className="type-heading-3 text-ink">Nothing due</h2>
        <p className="text-ink-muted">
          You are all caught up. Open a lecture or PDF and generate flashcards to start a deck.
        </p>
        <Link href="/" className="btn btn--secondary">
          Browse your library
        </Link>
      </div>
    );
  }
  return <ReviewSession cards={due} />;
}
