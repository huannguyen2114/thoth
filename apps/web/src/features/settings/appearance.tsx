"use client";

import { cx } from "@thoth/ui";
import { useEffect, useState } from "react";
import {
  ACCENTS,
  type AccentPref,
  applyAccent,
  applySkin,
  applyTheme,
  readAccent,
  readSkin,
  readTheme,
  type SkinPref,
  type ThemePref,
} from "@/app/_components/prefs";

const MODES: { id: ThemePref; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const SKINS: { id: SkinPref; label: string; about: string }[] = [
  {
    id: "hearth",
    label: "Hearth",
    about: "Warm paper, serif headings, coloured tiles and the dockable workspace.",
  },
  {
    id: "modern",
    label: "Modern",
    about:
      "Clean and neutral, with glass, recent sources in the sidebar and chat beside the source.",
  },
];

const ACCENT_LABEL: Record<AccentPref, string> = {
  graphite: "Graphite",
  blue: "Blue",
  green: "Green",
  violet: "Violet",
  orange: "Orange",
};

/**
 * Settings › Appearance (ADR-0050): the look (Hearth or Modern), the mode, and Modern's accent.
 * Per device: stored in localStorage, applied at once, and before first paint on the next load.
 */
export function Appearance() {
  const [skin, setSkin] = useState<SkinPref>("hearth");
  const [mode, setMode] = useState<ThemePref>("system");
  const [accent, setAccent] = useState<AccentPref>("graphite");
  useEffect(() => {
    setSkin(readSkin());
    setMode(readTheme());
    setAccent(readAccent());
  }, []);

  return (
    <section className="flex flex-col gap-8" aria-labelledby="appearance-heading">
      <div className="flex flex-col gap-1">
        <h2 id="appearance-heading" className="type-heading-1 text-ink">
          Appearance
        </h2>
        <p className="text-ink-muted">
          How Thoth looks on this device. Your library stays the same.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="type-label mb-3 text-ink">Look</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {SKINS.map((s) => (
            <label
              key={s.id}
              className={cx(
                "flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 bg-surface-200 transition-colors",
                skin === s.id ? "border-ink" : "border-border-subtle hover:border-border-control",
              )}
            >
              <input
                type="radio"
                name="skin"
                value={s.id}
                checked={skin === s.id}
                onChange={() => {
                  applySkin(s.id);
                  setSkin(s.id);
                }}
                className="sr-only"
              />
              <SkinPreview id={s.id} />
              <span className="flex flex-col gap-0.5 p-4">
                <span className="type-body-strong text-ink">{s.label}</span>
                <span className="type-caption text-ink-muted">{s.about}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle pt-6">
        <legend className="sr-only">Mode</legend>
        <span className="flex flex-col">
          <span className="type-label text-ink">Mode</span>
          <span className="type-caption text-ink-muted">Follow your system, or pick one.</span>
        </span>
        <span className="flex gap-0.5 rounded-lg bg-neutral-tint p-1">
          {MODES.map((m) => (
            <label
              key={m.id}
              className={cx(
                "cursor-pointer rounded-md px-3 py-1.5 type-label",
                mode === m.id ? "bg-surface-200 text-ink shadow-hearth-sm" : "text-ink-muted",
              )}
            >
              <input
                type="radio"
                name="mode"
                value={m.id}
                checked={mode === m.id}
                onChange={() => {
                  applyTheme(m.id);
                  setMode(m.id);
                }}
                className="sr-only"
              />
              {m.label}
            </label>
          ))}
        </span>
      </fieldset>

      {skin === "modern" && (
        <fieldset className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle pt-6">
          <legend className="sr-only">Accent</legend>
          <span className="flex flex-col">
            <span className="type-label text-ink">Accent</span>
            <span className="type-caption text-ink-muted">
              Buttons, links and the current item.
            </span>
          </span>
          <span className="flex gap-3">
            {ACCENTS.map((a) => (
              <label key={a} title={ACCENT_LABEL[a]} className="cursor-pointer">
                <input
                  type="radio"
                  name="accent"
                  value={a}
                  checked={accent === a}
                  onChange={() => {
                    applyAccent(a);
                    setAccent(a);
                  }}
                  className="peer sr-only"
                />
                <span className="sr-only">{ACCENT_LABEL[a]}</span>
                <span
                  aria-hidden="true"
                  data-swatch={a}
                  className={cx(
                    "accent-swatch block size-7 rounded-pill",
                    accent === a && "accent-swatch--on",
                  )}
                />
              </label>
            ))}
          </span>
        </fieldset>
      )}
    </section>
  );
}

/** A small drawing of each look, from its own colours. */
function SkinPreview({ id }: { id: SkinPref }) {
  return (
    <span aria-hidden="true" data-skin-preview={id} className="skin-preview">
      <span className="skin-preview__side">
        <span />
        <span />
        <span />
      </span>
      <span className="skin-preview__main">
        <span className="skin-preview__aa">Aa</span>
        <span className="skin-preview__bar" />
      </span>
    </span>
  );
}
