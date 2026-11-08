import { describe, expect, it } from "vitest";
import {
  LOCALES,
  SCREENSHOT_TAG_IDS,
  TAG_IDS,
  aiTags,
  canonicalTag,
  canonicalTags,
  isTagId,
  tagKey,
  tagLabel,
  tagLabels,
  tagLabelsAll,
} from "../src/index";

// The committed list of tag IDs. Items store these, so an ID must never disappear or change. A new tag is added by
// appending its ID here (and to the table, and to packages/ai/src/topics-vocab.ts).
import FROZEN_JSON from "./tag-ids.json" with { type: "json" };
const FROZEN = FROZEN_JSON as string[];

describe("tag IDs", () => {
  it("match the frozen snapshot exactly (append only)", () => {
    const missing = FROZEN.filter((id) => !isTagId(id));
    expect(missing, "IDs removed or renamed: items still refer to them").toEqual([]);
    const added = TAG_IDS.filter((id) => !FROZEN.includes(id));
    expect(added, "new IDs: append them to test/tag-ids.json").toEqual([]);
    expect(TAG_IDS).toHaveLength(FROZEN.length);
  });

  it("are unique, lowercase English-ish and short", () => {
    expect(new Set(TAG_IDS).size).toBe(TAG_IDS.length);
    for (const id of TAG_IDS) {
      expect(id).toBe(id.trim().toLowerCase());
      expect(id).not.toMatch(/\s{2}|[A-Z]/);
      expect(id.length).toBeLessThanOrEqual(40);
    }
  });

  it("every ID has all five labels, non-empty and ≤ 40 characters", () => {
    for (const id of TAG_IDS) {
      const l = tagLabels(id)!;
      for (const loc of LOCALES) {
        expect(l[loc], `${id} ${loc}`).toBeTruthy();
        expect(l[loc]!.trim()).toBe(l[loc]);
        expect(l[loc]!.length, `${id} ${loc}`).toBeLessThanOrEqual(40);
      }
      // The English label starts out as the ID (proper nouns capitalised).
      expect(l["en-US"].toLowerCase(), id).toBe(id);
    }
  });

  it("no normalised label (or ID) points at two IDs", () => {
    const seen = new Map<string, string>();
    for (const id of TAG_IDS) {
      const l = tagLabels(id)!;
      for (const s of [id, ...LOCALES.map((loc) => l[loc])]) {
        const k = tagKey(s);
        const prev = seen.get(k);
        expect(prev === undefined || prev === id, `"${s}" is a label of ${prev} and ${id}`).toBe(true);
        seen.set(k, id);
      }
    }
  });

  it("proper nouns stay as they are", () => {
    expect(tagLabel("react", "fr")).toBe("React");
    expect(tagLabel("github", "pt-BR")).toBe("GitHub");
    expect(tagLabel("lisbon", "en-US")).toBe("Lisbon");
    expect(tagLabel("lisbon", "pt-BR")).toBe("Lisboa");
    expect(tagLabel("lisbon", "es")).toBe("Lisboa");
    expect(tagLabel("lisbon", "fr")).toBe("Lisbonne");
  });
});

describe("labels", () => {
  it("label an ID per locale; anything else verbatim", () => {
    expect(tagLabel("dark mode", "pt-BR")).toBe("modo escuro");
    expect(tagLabel("recipe", "es")).toBe("receta");
    expect(tagLabel("map", "fr")).toBe("carte");
    expect(tagLabel("viagem de 2024", "es")).toBe("viagem de 2024");
  });
  it("tagLabelsAll gives the distinct labels in every language", () => {
    expect(tagLabelsAll("recipe")).toEqual(["recipe", "receita", "receta", "recette", "ricetta"]);
    expect(tagLabelsAll("react")).toEqual(["React"]);
    expect(tagLabelsAll("my own tag")).toEqual(["my own tag"]);
  });
});

describe("canonicalTag (typed tags)", () => {
  it("stores the ID when the text is one of the five labels, in any language, case and accents", () => {
    expect(canonicalTag("Modo Escuro")).toBe("dark mode");
    expect(canonicalTag("dark mode")).toBe("dark mode");
    expect(canonicalTag("  modo   oscuro ")).toBe("dark mode");
    expect(canonicalTag("Receta")).toBe("recipe");
    expect(canonicalTag("documentacion")).toBe("documentation");
    expect(canonicalTag("Lisbonne")).toBe("lisbon");
    expect(canonicalTag("REACT")).toBe("react");
  });
  it("keeps any other tag normalised, as typed", () => {
    expect(canonicalTag("  Viagem   2024 ")).toBe("viagem 2024");
    expect(canonicalTag("café da manhã")).toBe("café da manhã");
  });
  it("never matches the tagger's aliases or the old pt-PT names", () => {
    // "telemóvel" is an alias of smartphone; "folha de cálculo" was the pt-PT name of spreadsheet.
    expect(canonicalTag("telemóvel")).toBe("telemóvel");
    expect(canonicalTag("folha de cálculo")).toBe("folha de cálculo");
  });
  it("is idempotent and dedupes after mapping", () => {
    for (const id of TAG_IDS) expect(canonicalTag(id)).toBe(id);
    expect(canonicalTags(["modo escuro", "Dark Mode", "mode sombre", "x", ""])).toEqual(["dark mode", "x"]);
  });
});

describe("aiTags", () => {
  it("returns topics (IDs) when present", () => {
    expect(aiTags({ tipo: ["mapa"], visual: [], topics: ["map", "lisbon"] })).toEqual(["map", "lisbon"]);
  });
  it("maps the screenshot fallback (raw pt-PT keys) to IDs and drops labels without a tag", () => {
    expect(aiTags({ tipo: ["mapa"], visual: ["modo escuro", "imagens"] })).toEqual(["map", "dark mode"]);
    expect(aiTags({ tipo: ["wiki"], visual: [] })).toEqual(["encyclopedia"]);
  });
  it("every screenshot mapping points at a real ID", () => {
    for (const [raw, id] of Object.entries(SCREENSHOT_TAG_IDS)) expect(isTagId(id), raw).toBe(true);
  });
});
