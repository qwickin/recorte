import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { computeVersions } from "./version.mjs";

let dir;
// Isolated from the user's git config (signing, hooks, default branch...).
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const git = (...args) => execFileSync("git", args, { cwd: dir, env, stdio: "pipe" });
let n = 0;
const commit = (path) => {
  const file = join(dir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, String(++n));
  git("add", "-A");
  git("commit", "-q", "-m", `c${n} ${path}`);
};

before(() => {
  dir = mkdtempSync(join(tmpdir(), "recorte-version-"));
  git("init", "-q");
  git("config", "user.name", "t");
  git("config", "user.email", "t@example.com");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
});
after(() => rmSync(dir, { recursive: true, force: true }));

test("no tag: 0.0.<commits>, extension counts only its paths", () => {
  commit("README.md");
  commit("apps/server/a.ts");
  commit("apps/extension/a.ts");
  commit("packages/shared/a.ts");
  commit("apps/gallery/a.ts");
  assert.deepEqual(computeVersions(dir), { app: "0.0.5", extension: "0.0.2" });
});

test("vX.Y tag: MAJOR.MINOR from the tag, counts since the tag", () => {
  git("tag", "v1.4");
  assert.deepEqual(computeVersions(dir), { app: "1.4.0", extension: "1.4.0" });
  commit("apps/server/b.ts");
  commit("apps/extension/b.ts");
  commit("apps/server/c.ts");
  assert.deepEqual(computeVersions(dir), { app: "1.4.3", extension: "1.4.1" });
});

test("ignores non vX.Y tags and picks the nearest vX.Y", () => {
  git("tag", "v9.9.9");
  git("tag", "release-2");
  git("tag", "v2.0");
  commit("packages/shared/b.ts");
  assert.deepEqual(computeVersions(dir), { app: "2.0.1", extension: "2.0.1" });
});

test("CLI prints JSON or a single field", () => {
  const script = new URL("./version.mjs", import.meta.url).pathname;
  const out = execFileSync(process.execPath, [script, dir], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(out), { app: "2.0.1", extension: "2.0.1" });
  assert.equal(execFileSync(process.execPath, [script, "--extension", dir], { encoding: "utf8" }).trim(), "2.0.1");
});
