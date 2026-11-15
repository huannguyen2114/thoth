"use client";

import type { ContentId, SpaceId } from "@thoth/core";
import { Button, Select } from "@thoth/ui";
import Link from "next/link";
import { useState, useTransition } from "react";
import { moveContentAction } from "./actions";

interface Item {
  id: ContentId;
  title: string;
  kind: string;
}

/** Contents in a space, with add (from existing contents) and remove. */
export function SpaceContents({
  spaceId,
  contents,
  available,
}: {
  spaceId: SpaceId;
  contents: Item[];
  available: Item[];
}) {
  const [pick, setPick] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const move = (id: ContentId, to: SpaceId | null) =>
    start(async () => {
      const r = await moveContentAction(id, to);
      setError(r.error);
      if (!r.error) setPick("");
    });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-heading-2 text-ink">Contents</h2>
      {contents.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface-200 p-6">
          <h3 className="type-heading-3 text-ink">Nothing in this space yet</h3>
          <p className="mt-1 text-ink-muted">
            Add a lecture or PDF you already have, or{" "}
            <Link href="/" className="text-accent-text">
              add new content
            </Link>{" "}
            first.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
          {contents.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <Link
                href={`/content/${c.id}`}
                className="min-w-0 flex-1 truncate type-body-strong text-ink no-underline hover:underline"
              >
                {c.title}
              </Link>
              <span className="badge badge--neutral">{c.kind}</span>
              <Button size="sm" variant="ghost" onClick={() => move(c.id, null)} disabled={pending}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
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
            onClick={() => pick && move(pick as ContentId, spaceId)}
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
  );
}
