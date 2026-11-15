"use client";

import { Command as Cmdk } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  type Command,
  formatShortcut,
  type SearchResult,
  useCommands,
  useRegistry,
} from "./commands";
import { applySidebar, applyTheme, readSidebar } from "./prefs";

/** Cmd/Ctrl+K palette (ADR-0020): commands now; global search results from providers (Lane 3). */
export function CommandPalette({ spaces }: { spaces: { id: string; name: string }[] }) {
  const router = useRouter();
  const { commands, providers, paletteOpen: open, setPaletteOpen: setOpen } = useRegistry();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  const builtIn = useMemo<Command[]>(
    () => [
      {
        id: "palette",
        label: "Search or run a command",
        group: "General",
        shortcut: "mod+k",
        run: () => setOpen(true),
      },
      {
        id: "sidebar",
        label: "Toggle sidebar",
        group: "General",
        shortcut: "mod+\\",
        run: () => applySidebar(readSidebar() === "collapsed" ? "expanded" : "collapsed"),
      },
      { id: "go-home", label: "Go to home", group: "Go to", run: () => router.push("/") },
      { id: "go-review", label: "Go to review", group: "Go to", run: () => router.push("/review") },
      {
        id: "go-progress",
        label: "Go to progress",
        group: "Go to",
        run: () => router.push("/progress"),
      },
      {
        id: "go-settings",
        label: "Go to settings",
        group: "Go to",
        shortcut: "mod+,",
        run: () => router.push("/settings"),
      },
      ...spaces.map((s) => ({
        id: `space-${s.id}`,
        label: `Open space: ${s.name}`,
        group: "Spaces",
        run: () => router.push(`/spaces/${s.id}`),
      })),
      {
        id: "theme-light",
        label: "Use light theme",
        group: "Theme",
        run: () => applyTheme("light"),
      },
      { id: "theme-dark", label: "Use dark theme", group: "Theme", run: () => applyTheme("dark") },
      {
        id: "theme-system",
        label: "Match system theme",
        group: "Theme",
        run: () => applyTheme("system"),
      },
    ],
    [router, spaces, setOpen],
  );
  useCommands("shell", builtIn);

  // Ask search providers as the query changes (debounced, cancelled on change).
  useEffect(() => {
    if (!open || query.trim().length < 2 || providers.length === 0) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const all = await Promise.all(providers.map((p) => p(query, ctrl.signal).catch(() => [])));
      if (!ctrl.signal.aborted) setResults(all.flat());
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, query, providers]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const groups = useMemo(() => {
    const m = new Map<string, Command[]>();
    for (const c of commands)
      if (c.id !== "palette") m.set(c.group, [...(m.get(c.group) ?? []), c]);
    return [...m];
  }, [commands]);
  const resultGroups = useMemo(() => {
    const m = new Map<string, SearchResult[]>();
    for (const r of results) m.set(r.group, [...(m.get(r.group) ?? []), r]);
    return [...m];
  }, [results]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <Cmdk.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Search or run a command"
      shouldFilter={true}
      className="palette"
      overlayClassName="palette__overlay"
      contentClassName="palette__content"
    >
      <Cmdk.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Search or type a command"
        className="palette__input"
      />
      <Cmdk.List className="palette__list">
        <Cmdk.Empty className="palette__empty">Nothing found. Try another word.</Cmdk.Empty>
        {resultGroups.map(([group, items]) => (
          <Cmdk.Group key={`r-${group}`} heading={group} className="palette__group">
            {items.map((r) => (
              <Cmdk.Item
                key={r.id}
                value={`${r.id} ${r.label} ${r.detail ?? ""} ${query}`}
                onSelect={() => run(() => router.push(r.href))}
                className="palette__item"
              >
                <span className="truncate">{r.label}</span>
                {r.detail && <span className="palette__detail truncate">{r.detail}</span>}
              </Cmdk.Item>
            ))}
          </Cmdk.Group>
        ))}
        {groups.map(([group, items]) => (
          <Cmdk.Group key={group} heading={group} className="palette__group">
            {items.map((c) => (
              <Cmdk.Item
                key={c.id}
                value={`${c.label} ${(c.keywords ?? []).join(" ")}`}
                onSelect={() => run(c.run)}
                className="palette__item"
              >
                <span className="truncate">{c.label}</span>
                {c.shortcut && <kbd className="palette__kbd">{formatShortcut(c.shortcut)}</kbd>}
              </Cmdk.Item>
            ))}
          </Cmdk.Group>
        ))}
      </Cmdk.List>
    </Cmdk.Dialog>
  );
}
