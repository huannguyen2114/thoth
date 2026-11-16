import type { AppError, ExportFile, Result } from "@thoth/core";

/** A file download (attachment) or the error as JSON with a fitting status. */
export function downloadResponse(r: Result<ExportFile>): Response {
  if (!r.ok) return errorResponse(r.error);
  const { filename, mime, body } = r.value;
  return new Response(body, {
    headers: {
      "Content-Type": mime,
      // Filenames are ASCII slugs (see slugify), so the plain form is safe.
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function errorResponse(error: AppError): Response {
  const status = error.code === "not_found" ? 404 : 400;
  return Response.json({ error: error.message }, { status });
}
