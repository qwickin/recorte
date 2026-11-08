// Runs one tagging approach over the dataset and writes results/<approach>.json (tags, latency, memory).
// One approach per process, so the memory numbers are that approach's own.
// Usage: tsx run.mts <approach> [--models <dir>] [--threads 2] [--out results]
//   current            SigLIP2 (int8) zero-shot on the screenshot -> tipo ∪ visual (what ships today)
//   lexical            curated vocabulary, field-weighted alias matching + URL rules (no model)
//   lex-minilm         + paraphrase-multilingual-MiniLM-L12-v2 (q8) similarity
//   lex-e5             + multilingual-e5-small (q8) similarity
//   lex-minilm-visual  lex-minilm + SigLIP2 tipo probabilities as evidence + its visual tags
//   llm-<model>        lex-minilm candidates (top 25) -> a small instruct LLM picks the tags (qwen3, qwen25, smollm2)
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AutoModelForCausalLM, AutoTokenizer, env } from "@huggingface/transformers";
import { createClassifier, createEmbedder, createTopicTagger, TOPICS, VOCAB, type Embedder, type TopicInput } from "../../packages/ai/src/index.ts";
import type { Item } from "../../packages/shared/src/index.ts";
import { topicInput } from "../../apps/server/src/ai-input.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
const approach = args[0]!;
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1]! : d);
const MODELS = opt("--models", process.env.RECORTE_MODEL_DIR ?? `${HERE}../../packages/ai/models`);
const THREADS = Number(opt("--threads", "2"));
const OUT = opt("--out", `${HERE}results`);

type Row = Item & { image: string | null };
const data = JSON.parse(readFileSync(`${HERE}dataset/dataset.json`, "utf8")) as Row[];
const img = (r: Row) => (r.image ? readFileSync(`${HERE}dataset/${r.image}`) : null);

const mb = (b: number) => Math.round(b / 1048576);
const rss0 = process.memoryUsage().rss;
let peak = rss0;
const sample = () => (peak = Math.max(peak, process.memoryUsage().rss));

const LLMS: Record<string, string> = {
  qwen3: "onnx-community/Qwen3-0.6B-ONNX",
  qwen25: "onnx-community/Qwen2.5-0.5B-Instruct",
  smollm2: "HuggingFaceTB/SmolLM2-360M-Instruct",
};

const t0 = performance.now();
const needsVisual = approach === "current" || approach.endsWith("-visual");
const needsEmbed = approach.includes("minilm") || approach.includes("e5") || approach.startsWith("llm-");
const classifier = needsVisual ? await createClassifier({ modelDir: MODELS, threads: THREADS }) : null;
const embed: Embedder | undefined = needsEmbed
  ? await createEmbedder(
      approach.includes("e5")
        ? { modelDir: MODELS, threads: THREADS, modelId: "Xenova/multilingual-e5-small", prefix: "query: ", memArena: process.env.ARENA === "1" }
        : { modelDir: MODELS, threads: THREADS, modelId: "Xenova/paraphrase-multilingual-MiniLM-L12-v2", memArena: process.env.ARENA === "1" },
    )
  : undefined;
const tagger = createTopicTagger(embed);
let llm: { tok: any; model: any } | null = null;
if (approach.startsWith("llm-")) {
  const id = LLMS[approach.slice(4)]!;
  env.cacheDir = MODELS;
  llm = {
    tok: await AutoTokenizer.from_pretrained(id),
    model: await AutoModelForCausalLM.from_pretrained(id, { dtype: "q8", session_options: { intraOpNumThreads: THREADS, interOpNumThreads: 1 } }),
  };
}
// Warm-up (first call embeds the vocabulary; first ONNX run allocates): counted in the load time.
if (embed) await tagger.tag({ title: "warm up" });
const loadMs = Math.round(performance.now() - t0);
sample();
const rssLoaded = process.memoryUsage().rss;

const VISUAL_TIPO = new Set(VOCAB.tipo.map((l) => l.pt));
const NAMES = new Set(TOPICS.map((t) => t.pt));

