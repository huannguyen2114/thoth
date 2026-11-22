import { listRecentContents } from "@thoth/core";
import Link from "next/link";
import { connection } from "next/server";
import { KindIcon, kindLabels } from "@/features/library/icons";
import { getContainer } from "@/server/container";

/**
 * The Modern home's "Continue learning" row (ADR-0050): the three newest ready sources as quiet
 * cards. Hearth shows the at-a-glance strip instead.
 */
export async function ContinueLearning() {
  await connection();
  const ready = (await listRecentContents(await getContainer(), 12))
    .filter((c) => c.status === "ready")
    .slice(0, 3);
  if (ready.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="continue-heading">
      <h2 id="continue-heading" className="type-heading-3 text-ink">
        Continue learning
      </h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {ready.map((c) => (
          <li key={c.id}>
            <Link
              href={`/content/${c.id}`}
              className="continue-card flex h-full flex-col gap-3 rounded-xl border border-border-subtle bg-surface-200 p-3 text-ink no-underline"
            >
              <span className="flex h-20 items-end rounded-lg bg-surface-300 p-2">
                <span className="flex items-center gap-1 rounded-pill bg-surface-200 px-2 py-0.5 type-caption text-ink-muted">
                  <KindIcon kind={c.kind} />
                  {kindLabels[c.kind]}
                </span>
              </span>
              <span className="type-label line-clamp-2 px-0.5">{c.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
