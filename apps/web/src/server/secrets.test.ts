import { describe, expect, it } from "vitest";
import { type EntryFactory, KEYCHAIN_SERVICE, KeychainSecretStore } from "./secrets";

function memoryKeychain() {
  const map = new Map<string, string>();
  const factory: EntryFactory = (service, account) => ({
    getPassword: async () => map.get(`${service}/${account}`) ?? null,
    setPassword: async (v) => void map.set(`${service}/${account}`, v),
    deletePassword: async () => map.delete(`${service}/${account}`),
  });
  return { map, factory };
}

describe("KeychainSecretStore", () => {
  it("stores keys under the Thoth service", async () => {
    const { map, factory } = memoryKeychain();
    const store = await KeychainSecretStore.create(factory);
    expect(store.available).toBe(true);
    await store.set("profile-openrouter", "sk-or-1");
    expect(map.get(`${KEYCHAIN_SERVICE}/profile-openrouter`)).toBe("sk-or-1");
    expect(await store.get("profile-openrouter")).toBe("sk-or-1");
    await store.delete("profile-openrouter");
    expect(await store.get("profile-openrouter")).toBeNull();
  });

  it("is unavailable, not crashing, when the keychain throws (headless Linux)", async () => {
    const broken: EntryFactory = () => ({
      getPassword: () => Promise.reject(new Error("Platform secure storage failure")),
      setPassword: () => Promise.reject(new Error("Platform secure storage failure")),
      deletePassword: () => Promise.reject(new Error("Platform secure storage failure")),
    });
    const store = await KeychainSecretStore.create(broken);
    expect(store.available).toBe(false);
    expect(await store.get("anthropic-api")).toBeNull();
    await expect(store.set("anthropic-api", "x")).rejects.toThrow(/keychain/);
    await expect(store.delete("anthropic-api")).resolves.toBeUndefined();
  });
});
