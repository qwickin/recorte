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
  it("boosts title and headings over the page text", () => {
    const k = extractKeywords({ title: "Zebra", headings: ["Zebra"], pageText: "apple apple apple banana" }, 2);
    expect(k[0]).toBe("zebra");
  });
  it("returns [] for empty input", () => {
    expect(extractKeywords({})).toEqual([]);
  });

  it("whole-page context: a frequent page term loses to the selection and the headings near it", () => {
    const page = "github repository code issues pull requests ".repeat(60) + "footer cookies privacy";
    const k = extractKeywords(
      {
        title: "Surfaces — Fluid Functionalism",
        selection: "Combobox dropdown role select dialog Combobox dropdown",
        nearHeadings: ["Dialog"],
        headings: ["Surfaces", "Overview"],
        pageText: page,
      },
      6,
    );
    const top = k.slice(0, 3).join(" | ");
    expect(top).toContain("combobox");
    expect(top).toContain("dropdown");
    expect(k.indexOf("dialog")).toBeGreaterThanOrEqual(0);
    expect(k.indexOf("dialog")).toBeLessThan(k.indexOf("repository") < 0 ? 99 : k.indexOf("repository"));
    expect(k.slice(0, 4)).not.toContain("github");
  });
  it("page text still contributes when there is no selection", () => {
    const k = extractKeywords({ title: "Receita", pageText: "bacalhau com natas forno bacalhau natas receita bacalhau" }, 4);
    expect(k).toContain("bacalhau");
  });
  it("meta keywords count, like a description", () => {
    expect(extractKeywords({ keywords: ["design system", "ui"], pageText: "lorem ipsum dolor" }, 3)).toContain("design system");
  });
  it("text is still accepted as the selection (older callers)", () => {
    expect(extractKeywords({ text: "zebra zebra" }, 1)).toEqual(extractKeywords({ selection: "zebra zebra" }, 1));
  });
});
