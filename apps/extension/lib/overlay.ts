import type { Rect } from "./extract";
import { h, mount, nextFrames } from "./ui";

/** Area selection overlay: crosshair, dimmed outside the selection, live size, Esc cancels.
 *  Selection is limited to the visible viewport (phase 1). Resolves after the overlay is gone and repainted. */

const CSS = `
.layer { position: fixed; inset: 0; cursor: crosshair; user-select: none; -webkit-user-select: none; }
.dim { position: fixed; inset: 0; background: rgb(0 0 0 / .45); }
.sel { position: fixed; border: 1px solid rgb(255 255 255 / .95); box-shadow: 0 0 0 100vmax rgb(0 0 0 / .45),
  0 0 24px rgb(255 255 255 / .25); }
.size { position: fixed; padding: 3px 8px; border-radius: 6px; background: #000; color: #fff; font-size: 12px;
  font-weight: 400; font-variant-numeric: tabular-nums; box-shadow: 0 0 0 1px rgb(255 255 255 / .18); white-space: nowrap; }
.hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 8px 14px; border-radius: 999px;
  background: #000; color: rgb(255 255 255 / .8); font-size: 13px; box-shadow: 0 0 0 1px rgb(255 255 255 / .14),
  0 0 40px -10px rgb(255 255 255 / .35); pointer-events: none; animation: rc-fade .2s ease-out; }
`;

const MIN_SIZE = 4;

/** `hint`: the translated "drag to select" line (the content script reads the language). */
export function selectArea(hintText: string): Promise<Rect | null> {
  const ui = mount(CSS, { interactive: true, name: "overlay" });
  const dim = h("div", { class: "dim" });
  const sel = h("div", { class: "sel" });
  const size = h("div", { class: "size" });
  sel.hidden = true;
  size.hidden = true;
  const hint = h("div", { class: "hint" }, hintText);
  const layer = h("div", { class: "layer", tabindex: "-1" }, dim, sel, size, hint);
  ui.container.append(layer);
  layer.focus();

  return new Promise((resolve) => {
    let start: { x: number; y: number } | null = null;
    let rect: Rect | null = null;
    const clampX = (x: number) => Math.max(0, Math.min(x, document.documentElement.clientWidth || innerWidth));
    const clampY = (y: number) => Math.max(0, Math.min(y, document.documentElement.clientHeight || innerHeight));

    const finish = async (r: Rect | null) => {
      removeEventListener("keydown", onKey, true);
      ui.destroy();
      await nextFrames(2);
      resolve(r);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        void finish(null);
      }
    };
    addEventListener("keydown", onKey, true);

    layer.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      start = { x: clampX(e.clientX), y: clampY(e.clientY) };
      hint.hidden = true;
    });
    layer.addEventListener("mousemove", (e) => {
      if (!start) return;
      const x = clampX(e.clientX);
      const y = clampY(e.clientY);
      rect = { x: Math.min(x, start.x), y: Math.min(y, start.y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) };
      dim.hidden = true;
      sel.hidden = false;
      size.hidden = false;
      Object.assign(sel.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      size.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
      const below = rect.y + rect.height + 28 < innerHeight;
      Object.assign(size.style, { left: `${rect.x}px`, top: `${below ? rect.y + rect.height + 8 : Math.max(4, rect.y - 28)}px` });
    });
    layer.addEventListener("mouseup", () => {
      if (!start) return;
      start = null;
      if (rect && rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) void finish(rect);
      else {
        rect = null;
        sel.hidden = true;
        size.hidden = true;
        dim.hidden = false;
      }
    });
  });
}
