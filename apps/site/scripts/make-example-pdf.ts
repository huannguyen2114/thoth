/**
 * Writes public/examples/consistency-and-consensus.pdf: the small example chapter the landing
 * demo shows, as a real PDF visitors can download and add to Thoth. The text comes from
 * content/landing.ts, so the file and the demo never disagree. Runs before every site build.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { makePdf } from "../../../packages/ingest/src/__fixtures__/make-pdf.ts";
import { landing } from "../content/landing.ts";

const book = landing.samples.find((s) => s.kind === "pdf");
if (!book?.pages || !book.pdf) throw new Error("landing.ts has no PDF sample with pages");

const pages = book.pages.map((p, i) => [
  ...(i === 0 ? [book.title, ""] : []),
  p.heading,
  "",
  ...p.text,
]);
const out = resolve(import.meta.dirname, "../public", `.${book.pdf}`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, makePdf(pages, { title: book.title }));
console.log(`Wrote ${out}`);
