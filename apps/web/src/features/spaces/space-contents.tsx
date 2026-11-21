"use client";

import type { Tag } from "@thoth/core";
import { Button, Select } from "@thoth/ui";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AddContentComposer } from "@/features/library/add-content-composer";
import { TagButton, TagChip, TagFilteredList } from "@/features/library/tags";
import { moveContentAction } from "./actions";

export interface SpaceContentItem {
  id: string;
  title: string;
  kind: string;
  status: string;
  tags: Tag[];
}

/**
 * The space's Contents tab (doc 22): its contents with tags, "Move to…" another space (or drag
 * a row onto a space in the sidebar), add an existing content, and bulk add new ones here.
 */
export function SpaceContents({
  spaceId,
  contents,
  available,
  spaces,
  tags,
}: {
  spaceId: string;
  contents: SpaceContentItem[];
  available: { id: string; title: string }[];
  spaces: { id: string; name: string }[];
  tags: Tag[];
}) {
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{
    id: string;
    title: string;
    to: string;
    from: string | null;
  } | null>(null);
  const [pending, start] = useTransition();
  const others = spaces.filter((s) => s.id !== spaceId);
  const nameOf = (id: string | null) => spaces.find((s) => s.id === id)?.name ?? "no space";

  const move = (id: string, title: string, to: string | null) =>
    start(async () => {
      const r = await moveContentAction(id, to);
      if (!r.ok) return setError(r.error);
      setError(null);
      setPick("");
      setUndo(to === spaceId ? null : { id, title, to: nameOf(to), from: r.value.from });
    });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-labelledby="contents-heading">
        <h2 id="contents-heading" className="type-heading-2 text-ink">
          Contents
        </h2>
        {undo && (
          <div className="callout max-w-none" role="status">
            <div className="flex flex-wrap items-center gap-3">
              <p className="callout__text flex-1">
                Moved “{undo.title}” to {undo.to}.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  const u = undo;
                  setUndo(null);
                  start(async () => {
                    await moveContentAction(u.id, u.from);
                  });
                }}
              >
                Undo
              </Button>
            </div>
          </div>
        )}
        {contents.length === 0 ? (
          <div className="rounded-lg border border-border-subtle bg-surface-200 p-6">
            <h3 className="type-heading-3 text-ink">Nothing in this space yet</h3>
            <p className="mt-1 text-ink-muted">
              Add a lecture or PDF you already have, or add new ones below.
            </p>
          </div>
        ) : (
          <TagFilteredList
            tags={tags}
            items={contents.map((c) => ({
              id: c.id,
              title: c.title,
              tagIds: c.tags.map((t) => t.id),
              node: (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <div className="flex min-w-0 flex-1 basis-full flex-col gap-1 sm:basis-0">
                    <div className="flex min-w-0 items-center gap-2">
                      {c.status === "ready" ? (
                        <Link
                          href={`/content/${c.id}`}
                          className="min-w-0 truncate type-body-strong text-ink no-underline hover:underline"
                        >
                          {c.title}
                        </Link>
                      ) : (
                        <span className="min-w-0 truncate type-body-strong text-ink">
                          {c.title}
                        </span>
                      )}
                      <span className="badge badge--neutral shrink-0">
                        {c.status === "ready" ? c.kind : c.status}
                      </span>
                    </div>
                    {c.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <TagChip key={t.id} tag={t} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <TagButton contentId={c.id} title={c.title} assigned={c.tags} all={tags} />
                    <Select
                      aria-label={`Move ${c.title} to`}
                      value=""
                      disabled={pending}
                      className="w-32"
                      onChange={(e) => {
                        const to = e.target.value;
                        if (to) move(c.id, c.title, to === "none" ? null : to);
                      }}
                    >
                      <option value="">Move to…</option>
                      {others.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      <option value="none">No space</option>
                    </Select>
                  </div>
                </div>
              ),
            }))}
          />
        )}
        {contents.length > 0 && (
          <p className="hidden type-caption text-ink-muted md:block">
            Tip: drag a row onto a space in the sidebar to move it there.
          </p>
        )}

        {available.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="field min-w-0 flex-1">
              <label htmlFor="add-to-space" className="field__label">
                Add content to this space
              </label>
              <Select
                id="add-to-space"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="w-full"
              >
                <option value="">Choose a content</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              onClick={() => {
                const c = available.find((x) => x.id === pick);
                if (c) move(c.id, c.title, spaceId);
              }}
              disabled={!pick || pending}
            >
              Add
            </Button>
          </div>
        )}
        {error && (
          <p className="type-caption text-danger" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="bulk-heading">
        <h2 id="bulk-heading" className="type-heading-3 text-ink">
          Add new to this space
        </h2>
        <p className="text-ink-muted">
          Paste a link or a YouTube playlist, or drop several PDFs or a whole folder.
        </p>
        <AddContentComposer spaceId={spaceId} />
      </section>
    </div>
  );
}
