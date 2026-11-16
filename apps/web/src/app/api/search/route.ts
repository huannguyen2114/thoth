import { searchEverything } from "@thoth/core";
import { getContainer } from "@/server/container";

/** GET /api/search?q=: titles, notes and source text, ranked (Cmd+K palette). */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 200);
  const hits = await searchEverything(await getContainer(), { query: q });
  return Response.json({ hits }, { headers: { "Cache-Control": "no-store" } });
}
