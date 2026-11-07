import sharp from "sharp";
import { z } from "zod";

export interface CloudConfig {
  url: string;
  key: string;
  model: string;
}

export interface CloudInput {
  image: Buffer;
  pageTitle: string;
  site: string;
  text: string;
  headings: string[];
}

export interface CloudResult {
  title?: string;
  description?: string;
  keys: string[];
}

export type CloudAi = (input: CloudInput) => Promise<CloudResult>;
type FetchFn = typeof fetch;

const Answer = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  keys: z.array(z.string()).optional(),
});

const SYSTEM =
  "Descreves capturas de ecrã para uma galeria pessoal pesquisável. Responde em português de Portugal, " +
  'apenas com JSON: {"title": string (até 80 caracteres), "description": string (1 a 2 frases), "keys": string[] (até 8 palavras-chave)}.';

export function cloudEndpoint(url: string): string {
  const base = url.replace(/\/+$/, "");
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

/** Pulls the first JSON object out of a model reply (tolerates code fences / chatter). */
export function parseAnswer(content: string): CloudResult {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON in cloud reply");
  const a = Answer.parse(JSON.parse(content.slice(start, end + 1)));
  const clean = (s: string | undefined, max: number) => s?.replace(/\s+/g, " ").trim().slice(0, max) || undefined;
  const title = clean(a.title, 200);
  const description = clean(a.description, 600);
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    keys: [...new Set((a.keys ?? []).map((k) => clean(k, 60)?.toLowerCase()).filter((k): k is string => !!k))].slice(0, 12),
  };
}

/** OpenAI-compatible chat completion with the (downscaled) image. Throws on any failure; callers decide to ignore. */
export function createCloudAi(cfg: CloudConfig, fetchFn: FetchFn = fetch, timeoutMs = 60_000): CloudAi {
  return async (input) => {
    const jpeg = await sharp(input.image).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const context = [`Título da página: ${input.pageTitle}`, `Site: ${input.site}`, input.headings.length ? `Títulos: ${input.headings.slice(0, 8).join(" | ")}` : "", input.text ? `Texto: ${input.text.slice(0, 1500)}` : ""]
      .filter(Boolean)
      .join("\n");
    const res = await fetchFn(cloudEndpoint(cfg.url), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: context },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`cloud ai http ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("cloud ai: empty reply");
    return parseAnswer(content);
  };
}
