"use client";

import { parseCitations } from "@thoth/core";
import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const CITE_PREFIX = "#cite:";

/** Turns "[p.3]" and "[01:46]" into links "[p.3](#cite:p.3)" that the `a` renderer shows as chips. */
export function linkCitations(markdown: string): string {
  const matches = parseCitations(markdown);
  let out = "";
  let at = 0;
  for (const m of matches) {
    const label = m.raw.slice(1, -1);
    out += `${markdown.slice(at, m.start)}[${label}](${CITE_PREFIX}${encodeURIComponent(label)})`;
    at = m.end;
  }
  return out + markdown.slice(at);
}

function makeComponents(onCite?: (token: string) => void): Components {
  return {
    h1: (p) => <h1 className="mt-6 mb-3 type-heading-1 text-ink first:mt-0" {...strip(p)} />,
    h2: (p) => <h2 className="mt-6 mb-2 type-heading-2 text-ink first:mt-0" {...strip(p)} />,
    h3: (p) => <h3 className="mt-4 mb-2 type-heading-3 text-ink" {...strip(p)} />,
    h4: (p) => <h4 className="mt-4 mb-1 type-label text-ink" {...strip(p)} />,
    p: (p) => <p className="my-3 type-body text-ink" {...strip(p)} />,
    ul: (p) => <ul className="my-3 list-disc pl-6 text-ink marker:text-ink-subtle" {...strip(p)} />,
    ol: (p) => (
      <ol className="my-3 list-decimal pl-6 text-ink marker:text-ink-subtle" {...strip(p)} />
    ),
    li: (p) => <li className="my-1 pl-1 type-body" {...strip(p)} />,
    strong: (p) => <strong className="type-body-strong" {...strip(p)} />,
    blockquote: (p) => (
      <blockquote
        className="my-3 rounded-md bg-surface-300 px-4 py-2 text-ink-muted"
        {...strip(p)}
      />
    ),
    hr: () => <hr className="my-6 border-border-subtle" />,
    code: ({ className, children }) =>
      className ? (
        <code className="type-code">{children}</code>
      ) : (
        <code className="rounded-sm bg-surface-300 px-1 type-code">{children}</code>
      ),
    pre: (p) => (
      <pre className="my-3 overflow-x-auto rounded-md bg-surface-300 p-4 text-ink" {...strip(p)} />
    ),
    table: (p) => (
      <div className="my-3 overflow-x-auto">
        <table className="w-full border-collapse type-body" {...strip(p)} />
      </div>
    ),
    th: (p) => (
      <th className="border-b border-border-subtle px-3 py-2 text-left type-label" {...strip(p)} />
    ),
    td: (p) => <td className="border-b border-border-subtle px-3 py-2" {...strip(p)} />,
    a: ({ href, children }) => {
      if (href?.startsWith(CITE_PREFIX)) {
        const token = `[${decodeURIComponent(href.slice(CITE_PREFIX.length))}]`;
        return (
          <button
            type="button"
            className="badge badge--accent mx-0.5 cursor-pointer align-baseline hover:underline"
            aria-label={`Go to ${token.slice(1, -1)} in the source`}
            onClick={() => onCite?.(token)}
          >
            {children}
          </button>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent-text underline"
        >
          {children}
        </a>
      );
    },
  };
}

/** react-markdown passes the AST node as a prop; keep it off the DOM element. */
function strip<T extends { node?: unknown }>(props: T): Omit<T, "node" | "ref"> {
  const { node: _node, ref: _ref, ...rest } = props as T & { ref?: unknown };
  return rest;
}

/** Renders markdown in Hearth styles. Citation tokens become chips that call `onCite(token)`. */
export const Markdown = memo(function Markdown({
  source,
  onCite,
}: {
  source: string;
  onCite?: ((token: string) => void) | undefined;
}) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={makeComponents(onCite)}>
      {linkCitations(source)}
    </ReactMarkdown>
  );
});
