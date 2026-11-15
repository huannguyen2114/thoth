"use client";

/** Shared empty state for tools not built yet. Replaced lane by lane. */
export function PlaceholderPanel({ label, phase }: { label: string; phase: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-200 p-6">
      <h3 className="type-heading-3 text-ink">{label}</h3>
      <p className="mt-1 text-ink-muted">This tool arrives in {phase}.</p>
    </div>
  );
}
