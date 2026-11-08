import { describe, expect, it } from "vitest";
import { SCREENSHOT_TAG_IDS, TAG_IDS } from "../../shared/src/index";
import { INFORMATIVE_VISUAL, TAGGER_ID, TOPICS, TOPIC_PARENTS, VOCAB, topicId } from "../src/index";

describe("topic IDs", () => {
  it("every topic has a unique ID, and the vocabulary and the label table hold the same IDs", () => {
    const ids = TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...TAG_IDS].sort());
  });
  it("pt-PT names (the internal keys) stay unique and parents refer to them", () => {
    const pts = TOPICS.map((t) => t.pt);
    expect(new Set(pts).size).toBe(pts.length);
    for (const [c, ps] of TOPIC_PARENTS) for (const p of [c, ...ps]) expect(topicId(p), p).toBeDefined();
  });
  it("no pt-PT name is the ID of another topic (so mapping old names to IDs is idempotent)", () => {
    for (const t of TOPICS) {
      const other = TOPICS.find((o) => o.id === t.pt);
      if (other) expect(other, t.pt).toBe(t);
    }
  });
  it("screenshot labels that are topics map to that topic's ID; every emitted visual label has an ID", () => {
    for (const l of [...VOCAB.tipo, ...VOCAB.visual]) {
      const id = topicId(l.pt);
      if (id) expect(SCREENSHOT_TAG_IDS[l.pt], l.pt).toBe(id);
    }
    for (const l of VOCAB.tipo) expect(SCREENSHOT_TAG_IDS[l.pt], l.pt).toBeDefined();
    const dropped = [...INFORMATIVE_VISUAL].filter((v) => !SCREENSHOT_TAG_IDS[v]);
    expect(dropped).toEqual(["imagens"]);
  });
  it("the tagger version says IDs", () => {
    expect(TAGGER_ID).toBe("topics-v2");
  });
});
