import type { SecretStore } from "@thoth/core";

/**
 * `SecretStore` on the OS keychain through `@napi-rs/keyring` (doc 20, ADR-0037): macOS
 * Keychain, Windows Credential Manager or Linux Secret Service. Every entry is under the
 * service "Thoth", with the profile's `keyRef` as the account.
 *
 * `available` is decided once by a harmless read. When the keychain cannot be used (a headless
 * Linux box without Secret Service, a locked or missing backend) it is false, reads return
 * null, and Settings tells the owner to use the environment variables instead.
 *
 * Not marked `server-only` so the fallback test can import it; only the container uses it.
 */
export const KEYCHAIN_SERVICE = "Thoth";

export interface KeychainEntry {
  getPassword(): Promise<string | null>;
  setPassword(password: string): Promise<void>;
  deletePassword(): Promise<boolean>;
}
export type EntryFactory = (service: string, account: string) => KeychainEntry;

export class KeychainSecretStore implements SecretStore {
  private constructor(
    private readonly entry: EntryFactory | null,
    readonly available: boolean,
  ) {}

  /** Loads the native addon and probes the keychain. Never throws. */
  static async create(factory?: EntryFactory): Promise<KeychainSecretStore> {
    let entry = factory ?? null;
    if (!entry) {
      try {
        const { AsyncEntry } = await import("@napi-rs/keyring");
        entry = (service, account) => new AsyncEntry(service, account);
      } catch {
        return new KeychainSecretStore(null, false);
      }
    }
    try {
      await entry(KEYCHAIN_SERVICE, "availability-probe").getPassword();
      return new KeychainSecretStore(entry, true);
    } catch {
      return new KeychainSecretStore(entry, false);
    }
  }

  async get(ref: string): Promise<string | null> {
    if (!this.entry || !this.available) return null;
    try {
      return await this.entry(KEYCHAIN_SERVICE, ref).getPassword();
    } catch {
      return null;
    }
  }

  async set(ref: string, value: string): Promise<void> {
    if (!this.entry || !this.available) throw new Error("No OS keychain is available.");
    await this.entry(KEYCHAIN_SERVICE, ref).setPassword(value);
  }

  async delete(ref: string): Promise<void> {
    if (!this.entry || !this.available) return;
    await this.entry(KEYCHAIN_SERVICE, ref).deletePassword();
  }
}
