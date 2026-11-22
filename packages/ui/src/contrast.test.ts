import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every theme must stay readable (ADR-0050): text pairs meet WCAG AA (4.5:1), and controls'
 * edges meet 3:1, in light and dark, for Hearth, each skin, and each accent.
 */
const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));

type Palette = Record<string, string>;

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0);
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const TEXT: [string, string][] = [
  ["ink", "surface-100"],
  ["ink", "surface-200"],
  ["ink", "surface-300"],
  ["ink-muted", "surface-100"],
  ["ink-muted", "surface-300"],
  ["ink-subtle", "surface-100"],
  ["on-primary", "primary"],
  ["on-accent", "accent"],
  ["accent-text", "surface-100"],
  ["success", "surface-100"],
  ["danger", "surface-100"],
  ["info", "surface-100"],
];
const EDGES: [string, string][] = [["border-control", "surface-100"]];

function check(name: string, p: Palette) {
  for (const [fg, bg] of TEXT) {
    const a = p[fg];
    const b = p[bg];
    if (!a?.startsWith("#") || !b?.startsWith("#")) continue;
    expect(contrast(a, b), `${name}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  }
  for (const [fg, bg] of EDGES) {
    const a = p[fg];
    const b = p[bg];
    if (!a?.startsWith("#") || !b?.startsWith("#")) continue;
    expect(contrast(a, b), `${name}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
  }
}

/** Hearth's palette per theme, from its token list. */
function hearth(): Record<"light" | "dark", Palette> {
  const t = JSON.parse(readFileSync(root("design/hearth/tokens.json"), "utf8")) as {
    color: { themes: { id: string }[]; tokens: { name: string; value: string | Palette }[] };
  };
  const [light, dark] = t.color.themes.map((x) => x.id) as [string, string];
  const pick = (th: string) =>
    Object.fromEntries(
      t.color.tokens.map((k) => [
        k.name,
        typeof k.value === "string" ? k.value : (k.value[th] ?? ""),
      ]),
    );
  return { light: pick(light), dark: pick(dark) };
}

describe("theme contrast", () => {
  it("Hearth reads well in light and dark", () => {
    const h = hearth();
    check("hearth light", h.light);
    check("hearth dark", h.dark);
  });

  for (const dir of readdirSync(root("design/skins"))) {
    it(`${dir} reads well in light and dark, with every accent`, () => {
      const h = hearth();
      const s = JSON.parse(readFileSync(root(`design/skins/${dir}/tokens.json`), "utf8")) as {
        color: Record<"light" | "dark", Palette>;
        accents?: Record<string, Record<"light" | "dark", Palette>>;
      };
      for (const mode of ["light", "dark"] as const) {
        const base = { ...h[mode], ...s.color[mode] };
        check(`${dir} ${mode}`, base);
        for (const [name, a] of Object.entries(s.accents ?? {}))
          check(`${dir} ${mode} ${name}`, { ...base, ...a[mode] });
      }
    });
  }
});
