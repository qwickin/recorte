import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { showToast } from "@/lib/dialog";
import { extractText } from "@/lib/extract";
import type { BackgroundMessage, ContentMessage, ExtractResult, LocatedImage, PageMetrics } from "@/lib/messages";
import { selectArea } from "@/lib/overlay";
import { HOST_TAG, mount, nextFrames, removeAllUi } from "@/lib/ui";

const FRAME_CSS = `iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; margin: 0; padding: 0;
  background: transparent; color-scheme: normal; display: block; }`;

/**
 * Injected on demand (scripting.executeScript) into the tab being captured — never on every page.
 * Draws the area overlay and the pre-save dialog, measures/scrolls the page for full-page capture and extracts text.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  registration: "runtime",
  main() {
    const w = window as unknown as { __recorteContent?: boolean };
    if (w.__recorteContent) return;
    w.__recorteContent = true;

    const send = <T>(m: BackgroundMessage) => browser.runtime.sendMessage(m) as Promise<T>;

    browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse: (r: unknown) => void) => {
      const msg = raw as ContentMessage;
      if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("recorte:")) return;
      handle(msg).then(sendResponse, (e: unknown) => sendResponse({ error: e instanceof Error ? e.message : String(e) }));
      return true;
    });

    let hidden: { el: HTMLElement; value: string; priority: string }[] = [];
    let savedScrollBehavior: string | null = null;

    function metrics(): PageMetrics {
      const de = document.documentElement;
      return {
        pageHeight: Math.max(de.scrollHeight, document.body?.scrollHeight ?? 0, de.clientHeight),
        innerHeight: de.clientHeight || innerHeight,
        innerWidth,
        clientWidth: de.clientWidth || innerWidth,
        scrollX,
        scrollY,
        dpr: devicePixelRatio || 1,
      };
    }

    function hideFixed(): void {
      if (hidden.length) return;
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        if (el.tagName.toLowerCase() === HOST_TAG) continue;
        const pos = getComputedStyle(el).position;
        if (pos === "fixed" || pos === "sticky") {
          hidden.push({ el, value: el.style.getPropertyValue("visibility"), priority: el.style.getPropertyPriority("visibility") });
          el.style.setProperty("visibility", "hidden", "important");
        }
      }
    }

    function unhide(): void {
      for (const h of hidden) h.el.style.setProperty("visibility", h.value, h.priority);
      hidden = [];
    }

    function findImage(srcUrl: string): HTMLImageElement | null {
      const abs = (u: string) => {
        try {
          return new URL(u, location.href).href;
        } catch {
          return u;
        }
      };
      const target = abs(srcUrl);
      for (const img of document.images) {
        if (img.currentSrc === srcUrl || abs(img.currentSrc) === target || abs(img.src) === target) return img;
      }
      return null;
    }

    async function handle(msg: ContentMessage): Promise<unknown> {
      switch (msg.type) {
        case "recorte:ping":
          return { ok: true };
        case "recorte:prepare-capture":
          removeAllUi();
          await nextFrames(2);
          return { ok: true };
        case "recorte:start-area":
          removeAllUi();
          // Reply now; the selection comes back as its own message (survives a service-worker restart).
          void selectArea().then((rect) => send({ type: "recorte:area-selected", rect }));
          return { ok: true };
        case "recorte:metrics":
          removeAllUi();
          return metrics();
        case "recorte:scroll-to": {
          if (savedScrollBehavior === null) {
            savedScrollBehavior = document.documentElement.style.scrollBehavior;
            document.documentElement.style.scrollBehavior = "auto";
          }
          if (msg.hideFixed) hideFixed();
          scrollTo({ left: scrollX, top: msg.y, behavior: "instant" });
          await nextFrames(2);
          // Give lazy content and decode a moment.
          await new Promise((r) => setTimeout(r, 120));
          return scrollY;
        }
        case "recorte:restore":
          unhide();
          scrollTo({ left: msg.x, top: msg.y, behavior: "instant" });
          if (savedScrollBehavior !== null) document.documentElement.style.scrollBehavior = savedScrollBehavior;
          savedScrollBehavior = null;
          await nextFrames(1);
          return { ok: true };
        case "recorte:locate-image": {
          removeAllUi();
          const img = findImage(msg.srcUrl);
          if (!img) return null;
          const before = { x: scrollX, y: scrollY };
          img.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
          await nextFrames(2);
          await new Promise((r) => setTimeout(r, 80));
          const r = img.getBoundingClientRect();
          const vw = document.documentElement.clientWidth || innerWidth;
          const vh = document.documentElement.clientHeight || innerHeight;
          const x = Math.max(0, r.left);
          const y = Math.max(0, r.top);
          const rect = { x, y, width: Math.min(vw, r.right) - x, height: Math.min(vh, r.bottom) - y };
          if (rect.width < 2 || rect.height < 2) {
            scrollTo({ left: before.x, top: before.y, behavior: "instant" });
            return null;
          }
          const fig = img.closest("figure");
          const caption = fig?.querySelector("figcaption")?.textContent ?? img.title ?? "";
          const out: LocatedImage = { rect, alt: img.alt ?? "", caption, scroll: before };
          return out;
        }
        case "recorte:link-text": {
          let a: HTMLAnchorElement | null = null;
          for (const el of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
            if (el.href === msg.url) {
              a = el;
              break;
            }
          }
          const text = (a?.innerText || a?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300);
          return { text, title: a?.title?.trim() ?? "" };
        }
        case "recorte:extract": {
          const text = extractText(document, { kind: msg.kind, rect: msg.rect, image: msg.image });
          const out: ExtractResult = { text, pageTitle: document.title || location.hostname };
          return out;
        }
        case "recorte:dialog": {
          // The form lives in an extension-origin iframe: the page cannot read it or see its keystrokes.
          removeAllUi();
          const ui = mount(FRAME_CSS, { interactive: true, name: "dialog" });
          const frame = document.createElement("iframe");
          frame.src = `${browser.runtime.getURL("/dialog.html")}#${encodeURIComponent(msg.draftId)}`;
          frame.setAttribute("allowtransparency", "true");
          frame.title = "Recorte";
          frame.addEventListener("load", () => frame.contentWindow?.focus());
          ui.container.append(frame);
          return { ok: true };
        }
        case "recorte:close-dialog":
          document.querySelectorAll('recorte-ui[data-recorte="dialog"]').forEach((e) => e.remove());
          return { ok: true };
        case "recorte:toast":
          showToast(
            msg.text,
            msg.tone,
            msg.action === "open-gallery"
              ? { label: "Abrir", run: () => void send({ type: "recorte:open-gallery" }) }
              : msg.action === "open-options"
                ? { label: "Ligar", run: () => void send({ type: "recorte:open-options" }) }
                : undefined,
          );
          return { ok: true };
      }
    }
  },
});
