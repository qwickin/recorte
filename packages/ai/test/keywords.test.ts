import { describe, expect, it } from "vitest";
import { extractKeywords } from "../src/keywords";

describe("extractKeywords", () => {
  it("keeps the topic and drops stopwords", () => {
    const k = extractKeywords({
      title: "Pastel de nata – Wikipedia",
      text: "pastel de nata is a Portuguese egg custard tart pastry",
    });
    expect(k.some((w) => w === "pastel de nata" || w === "pastel")).toBe(true);
    expect(k).not.toContain("is");
    expect(k).not.toContain("de");
  });
  it("respects max and is deterministic", () => {
    const input = { title: "Rust async runtime", text: "tokio runtime schedules async tasks on worker threads ".repeat(5) };
    const a = extractKeywords(input, 5);
    expect(a.length).toBeLessThanOrEqual(5);
    expect(extractKeywords(input, 5)).toEqual(a);
  });
  it("boosts title and headings over body", () => {
    const k = extractKeywords({ title: "Zebra", headings: ["Zebra"], text: "apple apple apple banana" }, 2);
    expect(k[0]).toBe("zebra");
  });
  it("returns [] for empty input", () => {
    expect(extractKeywords({})).toEqual([]);
  });
});
