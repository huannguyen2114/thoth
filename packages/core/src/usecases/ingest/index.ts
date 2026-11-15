export * from "./add-content";
export * from "./chapters";
export * from "./prompts";
export * from "./run-ingest-job";
export * from "./source-url";

import type { Content } from "../../domain/content";
import type { ContentRepository } from "../../ports/repositories";

/** Newest first: what the home page's Recents list shows. */
export function listRecentContents(
  deps: { contents: ContentRepository },
  limit = 20,
): Promise<Content[]> {
  return deps.contents.listRecent(limit);
}
