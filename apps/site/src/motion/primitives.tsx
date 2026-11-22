"use client";

import { type HTMLMotionProps, motion, useInView, useReducedMotion } from "motion/react";
import { type ReactNode, useRef } from "react";
import { spring } from "./tokens";

/** A button that shrinks under the finger and springs back, like iOS. */
export function Press({ children, ...props }: HTMLMotionProps<"button">) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      whileHover={{ scale: 1.02 }}
      transition={spring.snappy}
      {...props}
    >
      {children}
    </motion.button>
  );
}

/** Fades and rises into place the first time it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 32 }}
      animate={seen ? { opacity: 1, y: 0 } : { opacity: 0, y: reduce ? 0 : 32 }}
      transition={{ ...spring.gentle, delay }}
    >
      {children}
    </motion.div>
  );
}
