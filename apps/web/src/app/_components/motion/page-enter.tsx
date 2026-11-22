"use client";

import { spring } from "@thoth/ui";
import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Each page fades and rises in a little as it opens (ADR-0047). */
export function PageEnter({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.smooth}
    >
      {children}
    </motion.div>
  );
}
