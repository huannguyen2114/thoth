/**
 * Secrets such as provider API keys (Phase 10, doc 20). The web app implements this on the OS
 * keychain; keys never go in the database, a settings file or the browser.
 * Errors here are environment problems (no keychain on a headless Linux box), so `available`
 * says whether saving can work at all and the UI explains the env var fallback.
 */
export interface SecretStore {
  readonly available: boolean;
  get(ref: string): Promise<string | null>;
  set(ref: string, value: string): Promise<void>;
  delete(ref: string): Promise<void>;
}
