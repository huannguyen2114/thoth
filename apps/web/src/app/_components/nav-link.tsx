"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Hearth nav-item that marks itself current for the active route. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link href={href} className="nav-item" aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
