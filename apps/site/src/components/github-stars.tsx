"use client";

import { REPO_URL } from "@content/site";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { formatStars } from "@/lib/stars";
import { spring } from "@/motion/tokens";

const API = REPO_URL.replace("https://github.com/", "https://api.github.com/repos/");
const KEY = "thoth-stars";

/**
 * The header's GitHub link with the live star count. It asks GitHub's public API once per
 * session (the answer is kept in sessionStorage) and shows the plain link until it answers or
 * if it fails.
 */
export function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved !== null) {
        setStars(Number(saved));
        return;
      }
    } catch {}
    let live = true;
    fetch(API, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { stargazers_count?: number } | null) => {
        const n = d?.stargazers_count;
        if (!live || typeof n !== "number") return;
        setStars(n);
        try {
          sessionStorage.setItem(KEY, String(n));
        } catch {}
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <a
      href={REPO_URL}
      className="flex items-center gap-1.5 rounded-pill px-3 py-1.5 type-label text-ink no-underline hover:bg-neutral-tint"
      aria-label={stars === null ? "GitHub" : `GitHub, ${stars} stars`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"
        />
      </svg>
      GitHub
      <AnimatePresence>
        {stars !== null && (
          <motion.span
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring.bouncy}
            className="flex items-center gap-0.5 rounded-pill tone-butter px-2 type-caption tabular-nums"
          >
            <span aria-hidden="true">★</span>
            {formatStars(stars)}
          </motion.span>
        )}
      </AnimatePresence>
    </a>
  );
}
