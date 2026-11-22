"use client";

import { spring } from "@thoth/ui";
import { motion } from "motion/react";

/**
 * The current page's highlight in the sidebar. One `layoutId` across every nav item, so it
 * slides from the old page to the new one (ADR-0047). Render it first inside a nav item.
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
