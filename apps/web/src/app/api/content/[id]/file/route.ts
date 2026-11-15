import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import type { ContentId } from "@thoth/core";
import { getContainer } from "@/server/container";
import { env } from "@/server/env";

const mimeByKind = { pdf: "application/pdf" } as const;

/**
 * GET /api/content/[id]/file: streams the uploaded file of a content (the PDF viewer reads it).
 * `content.filePath` is relative to THOTH_DATA_DIR or absolute inside it; anything outside the
 * data folder is refused so a bad row can never expose other files.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/content/[id]/file">) {
  const { id } = await ctx.params;
  const content = await (await getContainer()).contents.get(id as ContentId);
  if (!content?.filePath) return new Response("No file for this content.", { status: 404 });

  const dataDir = resolve(env.THOTH_DATA_DIR);
  const path = resolve(dataDir, content.filePath);
  const rel = relative(dataDir, path);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return new Response("File is outside the data folder.", { status: 403 });
  }

  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return new Response("The file is missing.", { status: 404 });

  const type = content.kind === "pdf" ? mimeByKind.pdf : "application/octet-stream";
  const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(info.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
