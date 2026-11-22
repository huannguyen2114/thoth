"use client";

import { BREW_INSTALL, downloadUrl, type Platform, REPO_URL, site } from "@content/site";
import { useEffect, useState } from "react";

type Detected = Platform["id"];

/** Best guess of the visitor's platform. Apple Silicon is the default for Macs (most new Macs). */
function detect(): Detected {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux-appimage";
  return "mac-arm64";
}

/**
 * The primary download button for the visitor's OS, with the other installers listed under it.
 * Links point at the latest GitHub release by stable asset name (ADR-0045).
 */
export function Download({ compact = false }: { compact?: boolean }) {
  const [id, setId] = useState<Detected>("mac-arm64");
  useEffect(() => setId(detect()), []);
  const main = site.platforms.find((p) => p.id === id) ?? site.platforms[0];
  if (!main) return null;
  const label = main.id.startsWith("mac")
    ? "Download for Mac"
    : main.id === "windows"
      ? "Download for Windows"
      : "Download for Linux";

  if (compact) {
    return (
      <a className="btn btn--primary btn--sm" href={downloadUrl(main)}>
        {label}
      </a>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a className="btn btn--primary btn--lg" href={downloadUrl(main)}>
          {label}
        </a>
        <a className="btn btn--secondary btn--lg" href={REPO_URL}>
          View on GitHub
        </a>
      </div>
      <p className="type-caption text-center text-ink-muted">
        {main.label}. Also for{" "}
        {site.platforms
          .filter((p) => p.id !== main.id)
          .map((p, i, all) => (
            <span key={p.id}>
              <a
                className="text-accent-text underline-offset-2 hover:underline"
                href={downloadUrl(p)}
              >
                {p.label}
              </a>
              {i < all.length - 2 ? ", " : i === all.length - 2 ? " and " : ""}
            </span>
          ))}
        .
      </p>
      {main.id.startsWith("mac") && <Brew />}
    </div>
  );
}

/** The Homebrew install (ADR-0049), copyable in one click. */
function Brew() {
  const [copied, setCopied] = useState(false);
  const text = BREW_INSTALL.join(" && ");
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      title="Copy the Homebrew command"
      className="flex max-w-full items-center gap-2 rounded-md border border-border-subtle bg-surface-200 px-3 py-1.5 text-left type-caption text-ink-muted hover:text-ink"
    >
      <span className="type-label text-ink">Homebrew</span>
      <code className="truncate font-mono">{text}</code>
      <span className="shrink-0 text-accent-text">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
