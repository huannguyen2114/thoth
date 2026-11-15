/**
 * Result type for expected failures. Use exceptions only for bugs and
 * unrecoverable infrastructure errors. See docs/decision/0005.
 */
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type AppErrorCode =
  | "not_found"
  | "validation"
  | "conflict"
  | "llm_unavailable"
  | "llm_bad_output"
  | "ingest_failed";

export interface AppError {
  code: AppErrorCode;
  message: string;
  cause?: unknown;
}

export const appError = (code: AppErrorCode, message: string, cause?: unknown): AppError =>
  cause === undefined ? { code, message } : { code, message, cause };
