import { z } from "zod";
import type { AnnotationId, ContentId } from "../shared/id";
import { type SourceAnchor, sourceAnchorSchema } from "./link";

/**
 * Marks the owner puts on a source (Phase 10, doc 21): highlights, freehand ink, shapes and
 * comments. Stored apart from the file; the original PDF is never changed.
 */
export const annotationKinds = ["highlight", "ink", "shape", "comment"] as const;
export type AnnotationKind = (typeof annotationKinds)[number];

/** Hearth accent names, never hex (ADR-0009). The viewer maps them to token classes. */
export const annotationColors = ["yellow", "green", "blue", "pink", "purple"] as const;
export type AnnotationColor = (typeof annotationColors)[number];

const point = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
]);

/** Geometry in 0..1 page space. Highlights use the anchor's rects and need no payload. */
export const annotationPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ink"),
    page: z.number().int().min(1),
    /** Each stroke is a list of [x, y, pressure]. */
    strokes: z.array(z.array(point).min(1)).min(1),
    width: z.number().min(0).max(0.05),
  }),
  z.object({
    type: z.literal("shape"),
    page: z.number().int().min(1),
    shape: z.enum(["rect", "ellipse", "arrow"]),
    x1: z.number().min(0).max(1),
    y1: z.number().min(0).max(1),
    x2: z.number().min(0).max(1),
    y2: z.number().min(0).max(1),
  }),
]);
export type AnnotationPayload = z.infer<typeof annotationPayloadSchema>;

export interface Annotation {
  id: AnnotationId;
  contentId: ContentId;
  kind: AnnotationKind;
  /** Always a `content` anchor: locator (page/time/paragraph), quote, and rects for PDFs. */
  anchor: Extract<SourceAnchor, { kind: "content" }>;
  color: AnnotationColor;
  comment: string | null;
  payload: AnnotationPayload | null;
  createdAt: Date;
  updatedAt: Date;
}

export const newAnnotationInput = z.object({
  kind: z.enum(annotationKinds),
  anchor: sourceAnchorSchema,
  color: z.enum(annotationColors).default("yellow"),
  comment: z.string().trim().max(4000).nullable().default(null),
  payload: annotationPayloadSchema.nullable().default(null),
});
export type NewAnnotationInput = z.input<typeof newAnnotationInput>;
export type NewAnnotation = Omit<Annotation, "id" | "createdAt" | "updatedAt">;
