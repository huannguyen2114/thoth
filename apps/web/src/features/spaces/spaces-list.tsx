import { listSpaces } from "@thoth/core";
import Link from "next/link";
import { connection } from "next/server";
import { getContainer } from "@/server/container";
import { SpaceIcon } from "./space-icon";

/** Server Component. Reads per request (local DB), so it opts out of prerendering. */
export async function SpacesList() {
  await connection();
  const spaces = await listSpaces(await getContainer());

  if (spaces.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-200 p-6">
        <h3 className="type-heading-3 text-ink">No spaces yet</h3>
        <p className="mt-1 text-ink-muted">
          Create a space to keep related lectures and notes together.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {spaces.map((s) => (
        <li key={s.id}>
          <Link
            href={`/spaces/${s.id}`}
            data-accent={s.color ?? "orange"}
            className="accent-tile flex flex-col gap-3 rounded-xl p-5 no-underline transition-transform duration-150 hover:-translate-y-0.5"
          >
            <span className="accent-fg flex size-9 items-center justify-center rounded-lg bg-surface-100/70">
              <SpaceIcon icon={s.icon ?? null} color={s.color ?? null} />
            </span>
            <h3 className="type-heading-2 text-ink">{s.name}</h3>
            <p className="mt-1 type-caption text-ink-muted">
              Created {s.createdAt.toLocaleDateString("en", { dateStyle: "medium" })}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SpacesListSkeleton() {
  return <div className="h-28 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />;
}
