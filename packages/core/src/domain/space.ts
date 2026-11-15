import { z } from "zod";
import type { SpaceId } from "../shared/id";

export interface Space {
  id: SpaceId;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const createSpaceInput = z.object({
  name: z.string().trim().min(1, "Enter a name for the space.").max(120),
  description: z.string().trim().max(1000).nullable().default(null),
});
export type CreateSpaceInput = z.input<typeof createSpaceInput>;
export type NewSpace = z.output<typeof createSpaceInput>;
