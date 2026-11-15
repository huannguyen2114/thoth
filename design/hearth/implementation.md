# Implementation

How to turn Hearth into code. Every value lives in `tokens.json` only; this page shows how to consume it, never the values themselves. CSS variable names equal token names (`surface-100` becomes `--surface-100`).

## 1. Load the fonts

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Newsreader:wght@400;500&family=JetBrains+Mono:wght@400&display=swap">
```

## 2. Get the CSS variables

Use the `tokens.css` this system generates from `tokens.json` (see "Consuming this system" on the overview). It declares the light theme on `:root, [data-theme="light"]`, overrides on `[data-theme="dark"]`, the spacing, radius and shadow variables, `--font-serif`, `--font-sans`, `--font-mono`, and one class per type style (`.body`, `.heading-2`, `.overline` and so on).

To generate it in your own build instead, read `tokens.json` and emit the variables:

```js
// build-tokens.mjs — node build-tokens.mjs > tokens.css
import fs from 'node:fs';
const t = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
const themes = t.color.themes.map((x) => x.id);
const val = (v, th) => (typeof v === 'string' ? v : v[th] ?? v[themes[0]]);
const ref = (v) => v.replace(/^\{(.+)\}$/, 'var(--$1)');
const out = [];
for (const th of themes) {
  const sel = th === themes[0] ? `:root, [data-theme="${th}"]` : `[data-theme="${th}"]`;
  const vars = [...t.color.tokens, ...(t.shadow?.tokens ?? [])]
    .map((k) => `  --${k.name}: ${ref(val(k.value, th))};`);
  out.push(`${sel} {\n${vars.join('\n')}\n}`);
}
const rest = [...t.spacing.tokens, ...t.radius.tokens].map((k) => `  --${k.name}: ${k.value};`);
rest.push(...Object.entries(t.type.families).map(([k, v]) => `  --font-${k}: ${v};`));
out.push(`:root {\n${rest.join('\n')}\n}`);
console.log(out.join('\n\n'));
```

Then load `components/bundle.css` after it for the component classes (`btn`, `field`, `card`, `badge`, `callout`, `check`, `toggle`, `select`, `tabs`, `tooltip`, `menu`, `modal`, `sidebar`, `codeblock`).

## 3. Base styles

```css
body {
  background: var(--surface-100);
  color: var(--ink);
  font: 400 15px/23px var(--font-sans);
}
h1, h2, h3 { font-family: var(--font-serif); font-weight: 500; letter-spacing: -0.01em; }
:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

## 4. Dark mode switch

```js
const set = (t) => document.documentElement.setAttribute('data-theme', t);
const mq = matchMedia('(prefers-color-scheme: dark)');
set(mq.matches ? 'dark' : 'light');
mq.addEventListener('change', (e) => set(e.matches ? 'dark' : 'light'));
```

## 5. Tailwind mapping

Point Tailwind at the variables, never at hex values, so both themes and later token edits flow through.

```js
// tailwind.config.js
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: { 100: 'var(--surface-100)', 200: 'var(--surface-200)', 300: 'var(--surface-300)' },
        ink: { DEFAULT: 'var(--ink)', muted: 'var(--ink-muted)', subtle: 'var(--ink-subtle)' },
        accent: {
          DEFAULT: 'var(--accent)', hover: 'var(--accent-hover)', pressed: 'var(--accent-pressed)',
          text: 'var(--accent-text)', tint: 'var(--accent-tint)', on: 'var(--on-accent)',
        },
        border: { subtle: 'var(--border-subtle)', control: 'var(--border-control)' },
      },
      borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)' },
      boxShadow: { sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)' },
      fontFamily: { serif: 'var(--font-serif)', sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
    },
  },
};
```

## 6. React button example

```jsx
export function Button({ variant = 'primary', size, children, ...props }) {
  const cls = ['btn', `btn--${variant}`, size && `btn--${size}`].filter(Boolean).join(' ');
  return <button className={cls} {...props}>{children}</button>;
}
```
