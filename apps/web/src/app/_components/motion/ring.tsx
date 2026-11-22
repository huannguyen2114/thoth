"use client";

import { spring } from "@thoth/ui";
import { motion } from "motion/react";

/** A progress ring that fills when it appears (ADR-0047). `value` is 0..1. */
export function Ring({ value, size = 56 }: { value: number; size?: number }) {
  const r = 22;
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" aria-hidden="true" className="-rotate-90">
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.18}
        strokeWidth="6"
      />
      <motion.circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: Math.max(0, Math.min(1, value)) }}
        viewport={{ once: true }}
        transition={{ ...spring.gentle, delay: 0.1 }}
      />
    </svg>
  );
}
