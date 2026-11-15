"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * One registry for commands and keyboard shortcuts (ADR-0020). Features register commands;
 * the command palette lists them and the global key handler runs their shortcuts.
 * Contract for Phase 8 lanes: register with `useCommands(group, commands)`, and add search
 * results with `useSearchProvider(provider)`. Do not add your own global keydown listeners.
 */
export interface Command {
  id: string;
  /** Sentence case, verb first: "Open settings", "Toggle sidebar". */
  label: string;
  group: string;
  /** For example "mod+k", "mod+\\", "g p". "mod" is Cmd on Mac and Ctrl elsewhere. */
  shortcut?: string;
  keywords?: string[];
  run: () => void;
}

export interface SearchResult {
  id: string;
  label: string;
  /** Second line, for example the content title a segment comes from. */
  detail?: string;
  group: string;
  href: string;
}
export type SearchProvider = (query: string, signal: AbortSignal) => Promise<SearchResult[]>;

interface Registry {
  commands: Command[];
  providers: SearchProvider[];
  register: (group: string, cmds: Command[]) => () => void;
  addProvider: (p: SearchProvider) => () => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

const Ctx = createContext<Registry | null>(null);

export const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** "mod+k" -> "⌘K" on Mac, "Ctrl+K" elsewhere. */
export function formatShortcut(s: string): string {
  const mac = isMac();
  return s
    .split("+")
    .map((k) =>
      k === "mod" ? (mac ? "⌘" : "Ctrl") : k === "shift" ? (mac ? "⇧" : "Shift") : k.toUpperCase(),
    )
    .join(mac ? "" : "+");
}

function matches(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.at(-1);
  const mod = parts.includes("mod");
  const shift = parts.includes("shift");
  const modDown = isMac() ? e.metaKey : e.ctrlKey;
  return modDown === mod && e.shiftKey === shift && e.key.toLowerCase() === key;
}

export function CommandsProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<Record<string, Command[]>>({});
  const [providers, setProviders] = useState<SearchProvider[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const register = useCallback((group: string, cmds: Command[]) => {
    setGroups((g) => ({ ...g, [group]: cmds }));
    return () =>
      setGroups((g) => {
        const { [group]: _gone, ...rest } = g;
        return rest;
      });
  }, []);
  const addProvider = useCallback((p: SearchProvider) => {
    setProviders((ps) => [...ps, p]);
    return () => setProviders((ps) => ps.filter((x) => x !== p));
  }, []);

  const commands = useMemo(() => Object.values(groups).flat(), [groups]);
  const latest = useRef(commands);
  latest.current = commands;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      for (const c of latest.current) {
        if (c.shortcut && matches(e, c.shortcut)) {
          e.preventDefault();
          c.run();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(
    () => ({ commands, providers, register, addProvider, paletteOpen, setPaletteOpen }),
    [commands, providers, register, addProvider, paletteOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRegistry(): Registry {
  const r = useContext(Ctx);
  if (!r) throw new Error("useRegistry must be used inside <CommandsProvider>.");
  return r;
}

/** Registers commands while the calling component is mounted. Pass a stable array (useMemo). */
export function useCommands(group: string, commands: Command[]) {
  const { register } = useRegistry();
  useEffect(() => register(group, commands), [group, commands, register]);
}

/** Adds global search results to the palette while mounted (Lane 3). */
export function useSearchProvider(provider: SearchProvider) {
  const { addProvider } = useRegistry();
  useEffect(() => addProvider(provider), [provider, addProvider]);
}