async function llmPick(input: TopicInput, candidates: string[]): Promise<{ tags: string[]; raw: string }> {
  const ctx = [
    `Título: ${input.title ?? ""}`,
    input.description ? `Descrição: ${input.description}` : "",
    input.nearHeadings?.length ? `Secção: ${input.nearHeadings.join(" / ")}` : "",
    `URL: ${input.url ?? ""}`,
    `Texto: ${(input.selection ?? "").replace(/\s+/g, " ").slice(0, 700)}`,
    input.pageText ? `Página: ${input.pageText.replace(/\s+/g, " ").slice(0, 500)}` : "",
  ].filter(Boolean).join("\n");
  const messages = [
    { role: "system", content: "És um sistema de etiquetagem. Respondes só com etiquetas, separadas por vírgulas." },
    {
      role: "user",
      content: `${ctx}\n\nEtiquetas candidatas: ${candidates.join(", ")}\n\nEscolhe de 3 a 7 etiquetas candidatas que descrevem o assunto e o tipo deste conteúdo (não a navegação do site). Responde só com as etiquetas escolhidas, separadas por vírgulas.`,
    },
  ];
  const prompt = llm!.tok.apply_chat_template(messages, { add_generation_prompt: true, tokenize: false, enable_thinking: false });
  const inputs = llm!.tok(prompt, { add_special_tokens: false });
  const out = await llm!.model.generate({ ...inputs, max_new_tokens: 48, do_sample: false });
  const n = inputs.input_ids.dims[1];
  const raw = llm!.tok.decode(out.slice(null, [n, null]), { skip_special_tokens: true }).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const picked = raw.split(/[,\n;]/).map((s: string) => s.trim().toLowerCase().replace(/^[-*\d.\s]+|[.\s]+$/g, "")).filter((s: string) => NAMES.has(s));
  return { tags: [...new Set(picked)].slice(0, 7), raw };
}

const perItem: { id: string; tags: string[]; ms: number; extra?: unknown }[] = [];
for (const r of data) {
  const input = topicInput(r);
  const s = performance.now();
  let tags: string[] = [];
  let extra: unknown;
  if (approach === "current") {
    const im = img(r);
    if (im) {
      const c = await classifier!.classify(im);
      tags = [...c.tipo, ...c.visual];
    }
  } else if (approach.endsWith("-visual")) {
    const im = img(r);
    let visual: Record<string, number> = {};
    let vtags: string[] = [];
    if (im) {
      const c = await classifier!.classify(im);
      visual = Object.fromEntries(Object.entries(c.scores).filter(([k]) => VISUAL_TIPO.has(k) && NAMES.has(k)));
      vtags = c.visual.filter((v) => NAMES.has(v));
    }
    const res = await tagger.tag(input, { visual });
    tags = [...res.tags];
    for (const v of vtags) if (!tags.includes(v) && tags.length < 7) tags.push(v);
    extra = res.ranked.slice(0, 12).map((x) => `${x.tag}:${x.score.toFixed(1)}`);
  } else if (approach.startsWith("llm-")) {
    const res = await tagger.tag(input);
    const cands = res.ranked.slice(0, 25).map((x) => x.tag);
    const p = await llmPick(input, cands);
    tags = p.tags;
    extra = { raw: p.raw, candidates: cands };
  } else {
    const res = await tagger.tag(input);
    tags = res.tags;
    extra = res.ranked.slice(0, 12).map((x) => `${x.tag}:${x.score.toFixed(1)}(l${x.lex.toFixed(1)} s${x.sem.toFixed(1)} r${x.rule})`);
  }
  const ms = Math.round(performance.now() - s);
  sample();
  perItem.push({ id: r.id, tags, ms, extra });
  console.log(`${r.id.padEnd(18)} ${String(ms).padStart(5)}ms  ${tags.join(", ")}`);
}

const maxRss = process.resourceUsage().maxRSS * 1024;
mkdirSync(OUT, { recursive: true });
const result = {
  approach, threads: THREADS, platform: `${process.platform}-${process.arch}`, node: process.version,
  loadMs, rssBaseMB: mb(rss0), rssLoadedMB: mb(rssLoaded), rssPeakMB: mb(Math.max(peak, maxRss)), perItem,
};
writeFileSync(`${OUT}/${approach}.json`, JSON.stringify(result, null, 1));
console.log(`load ${loadMs} ms, rss base ${mb(rss0)} MB, loaded ${mb(rssLoaded)} MB, peak ${result.rssPeakMB} MB`);
