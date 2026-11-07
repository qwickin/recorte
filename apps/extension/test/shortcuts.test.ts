import { describe, expect, it } from "vitest";
import { SUGGESTED_KEYS, formatShortcut, isMacPlatform } from "../lib/shortcuts";

describe("formatShortcut", () => {
  it("shows Mac symbols in Apple's order", () => {
    expect(formatShortcut("MacCtrl+Shift+S", true)).toBe("⌃⇧S");
    expect(formatShortcut("Alt+Shift+F", true)).toBe("⌥⇧F");
    expect(formatShortcut("Shift+Command+K", true)).toBe("⇧⌘K");
    // Firefox/manifest "Ctrl" on macOS is the Command key.
    expect(formatShortcut("Ctrl+Shift+V", true)).toBe("⇧⌘V");
  });
  it("keeps Chrome's macOS symbols, reordered", () => {
    expect(formatShortcut("⌃⇧S", true)).toBe("⌃⇧S");
    expect(formatShortcut("⇧⌃S", true)).toBe("⌃⇧S");
    expect(formatShortcut("⇧⌘S", true)).toBe("⇧⌘S");
  });
  it("uses names elsewhere", () => {
    expect(formatShortcut("Alt+Shift+S", false)).toBe("Alt+Shift+S");
    expect(formatShortcut("MacCtrl+Shift+S", false)).toBe("Ctrl+Shift+S");
    expect(formatShortcut("Ctrl+Shift+Comma", false)).toBe("Ctrl+Shift+,");
  });
  it("empty when unbound", () => {
    expect(formatShortcut("", true)).toBe("");
    expect(formatShortcut(undefined, false)).toBe("");
  });
});

describe("suggested keys", () => {
  it("never suggest the macOS screenshot shortcuts (⌘⇧3/4/5/6) nor ⌘⇧ at all on Mac", () => {
    for (const k of Object.values(SUGGESTED_KEYS)) {
      expect(k.mac).toMatch(/^MacCtrl\+Shift\+[A-Z]$/);
      expect(k.default).toMatch(/^Alt\+Shift\+[A-Z]$/);
    }
  });
});

describe("isMacPlatform", () => {
  it("detects macOS", () => {
    expect(isMacPlatform({ platform: "MacIntel" })).toBe(true);
    expect(isMacPlatform({ platform: "Win32" })).toBe(false);
    expect(isMacPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" })).toBe(true);
  });
});
