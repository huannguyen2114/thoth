"use client";

import { cx, spring } from "@thoth/ui";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CountUp } from "@/app/_components/motion/primitives";
import { type HomeNumbers, loadHomeNumbersAction } from "./actions";

/**
 * Home's today strip (ADR-0047): where you left off, cards due, today's plan and your streak, as
 * tinted tiles that count up. Each tile is a link to the place that number lives.
 */
export function TodayStrip({ last }: { last: { id: string; title: string } | null }) {
  const [n, setN] = useState<HomeNumbers | null>(null);
  useEffect(() => {
    let live = true;
    loadHomeNumbersAction(new Date().getTimezoneOffset())
      .then((v) => live && setN(v))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const tiles = [
    {
      key: "continue",
      tone: "tone-peach",
      href: last ? `/content/${last.id}` : "/",
      label: "Continue",
      value: null,
      text: last?.title ?? "Add your first source",
    },
    {
      key: "due",
      tone: "tone-sky",
      href: "/review",
      label: "Cards due",
      value: n?.due ?? null,
      text: n && n.due === 0 ? "All caught up" : "Review now",
    },
    {
      key: "today",
      tone: "tone-butter",
      href: "/planner",
      label: "Today's plan",
      value: n ? n.today.done : null,
      text: n ? (n.today.total ? `of ${n.today.total} tasks done` : "No plan for today") : "",
    },
    {
      key: "streak",
      tone: "tone-sage",
      href: "/progress",
      label: "Streak",
      value: n?.streak ?? null,
      text: n?.streak === 1 ? "day" : "days in a row",
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="At a glance">
      {tiles.map((t, i) => (
        <motion.div
          key={t.key}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.05 * i }}
        >
          <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}>
            <Link
              href={t.href}
              aria-label={t.key === "continue" ? "Continue where you left off" : t.label}
              className={cx(
                "flex h-full min-h-28 flex-col justify-between gap-2 rounded-xl p-4 no-underline",
                t.tone,
              )}
            >
              <span className="type-overline opacity-80">{t.label}</span>
              {t.value === null ? (
                <span className="line-clamp-2 type-heading-3">{t.text || "…"}</span>
              ) : (
                <span className="flex items-baseline gap-1.5">
                  <CountUp value={t.value} className="type-display-lg" />
                  <span className="type-caption opacity-80">{t.text}</span>
                </span>
              )}
            </Link>
          </motion.div>
        </motion.div>
      ))}
    </section>
  );
}
