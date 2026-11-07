import { describe, expect, it, vi } from "vitest";
import { TabChangedError, isSameTarget, makeTabGuard } from "../lib/guard";
import { captureVisible } from "../lib/capture";

const target = { tabId: 7, windowId: 1, url: "https://example.com/a" };
const tab = { id: 7, windowId: 1, url: "https://example.com/a", active: true };

describe("tab guard", () => {
  it("accepts the unchanged active tab", () => {
    expect(isSameTarget(target, tab)).toBe(true);
  });
  it("rejects a tab that is no longer active, navigated, moved or closed", () => {
    expect(isSameTarget(target, { ...tab, active: false })).toBe(false);
    expect(isSameTarget(target, { ...tab, url: "https://example.com/b" })).toBe(false);
    expect(isSameTarget(target, { ...tab, windowId: 2 })).toBe(false);
    expect(isSameTarget(target, undefined)).toBe(false);
  });
  it("guard throws TabChangedError when the user switched tabs, and when the tab was closed", async () => {
    await expect(makeTabGuard(target, async () => tab)()).resolves.toBeUndefined();
    await expect(makeTabGuard(target, async () => ({ ...tab, active: false }))()).rejects.toBeInstanceOf(TabChangedError);
    await expect(
      makeTabGuard(target, async () => {
        throw new Error("No tab with id: 7");
      })(),
    ).rejects.toThrow("Captura cancelada: mudaste de separador");
  });
});

vi.mock("wxt/browser", () => ({
  browser: { tabs: { captureVisibleTab: vi.fn(async () => "data:image/png;base64,AAAA") } },
}));

describe("captureVisible with a guard", () => {
  it("never calls captureVisibleTab when the tab changed", async () => {
    const { browser } = await import("wxt/browser");
    const guard = makeTabGuard(target, async () => ({ ...tab, url: "https://other.example/" }));
    await expect(captureVisible(1, guard)).rejects.toBeInstanceOf(TabChangedError);
    expect(browser.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });
});
