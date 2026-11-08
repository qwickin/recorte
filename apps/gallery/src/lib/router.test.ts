import { describe, expect, it } from "vitest";
import { pagePath } from "./router";

describe("pagePath", () => {
  it("maps the old pt-PT slugs to the English pages (links of installed extensions, bookmarks)", () => {
    expect(pagePath("/extensao")).toBe("/extension");
    expect(pagePath("/definicoes/")).toBe("/settings");
    expect(pagePath("/lixo")).toBe("/trash");
  });
  it("leaves every other path alone", () => {
    expect(pagePath("/")).toBe("/");
    expect(pagePath("/settings")).toBe("/settings");
    expect(pagePath("/trash/")).toBe("/trash");
    expect(pagePath("/lixo/x")).toBe("/lixo/x");
  });
});
