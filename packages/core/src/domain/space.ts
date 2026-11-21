import { z } from "zod";
import type { SpaceId } from "../shared/id";
import { type AccentColor, accentColors } from "./tag";

/** Icon names the space picker offers (Hearth icon set). Phase 10, doc 22. */
export const spaceIcons = [
  "book",
  "flask",
  "calculator",
  "globe",
  "code",
  "music",
  "palette",
  "briefcase",
  "heart",
  "star",
] as const;
export type SpaceIcon = (typeof spaceIcons)[number];

export interface Space {
  id: SpaceId;
  name: string;
  description: string | null;
  /** Null until the owner picks one; the UI shows the default accent. */
  color: AccentColor | null;
  icon: SpaceIcon | null;
  createdAt: Date;
  updatedAt: Date;
}

export const createSpaceInput = z.object({
  name: z.string().trim().min(1, "Enter a name for the space.").max(120),
  description: z.string().trim().max(1000).nullable().default(null),
  color: z.enum(accentColors).nullable().default(null),
  icon: z.enum(spaceIcons).nullable().default(null),
});
export type CreateSpaceInput = z.input<typeof createSpaceInput>;
export type NewSpace = z.output<typeof createSpaceInput>;

/** Every field optional and without defaults, so an update only touches what it names. */
export const updateSpaceInput = z.object({
  name: z.string().trim().min(1, "Enter a name for the space.").max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  color: z.enum(accentColors).nullable().optional(),
  icon: z.enum(spaceIcons).nullable().optional(),
});
export type UpdateSpaceInput = z.input<typeof updateSpaceInput>;
