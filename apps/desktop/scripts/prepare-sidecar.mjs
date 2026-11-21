#!/usr/bin/env node
// Assembles what the Tauri bundle ships next to the Rust shell (doc 19):
//
//   src-tauri/binaries/node-<target triple>[.exe]   the official Node 22 binary (externalBin)
//   src-tauri/resources/server/                     the Next standalone server, flattened
//   ui/hearth-tokens.css                            Hearth tokens for the shell's own pages
//
// Usage: node scripts/prepare-sidecar.mjs [--target <triple>] [--skip-build] [--if-missing]
//
// The standalone build is copied without symlinks. pnpm's layout is all symlinks, and they do not
// survive Tauri's resource copy or a Windows installer, so every package is hoisted into one flat
// `node_modules`. Native modules (libSQL, ONNX Runtime, sharp) come from this machine's install,
// so the target must match the host: CI builds each target on its own runner (ADR-0036).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Node line shipped with the app. Bump deliberately; CI and `.nvmrc` use 22 too. */
const NODE_VERSION = "22.23.5";

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(desktopDir, "../..");
const webDir = join(repoRoot, "apps/web");
const tauriDir = join(desktopDir, "src-tauri");
const cacheDir = join(desktopDir, ".cache");
const outServer = join(tauriDir, "resources/server");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const TARGETS = {
  "aarch64-apple-darwin": { platform: "darwin", arch: "arm64", dist: "darwin-arm64" },
  "x86_64-apple-darwin": { platform: "darwin", arch: "x64", dist: "darwin-x64" },
  "x86_64-pc-windows-msvc": { platform: "win32", arch: "x64", dist: "win-x64" },
  "aarch64-pc-windows-msvc": { platform: "win32", arch: "arm64", dist: "win-arm64" },
  "x86_64-unknown-linux-gnu": { platform: "linux", arch: "x64", dist: "linux-x64" },
  "aarch64-unknown-linux-gnu": { platform: "linux", arch: "arm64", dist: "linux-arm64" },
};

const triple = option("--target") ?? process.env.TAURI_ENV_TARGET_TRIPLE ?? hostTriple();
const target = TARGETS[triple];
if (!target) die(`Unsupported target ${triple}. Known: ${Object.keys(TARGETS).join(", ")}`);
if (target.platform !== process.platform || target.arch !== process.arch) {
  die(
    `Target ${triple} does not match this machine (${process.platform}-${process.arch}). ` +
      "Native modules come from the local install, so build each target on its own OS (CI does).",
  );
}

const exe = target.platform === "win32" ? ".exe" : "";
const nodeOut = join(tauriDir, "binaries", `node-${triple}${exe}`);
const serverEntry = join(outServer, "apps/web/thoth-server.mjs");

if (flag("--if-missing") && existsSync(nodeOut) && existsSync(serverEntry)) {
  console.log("Sidecar already prepared (--if-missing).");
  process.exit(0);
}

await prepareNode();
if (!flag("--skip-build")) buildStandalone();
assembleServer();
copyShellTokens();
console.log(`\nSidecar ready for ${triple}.`);

// ---------------------------------------------------------------------------------------------

function die(message) {
  console.error(`prepare-sidecar: ${message}`);
  process.exit(1);
}

/** This machine's triple, from Node (rustc may not be on PATH yet). */
function hostTriple() {
  return Object.entries(TARGETS).find(
    ([, t]) => t.platform === process.platform && t.arch === process.arch,
  )?.[0];
}

async function download(url, file) {
  if (existsSync(file)) return;
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) die(`GET ${url} answered ${res.status}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function prepareNode() {
  const base = `https://nodejs.org/dist/v${NODE_VERSION}`;
  const name = `node-v${NODE_VERSION}-${target.dist}`;
  const archive = target.platform === "win32" ? `${name}.zip` : `${name}.tar.gz`;
  const dir = join(cacheDir, `node-v${NODE_VERSION}`);
  const file = join(dir, archive);
  const sums = join(dir, "SHASUMS256.txt");
  await download(`${base}/SHASUMS256.txt`, sums);
  await download(`${base}/${archive}`, file);

  // Verify before anything is extracted. A mismatch deletes the download so a rerun refetches.
  const expected = readFileSync(sums, "utf8")
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .find(([, f]) => f === archive)?.[0];
  if (!expected) die(`${archive} is not listed in SHASUMS256.txt`);
  const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (actual !== expected) {
    rmSync(file);
    die(`SHA-256 mismatch for ${archive}: expected ${expected}, got ${actual}`);
  }
  console.log(`Verified ${archive} (sha256 ${actual.slice(0, 16)}…)`);

  const extractDir = join(dir, `extract-${target.dist}`);
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });
  // bsdtar (macOS, Windows 10+) and GNU tar both read .tar.gz; bsdtar also reads .zip.
  const inner = target.platform === "win32" ? `${name}/node.exe` : `${name}/bin/node`;
  // On Windows use System32's bsdtar: Git's GNU tar, often first on PATH, cannot read .zip.
  const sysTar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  const tar = target.platform === "win32" && existsSync(sysTar) ? sysTar : "tar";
  const r = spawnSync(tar, ["-xf", file, "-C", extractDir, inner], { stdio: "inherit" });
  if (r.status !== 0) die(`Could not extract ${inner} from ${archive}`);
  mkdirSync(dirname(nodeOut), { recursive: true });
  cpSync(join(extractDir, inner), nodeOut);
  if (exe === "") chmodSync(nodeOut, 0o755);
  rmSync(extractDir, { recursive: true, force: true });
  console.log(`Node ${NODE_VERSION} → ${relative(desktopDir, nodeOut)}`);
}

