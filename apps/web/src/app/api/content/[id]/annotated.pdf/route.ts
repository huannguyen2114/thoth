import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { type ContentId, listAnnotations } from "@thoth/core";
import { writeAnnotatedPdf } from "@/features/annotations/pdf-export";
import { getContainer } from "@/server/container";
import { env } from "@/server/env";

/**
 * GET /api/content/[id]/annotated.pdf: a copy of the stored PDF with its annotations written in
 * as standard PDF annotations (doc 21). The stored file is never changed. Same data-folder
 * guard as `/file`.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/content/[id]/annotated.pdf">) {
  const { id } = await ctx.params;
  const c = await getContainer();
  const content = await c.contents.get(id as ContentId);
  if (!content?.filePath || content.kind !== "pdf") {
    return new Response("This content has no PDF file.", { status: 404 });
  }
  const dataDir = resolve(env.THOTH_DATA_DIR);
  const path = resolve(dataDir, content.filePath);
  const rel = relative(dataDir, path);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return new Response("File is outside the data folder.", { status: 403 });
  }
  const original = await readFile(path).catch(() => null);
  if (!original) return new Response("The file is missing.", { status: 404 });

  let bytes: Uint8Array;
  try {
    bytes = await writeAnnotatedPdf(new Uint8Array(original), await listAnnotations(c, content.id));
  } catch (cause) {
    console.error("Annotated PDF export failed", cause);
    return new Response("This PDF could not be annotated. Download the original instead.", {
      status: 422,
    });
  }
  const name = `${content.title.replace(/[^\p{L}\p{N} ._-]+/gu, "").trim() || "document"} (annotated).pdf`;
  return new Response(new Blob([bytes as BlobPart]), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="annotated.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
