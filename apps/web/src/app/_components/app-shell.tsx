import { listRecentContents, listSpaces } from "@thoth/core";
import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";
import { SearchProvider } from "@/features/search/search-provider";
import { getContainer } from "@/server/container";
import { CommandPalette } from "./command-palette";
import { PageEnter } from "./motion/page-enter";
import { Sidebar } from "./sidebar";

/** Spaces for the sidebar and palette: data, so it streams in after the frame paints. */
async function ShellData() {
  await connection();
  const c = await getContainer();
  // Recent sources for the Modern sidebar (ADR-0050); Hearth hides them with CSS.
  const recents = (await listRecentContents(c, 12)).map((x) => ({ id: x.id, title: x.title }));
  const spaces = (await listSpaces(c)).map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    icon: s.icon,
  }));
  return (
    <>
      <Sidebar spaces={spaces} recents={recents} />
      <CommandPalette spaces={spaces} />
    </>
  );
}

/** The sidebar's place while spaces load. It reads no pathname, so it prerenders anywhere. */
function SidebarSkeleton() {
  return (
    <>
      <div className="app-topbar" aria-hidden="true" />
      <aside className="app-sidebar" aria-hidden="true" />
    </>
  );
}

/**
 * The app frame (ADR-0020, ADR-0048): fills the viewport and never scrolls itself; the sidebar
 * and the main area scroll on their own. It is rendered once by the `(shell)` layout, so the
 * sidebar stays mounted across pages and its current-page pill slides between items.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame">
      <Suspense fallback={<SidebarSkeleton />}>
        <ShellData />
      </Suspense>
      {/* Its commands read the pathname: runtime data on dynamic routes, so it streams in. */}
      <Suspense>
        <SearchProvider />
      </Suspense>
      <main id="main" className="app-main">
        {children}
      </main>
    </div>
  );
}

/**
 * A page's body inside the frame. Padded pages fade and rise in as they open; `bleed` pages
 * (the content workspace, a space) fill the main area edge to edge.
 */
export function AppPage({ children, bleed = false }: { children: ReactNode; bleed?: boolean }) {
  if (bleed) return <div className="h-full">{children}</div>;
  return (
    <div className="app-main--padded">
      <PageEnter>{children}</PageEnter>
    </div>
  );
}
