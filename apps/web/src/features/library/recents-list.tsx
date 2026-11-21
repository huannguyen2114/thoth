import { type Content, listRecentContents, listTags, type Tag, tagsByContent } from "@thoth/core";
import Link from "next/link";
import { connection } from "next/server";
import { getContainer } from "@/server/container";
import { retryContentAction } from "./actions";
import { KindIcon, kindLabels } from "./icons";
import { RefreshWhileBusy } from "./refresh-while-busy";
import { StatusBadge } from "./status-badge";
import { TagButton, TagChip, TagFilteredList } from "./tags";

/** Server Component: the newest contents with live status (refreshes while any is busy). */
export async function RecentsList() {
  await connection();
  const c = await getContainer();
  const [contents, tags, byContent] = await Promise.all([
    listRecentContents(c, 20),
    listTags(c),
    tagsByContent(c),
  ]);

  if (contents.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-200 p-6">
        <h3 className="type-heading-3 text-ink">Nothing here yet</h3>
        <p className="mt-1 text-ink-muted">
          Add a link, a PDF or some text above to start learning.
        </p>
      </div>
    );
  }

  const busy = contents.some((c) => c.status === "pending" || c.status === "processing");
  return (
    <>
      <RefreshWhileBusy busy={busy} />
      <TagFilteredList
        tags={tags}
        items={contents.map((x) => {
          const own = byContent.get(x.id) ?? [];
          return {
            id: x.id,
            title: x.title,
            tagIds: own.map((t) => t.id),
            node: <RecentItem content={x} tags={own} allTags={tags} />,
          };
        })}
      />
    </>
  );
}

function RecentItem({
  content: c,
  tags,
  allTags,
}: {
  content: Content;
  tags: Tag[];
  allTags: Tag[];
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-1 text-ink-muted" title={kindLabels[c.kind]}>
        <KindIcon kind={c.kind} />
        <span className="sr-only">{kindLabels[c.kind]}</span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          {c.status === "ready" ? (
            <Link
              href={`/content/${c.id}`}
              className="truncate type-body-strong text-ink no-underline hover:underline"
            >
              {c.title}
            </Link>
          ) : (
            <span className="truncate type-body-strong text-ink">{c.title}</span>
          )}
          <StatusBadge status={c.status} />
        </div>
        <p className="type-caption text-ink-muted">
          {kindLabels[c.kind]} · Added{" "}
          {c.createdAt.toLocaleDateString("en", { dateStyle: "medium" })}
        </p>
        {c.error && (
          <p
            className={
              c.status === "failed" ? "type-caption text-danger" : "type-caption text-ink-muted"
            }
          >
            {c.error}
          </p>
        )}
        {c.status === "failed" && (
          <form action={retryContentAction} className="mt-1">
            <input type="hidden" name="contentId" value={c.id} />
            <button type="submit" className="btn btn--secondary btn--sm">
              Try again
            </button>
          </form>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <TagChip key={t.id} tag={t} />
            ))}
          </div>
        )}
      </div>
      <TagButton contentId={c.id} title={c.title} assigned={tags} all={allTags} />
    </div>
  );
}

export function RecentsListSkeleton() {
  return <div className="h-40 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />;
}
