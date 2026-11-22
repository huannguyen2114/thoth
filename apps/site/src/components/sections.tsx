import { type Feature, REPO_URL, site } from "@content/site";
import { cx, ThothIcon } from "@thoth/ui";
import { Download } from "@/components/download";
import { Shot } from "@/components/shot";
import type { buildData } from "@/lib/build-data";

/** Sections of the detailed pages (/features, /changelog, /download). Copy comes from content/site.ts. */

export function Mark({ className }: { className?: string }) {
  return <ThothIcon size={32} className={cx("rounded-md ring-1 ring-border-subtle", className)} />;
}

export function Header() {
  const links = [
    ["Features", "#features"],
    ["Models", "#models"],
    ["Privacy", "#privacy"],
    ["What's new", "#whats-new"],
    ["FAQ", "#faq"],
  ] as const;
  return (
    <header className="sticky top-0 z-10 border-b border-border-subtle bg-surface-100/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 md:px-6">
        <a href="#top" className="flex items-center gap-2 text-ink no-underline">
          <Mark />
          <span className="type-heading-3">{site.name}</span>
        </a>
        <nav aria-label="Sections" className="ml-auto hidden items-center gap-1 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="nav-item no-underline">
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <a href={REPO_URL} className="btn btn--ghost btn--sm">
            GitHub
          </a>
          <Download compact />
        </div>
      </div>
    </header>
  );
}

export function Hero({ version }: { version: string }) {
  return (
    <section id="top" className="overflow-hidden px-4 pt-16 md:px-6 md:pt-24">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
        <p className="badge badge--neutral type-caption">
          v{version} · macOS · Windows · Linux · free and open source
        </p>
        <h1 className="type-display-lg text-balance text-ink md:type-display-xl">{site.tagline}</h1>
        <p className="type-body-lg max-w-2xl text-pretty text-ink-muted">{site.description}</p>
        <Download />
      </div>
      <div className="mx-auto mt-14 max-w-6xl md:mt-20">
        <Shot
          id="workspace"
          alt="Thoth's content workspace: a lecture video, its chapters, chat with citations and notes"
          priority
        />
      </div>
    </section>
  );
}

