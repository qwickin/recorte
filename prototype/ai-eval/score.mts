// Scores results/*.json against ground-truth.json -> results/summary.md (table + per-page outputs).
// Usage: [GT=ground-truth-holdout.json] tsx score.mts [resultsDir] [approach...]
// Tags are compared as tag IDs: the ground truth (pt-PT names) and results written before topics-v2 (pt-PT names,
// raw screenshot labels) are mapped through the vocabulary's ID column; IDs and unknown names pass through.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const dir = process.argv[2] ?? `${HERE}results`;
const only = process.argv.slice(3);
const gt = JSON.parse(readFileSync(`${HERE}${process.env.GT ?? "ground-truth.json"}`, "utf8")) as Record<string, string[]>;
delete (gt as Record<string, unknown>)._;

// pt-PT name -> ID (packages/ai/src/topics-vocab.ts: group|id|pt|…) and raw screenshot label -> ID (tag-labels.ts).
const vocab = readFileSync(`${HERE}../../packages/ai/src/topics-vocab.ts`, "utf8");
const TO_ID = new Map<string, string>();
for (const m of vocab.matchAll(/^[a-z]+\|([^|]+)\|([^|]+)\|/gm)) TO_ID.set(m[2]!.trim(), m[1]!.trim());
const labels = readFileSync(`${HERE}../../packages/shared/src/tag-labels.ts`, "utf8");
const shot = labels.slice(labels.indexOf("SCREENSHOT_TAG_IDS"));
for (const m of shot.slice(0, shot.indexOf("};")).matchAll(/^\s+"?([^":]+?)"?: "([^"]+)",$/gm)) if (!TO_ID.has(m[1]!)) TO_ID.set(m[1]!, m[2]!);
const IDS = new Set(TO_ID.values());
const toId = (t: string) => (IDS.has(t) ? t : TO_ID.get(t) ?? t);
for (const id of Object.keys(gt)) gt[id] = gt[id]!.map((e) => e.split("|").map(toId).join("|"));

interface Res { approach: string; threads: number; platform: string; loadMs: number; rssBaseMB: number; rssLoadedMB: number; rssPeakMB: number; perItem: { id: string; tags: string[]; ms: number }[] }
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const results = files.map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Res).filter((r) => !only.length || only.includes(r.approach));

function match(tags: string[], expected: string[]) {
  const alts = expected.map((e) => e.split("|"));
  const used = new Set<number>();
  const hits: string[] = [];
  const miss: string[] = [];
  for (const t of tags) {
    const i = alts.findIndex((a, j) => !used.has(j) && a.includes(t));
    if (i >= 0) (used.add(i), hits.push(t));
    else miss.push(t);
  }
  return { tp: hits.length, fp: miss, fn: expected.filter((_, j) => !used.has(j)), hits };
}
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]!; };

const rows: string[] = [];
const per: Record<string, Record<string, string>> = {};
for (const r of results) {
  let tp = 0, np = 0, ng = 0;
  let pSum = 0, rSum = 0;
  const ids = Object.keys(gt);
  for (const id of ids) {
    const it = r.perItem.find((x) => x.id === id);
    const tags = [...new Set((it?.tags ?? []).map(toId))];
    const m = match(tags, gt[id]!);
    tp += m.tp; np += tags.length; ng += gt[id]!.length;
    pSum += tags.length ? m.tp / tags.length : 0;
    rSum += m.tp / gt[id]!.length;
    (per[id] ??= {})[r.approach] = tags.map((t) => (m.hits.includes(t) ? `**${t}**` : t)).join(", ") || "—";
  }
  const P = np ? tp / np : 0, R = tp / ng, F = P + R ? (2 * P * R) / (P + R) : 0;
  const ms = r.perItem.map((x) => x.ms);
  rows.push(`| ${r.approach} | ${pct(P)} | ${pct(R)} | ${pct(F)} | ${(np / ids.length).toFixed(1)} | ${q(ms, 0.5)} | ${q(ms, 0.95)} | ${Math.max(...ms)} | ${r.loadMs} | ${r.rssLoadedMB - r.rssBaseMB} | ${r.rssPeakMB} | ${r.platform}/${r.threads}t |`);
}
const out = [
  `| approach | micro P | micro R | F1 | tags/item | p50 ms | p95 ms | max ms | load ms | +RSS loaded MB | peak RSS MB | platform/threads |`,
  `|---|---|---|---|---|---|---|---|---|---|---|---|`,
  ...rows,
  "",
  "Per page (bold = matches the ground truth):",
  "",
  ...Object.entries(per).flatMap(([id, byA]) => [
    `**${id}** — expected: ${gt[id]!.join(", ")}`,
    ...Object.entries(byA).map(([a, t]) => `- ${a}: ${t}`),
    "",
  ]),
].join("\n");
writeFileSync(`${dir}/summary.md`, out);
console.log(out.split("\n").slice(0, rows.length + 2).join("\n"));