function buildStandalone() {
  console.log("\nBuilding the standalone server (THOTH_STANDALONE=1)…");
  const r = spawnSync("pnpm", ["--filter", "@thoth/web", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, THOTH_STANDALONE: "1", NEXT_TELEMETRY_DISABLED: "1" },
    shell: process.platform === "win32",
  });
  if (r.status !== 0) die("The web build failed.");
}

/** `.pnpm/<id>/node_modules/<name>` or `.../@scope/<name>`: every real package directory. */
function pnpmPackages(store) {
  const out = [];
  for (const id of readdirSync(store)) {
    const nm = join(store, id, "node_modules");
    if (!existsSync(nm) || id === "node_modules") continue;
    for (const entry of readdirSync(nm)) {
      const names = entry.startsWith("@")
        ? readdirSync(join(nm, entry)).map((n) => `${entry}/${n}`)
        : [entry];
      for (const name of names) {
        const p = join(nm, name);
        if (lstatSync(p).isSymbolicLink()) continue;
        out.push({ name, dir: realpathSync(p) });
      }
    }
  }
  return out;
}

/**
 * The dependency symlinks: in `.pnpm/<id>/node_modules`, every symlink is a dependency of the one
 * real package there (the owner). Paths are real paths, so they compare with pnpmPackages().
 */
function pnpmLinks(store) {
  const out = [];
  for (const id of readdirSync(store)) {
    const nm = join(store, id, "node_modules");
    if (!existsSync(nm) || id === "node_modules") continue;
    const entries = [];
    for (const entry of readdirSync(nm)) {
      if (entry.startsWith("@")) {
        for (const n of readdirSync(join(nm, entry))) entries.push(`${entry}/${n}`);
      } else entries.push(entry);
    }
    const owners = entries.filter((n) => !lstatSync(join(nm, n)).isSymbolicLink());
    for (const n of entries) {
      const p = join(nm, n);
      if (!lstatSync(p).isSymbolicLink()) continue;
      let target;
      try {
        target = realpathSync(p);
      } catch {
        continue; // a dependency the trace left out
      }
      for (const o of owners) out.push({ owner: realpathSync(join(nm, o)), name: n, target });
    }
  }
  return out;
}

function versionOf(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version ?? "?";
  } catch {
    return "?";
  }
}

