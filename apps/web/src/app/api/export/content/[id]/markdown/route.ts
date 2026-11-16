import { type ContentId, exportContentMarkdown } from "@thoth/core";
import { downloadResponse } from "@/features/export/download-response";
import { getContainer } from "@/server/container";

/** GET /api/export/content/[id]/markdown: notes and ready summaries as one .md file. */
export async function GET(_req: Request, ctx: RouteContext<"/api/export/content/[id]/markdown">) {
  const { id } = await ctx.params;
  return downloadResponse(await exportContentMarkdown(await getContainer(), id as ContentId));
}
