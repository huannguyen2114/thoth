/**
 * Per-viewer UI preferences (ADR-0020). Stored in localStorage and mirrored on <html> as data
 * attributes, which CSS reads. PREFS_SCRIPT runs in <head> before first paint, so there is no
 * flash of the wrong theme or sidebar width.
 */
export type ThemePref = "light" | "dark" | "system";
export type SidebarPref = "expanded" | "collapsed";

export const THEME_KEY = "thoth.theme";
export const SIDEBAR_KEY = "thoth.sidebar";

export const PREFS_SCRIPT = `(() => { try {
  const d = document.documentElement;
  const t = localStorage.getItem("${THEME_KEY}");
  if (t === "light" || t === "dark") d.dataset.theme = t;
  d.dataset.sidebar = localStorage.getItem("${SIDEBAR_KEY}") === "collapsed" ? "collapsed" : "expanded";
} catch {} })();`;

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function readTheme(): ThemePref {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(t: ThemePref) {
  store(THEME_KEY, t);
  const d = document.documentElement;
  if (t === "system") delete d.dataset.theme;
  else d.dataset.theme = t;
}

export function readSidebar(): SidebarPref {
  return document.documentElement.dataset.sidebar === "collapsed" ? "collapsed" : "expanded";
}

export function applySidebar(s: SidebarPref) {
  store(SIDEBAR_KEY, s);
  document.documentElement.dataset.sidebar = s;
}
