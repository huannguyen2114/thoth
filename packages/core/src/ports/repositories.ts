import type { Content } from "../domain/content";
import type { NewSpace, Space } from "../domain/space";
import type { ContentId, SpaceId } from "../shared/id";

/** Persistence ports. Implemented by @thoth/db. Use cases depend on these, never on Drizzle. */
export interface SpaceRepository {
  create(input: NewSpace): Promise<Space>;
  get(id: SpaceId): Promise<Space | null>;
  list(): Promise<Space[]>;
}

export interface ContentRepository {
  get(id: ContentId): Promise<Content | null>;
  listRecent(limit: number): Promise<Content[]>;
}
