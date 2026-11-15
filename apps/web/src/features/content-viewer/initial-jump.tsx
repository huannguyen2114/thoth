"use client";

import { useEffect } from "react";
import { useViewer } from "./viewer-context";

/**
 * Jumps the viewer to a citation token from the URL (`/content/{id}?at=[p.3]`), used by
 * exam results and the progress page. Retries briefly because viewers (the YouTube player
 * especially) register their handle a moment after mount.
 */
export function InitialJump({ token }: { token: string | undefined }) {
  const { jumpToToken } = useViewer();
  useEffect(() => {
    if (!token) return;
    const timers = [300, 1200, 2500].map((ms) => setTimeout(() => jumpToToken(token), ms));
    return () => timers.forEach(clearTimeout);
  }, [token, jumpToToken]);
  return null;
}
