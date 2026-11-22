"use client";

import { spring } from "@thoth/ui";
import { motion } from "motion/react";

/**
 * The current page's highlight in the sidebar (ADR-0047). It springs in as a page opens; its
 * shared `layoutId` also slides it between items that live in the same render. Render it
 * first inside a nav item.
 */
export function NavPill({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <motion.span
      layoutId="sidebar-current"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring.snappy}
      aria-hidden="true"
      className="app-nav-pill"
    />
  );
}