export function Trust() {
  const items = ["Runs on your computer", "No account", "Your own model", "Free and open source"];
  return (
    <div className="mt-16 border-y border-border-subtle bg-surface-200">
      <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-6 md:px-6">
        {items.map((t) => (
          <li key={t} className="type-overline text-ink-muted">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Section({
  id,
  n,
  kicker,
  title,
  lead,
  children,
}: {
  id: string;
  n: string;
  kicker: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="px-4 py-20 md:px-6 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex max-w-3xl flex-col gap-3 md:mb-16">
          <p className="type-overline text-accent-text">{n ? `${n} · ${kicker}` : kicker}</p>
          <h2
            id={`${id}-title`}
            className="type-heading-1 text-balance text-ink md:type-display-lg"
          >
            {title}
          </h2>
          {lead && <p className="type-body-lg text-pretty text-ink-muted">{lead}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function FeatureRow({ feature: f, flip }: { feature: Feature; flip: boolean }) {
  return (
    <article id={f.id} className="grid items-center gap-8 md:grid-cols-5 md:gap-12">
      <div className={cx("flex flex-col gap-4 md:col-span-2", flip && "md:order-2")}>
        <p className="type-label text-accent-text">{f.kicker}</p>
        <h3 className="type-heading-1 text-balance text-ink">{f.title}</h3>
        <p className="type-body-lg text-pretty text-ink-muted">{f.body}</p>
        <ul className="flex flex-col gap-2">
          {f.points.map((p) => (
            <li key={p} className="type-body flex gap-2 text-ink">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-pill bg-accent" />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={cx("md:col-span-3", flip && "md:order-1")}>
        <Shot id={f.shot} alt={`${f.kicker} in Thoth`} />
      </div>
    </article>
  );
}

export function Models() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border-subtle">
      <table className="w-full min-w-xl border-collapse text-left">
        <thead className="bg-surface-200">
          <tr>
            {["Provider", "How it connects", "Good for"].map((h) => (
              <th key={h} scope="col" className="type-label px-5 py-3 text-ink-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {site.models.map((m) => (
            <tr key={m.name} className="border-t border-border-subtle">
              <th scope="row" className="type-body-strong px-5 py-4 text-ink">
                {m.name}
              </th>
              <td className="type-body px-5 py-4 text-ink-muted">{m.how}</td>
              <td className="type-body px-5 py-4 text-ink-muted">{m.good}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Privacy() {
  return (
    <div className="flex flex-col gap-10">
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {site.privacy.map((p) => (
          <div key={p.label} className="card flex flex-col gap-1">
            <dd className="type-display-lg text-ink">{p.value}</dd>
            <dt className="type-label text-ink-muted">{p.label}</dt>
          </div>
        ))}
      </dl>
      <div className="grid gap-6 md:grid-cols-3">
        {[
          [
            "What stays here",
            "Your sources, notes, highlights, quizzes, cards and progress. They live in one folder on your computer.",
          ],
          [
            "What leaves",
            "Only the text you send to your model, to the provider you picked. With a local model, nothing leaves.",
          ],
          ["Your keys", "API keys go in your system keychain, never in a file or the browser."],
        ].map(([t, b]) => (
          <div key={t} className="flex flex-col gap-2">
            <h3 className="type-heading-3 text-ink">{t}</h3>
            <p className="type-body text-ink-muted">{b}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Shortcuts() {
  return (
    <ul className="grid gap-x-12 md:grid-cols-2">
      {site.shortcuts.map((s) => (
        <li
          key={s.action}
          className="flex items-center justify-between gap-6 border-b border-border-subtle py-4"
        >
          <span className="type-body text-ink">{s.action}</span>
          <span className="flex shrink-0 gap-1">
            {s.keys.map((k, i) => (
              <kbd
                // biome-ignore lint/suspicious/noArrayIndexKey: keys repeat ("[", "[") and never reorder
                key={i}
                className="type-code inline-flex min-w-7 justify-center rounded-sm border border-border-control bg-surface-200 px-2 text-ink"
              >
                {k}
              </kbd>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function WhatsNew({
  version,
  releases,
}: {
  version: string;
  releases: ReturnType<typeof buildData>["releases"];
}) {
  const date = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return (
    <div className="flex flex-col gap-8">
      <p className="type-body text-ink-muted">
        The current version is {version}. Release notes for each version are on{" "}
        <a
          className="text-accent-text underline-offset-2 hover:underline"
          href={`${REPO_URL}/releases`}
        >
          GitHub
        </a>
        .
      </p>
      <ol className="flex flex-col">
        {releases.map((r) => (
          <li
            key={r.phase}
            className="grid gap-2 border-t border-border-subtle py-6 md:grid-cols-4 md:gap-8"
          >
            <p className="type-caption text-ink-muted">
              Phase {r.phase} · <time dateTime={r.date}>{date(r.date)}</time>
            </p>
            <div className="flex flex-col gap-2 md:col-span-3">
              <h3 className="type-heading-3 text-ink">{r.title}</h3>
              {r.points.length > 0 && (
                <ul className="flex list-disc flex-col gap-1 pl-5">
                  {r.points.map((p) => (
                    <li key={p} className="type-body text-ink-muted">
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Faq() {
  return (
    <div className="flex flex-col">
      {site.faq.map((f) => (
        <details key={f.q} className="group border-t border-border-subtle py-5 last:border-b">
          <summary className="type-heading-3 flex cursor-pointer list-none items-center justify-between gap-4 text-ink">
            {f.q}
            <span
              aria-hidden="true"
              className="text-ink-subtle transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none"
            >
              +
            </span>
          </summary>
          <p className="type-body-lg mt-3 max-w-3xl text-ink-muted">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function Closing() {
  return (
    <section className="px-4 pb-24 md:px-6">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-xl bg-surface-200 px-6 py-16 text-center">
        <Mark className="size-12" />
        <h2 className="type-display-lg text-balance text-ink">Start with one PDF.</h2>
        <p className="type-body-lg max-w-xl text-ink-muted">
          Add a lecture you have this week. Ask it a question, and see where the answer comes from.
        </p>
        <Download />
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border-subtle px-4 py-10 md:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="type-label text-ink">{site.name}</span>
          <span className="type-caption text-ink-muted">· Free software under the AGPL-3.0</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          {[
            ["Source code", REPO_URL],
            ["Releases", `${REPO_URL}/releases`],
            ["Documentation", `${REPO_URL}/tree/main/docs`],
            ["Report a problem", `${REPO_URL}/issues`],
          ].map(([label, href]) => (
            <a key={href} href={href} className="type-label text-ink-muted hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
