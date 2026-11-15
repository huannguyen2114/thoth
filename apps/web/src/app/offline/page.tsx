import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

/** Served by the service worker when a page cannot load. Must stay fully static. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-4">
      <h1 className="type-heading-1 text-ink">You are offline</h1>
      <p className="text-ink-muted">
        Thoth runs on your computer. Reconnect to it, then reload this page.
      </p>
    </main>
  );
}
