/** Branded string IDs so a SpaceId can never be passed where a ContentId is expected. */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type SpaceId = Brand<string, "SpaceId">;
export type ContentId = Brand<string, "ContentId">;
export type SegmentId = Brand<string, "SegmentId">;
export type ChapterId = Brand<string, "ChapterId">;
export type ChatId = Brand<string, "ChatId">;
export type MessageId = Brand<string, "MessageId">;
export type StudySetId = Brand<string, "StudySetId">;
export type QuizQuestionId = Brand<string, "QuizQuestionId">;
export type QuizAttemptId = Brand<string, "QuizAttemptId">;
export type FlashcardId = Brand<string, "FlashcardId">;
export type ReviewId = Brand<string, "ReviewId">;
export type JobId = Brand<string, "JobId">;

/** Random UUID. Swap for UUIDv7 if ordering by ID is ever needed. */
export const newId = <T extends string>(): T => crypto.randomUUID() as T;
