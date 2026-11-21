import { connection } from "next/server";
import { getContainer } from "@/server/container";

/**
 * GET /api/health: 200 once the server can serve the app (doc 19).
 * The desktop shell polls it before it shows the window. Building the container opens the
 * database and runs migrations, so "ready" means the first page will not fail on the DB.
 */
export async function GET() {
  await connection();
  await getContainer();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
