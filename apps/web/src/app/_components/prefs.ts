/**
 * Per-viewer UI preferences (ADR-0020). Stored in localStorage and mirrored on <html> as data
 * attributes, which CSS reads. PREFS_SCRIPT runs in <head> before first paint, so there is no
 * flash of the wrong theme or sidebar width.
 */
export type ThemePref = "light" | "dark" | "system";
export type SidebarPref = "expanded" | "collapsed";
/** The look (ADR-0050): Hearth (warm, the default) or Modern (neutral, glass, chat-first). */
export type SkinPref = "hearth" | "modern";
/** Modern's accent colour. Hearth keeps its terracotta. */
export type AccentPref = "graphite" | "blue" | "green" | "violet" | "orange";
export const ACCENTS: readonly AccentPref[] = ["graphite", "blue", "green", "violet", "orange"];

export const THEME_KEY = "thoth.theme";
export const SIDEBAR_KEY = "thoth.sidebar";
export const SKIN_KEY = "thoth.skin";
export const ACCENT_KEY = "thoth.accent";

/** A saved value, or the default when it is missing or unknown. Pure, for tests. */
export function parseSkin(v: string | null): SkinPref {
  return v === "modern" ? "modern" : "hearth";
}
export function parseAccent(v: string | null): AccentPref {
  return ACCENTS.includes(v as AccentPref) ? (v as AccentPref) : "graphite";
}

export const PREFS_SCRIPT = `(() => { try {
  const d = document.documentElement;
  const t = localStorage.getItem("${THEME_KEY}");
  if (t === "light" || t === "dark") d.dataset.theme = t;
  d.dataset.sidebar = localStorage.getItem("${SIDEBAR_KEY}") === "collapsed" ? "collapsed" : "expanded";
  if (localStorage.getItem("${SKIN_KEY}") === "modern") d.dataset.skin = "modern";
  const a = localStorage.getItem("${ACCENT_KEY}");
  if (a && a !== "graphite" && ["blue","green","violet","orange"].includes(a)) d.dataset.accent = a;
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

export function readSkin(): SkinPref {
  try {
    return parseSkin(localStorage.getItem(SKIN_KEY));
  } catch {
    return "hearth";
  }
}

/** Switches the look at once: the CSS reads data-skin on <html>. */
export function applySkin(s: SkinPref) {
  store(SKIN_KEY, s);
  const d = document.documentElement;
  if (s === "modern") d.dataset.skin = "modern";
  else delete d.dataset.skin;
  window.dispatchEvent(new Event(SKIN_EVENT));
}

export function readAccent(): AccentPref {
  try {
    return parseAccent(localStorage.getItem(ACCENT_KEY));
  } catch {
    return "graphite";
  }
}

export function applyAccent(a: AccentPref) {
  store(ACCENT_KEY, a);
  const d = document.documentElement;
  if (a === "graphite") delete d.dataset.accent;
  else d.dataset.accent = a;
}

/** Fired on window when the skin changes, so components that lay out differently re-render. */
export const SKIN_EVENT = "thoth:skin";
