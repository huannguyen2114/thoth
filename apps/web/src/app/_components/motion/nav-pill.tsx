"use client";

import { spring } from "@thoth/ui";
import { motion } from "motion/react";

/**
 * The current page's highlight in the sidebar (ADR-0047, ADR-0048). The sidebar stays mounted
 * across pages, so the shared `layoutId` slides the pill from the old item to the new one.
 * Render it first inside a nav item.
 */
export function NavPill({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <motion.span
      layoutId="sidebar-current"
      transition={spring.snappy}
      aria-hidden="true"
      className="app-nav-pill"
    />
  );
}
