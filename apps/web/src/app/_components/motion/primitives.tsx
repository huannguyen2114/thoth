"use client";

import { spring } from "@thoth/ui";
import { animate, type HTMLMotionProps, motion, useInView, useMotionValue } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { formatCount } from "./format";

/** Fades and rises into place the first time it scrolls into view, after `delay` seconds. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-5% 0px" }}
      transition={{ ...spring.gentle, delay }}
    >
      {children}
    </motion.div>
  );
}

/** A card that lifts under the pointer and gives under a press. */
export function Lift({ children, className, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={spring.snappy}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Counts up to `value` when it first appears. Server-rendered as the final number. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  const v = useMotionValue(0);
  useEffect(() => {
    if (!seen) return;
    const unsub = v.on("change", (n) => {
      if (ref.current) ref.current.textContent = formatCount(n);
    });
    const c = animate(v, value, { duration: 0.9, ease: [0.2, 0, 0, 1] });
    return () => {
      c.stop();
      unsub();
    };
  }, [seen, v, value]);
  return (
    <span ref={ref} className={className}>
      {formatCount(value)}
    </span>
  );
}
