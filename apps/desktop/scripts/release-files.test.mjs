import assert from "node:assert/strict";
import { test } from "node:test";
import { homebrewCask, UPDATE_FILES, updaterManifest } from "./release-files.mjs";

test("the updater manifest lists only signed platforms, with release URLs", () => {
  const m = updaterManifest({
    version: "0.2.0",
    repo: "me/thoth",
    pubDate: "2026-11-22T00:00:00.000Z",
    sigs: { [UPDATE_FILES["darwin-aarch64"]]: "sig-mac\n" },
  });
  assert.deepEqual(Object.keys(m.platforms), ["darwin-aarch64"]);
  assert.equal(m.platforms["darwin-aarch64"].signature, "sig-mac");
  assert.equal(
    m.platforms["darwin-aarch64"].url,
    "https://github.com/me/thoth/releases/download/v0.2.0/Thoth-macOS-arm64.app.tar.gz",
  );
  assert.equal(m.version, "0.2.0");
});

test("an unsigned release has no manifest", () => {
  assert.equal(updaterManifest({ version: "0.2.0", repo: "me/thoth", sigs: {} }), null);
});

test("the cask pins each DMG's checksum, or skips the check when one is missing", () => {
  const rb = homebrewCask({
    version: "0.2.0",
    repo: "me/thoth",
    sha: { "Thoth-macOS-arm64.dmg": "abc", "Thoth-macOS-x64.dmg": "def" },
  });
  assert.match(rb, /version "0\.2\.0"/);
  assert.match(rb, /arm: {3}"abc",\n {9}intel: "def"/);
  assert.match(
    homebrewCask({ version: "0.2.0", repo: "me/thoth", sha: { "Thoth-macOS-arm64.dmg": "abc" } }),
    /sha256 :no_check/,
  );
  assert.match(rb, /app "Thoth\.app"/);
  assert.match(rb, /brew tap me\/thoth https:\/\/github\.com\/me\/thoth/);
});
