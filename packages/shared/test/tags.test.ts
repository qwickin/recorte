import { describe, expect, it } from "vitest";
import { normalizeTag, normalizeTags } from "../src/index";

describe("tags", () => {
  it("normalizes and dedupes", () => {
    expect(normalizeTags([" Lisboa ", "lisboa", "", "Modo  Escuro"])).toEqual(["lisboa", "modo escuro"]);
  });
  it("caps at 40 chars", () => {
    expect(normalizeTag("a".repeat(60))).toHaveLength(40);
  });
});
