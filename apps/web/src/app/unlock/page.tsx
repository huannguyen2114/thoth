import { Button } from "@thoth/ui";
import type { Metadata } from "next";
import { Suspense } from "react";
import { safeNext } from "@/features/access/gate";

export const metadata: Metadata = { title: "Unlock", robots: { index: false } };

export default function UnlockPage({ searchParams }: PageProps<"/unlock">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="type-display-lg text-ink">Thoth</h1>
        <p className="text-ink-muted">Enter your passcode to open Thoth on this device.</p>
      </header>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-surface-300" />}>
        <UnlockForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function UnlockForm({ searchParams }: Pick<PageProps<"/unlock">, "searchParams">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const error = one(params.error);
  const wait = Number(one(params.wait)) || 0;
  const next = safeNext(one(params.next));

  return (
    <form method="post" action="/unlock/verify" className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <div className={`field max-w-none ${error === "wrong" ? "field--error" : ""}`}>
        <label htmlFor="passcode" className="field__label">
          Passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          required
          autoComplete="current-password"
          aria-describedby={error ? "passcode-error" : undefined}
          className="field__input"
        />
      </div>
      {error === "wrong" ? (
        <p id="passcode-error" role="alert" className="callout callout--danger">
          That passcode is not right. Check it and try again.
        </p>
      ) : null}
      {error === "locked" ? (
        <p id="passcode-error" role="alert" className="callout callout--warning">
          Too many wrong tries. Wait {formatWait(wait)} and try again.
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg">
        Unlock
      </Button>
    </form>
  );
}

function formatWait(sec: number): string {
  if (sec < 90) return `${Math.max(sec, 1)} seconds`;
  return `${Math.ceil(sec / 60)} minutes`;
}
