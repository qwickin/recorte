import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createTopicTagger, tagItem } from "@recorte/ai";
import type { Item } from "@recorte/shared";
import { topicInput } from "../src/ai-input";

// Real pages captured with the extension's extractor (prototype/ai-eval/dataset).
const dataset = JSON.parse(readFileSync(new URL("../../../prototype/ai-eval/dataset/dataset.json", import.meta.url), "utf8")) as (Item & { id: string })[];
const page = (id: string) => dataset.find((r) => r.id === id)!;
const tagger = createTopicTagger();

describe("text tagger (shipped approach)", () => {
  it("fluidfunctionalism.com/docs/surfaces: a UI components page, not just 'documentação'", async () => {
    const tags = await tagItem(tagger, topicInput(page("ff-surfaces")), null);
    expect(tags).toEqual(expect.arrayContaining(["componentes ui", "dialog", "dropdown", "sombras", "documentação"]));
  });

  it("screenshot evidence: the visual tags in the vocabulary are appended, up to 7", async () => {
    const input = topicInput(page("ff-surfaces"));
    const base = await tagItem(tagger, input, null);
    const tags = await tagItem(tagger, input, { tipo: [], visual: ["não é etiqueta", "modo escuro"], scores: {} });
    expect(tags.slice(0, base.length)).toEqual(base);
    expect(tags).not.toContain("não é etiqueta");
    expect(tags.length).toBeLessThanOrEqual(7);
  });
});
