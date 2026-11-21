// The desktop app's server entry (docs/technical_design/19-desktop-app.md).
//
// The Tauri shell runs this file on the bundled Node binary, from the standalone build's
// `apps/web` folder (prepare-sidecar.mjs copies it next to Next's own `server.js`). It replaces
// `server.js` because the desktop app needs three things that file cannot do:
//
// 1. Loopback only. It always listens on 127.0.0.1 (ADR-0027, ADR-0036) and refuses any other
//    HOSTNAME. Next's `server.js` defaults to 0.0.0.0.
// 2. Serve on LAN without a second process. On a `lan-start` command (stdin, from the shell) it
//    opens a second listener on 0.0.0.0 with the passcode set. Like `apps/web/scripts/lan-server.mjs`
//    it overwrites `x-thoth-peer` and `x-thoth-proxied` from the real socket on every request, on
//    both listeners, and sets THOTH_TRUSTED_PEER=1, so `src/proxy.ts` can tell local from remote.
//    One process means one job runner and one database writer.
// 3. Find the user's `claude` CLI. The Agent SDK only looks for its per-platform binary package
//    (`@anthropic-ai/claude-agent-sdk-<platform>-<arch>/claude`). Rather than ship that 300 MB
//    binary, this file links the user's installed `claude` into a shim package on NODE_PATH.
//
// Control protocol: one JSON object per line on stdin; events, one JSON object per line on
// stdout, prefixed with `@@thoth ` so they stand apart from Next's logs. When stdin closes (the
// shell quit or crashed) the server exits, so no orphan keeps the port or the database.
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const MIN_PASSCODE_LENGTH = 8;
const LOOPBACK = "127.0.0.1";
const FORWARDING = ["forwarded", "x-forwarded-for", "x-real-ip", "x-forwarded-host"];

function emit(event) {
  process.stdout.write(`@@thoth ${JSON.stringify(event)}\n`);
}

function fail(message) {
  emit({ event: "fatal", message });
  process.exit(1);
}

const host = process.env.HOSTNAME ?? LOOPBACK;
if (host !== LOOPBACK)
  fail(`Refusing HOSTNAME=${host}: the desktop server binds to 127.0.0.1 only.`);
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0) fail("PORT is not set.");
if (!process.env.THOTH_DATA_DIR) fail("THOTH_DATA_DIR is not set.");

process.chdir(dir);
process.env.NODE_ENV = "production";
process.env.THOTH_TRUSTED_PEER = "1";
// LAN serving is off until the owner turns it on, whatever the environment said.
delete process.env.THOTH_PASSCODE;

linkClaudeCli();

// Same start-up as the standalone `server.js`: the build-time config, not next.config.ts.
const { config } = JSON.parse(readFileSync(join(dir, ".next/required-server-files.json"), "utf8"));
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);
const next = require("next");
const app = next({ dev: false, dir, hostname: LOOPBACK, port, conf: config });
const handle = app.getRequestHandler();
await app.prepare();

/** Overwrite, never trust, what the client sent (ADR-0027). */
function stamped(req, res) {
  const h = req.headers;
  const proxied =
    FORWARDING.some((k) => h[k] !== undefined) ||
    Object.keys(h).some((k) => k.startsWith("tailscale-"));
  h["x-thoth-peer"] = req.socket.remoteAddress ?? "";
  h["x-thoth-proxied"] = proxied ? "1" : "0";
  handle(req, res);
}

const local = createServer(stamped);
local.on("error", (e) => fail(`Could not listen on ${LOOPBACK}:${port}: ${e.message}`));
local.listen(port, LOOPBACK, () => emit({ event: "listening", port }));

/** @type {import("node:http").Server | null} */
let lan = null;

function lanUrls(lanPort) {
  const urls = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== "IPv4" || i.internal) continue;
      urls.push({
        name,
        url: `http://${i.address}:${lanPort}`,
        tailscale: i.address.startsWith("100."),
      });
    }
  }
  return urls;
}

function startLan(cmd) {
  const passcode = typeof cmd.passcode === "string" ? cmd.passcode : "";
  if (passcode.length < MIN_PASSCODE_LENGTH) {
    return emit({
      event: "lan-error",
      message: `The passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`,
    });
  }
  const lanPort = Number(cmd.port ?? 3214);
  if (lan) stopLan(false);
  process.env.THOTH_PASSCODE = passcode;
  const server = createServer(stamped);
  server.on("error", (e) => {
    delete process.env.THOTH_PASSCODE;
    lan = null;
    emit({ event: "lan-error", message: `Could not serve on port ${lanPort}: ${e.message}` });
  });
  server.listen(lanPort, "0.0.0.0", () => {
    lan = server;
    emit({ event: "lan-started", port: lanPort, urls: lanUrls(lanPort) });
  });
}

function stopLan(announce = true) {
  delete process.env.THOTH_PASSCODE;
  if (lan) {
    lan.close();
    lan.closeAllConnections?.();
    lan = null;
  }
  if (announce) emit({ event: "lan-stopped" });
}

createInterface({ input: process.stdin })
  .on("line", (line) => {
    let cmd;
    try {
      cmd = JSON.parse(line);
    } catch {
      return;
    }
    if (cmd?.cmd === "lan-start") startLan(cmd);
    else if (cmd?.cmd === "lan-stop") stopLan();
  })
  // The shell holds stdin open for the app's whole life. EOF means it is gone.
  .on("close", () => process.exit(0));
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();

// Belt and braces: if the shell dies without closing the pipe (a hard crash), exit too.
const parent = Number(process.env.THOTH_PARENT_PID);
if (Number.isInteger(parent) && parent > 0) {
  setInterval(() => {
    try {
      process.kill(parent, 0);
    } catch (e) {
      if (e?.code === "ESRCH") process.exit(0);
    }
  }, 2000).unref();
}

/**
 * Puts the user's `claude` where the Agent SDK looks for its native binary:
 * `<data>/runtime/node_modules/@anthropic-ai/claude-agent-sdk-<platform>-<arch>/claude[.exe]`.
 * The shell puts `<data>/runtime/node_modules` on NODE_PATH, which Node's resolver searches last,
 * so an SDK platform package bundled with the app would still win.
 */
function linkClaudeCli() {
  const exe = process.platform === "win32" ? ".exe" : "";
  const found = findOnPath(`claude${exe}`);
  const pkgDir = resolve(
    process.env.THOTH_DATA_DIR,
    "runtime/node_modules/@anthropic-ai",
    `claude-agent-sdk-${process.platform}-${process.arch}`,
  );
  const target = join(pkgDir, `claude${exe}`);
  try {
    rmSync(target, { force: true });
  } catch {}
  if (!found) {
    emit({ event: "claude", found: false });
    return;
  }
  mkdirSync(pkgDir, { recursive: true });
  try {
    symlinkSync(found, target);
  } catch {
    // Windows without Developer Mode cannot symlink. A hard link needs no privilege.
    try {
      linkSync(found, target);
    } catch (e) {
      emit({ event: "claude", found: true, path: found, linked: false, message: String(e) });
      return;
    }
  }
  emit({ event: "claude", found: true, path: found, linked: true });
}

function findOnPath(name) {
  for (const d of (process.env.PATH ?? "").split(delimiter)) {
    if (!d) continue;
    const p = join(d, name);
    try {
      if (existsSync(p) && !lstatSync(p).isDirectory()) return p;
    } catch {}
  }
  return null;
}
