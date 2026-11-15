/** Branded string IDs so a SpaceId can never be passed where a ContentId is expected. */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type SpaceId = Brand<string, "SpaceId">;
export type ContentId = Brand<string, "ContentId">;

/** Time-sortable-enough random ID. Swap for UUIDv7 if ordering by ID is ever needed. */
export const newId = <T extends string>(): T => crypto.randomUUID() as T;
