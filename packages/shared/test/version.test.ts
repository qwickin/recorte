import { describe, expect, it } from "vitest";
import { compareVersions } from "../src/index";

describe("compareVersions", () => {
  it("compares numerically", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBe(1);
    expect(compareVersions("0.1.9", "0.1.10")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });
});
