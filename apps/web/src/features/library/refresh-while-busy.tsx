"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 2_000;

/**
 * Re-renders the page's Server Components every 2 s while an item is queued or processing,
 * so Recents shows live status. Stops by itself once everything is ready or failed.
 */
export function RefreshWhileBusy({ busy }: { busy: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [busy, router]);
  return null;
}
