#!/usr/bin/env node
// Headless smoke test of the bundled server (doc 19). CI runs it on every target.
//
//   node scripts/smoke.mjs                       the prepared sidecar (src-tauri/binaries + resources)
//   node scripts/smoke.mjs --app Thoth.app       the server inside a built macOS app
//
// It starts the server the way the shell does, waits for GET /api/health, loads the home page,
// checks it listens on 127.0.0.1 only, checks Serve on LAN (refused without a passcode, gated with
// one, closed on stop), then closes
// stdin and expects the server to exit (what happens when the app quits or crashes).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

/** Same names as prepare-sidecar.mjs (Tauri's externalBin suffix). */
function hostTriple() {
  const os = { darwin: "apple-darwin", win32: "pc-windows-msvc", linux: "unknown-linux-gnu" };
  const cpu = { arm64: "aarch64", x64: "x86_64" };
  return `${cpu[process.arch]}-${os[process.platform]}`;
}

let node;
let server;
const appOpt = option("--app");
const app = appOpt && resolve(appOpt);
if (app) {
  node = join(app, "Contents/MacOS/node");
  server = join(app, "Contents/Resources/server");
} else {
  const exe = process.platform === "win32" ? ".exe" : "";
  node = option("--node")
    ? resolve(option("--node"))
    : join(desktopDir, "src-tauri/binaries", `node-${hostTriple()}${exe}`);
  server = resolve(option("--server") ?? join(desktopDir, "src-tauri/resources/server"));
}

const port = Number(option("--port") ?? 47390);
const dataDir = mkdtempSync(join(tmpdir(), "thoth-smoke-"));
const webDir = join(server, "apps/web");
const base = `http://127.0.0.1:${port}`;

function check(ok, message) {
  if (!ok) {
    console.error(`✗ ${message}`);
    child.kill();
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

console.log(`node:   ${node}\nserver: ${server}\ndata:   ${dataDir}`);

/** Loads a bundled package with the bundled Node, as the server would. */
function loads(code) {
  const r = spawnSync(node, ["-e", code], { cwd: server, encoding: "utf8" });
  if (r.status !== 0) console.error(r.stderr.slice(-2000));
  return r.status === 0;
}
// Native modules for this target (ADR-0036). Checked before the server starts, so a missing
// binary fails here with its own error rather than as a vague runtime fallback.
const nativeChecks = [
  ["libsql", "require('libsql')"],
  ["onnxruntime-node", "require('onnxruntime-node').InferenceSession"],
];
const ortBin = join(
  server,
  "node_modules/onnxruntime-node/bin/napi-v6",
  process.platform,
  process.arch,
);
for (const [pkg, code] of nativeChecks) {
  if (pkg === "onnxruntime-node" && !existsSync(ortBin)) {
    console.warn(
      `! onnxruntime-node has no ${process.platform}-${process.arch} binary: search is keyword-only here.`,
    );
    continue;
  }
  if (!loads(code)) {
    console.error(`✗ ${pkg} does not load from the bundle`);
    process.exit(1);
  }
  console.log(`✓ ${pkg} loads from the bundle`);
}

const child = spawn(node, [join(webDir, "thoth-server.mjs")], {
  cwd: webDir,
  stdio: ["pipe", "pipe", "inherit"],
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME ?? "",
    USERPROFILE: process.env.USERPROFILE ?? "",
    SYSTEMROOT: process.env.SYSTEMROOT ?? "",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    THOTH_DATA_DIR: dataDir,
    THOTH_MIGRATIONS_DIR: join(server, "packages/db/drizzle"),
    NODE_PATH: join(dataDir, "runtime/node_modules"),
    NEXT_TELEMETRY_DISABLED: "1",
  },
});

const events = [];
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let nl = buffer.indexOf("\n");
  while (nl !== -1) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    process.stdout.write(`  | ${line}\n`);
    if (line.startsWith("@@thoth ")) events.push(JSON.parse(line.slice(8)));
    nl = buffer.indexOf("\n");
  }
});
const exited = new Promise((r) => child.on("exit", (code) => r(code)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function status(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(5000) })).status;
  } catch {
    return 0;
  }
}

const started = Date.now();
let health = 0;
while (Date.now() - started < 120_000) {
  health = await status(`${base}/api/health`);
  if (health === 200) break;
  await sleep(500);
}
check(health === 200, `GET /api/health → 200 in ${Date.now() - started} ms`);
check((await status(`${base}/`)) === 200, "GET / → 200");

const lanIp = Object.values(networkInterfaces())
  .flat()
  .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
if (lanIp) {
  check((await status(`http://${lanIp}:${port}/`)) === 0, `not reachable on ${lanIp}`);
}

child.stdin.write(`${JSON.stringify({ cmd: "lan-start", passcode: "short", port: port + 1 })}\n`);
await sleep(1000);
check(
  events.some((e) => e.event === "lan-error") && !events.some((e) => e.event === "lan-started"),
  "Serve on LAN refuses a passcode under 8 characters",
);

// With a passcode, the LAN listener is behind the gate; loopback is not.
const lanPort = port + 1;
child.stdin.write(
  `${JSON.stringify({ cmd: "lan-start", passcode: "smoke-test-passcode", port: lanPort })}\n`,
);
await sleep(1500);
check(
  events.some((e) => e.event === "lan-started"),
  "Serve on LAN starts with a passcode",
);
if (lanIp) {
  const remote = await fetch(`http://${lanIp}:${lanPort}/api/health`, { redirect: "manual" })
    .then((r) => r.status)
    .catch(() => 0);
  check(remote === 401, `LAN request without a session → 401 (got ${remote})`);
  const forged = await fetch(`http://${lanIp}:${lanPort}/api/health`, {
    headers: { "X-Forwarded-For": "127.0.0.1", Host: `localhost:${lanPort}` },
  })
    .then((r) => r.status)
    .catch(() => 0);
  check(forged === 401, `forged localhost headers from the LAN → 401 (got ${forged})`);
} else {
  console.warn("! no LAN address on this machine: skipped the remote gate checks");
}
check((await status(`${base}/api/health`)) === 200, "loopback still needs no passcode");
child.stdin.write(`${JSON.stringify({ cmd: "lan-stop" })}\n`);
await sleep(800);
check(
  events.some((e) => e.event === "lan-stopped"),
  "Serve on LAN stops",
);
if (lanIp) {
  check((await status(`http://${lanIp}:${lanPort}/`)) === 0, "LAN port closed after stop");
}

child.stdin.end();
const code = await Promise.race([exited, sleep(15_000).then(() => "timeout")]);
check(code !== "timeout", "exits when stdin closes");
rmSync(dataDir, { recursive: true, force: true });
console.log("Smoke test passed.");
