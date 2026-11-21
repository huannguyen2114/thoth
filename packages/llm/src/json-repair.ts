/**
 * Lenient JSON reading for models without native structured output (doc 20).
 * Small local models wrap JSON in prose, code fences or <think> blocks, and leave trailing
 * commas. This recovers the value when the intent is clear; zod still validates the result.
 */
export function parseJsonLoose(text: string): { ok: true; value: unknown } | { ok: false } {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*<think>[\s\S]*$/i, "")
    .trim();
  for (const candidate of candidates(cleaned)) {
    for (const variant of [candidate, withoutTrailingCommas(candidate)]) {
      try {
        return { ok: true, value: JSON.parse(variant) };
      } catch {
        // try the next variant
      }
    }
  }
  return { ok: false };
}

function* candidates(text: string): Generator<string> {
  yield text;
  const fence = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/.exec(text);
  if (fence?.[1]) yield fence[1].trim();
  const span = outermost(text);
  if (span) yield span;
}

/** The text from the first `{` or `[` to its matching close, skipping strings. */
function outermost(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  const stack: string[] = [];
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) return null;
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function withoutTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}
