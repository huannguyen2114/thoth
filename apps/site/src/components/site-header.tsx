"use client";

import { site } from "@content/site";
import { cx, ThothIcon } from "@thoth/ui";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { spring } from "@/motion/tokens";
import { Download } from "./download";
import { GitHubStars } from "./github-stars";

const LINKS = [
  ["Features", "/features/"],
  ["Changelog", "/changelog/"],
  ["Download", "/download/"],
] as const;

/** The shared header: the current page has a pill that slides between links. */
export function SiteHeader() {
  const path = usePathname();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12));
  return (
    <header
      className={cx(
        "sticky top-0 z-30 transition-colors duration-200",
        scrolled
          ? "border-b border-border-subtle bg-surface-100/80 backdrop-blur"
          : "border-b border-transparent",
      )}
    >
      <div
        className={cx(
          "mx-auto flex max-w-6xl items-center gap-4 px-4 transition-all duration-200 md:px-6",
          scrolled ? "h-14" : "h-18",
        )}
      >
        <Link href="/" className="flex items-center gap-2 text-ink no-underline">
          <ThothIcon size={32} className="rounded-md ring-1 ring-border-subtle" />
          <span className="type-heading-3">{site.name}</span>
        </Link>
        <nav aria-label="Pages" className="ml-auto hidden items-center gap-1 md:flex">
          {LINKS.map(([label, href]) => {
            const active = path === href || path === href.slice(0, -1);
            return (
              <Link
                key={href}
                href={href}
                className="relative rounded-pill px-3 py-1.5 type-label text-ink no-underline"
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-pill bg-neutral-tint"
                  />
                )}
                <span className="relative">{label}</span>
              </Link>
            );
          })}
          <GitHubStars />
        </nav>
        <div className="ml-auto md:ml-2">
          <Download compact />
        </div>
      </div>
    </header>
  );
}
