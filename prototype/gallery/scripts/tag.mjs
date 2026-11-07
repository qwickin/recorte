// Runs the AI tagging step the server will run on every upload, using a local Ollama vision model.
// Usage: OLLAMA_MODEL=qwen3.5:9b node scripts/tag.mjs  -> src/data/captures.json
import { readFile, writeFile } from "node:fs/promises";

const MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:9b";
const HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const RAW = new URL("./.raw/", import.meta.url).pathname;
const OUT = new URL("../src/data/captures.json", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("../src/data/manifest.json", import.meta.url), "utf8"));
const done = new Map(JSON.parse(await readFile(OUT, "utf8").catch(() => "[]")).filter((c) => c.tags?.length).map((c) => [c.id, c]));

const schema = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    visibleText: { type: "string" },
  },
  required: ["title", "description", "tags", "keywords", "visibleText"],
};

const SYSTEM = `És o catalogador de uma galeria privada de capturas de ecrã de páginas web.
Recebes a imagem, o URL e o título da página. Responde apenas com JSON válido segundo o schema, em português de Portugal.
- title: título curto e específico do que a captura mostra (máx. 60 caracteres).
- description: 1 a 2 frases objetivas: o que se vê e para que pode servir mais tarde.
- tags: 4 a 7 etiquetas em minúsculas, 1 a 2 palavras cada, do geral para o específico: tipo de página ou conteúdo, assunto, e um elemento visual marcante (por exemplo "modo escuro", "tabela", "código", "fotografia"). Reutiliza etiquetas já existentes sempre que servirem.
- keywords: 10 a 16 chaves de pesquisa: sinónimos e termos relacionados em português E em inglês, nomes próprios, marcas, tecnologias, cores dominantes e palavras importantes do texto visível.
- visibleText: o texto visível mais importante, literal (máx. 160 caracteres).`;

const out = [];
const tagCounts = new Map();
for (const c of done.values()) for (const t of c.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);

for (const c of manifest) {
  if (done.has(c.id)) { out.push({ ...c, ...pick(done.get(c.id)) }); continue; }
  const existing = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([t]) => t);
  const img = (await readFile(`${RAW}${c.id}-ai.jpg`)).toString("base64");
  const started = Date.now();
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, stream: false, think: false, format: schema,
      options: { temperature: 0.2, num_ctx: 8192 },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `URL: ${c.url}\nTítulo da página: ${c.pageTitle}\nTipo de captura: ${c.kind === "area" ? "área selecionada" : c.kind === "full" ? "página inteira" : "parte visível"}\nEtiquetas já existentes: ${existing.join(", ") || "(nenhuma)"}`, images: [img] },
      ],
    }),
  });
  const json = await res.json();
  let ai;
  try { ai = JSON.parse(json.message.content); } catch { console.log("bad json", c.id, json.error ?? json.message?.content?.slice(0, 200)); continue; }
  ai.tags = [...new Set(ai.tags.map((t) => t.toLowerCase().trim().replace(/^#/, "")).filter(Boolean))].slice(0, 7);
  ai.keywords = [...new Set(ai.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 16);
  for (const t of ai.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  out.push({ ...c, ...ai });
  console.log(`ok ${c.id} ${((Date.now() - started) / 1000).toFixed(1)}s  [${ai.tags.join(", ")}]`);
  await writeFile(OUT, JSON.stringify(out, null, 2)); // checkpoint
}
await writeFile(OUT, JSON.stringify(out, null, 2));
console.log("tagged", out.length);
function pick(d) { return { title: d.title, description: d.description, tags: d.tags, keywords: d.keywords, visibleText: d.visibleText }; }
