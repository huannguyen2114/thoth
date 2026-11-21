"use client";

/**
 * "Show this passage of that summary": sent by a `thoth:s/<id>?q=` chip, received by the Summary
 * panel (it opens the set and flashes the passage). The latest request waits for the panel when
 * it is not mounted yet.
 */
type Listener = (setId: string, quote: string | null) => boolean;

const listeners = new Set<Listener>();
let pending: { setId: string; quote: string | null } | null = null;

export function requestSetQuote(setId: string, quote: string | null) {
  for (const l of listeners) if (l(setId, quote)) return;
  pending = { setId, quote };
}

/** Return true from the listener when it handled the request. */
export function onSetQuote(listener: Listener) {
  listeners.add(listener);
  if (pending && listener(pending.setId, pending.quote)) pending = null;
  return () => {
    listeners.delete(listener);
  };
}

/** Takes the request that is still waiting, once the panel can show it. */
export function takePendingSetQuote(setId?: string) {
  if (!pending || (setId && pending.setId !== setId)) return null;
  const p = pending;
  pending = null;
  return p;
}
