"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Spring motion for the whole app (ADR-0047). LazyMotion keeps the first load small; `m.*`
 * components and `motion.*` both work inside it. `reducedMotion="user"` honours the OS setting:
 * transforms are dropped and only opacity changes remain.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
