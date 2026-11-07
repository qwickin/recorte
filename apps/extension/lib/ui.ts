import { browser } from "wxt/browser";

/** Shadow-DOM host + shared styles for everything the extension draws inside web pages. */

export const HOST_TAG = "recorte-ui";
const FONT_FAMILY = "Recorte Albert Sans";
let fontRequested = false;

/** Registers Albert Sans from the extension package (an @font-face inside a shadow root is ignored).
 *  If the page's CSP blocks it, the system font stack takes over. */
export function ensureFont(): void {
  if (fontRequested) return;
  fontRequested = true;
  try {
    for (const w of ["300", "400", "500"]) {
      const url = browser.runtime.getURL(`/fonts/albert-sans-latin-${w}-normal.woff2` as "/fonts/albert-sans-latin-400-normal.woff2");
      const face = new FontFace(FONT_FAMILY, `url("${url}") format("woff2")`, { weight: w, style: "normal" });
      document.fonts.add(face);
      face.load().catch(() => {});
    }
  } catch {
    // system fallback
  }
}

export const BASE_CSS = `
:host { all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;
  pointer-events: none; color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
.root { --ink: #fff; --ink-2: rgb(255 255 255 / .66); --ink-3: rgb(255 255 255 / .42); --ink-4: rgb(255 255 255 / .24);
  --hair: rgb(255 255 255 / .09); --hair-2: rgb(255 255 255 / .16); --fill: rgb(255 255 255 / .06);
  font-family: "${FONT_FAMILY}", "Albert Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-weight: 300; font-size: 14px; line-height: 1.45; color: var(--ink); -webkit-font-smoothing: antialiased;
  letter-spacing: 0; text-align: left; }
button, input, textarea, select { font: inherit; color: inherit; }
kbd { font: 500 11px/1 ui-monospace, "SF Mono", Menlo, monospace; color: var(--ink-3); border: 1px solid var(--hair-2);
  border-radius: 5px; padding: 3px 5px; margin-left: 8px; }
@keyframes rc-fade { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes rc-dim { from { opacity: 0; } to { opacity: 1; } }
`;

export interface Mounted {
  host: HTMLElement;
  root: ShadowRoot;
  container: HTMLDivElement;
  destroy(): void;
}

/** Mounts an isolated UI layer. Key events are kept from reaching the page's own shortcuts. */
export function mount(css: string, opts: { interactive: boolean; name: string }): Mounted {
  ensureFont();
  const host = document.createElement(HOST_TAG);
  host.setAttribute("data-recorte", opts.name);
  // Closed: the page cannot reach into the root (preview, tags, categories); only this isolated world holds it.
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = BASE_CSS + css;
  const container = document.createElement("div");
  container.className = "root";
  if (opts.interactive) container.style.pointerEvents = "auto";
  root.append(style, container);
  if (opts.interactive) {
    for (const t of ["keydown", "keyup", "keypress", "wheel", "mousedown", "mouseup", "click", "input"]) {
      host.addEventListener(t, (e) => e.stopPropagation());
    }
  }
  (document.documentElement ?? document.body).append(host);
  return { host, root, container, destroy: () => host.remove() };
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) el.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Removes every extension UI layer (used before a capture so nothing of ours ends up in the image). */
export function removeAllUi(except?: string): void {
  for (const el of document.querySelectorAll(HOST_TAG)) {
    if (except && el.getAttribute("data-recorte") === except) continue;
    el.remove();
  }
}

export const nextFrames = (n = 2): Promise<void> =>
  new Promise((resolve) => {
    const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(n);
  });
