#!/usr/bin/env node
// Runs the Tauri CLI with a usable toolchain (doc 19):
// - puts ~/.cargo/bin on PATH when cargo is not already there (rustup's default install);
// - on macOS, when the C compiler is blocked (Xcode installed but its licence not accepted, exit
//   status 69), uses the Command Line Tools instead via DEVELOPER_DIR, if they are installed.
// Usage: node scripts/tauri.mjs <tauri args…>
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };

const cargoBin = join(homedir(), ".cargo", "bin");
const has = (cmd) => spawnSync(cmd, ["--version"], { env, stdio: "ignore" }).status === 0;
if (!has("cargo") && existsSync(cargoBin)) env.PATH = `${cargoBin}${delimiter}${env.PATH ?? ""}`;
if (!has("cargo")) {
  console.error("cargo not found. Install Rust with rustup: https://rustup.rs");
  process.exit(1);
}

const clt = "/Library/Developer/CommandLineTools";
if (process.platform === "darwin" && !env.DEVELOPER_DIR && !has("cc") && existsSync(clt)) {
  env.DEVELOPER_DIR = clt;
  if (has("cc")) {
    console.log("Xcode's licence is not accepted; building with the Command Line Tools instead.");
  } else {
    console.error("No working C compiler. Run `xcode-select --install` or accept Xcode's licence.");
    process.exit(1);
  }
}

const bin = join(
  desktopDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tauri.cmd" : "tauri",
);
const r = spawnSync(bin, process.argv.slice(2), {
  cwd: desktopDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(r.status ?? 1);
