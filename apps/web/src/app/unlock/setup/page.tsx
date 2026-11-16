import type { Metadata } from "next";

export const metadata: Metadata = { title: "Remote access is off", robots: { index: false } };

/** Shown to non-local requests while no usable THOTH_PASSCODE exists. Static: serves no data. */
export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4 py-8">
      <h1 className="type-heading-1 text-ink">Remote access is off</h1>
      <p className="text-ink-muted">
        Thoth only answers requests from the computer it runs on until you set a passcode. To open
        it from your phone:
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-ink">
        <li>
          On the computer, add a line to <code className="type-code">apps/web/.env.local</code>:{" "}
          <code className="type-code">THOTH_PASSCODE=your-passcode</code> (at least 8 characters).
        </li>
        <li>
          Start Thoth with <code className="type-code">pnpm start:lan</code>.
        </li>
        <li>Reload this page and enter the passcode.</li>
      </ol>
    </main>
  );
}