function assembleServer() {
  const standalone = join(webDir, ".next/standalone");
  if (!existsSync(join(standalone, "apps/web/server.js"))) {
    die("No standalone build. Run without --skip-build, or THOTH_STANDALONE=1 pnpm build first.");
  }
  console.log(`\nAssembling ${relative(desktopDir, outServer)}`);
  rmSync(outServer, { recursive: true, force: true });
  mkdirSync(outServer, { recursive: true });

  // 1. The app itself, without its symlinked node_modules folders.
  const webOut = join(outServer, "apps/web");
  cpSync(join(standalone, "apps/web"), webOut, {
    recursive: true,
    filter: (src) => {
      const rel = relative(join(standalone, "apps/web"), src).split("\\").join("/");
      return rel !== "node_modules" && rel !== ".next/node_modules";
    },
  });
  cpSync(join(webDir, ".next/static"), join(webOut, ".next/static"), { recursive: true });
  if (existsSync(join(webDir, "public"))) {
    cpSync(join(webDir, "public"), join(webOut, "public"), { recursive: true });
  }
  cpSync(join(desktopDir, "server/thoth-server.mjs"), join(webOut, "thoth-server.mjs"));

  // 2. Migrations (traced into packages/db/drizzle by the build; copy the source to be sure).
  const drizzleOut = join(outServer, "packages/db/drizzle");
  rmSync(join(outServer, "packages"), { recursive: true, force: true });
  cpSync(join(repoRoot, "packages/db/drizzle"), drizzleOut, { recursive: true });

  // 3. Hoist every traced package into one flat node_modules. When two versions were traced, the
  //    one most packages use is hoisted, and the other is nested under the packages that use it.
  const nmOut = join(outServer, "node_modules");
  const store = join(standalone, "node_modules/.pnpm");
  const byName = new Map();
  for (const pkg of pnpmPackages(store)) {
    const list = byName.get(pkg.name) ?? [];
    list.push(pkg.dir);
    byName.set(pkg.name, list);
  }
  const links = pnpmLinks(store); // { owner: real dir, name, target: real dir }
  const seen = new Map();
  const nested = [];
  for (const [name, dirs] of byName) {
    const uses = (d) => links.filter((l) => l.target === d).length;
    const [winner, ...losers] = [...dirs].sort((a, b) => uses(b) - uses(a));
    seen.set(name, winner);
    cpSync(winner, join(nmOut, name), { recursive: true, dereference: true });
    for (const loser of losers) nested.push({ name, dir: loser });
  }
  for (const { name, dir } of nested) {
    for (const l of links.filter((x) => x.target === dir)) {
      const owner = [...seen].find(([, d]) => d === l.owner)?.[0];
      if (!owner) die(`${name}@${versionOf(dir)} is used by a nested package; flatten by hand.`);
      console.log(`  nesting ${name}@${versionOf(dir)} under ${owner}`);
      cpSync(dir, join(nmOut, owner, "node_modules", name), { recursive: true, dereference: true });
    }
  }

  // 4. Turbopack's hashed aliases for serverExternalPackages (`.next/node_modules/<pkg>-<hash>`).
  const aliasDir = join(standalone, "apps/web/.next/node_modules");
  if (existsSync(aliasDir)) {
    for (const entry of readdirSync(aliasDir)) {
      const names = entry.startsWith("@")
        ? readdirSync(join(aliasDir, entry)).map((n) => `${entry}/${n}`)
        : [entry];
      for (const name of names) {
        const real = realpathSync(join(aliasDir, name));
        cpSync(real, join(webOut, ".next/node_modules", name), {
          recursive: true,
          dereference: true,
        });
      }
    }
  }

  // 5. ONNX Runtime is loaded by Transformers.js at run time, so the trace misses it. Ship only
  //    this target's binaries (the npm package carries every platform: ~290 MB).
  addOnnxRuntime(nmOut, seen);

  // 6. pdfjs loads its worker (`legacy/build/pdf.worker.mjs`), fonts and cmaps by path at run
  //    time, so the trace keeps only `pdf.mjs` and every PDF import fails. Ship the package,
  //    minus the modern build, types, viewer and source maps (Node uses `legacy/`).
  addFullPdfjs(nmOut, join(webOut, ".next/node_modules"));

  writeFileSync(
    join(outServer, "bundle.json"),
    `${JSON.stringify({ target: triple, node: NODE_VERSION, builtAt: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`Hoisted ${seen.size} packages.`);
}

function addOnnxRuntime(nmOut, seen) {
  const transformers = seen.get("@huggingface/transformers");
  if (!transformers) return;
  let ort;
  try {
    ort = realpathSync(
      join(
        realpathSync(join(webDir, "node_modules/@huggingface/transformers")),
        "../../onnxruntime-node",
      ),
    );
  } catch {
    die("onnxruntime-node is not installed next to @huggingface/transformers.");
  }
  const out = join(nmOut, "onnxruntime-node");
  rmSync(out, { recursive: true, force: true });
  cpSync(ort, out, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const rel = relative(ort, src).split("\\").join("/");
      if (rel === "bin" || rel === "bin/napi-v6") return true;
      if (rel.startsWith("bin/napi-v6/")) {
        const want = `bin/napi-v6/${target.platform}/${target.arch}`;
        return want.startsWith(rel) || rel.startsWith(want);
      }
      return !rel.startsWith("bin/") && rel !== "script";
    },
  });
  const binDir = join(out, "bin/napi-v6", target.platform, target.arch);
  if (!existsSync(binDir)) {
    console.warn(
      `! onnxruntime-node ${versionOf(ort)} has no ${target.platform}-${target.arch} binary. ` +
        "Local embeddings (semantic search) will not work in this build.",
    );
  }
  const common = join(realpathSync(join(ort, "..")), "onnxruntime-common");
  // Always the full package: the trace keeps only the ESM half, and onnxruntime-node needs CJS.
  rmSync(join(nmOut, "onnxruntime-common"), { recursive: true, force: true });
  cpSync(common, join(nmOut, "onnxruntime-common"), { recursive: true, dereference: true });
}

function addFullPdfjs(nmOut, aliasOut) {
  let src;
  try {
    src = realpathSync(join(repoRoot, "packages/ingest/node_modules/pdfjs-dist"));
  } catch {
    die("pdfjs-dist is not installed for @thoth/ingest.");
  }
  const skip = new Set(["build", "types", "web"]);
  const filter = (p) => {
    const rel = relative(src, p).split("\\").join("/");
    return !skip.has(rel.split("/")[0]) && !rel.endsWith(".map");
  };
  const targets = [join(nmOut, "pdfjs-dist")];
  if (existsSync(aliasOut)) {
    for (const entry of readdirSync(aliasOut)) {
      if (entry.startsWith("pdfjs-dist-")) targets.push(join(aliasOut, entry));
    }
  }
  for (const out of targets) {
    rmSync(out, { recursive: true, force: true });
    cpSync(src, out, { recursive: true, dereference: true, filter });
  }
}

function copyShellTokens() {
  const src = join(repoRoot, "packages/ui/src/styles/tokens.css");
  cpSync(src, join(desktopDir, "ui/hearth-tokens.css"));
}
