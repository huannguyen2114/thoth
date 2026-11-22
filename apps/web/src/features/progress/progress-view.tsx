import { getProgress, type Progress, type TopicProgress } from "@thoth/core";
import { cx } from "@thoth/ui";
import Link from "next/link";
import { connection } from "next/server";
import { CountUp } from "@/app/_components/motion/primitives";
import { Ring } from "@/app/_components/motion/ring";
import { getContainer } from "@/server/container";
import { PracticeButton } from "./practice-button";

/** Server Component: progress computed on read (ADR-0018). */
export async function ProgressView() {
  await connection();
  const p: Progress = await getProgress(await getContainer(), new Date());

  return (
    <div className="flex flex-col gap-12">
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat tone="tone-sky" label="Questions answered" value={String(p.answered)} />
        <Stat
          tone="tone-sage"
          label="Average score"
          value={p.accuracy === null ? "None yet" : `${Math.round(p.accuracy * 100)}%`}
          ring={p.accuracy}
        />
        <Stat
          tone="tone-peach"
          label="Cards due"
          value={String(p.cardsDue)}
          action={p.cardsDue > 0 ? { href: "/review", label: "Review now" } : undefined}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="type-heading-2 text-ink">Weak spots</h2>
        {p.answered === 0 ? (
          <Empty text="Take a quiz or an exam and your weakest topics show up here." />
        ) : p.weak.length === 0 ? (
          <Empty text="No weak spots right now. Every topic you have answered scores 80% or more." />
        ) : (
          <TopicList topics={p.weak} practice />
        )}
      </section>

      {p.topics.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="type-heading-2 text-ink">All topics</h2>
          <TopicList topics={p.topics} />
        </section>
      )}
    </div>
  );
}

/** A tinted number tile (ADR-0047): whole numbers count up, a score fills its ring. */
function Stat({
  label,
  value,
  action,
  tone,
  ring,
}: {
  label: string;
  value: string;
  action?: { href: string; label: string } | undefined;
  tone: string;
  ring?: number | null;
}) {
  return (
    <div className={cx("flex items-center justify-between gap-3 rounded-xl p-5", tone)}>
      <div className="flex flex-col gap-1">
        <span className="type-caption opacity-80">{label}</span>
        <span className="type-display-lg tabular-nums">
          {/^\d+$/.test(value) ? <CountUp value={Number(value)} /> : value}
        </span>
        {action && (
          <Link href={action.href} className="type-label underline-offset-4 hover:underline">
            {action.label}
          </Link>
        )}
      </div>
      {typeof ring === "number" && <Ring value={ring} />}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-200 p-6">
      <p className="text-ink-muted">{text}</p>
    </div>
  );
}

function TopicList({ topics, practice = false }: { topics: TopicProgress[]; practice?: boolean }) {
  return (
    <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
      {topics.map((t) => (
        <li
          key={`${t.contentId}-${t.topic}`}
          className="flex flex-wrap items-center gap-4 px-4 py-3"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="type-body-strong text-ink">{t.topic}</span>
            <Link href={`/content/${t.contentId}`} className="truncate type-caption text-ink-muted">
              {t.contentTitle}
            </Link>
            <div className="h-2 rounded-pill bg-neutral-tint" aria-hidden="true">
              <div
                className={cx(
                  "h-2 rounded-pill",
                  t.score >= 0.8 ? "bg-success" : t.score >= 0.5 ? "bg-warning" : "bg-danger",
                )}
                style={{ width: `${Math.max(4, t.score * 100)}%` }}
              />
            </div>
          </div>
          <span className="type-label text-ink tabular-nums">
            {Math.round(t.score * 100)}%
            <span className="type-caption text-ink-muted"> · {t.answered} answered</span>
          </span>
          {practice && <PracticeButton contentId={t.contentId} topic={t.topic} />}
        </li>
      ))}
    </ul>
  );
}
