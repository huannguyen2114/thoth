"use client";

import { ThothIcon } from "@thoth/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { HistoryIcon } from "@/features/history/history-icon";
import { PlannerCommands } from "@/features/planner/planner-commands";
import { PlannerIcon } from "@/features/planner/planner-icon";
import { MoveCommands } from "@/features/spaces/move-commands";
import { type NavSpace, SpaceNavItem } from "@/features/spaces/space-nav-item";
import { formatShortcut, useRegistry } from "./commands";
import {
  CardsIcon,
  ChartIcon,
  GearIcon,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SidebarIcon,
  SunIcon,
} from "./icons";
import { NavPill } from "./motion/nav-pill";
import { applySidebar, applyTheme, readSidebar, readTheme, type ThemePref } from "./prefs";

/** A space in the sidebar: name, plus its Hearth accent and icon names (doc 22). */
export type SidebarSpace = NavSpace;

function Item({
  href,
  icon,
  label,
  exact = false,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const current = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className="nav-item app-nav-item"
      aria-current={current ? "page" : undefined}
      title={label}
    >
      <NavPill show={current} />
      {icon}
      <span className="app-label truncate">{label}</span>
    </Link>
  );
}

const themeOrder: ThemePref[] = ["system", "light", "dark"];
const themeMeta: Record<ThemePref, { icon: ReactNode; label: string }> = {
  system: { icon: <MonitorIcon />, label: "System theme" },
  light: { icon: <SunIcon />, label: "Light theme" },
  dark: { icon: <MoonIcon />, label: "Dark theme" },
};

/**
 * The app sidebar (ADR-0020): fixed height, its own scroll for spaces, Settings pinned at the
 * bottom, collapsible to icons (mod+\), and a drawer on narrow screens.
 */
export function Sidebar({ spaces }: { spaces: SidebarSpace[] }) {
  const { setPaletteOpen } = useRegistry();
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemePref>("system");
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setTheme(readTheme()), []);
  // Close the drawer after navigating on a phone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on route change only
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    document.documentElement.dataset.drawer = drawer ? "open" : "closed";
  }, [drawer]);

  const cycleTheme = () => {
    const next = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length] ?? "system";
    applyTheme(next);
    setTheme(next);
  };

  return (
    <>
      {/* Phone top bar: opens the drawer. Hidden from md up. */}
      <div className="app-topbar">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-label="Open menu"
          onClick={() => setDrawer(true)}
        >
          <MenuIcon />
        </button>
        <Link href="/" className="type-heading-3 text-ink no-underline">
          Thoth
        </Link>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-label="Search"
          onClick={() => setPaletteOpen(true)}
        >
          <SearchIcon />
        </button>
      </div>
      {drawer && (
        <button
          type="button"
          aria-label="Close menu"
          className="app-scrim"
          onClick={() => setDrawer(false)}
        />
      )}

      <aside className="app-sidebar" aria-label="Sidebar">
        <PlannerCommands />
        <MoveCommands spaces={spaces} />
        <div className="app-sidebar__head">
          <Link
            href="/"
            className="app-brand type-heading-3 text-ink no-underline"
            title="Thoth home"
          >
            <span className="app-brand__mark" aria-hidden="true">
              <ThothIcon size={28} />
            </span>
            <span className="app-label">Thoth</span>
          </Link>
          <button
            type="button"
            className="app-icon-btn app-collapse"
            onClick={() => applySidebar(readSidebar() === "collapsed" ? "expanded" : "collapsed")}
            title={`Toggle sidebar (${formatShortcut("mod+\\")})`}
            aria-label="Toggle sidebar"
          >
            <SidebarIcon />
          </button>
        </div>

        <button
          type="button"
          className="app-search"
          onClick={() => setPaletteOpen(true)}
          title="Search"
        >
          <SearchIcon />
          <span className="app-label flex-1 text-left">Search</span>
          <kbd className="app-label palette__kbd">{formatShortcut("mod+k")}</kbd>
        </button>

        <nav aria-label="Main" className="flex flex-col gap-0.5">
          <Item href="/" exact icon={<PlusIcon />} label="Add content" />
          <Item href="/review" icon={<CardsIcon />} label="Review" />
          <Item href="/planner" icon={<PlannerIcon />} label="Planner" />
          <Item href="/history" icon={<HistoryIcon />} label="History" />
          <Item href="/progress" icon={<ChartIcon />} label="Progress" />
        </nav>

        <div className="app-sidebar__scroll">
          <p className="app-group type-overline text-ink-muted">Spaces</p>
          <nav aria-label="Spaces" className="flex flex-col gap-0.5">
            {spaces.length === 0 ? (
              <p className="app-label px-3 type-caption text-ink-muted">No spaces yet</p>
            ) : (
              spaces.map((s) => <SpaceNavItem key={s.id} space={s} />)
            )}
          </nav>
        </div>

        <div className="app-sidebar__foot">
          <button
            type="button"
            className="nav-item app-nav-item w-full"
            onClick={cycleTheme}
            title={`${themeMeta[theme].label}. Click to change.`}
          >
            {themeMeta[theme].icon}
            <span className="app-label truncate">{themeMeta[theme].label}</span>
          </button>
          <Item href="/settings" icon={<GearIcon />} label="Settings" />
        </div>
      </aside>
    </>
  );
}
