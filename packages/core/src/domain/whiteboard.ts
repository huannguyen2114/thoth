import { z } from "zod";
import type { ContentId, SpaceId, WhiteboardId } from "../shared/id";

/**
 * Whiteboard element model (ADR-0031). The contract between Claude, core and the canvas.
 * Coordinates are board units (pixels at 100% zoom), origin top left, y down.
 */
export const boardColors = ["yellow", "peach", "pink", "green", "blue", "purple", "white"] as const;
export const inkColors = ["ink", "terracotta", "blue", "green", "purple"] as const;

/** A link from any element to a place in a content: "[p.3]", "[03:21]", "[§2]" (ADR-0019). */
export const sourceLinkSchema = z.object({
  contentId: z.string().min(1),
  token: z.string().regex(/^\[(p\.\d+|\d{1,2}(:\d{2}){1,2}|§\d+)\]$/, "Use a citation like [p.3]."),
});
export type SourceLink = z.infer<typeof sourceLinkSchema>;

const box = {
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
};
const base = {
  id: z.string().regex(/^[A-Za-z0-9_.~:@+-]{1,40}$/),
  source: sourceLinkSchema.optional(),
  /** Who made it: Claude's elements may be changed by Claude; people's only when asked. */
  by: z.enum(["claude", "person"]).default("person"),
  locked: z.boolean().optional(),
};

export const elementSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    ...box,
    type: z.literal("shape"),
    kind: z.enum(["rect", "rounded", "ellipse", "diamond", "pill"]).default("rounded"),
    color: z.enum(boardColors).default("green"),
    text: z.string().max(4000).default(""),
    size: z.enum(["small", "body", "large", "title"]).default("body"),
  }),
  z.object({
    ...base,
    ...box,
    type: z.literal("sticky"),
    color: z.enum(boardColors).default("yellow"),
    text: z.string().max(4000).default(""),
  }),
  z.object({
    ...base,
    type: z.literal("text"),
    x: z.number(),
    y: z.number(),
    text: z.string().max(4000),
    size: z.enum(["small", "body", "large", "title", "huge"]).default("body"),
    color: z.enum(inkColors).default("ink"),
    /** Wrap width; omitted = no wrapping. */
    wrap: z.number().positive().optional(),
  }),
  z.object({
    ...base,
    ...box,
    type: z.literal("section"),
    title: z.string().max(200).default(""),
    color: z.enum(boardColors).default("white"),
  }),
  z.object({
    ...base,
    type: z.literal("arrow"),
    from: z.string(),
    to: z.string(),
    label: z.string().max(200).optional(),
    dash: z.boolean().optional(),
    color: z.enum(inkColors).default("ink"),
  }),
  z.object({
    ...base,
    type: z.literal("table"),
    x: z.number(),
    y: z.number(),
    /** Row 0 is the header. Short cells. */
    rows: z
      .array(z.array(z.string().max(300)))
      .min(1)
      .max(40),
    colWidths: z.array(z.number().positive()).optional(),
  }),
  z.object({
    ...base,
    ...box,
    type: z.literal("image"),
    /** An inline SVG drawing (data:image/svg+xml,...). No <text>; labels go in text elements. */
    svg: z.string().max(200_000),
  }),
]);
export type BoardElement = z.infer<typeof elementSchema>;

/** Operations Claude (or the UI) applies to a board; validated, then applied in order. */
export const boardOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), element: elementSchema }),
  z.object({
    op: z.literal("update"),
    id: z.string(),
    /** Changed fields only. */
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({ op: z.literal("remove"), id: z.string() }),
]);
export type BoardOp = z.infer<typeof boardOpSchema>;

export interface Whiteboard {
  id: WhiteboardId;
  contentId: ContentId | null;
  spaceId: SpaceId | null;
  title: string;
  /** Back to front. */
  elements: BoardElement[];
  /** Bumped on every save; a save with a stale version is refused (ADR-0031). */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
