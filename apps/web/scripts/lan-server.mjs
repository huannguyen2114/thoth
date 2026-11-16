// `pnpm start:lan`: serve the production build on every network interface, behind the passcode gate
// (docs/technical_design/14-phone-and-lan.md).
//
// Why a custom server: Next fills `x-forwarded-for` only when the client did not send one, so a
// remote device could forge "127.0.0.1". This server overwrites `x-thoth-peer` and `x-thoth-proxied`
// from the real socket on every request, and sets THOTH_TRUSTED_PEER so `src/proxy.ts` trusts them.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(webDir);
const require = createRequire(resolve(webDir, "package.json"));

const port = Number(process.env.PORT ?? 3214);
const host = "0.0.0.0";

if (!existsSync(resolve(webDir, ".next/BUILD_ID"))) {
  console.log("No production build yet. Building (this takes a minute)...");
  const r = spawnSync("pnpm", ["build"], { cwd: webDir, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// Load apps/web/.env.local before reading THOTH_PASSCODE.
// (@next/env is next's own dependency, so resolve it from next.)
createRequire(require.resolve("next"))("@next/env").loadEnvConfig(webDir, false);
process.env.THOTH_TRUSTED_PEER = "1";
process.env.NODE_ENV = "production";

const { default: next } = await import(require.resolve("next"));
const app = next({ dev: false, dir: webDir, hostname: host, port });
const handle = app.getRequestHandler();
await app.prepare();

const FORWARDING = ["forwarded", "x-forwarded-for", "x-real-ip", "x-forwarded-host"];
createServer((req, res) => {
  const h = req.headers;
  const proxied =
    FORWARDING.some((k) => h[k] !== undefined) ||
    Object.keys(h).some((k) => k.startsWith("tailscale-"));
  // Overwrite, never trust, whatever the client sent.
  h["x-thoth-peer"] = req.socket.remoteAddress ?? "";
  h["x-thoth-proxied"] = proxied ? "1" : "0";
  handle(req, res);
}).listen(port, host, () => {
  const passcode = (process.env.THOTH_PASSCODE ?? "").length >= 8;
  console.log(`\nThoth is running on port ${port}.`);
  console.log(`  This computer:  http://localhost:${port}`);
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== "IPv4" || i.internal) continue;
      const tail = i.address.startsWith("100.") ? "  (Tailscale)" : "";
      console.log(`  ${name.padEnd(14)} http://${i.address}:${port}${tail}`);
    }
  }
  console.log(
    "\nFrom a phone: join the same Wi-Fi, or install Tailscale on both devices and use the 100.x.y.z address.",
  );
  console.log(
    "Do not use `tailscale serve` or other local proxies unless you read docs/technical_design/14-phone-and-lan.md.",
  );
  if (!passcode) {
    console.log(
      "\n! THOTH_PASSCODE is missing or shorter than 8 characters. Other devices will only see a setup page.",
    );
    console.log("  Add THOTH_PASSCODE=... to apps/web/.env.local and restart.");
  }
});
