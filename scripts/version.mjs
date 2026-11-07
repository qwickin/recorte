#!/usr/bin/env node
// Versions from Git (spec §10). Prints {"app":"X.Y.N","extension":"X.Y.M"}.
//   app       = MAJOR.MINOR of the nearest `vX.Y` tag + commits since that tag
//   extension = same MAJOR.MINOR + commits since the tag touching apps/extension or packages/shared
//   no tag    = 0.0.<commits> (all history / extension paths only)
// Only integers (Chrome manifests accept 1-4 integers <= 65535): no hash, no -dirty.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const EXTENSION_PATHS = ["apps/extension", "packages/shared"];
const TAG_RE = /^v(\d+)\.(\d+)$/;

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Nearest reachable tag that is exactly `vX.Y` (a `--match` glob would also accept v1.2.3). */
export function findTag(cwd) {
  // Tags reachable from HEAD, nearest first (topological order of the commit they point at).
  const reachable = git(cwd, ["tag", "--merged", "HEAD"]).split("\n").filter((t) => TAG_RE.test(t));
  if (reachable.length === 0) return null;
  let best = null;
  for (const tag of reachable) {
    const distance = Number(git(cwd, ["rev-list", "--count", `${tag}..HEAD`]));
    if (!best || distance < best.distance) best = { tag, distance };
  }
  return best.tag;
}

export function computeVersions(cwd = process.cwd()) {
  const tag = findTag(cwd);
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const count = (paths = []) => Number(git(cwd, ["rev-list", "--count", range, ...(paths.length ? ["--", ...paths] : [])]));
  const [major, minor] = tag ? TAG_RE.exec(tag).slice(1, 3).map(Number) : [0, 0];
  return {
    app: `${major}.${minor}.${count()}`,
    extension: `${major}.${minor}.${count(EXTENSION_PATHS)}`,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const v = computeVersions(args.find((a) => !a.startsWith("--")) ?? process.cwd());
  const field = args.includes("--app") ? "app" : args.includes("--extension") ? "extension" : null;
  process.stdout.write(field ? `${v[field]}\n` : `${JSON.stringify(v)}\n`);
}
