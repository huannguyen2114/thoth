import type { ContentKind } from "@thoth/core";

/** Each kind of source has its own tone (ADR-0047), used for icon tiles and cards. */
export const kindTone: Record<ContentKind, string> = {
  pdf: "tone-butter",
  youtube: "tone-peach",
  webpage: "tone-sky",
  text: "tone-sage",
};
