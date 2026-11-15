import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDb, migrateDb } from "./client";
import { DrizzleChapterRepository } from "./repositories/chapter-repository";
import { DrizzleSegmentRepository } from "./repositories/segment-repository";
import { SAMPLE_LECTURE_ID, SAMPLE_PDF_ID, seedSampleContent } from "./seed";

describe("seedSampleContent", () => {
  it("is idempotent and searchable", async () => {
    const db = createDb(":memory:");
    await migrateDb(db, fileURLToPath(new URL("../drizzle", import.meta.url)));
    await seedSampleContent(db);
    await seedSampleContent(db);
    const segs = new DrizzleSegmentRepository(db);
    expect(await segs.listByContent(SAMPLE_PDF_ID)).toHaveLength(6);
    expect(await new DrizzleChapterRepository(db).listByContent(SAMPLE_LECTURE_ID)).toHaveLength(6);
    const hits = await segs.search([SAMPLE_PDF_ID], "ATP synthase", 3);
    expect(hits[0]?.segment.locator).toEqual({ type: "page", page: 5 });
  });
});
