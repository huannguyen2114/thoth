import { listSpaces } from "@thoth/core";
import { cx } from "@thoth/ui";
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
  const spaces = (await listSpaces(await getContainer())).map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    icon: s.icon,
  }));
  return (
    <>
      <Sidebar spaces={spaces} />
      <CommandPalette spaces={spaces} />
    </>
  );
}

/**
 * The app frame (ADR-0020): fills the viewport and never scrolls itself; the sidebar and the
 * main area scroll on their own. `bleed` removes the main padding for full-screen pages such
 * as the content workspace.
 */
export function AppShell({ children, bleed = false }: { children: ReactNode; bleed?: boolean }) {
  return (
    <div className="app-frame">
      <Suspense
        fallback={
          <>
            <Sidebar spaces={[]} />
            <CommandPalette spaces={[]} />
          </>
        }
      >
        <ShellData />
      </Suspense>
      <SearchProvider />
      <main id="main" className={cx("app-main", !bleed && "app-main--padded")}>
        {bleed ? children : <PageEnter>{children}</PageEnter>}
      </main>
    </div>
  );
}
