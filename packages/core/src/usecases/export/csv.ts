import type { Flashcard } from "../../domain/flashcard";

/** One CSV field (RFC 4180): quoted when it holds a comma, quote, or line break; quotes doubled. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}

/** Anki tags are space-separated, so a topic like "Cell biology" becomes "Cell_biology". */
export function ankiTag(topic: string): string {
  return topic.trim().replace(/\s+/g, "_").replace(/,/g, "");
}

/**
 * Anki text import (File > Import): `Front,Back,Tags`, UTF-8, comma separated. The `#` header
 * lines (Anki 2.1.54+) pick the separator, turn HTML off so `<` in a card stays text, and say
 * column 3 holds tags; older versions skip lines starting with `#`.
 */
export function flashcardsToAnkiCsv(cards: Pick<Flashcard, "front" | "back" | "topic">[]): string {
  const lines = [
    "#separator:Comma",
    "#html:false",
    "#tags column:3",
    ...cards.map((c) => csvRow([c.front, c.back, ankiTag(c.topic)])),
  ];
  return `${lines.join("\n")}\n`;
}
