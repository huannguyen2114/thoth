import { z } from "zod";

export const flashcardOptionsSchema = z.object({
  count: z.number().int().min(1, "Ask for at least 1 card.").max(60, "Ask for 60 cards or fewer."),
  /** Chapter ids. Empty means every chapter. */
  chapterIds: z.array(z.string()),
  focus: z.string().trim().max(500).default(""),
  language: z.string().trim().min(1).max(40).default("English"),
});
export type FlashcardOptions = z.infer<typeof flashcardOptionsSchema>;

export const generatedCardsSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().trim().min(3),
        back: z.string().trim().min(1),
        /** One of the topic titles given in the prompt. */
        topic: z.string(),
        /** A citation token copied from the source, for example "[p.3]" or "[03:21]". */
        source: z.string().nullable(),
      }),
    )
    .min(1),
});

export const cardTextSchema = z.object({
  front: z.string().trim().min(1, "The front of a card cannot be empty."),
  back: z.string().trim().min(1, "The back of a card cannot be empty."),
});
