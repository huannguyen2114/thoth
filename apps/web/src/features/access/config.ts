export const MIN_PASSCODE_LENGTH = 8;

export type AccessConfig =
  | { state: "unset" }
  | { state: "too-short" }
  | { state: "ready"; passcode: string };

export function readAccessConfig(
  env: Record<string, string | undefined> = process.env,
): AccessConfig {
  const passcode = env.THOTH_PASSCODE;
  if (!passcode) return { state: "unset" };
  if (passcode.length < MIN_PASSCODE_LENGTH) return { state: "too-short" };
  return { state: "ready", passcode };
}

/** True only inside `scripts/lan-server.mjs`, which overwrites the peer headers on every request. */
export function hasTrustedPeer(env: Record<string, string | undefined> = process.env): boolean {
  return env.THOTH_TRUSTED_PEER === "1";
}
