/**
 * Keyboard shortcut labels. `commands.getAll()` gives the binding the user actually has (it may have been remapped
 * in chrome://extensions/shortcuts or about:addons), in a browser-specific form:
 *   - Chrome on macOS: symbols already ("⌃⇧S", "⇧⌘S");
 *   - Chrome elsewhere / Firefox: "Alt+Shift+S", "Ctrl+Shift+S", and on macOS Firefox "MacCtrl+Shift+S"
 *     ("Ctrl"/"Command" there mean ⌘).
 * On a Mac this renders the ⌃ ⌥ ⇧ ⌘ symbols in Apple's order; elsewhere "Ctrl+Shift+S".
 */

/** Apple's modifier order: Control, Option, Shift, Command. */
const MAC_ORDER = ["⌃", "⌥", "⇧", "⌘"] as const;

const MAC_SYMBOL: Record<string, (typeof MAC_ORDER)[number]> = {
  macctrl: "⌃",
  control: "⌃",
  alt: "⌥",
  option: "⌥",
  opt: "⌥",
  shift: "⇧",
  command: "⌘",
  cmd: "⌘",
  meta: "⌘",
  // In extension manifests and Firefox, "Ctrl" on macOS is the Command key.
  ctrl: "⌘",
};

const OTHER_NAME: Record<string, string> = {
  macctrl: "Ctrl",
  control: "Ctrl",
  ctrl: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  command: "Ctrl",
  cmd: "Ctrl",
  meta: "Meta",
};

const KEY_NAME: Record<string, string> = {
  comma: ",",
  period: ".",
  space: "Espaço",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

export const isMacPlatform = (nav: { platform?: string; userAgent?: string } = globalThis.navigator ?? {}): boolean =>
  /Mac|iPhone|iPad/.test(nav.platform || nav.userAgent || "");

/** "" when there is no binding. */
export function formatShortcut(raw: string | undefined | null, mac: boolean): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  // Already in symbols (Chrome on macOS): keep, but normalise the modifier order.
  if (!s.includes("+")) {
    if (!mac) return s;
    const mods = MAC_ORDER.filter((m) => s.includes(m));
    const key = [...s].filter((ch) => !(MAC_ORDER as readonly string[]).includes(ch)).join("");
    return mods.join("") + key;
  }
  const parts = s.split("+").map((p) => p.trim()).filter(Boolean);
  const key = parts.pop() ?? "";
  const keyLabel = KEY_NAME[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key);
  if (mac) {
    const mods = new Set(parts.map((p) => MAC_SYMBOL[p.toLowerCase()] ?? p));
    return MAC_ORDER.filter((m) => mods.has(m)).join("") + keyLabel;
  }
  const names = parts.map((p) => OTHER_NAME[p.toLowerCase()] ?? p);
  return [...new Set(names), keyLabel].join("+");
}

export const COMMAND_LABELS: Record<string, string> = {
  "capture-area": "Capturar área",
  "capture-visible": "Capturar parte visível",
  "capture-full": "Capturar página inteira",
};

/**
 * Suggested bindings (manifest `commands.*.suggested_key`). On macOS ⌃⇧ (MacCtrl+Shift): ⌘⇧3/4/5/6 are the
 * system screenshots and Chrome/Firefox already use many ⌘⇧ letters (⌘⇧V paste-and-match-style, ⌘⇧F, ⌘⇧S…), while
 * ⌥⇧ letters type characters in text fields. Elsewhere Alt+Shift as before.
 */
export const SUGGESTED_KEYS = {
  "capture-area": { default: "Alt+Shift+S", mac: "MacCtrl+Shift+S" },
  "capture-visible": { default: "Alt+Shift+V", mac: "MacCtrl+Shift+V" },
  "capture-full": { default: "Alt+Shift+F", mac: "MacCtrl+Shift+F" },
} as const;
