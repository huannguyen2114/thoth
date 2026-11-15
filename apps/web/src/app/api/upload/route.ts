import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { addContent } from "@thoth/core";
import { MAX_UPLOAD_BYTES } from "@/features/library/limits";
import { getContainer } from "@/server/container";
import { env } from "@/server/env";
import { wakeJobRunner } from "@/server/jobs/runner";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (error: string, status: number) => json({ error }, status);

/**
 * POST multipart/form-data with `file` (a PDF) and optional `spaceId`.
 * Saves the file to <THOTH_DATA_DIR>/uploads/<uploadId>.pdf, then calls `addContent`.
 * A route handler rather than a Server Action because actions cap bodies at 1 MB.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return fail("This file is over 50 MB. Choose a smaller PDF, or split it first.", 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("We could not read the upload. Choose the file again.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("Choose a PDF file to upload.", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail("This file is over 50 MB. Choose a smaller PDF, or split it first.", 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(bytes)) {
    return fail("This file is not a PDF. Choose a .pdf file.", 415);
  }

  const dir = resolve(env.THOTH_DATA_DIR, "uploads");
  const filePath = resolve(dir, `${randomUUID()}.pdf`);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, bytes);

  const spaceId = form.get("spaceId");
  const result = await addContent(await getContainer(), {
    kind: "pdf",
    filePath,
    fileName: file.name || "Untitled.pdf",
    spaceId: typeof spaceId === "string" && spaceId ? spaceId : null,
  });
  if (!result.ok) {
    await rm(filePath, { force: true });
    return fail(result.error.message, 400);
  }
  wakeJobRunner();
  return json({ id: result.value.id }, 201);
}

/** Every PDF starts with "%PDF-" (some tools put a few bytes before it). */
function isPdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}
