import { browser } from "wxt/browser";
import { DIALOG_CSS, renderSaveDialog } from "@/lib/dialog";
import type { BackgroundMessage, CategoriesResponse, CategoryResponse, DraftInfo, TagsResponse } from "@/lib/messages";
import { BASE_CSS } from "@/lib/ui";

/**
 * Pre-save dialog page. Shown in an iframe over the captured page (web_accessible_resources): being an
 * extension-origin document, the host page cannot read its DOM nor listen to the keys typed into it.
 * Everything (draft preview, tags, categories, save) goes through background messages.
 */
const send = <T>(m: BackgroundMessage) => browser.runtime.sendMessage(m) as Promise<T>;
const draftId = decodeURIComponent(location.hash.slice(1));

const fonts = ["300", "400", "500"]
  .map((w) => `@font-face{font-family:"Recorte Albert Sans";font-weight:${w};src:url("/fonts/albert-sans-latin-${w}-normal.woff2") format("woff2")}`)
  .join("");
const style = document.createElement("style");
style.textContent = `${fonts}${BASE_CSS}${DIALOG_CSS}
html, body { margin: 0; background: transparent; color-scheme: normal; overflow: hidden; }`;
document.head.append(style);

async function main(): Promise<void> {
  const info = await send<DraftInfo | null>({ type: "recorte:draft-info", draftId });
  if (!info) {
    await send({ type: "recorte:draft-cancel", draftId });
    return;
  }
  const input = await renderSaveDialog(document.getElementById("root")!, {
    preview: info.preview,
    title: info.title,
    site: info.site,
    truncated: info.truncated,
    loadTags: async () => {
      const r = await send<TagsResponse>({ type: "recorte:tags" });
      if (!r.ok) throw new Error(r.error);
      return r.tags;
    },
    loadCategories: async () => {
      const r = await send<CategoriesResponse>({ type: "recorte:categories" });
      if (!r.ok) throw new Error(r.error);
      return r.categories;
    },
    createCategory: async (name) => {
      const r = await send<CategoryResponse>({ type: "recorte:create-category", name });
      if (!r.ok) throw new Error(r.error);
      return r.category;
    },
  });
  await send(input ? { type: "recorte:draft-save", draftId, input } : { type: "recorte:draft-cancel", draftId });
}

void main();
