"use client";

import { useSyncExternalStore } from "react";
import { parseSkin, SKIN_EVENT, type SkinPref } from "./prefs";

function subscribe(onChange: () => void) {
  window.addEventListener(SKIN_EVENT, onChange);
  return () => window.removeEventListener(SKIN_EVENT, onChange);
}

/**
 * The current look (ADR-0050), for the few components whose layout differs between themes (the
 * content workspace). "pending" on the server and during hydration; most styling needs no hook,
 * because CSS reads data-skin, which the first-paint script sets.
 */
export function useSkin(): SkinPref | "pending" {
  return useSyncExternalStore<SkinPref | "pending">(
    subscribe,
    () => parseSkin(document.documentElement.dataset.skin ?? null),
    () => "pending",
  );
}
