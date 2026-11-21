import { z } from "zod";
import type { TagId } from "../shared/id";

/** Hearth accent names for tags and spaces, never hex (ADR-0009). */
export const accentColors = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
] as const;
export type AccentColor = (typeof accentColors)[number];

/** Labels on contents, shown as filter chips in the library (Phase 10, doc 22). */
export interface Tag {
  id: TagId;
  name: string;
  color: AccentColor;
}

export const tagInput = z.object({
  name: z.string().trim().min(1, "Enter a tag name.").max(40),
  color: z.enum(accentColors).default("gray"),
});
export type TagInput = z.input<typeof tagInput>;
