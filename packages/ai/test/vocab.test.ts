import { describe, expect, it } from "vitest";
import { VOCAB, labelSynonyms } from "../src/vocab";

describe("vocab", () => {
  it("has tipo and visual only", () => {
    expect(Object.keys(VOCAB).sort()).toEqual(["tipo", "visual"]);
  });
  it("labelSynonyms returns pt name plus english words", () => {
    const s = labelSynonyms("mapa");
    expect(s[0]).toBe("mapa");
    expect(s).toContain("street");
    expect(s).toContain("map");
    expect(s).not.toContain("a");
  });
  it("returns [] for unknown tags", () => {
    expect(labelSynonyms("nada")).toEqual([]);
  });
});
