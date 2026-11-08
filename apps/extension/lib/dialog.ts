import { type Category, DEFAULT_LOCALE, formatNumber, normalizeTag, normalizeTags, type TagCount } from "@recorte/shared";
import { makeT, type T } from "./i18n";
import { MAX_FULL_PAGE_HEIGHT } from "./stitch";
import type { DialogInput, LinkPreview } from "./messages";
import { h, mount } from "./ui";

/**
 * Pre-save dialog (spec §6) with the gallery's look. It is rendered inside an extension-origin page
 * (entrypoints/dialog) shown in an iframe over the web page, so the page can neither read the form nor observe
 * the keystrokes typed into it.
 */

export interface DialogOptions {
  preview: string;
  /** A saved link: a card (its og:image when known) instead of the capture. */
  link?: LinkPreview;
  title: string;
  site: string;
  truncated: boolean;
  loadTags(): Promise<TagCount[]>;
  loadCategories(): Promise<Category[]>;
  createCategory(name: string): Promise<Category>;
  /** The extension's UI language (lib/i18n/browser getT); English when omitted. */
  t?: T;
}

export const DIALOG_CSS = `
.backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / .62); backdrop-filter: blur(6px);
  display: grid; place-items: center; padding: 24px; animation: rc-dim .18s ease-out; }
/* The panel always fits the viewport, whatever the capture size: the preview is contained, the form body scrolls
   and the footer (Cancel / Save) stays visible. */
.panel { position: relative; width: min(920px, 100%); height: min(640px, calc(100vh - 48px)); display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(300px, 1fr); grid-template-rows: minmax(0, 1fr);
  background: #000; border-radius: 18px; overflow: hidden;
  box-shadow: 0 0 0 1px rgb(255 255 255 / .08), 0 1px 0 0 rgb(255 255 255 / .06) inset,
    0 50px 120px -30px rgb(0 0 0 / .95), 0 0 120px -40px rgb(255 255 255 / .14);
  animation: rc-fade .22s cubic-bezier(.2,.7,.2,1); }
.preview { position: relative; min-height: 0; background: #050505; border-right: 1px solid var(--hair); overflow: hidden;
  display: flex; align-items: center; justify-content: center; padding: 20px; }
.preview img { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain;
  border-radius: 8px; box-shadow: 0 0 0 1px var(--hair), 0 20px 60px -20px rgb(255 255 255 / .12); }
.linkcard { width: 100%; max-height: 100%; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.linkcard img { flex: 0 1 auto; min-height: 0; max-height: calc(100% - 120px); width: 100%; object-fit: cover; }
.linkcard .site { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
.linkcard .t { font-size: 20px; font-weight: 300; line-height: 1.25; color: #fff; overflow: hidden; display: -webkit-box;
  -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
.linkcard .d { font-size: 13px; line-height: 1.5; color: var(--ink-2); overflow: hidden; display: -webkit-box;
  -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.linkcard .u { font-size: 12px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview .tall { position: absolute; left: 50%; bottom: 10px; translate: -50% 0; font-size: 11px; color: var(--ink-3);
  background: rgb(0 0 0 / .7); padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
form { display: flex; flex-direction: column; min-height: 0; }
.body { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column;
  gap: 16px; padding: 22px 22px 16px; }
@media (max-width: 720px), (max-height: 520px) {
  .backdrop { padding: 10px; }
  .panel { height: calc(100vh - 20px); }
}
@media (max-width: 720px) {
  .panel { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 32vh) minmax(0, 1fr); }
  .preview { border-right: 0; border-bottom: 1px solid var(--hair); padding: 12px; }
}
header { display: flex; align-items: baseline; gap: 10px; }
.brand { font-weight: 500; font-size: 15px; letter-spacing: .01em; }
.site { color: var(--ink-3); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field { display: flex; flex-direction: column; gap: 7px; position: relative; }
.label { font-size: 11px; font-weight: 400; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
.input, textarea, select, .chips { width: 100%; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px;
  padding: 9px 11px; outline: none; transition: border-color .15s, box-shadow .15s; }
.input:focus, textarea:focus, select:focus, .chips:focus-within { border-color: rgb(255 255 255 / .4);
  box-shadow: 0 0 0 3px rgb(255 255 255 / .07), 0 0 24px -6px rgb(255 255 255 / .25); }
textarea { resize: vertical; min-height: 64px; max-height: 200px; }
select { appearance: none; cursor: pointer; background-image: linear-gradient(45deg, transparent 50%, var(--ink-3) 50%),
  linear-gradient(135deg, var(--ink-3) 50%, transparent 50%); background-position: calc(100% - 16px) 50%, calc(100% - 11px) 50%;
  background-size: 5px 5px; background-repeat: no-repeat; }
option { background: #0b0b0b; color: #fff; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 8px; cursor: text; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; border-radius: 999px;
  background: rgb(255 255 255 / .1); font-size: 12.5px; font-weight: 400; }
.chip button { all: unset; cursor: pointer; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
  color: var(--ink-2); font-size: 13px; line-height: 1; }
.chip button:hover { background: rgb(255 255 255 / .14); color: #fff; }
.tag-input { flex: 1 1 120px; min-width: 100px; border: 0; outline: 0; background: transparent; padding: 3px 2px; }
.suggest { position: absolute; left: 0; right: 0; top: 100%; margin: 6px 0 0; padding: 5px; list-style: none; z-index: 2;
  background: #0b0b0b; border-radius: 12px; max-height: 210px; overflow: auto;
  box-shadow: 0 0 0 1px rgb(255 255 255 / .1), 0 24px 60px -12px rgb(0 0 0 / .9); }
.suggest li { display: flex; justify-content: space-between; gap: 10px; padding: 7px 10px; border-radius: 8px; cursor: pointer; }
.suggest li[aria-selected="true"], .suggest li:hover { background: rgb(255 255 255 / .09); }
.suggest .n { color: var(--ink-4); font-size: 12px; }
.row { display: flex; gap: 8px; }
.row .input { flex: 1; }
.btn { appearance: none; border: 0; cursor: pointer; border-radius: 999px; padding: 9px 16px; font-weight: 400;
  display: inline-flex; align-items: center; transition: background .15s, box-shadow .15s, opacity .15s; }
.btn.primary { background: #fff; color: #000; font-weight: 500; }
.btn.primary kbd { color: rgb(0 0 0 / .5); border-color: rgb(0 0 0 / .18); }
.btn.primary:hover { box-shadow: 0 0 28px -4px rgb(255 255 255 / .55); }
.btn.ghost { background: transparent; color: var(--ink-2); box-shadow: inset 0 0 0 1px var(--hair-2); }
.btn.ghost:hover { color: #fff; background: var(--fill); }
.btn:disabled { opacity: .5; cursor: default; }
footer { flex: none; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 22px 16px;
  border-top: 1px solid var(--hair); background: #000; }
.note { margin: 0; font-size: 12px; color: var(--ink-3); }
.error { margin: 0; font-size: 12px; color: #ff8a8a; }
`;

function linkCard(l: LinkPreview, site: string, title: string): HTMLElement {
  const card = h("div", { class: "linkcard" });
  if (l.image) {
    const im = h("img", { alt: "", src: l.image, referrerpolicy: "no-referrer" });
    im.addEventListener("error", () => im.remove());
    card.append(im);
  }
  card.append(h("span", { class: "site" }, site), h("p", { class: "t" }, title));
  if (l.description) card.append(h("p", { class: "d" }, l.description));
  card.append(h("span", { class: "u" }, l.url));
  return card;
}

/** Accent- and case-insensitive key for matching. */
const fold = (s: string) => normalizeTag(s).normalize("NFD").replace(/\p{M}/gu, "");

/** Renders the dialog into `container`; resolves with the user's input, or null when cancelled. */
export function renderSaveDialog(container: HTMLElement, o: DialogOptions): Promise<DialogInput | null> {
  const t = o.t ?? makeT(DEFAULT_LOCALE);
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  return new Promise((resolve) => {
    let done = false;
    const finish = (v: DialogInput | null) => {
      if (done) return;
      done = true;
      container.replaceChildren();
      resolve(v);
    };

    // --- fields
    const titleInput = h("input", { class: "input", type: "text", "aria-label": t("dialog.title"), maxlength: "500" });
    titleInput.value = o.title;
    // Plain Enter must not submit implicitly: saving is Cmd/Ctrl+Enter or the button.
    titleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) e.preventDefault();
    });
    const noteInput = h("textarea", { rows: "3", "aria-label": t("dialog.note"), placeholder: t("dialog.notePlaceholder") });

    const tags: string[] = [];
    let allTags: TagCount[] = [];
    const chips = h("div", { class: "chips" });
    const tagInput = h("input", {
      class: "tag-input",
      type: "text",
      "aria-label": t("dialog.tags"),
      placeholder: t("dialog.addTag"),
      autocomplete: "off",
    });
    const suggest = h("ul", { class: "suggest", role: "listbox" });
    suggest.hidden = true;
    let suggestions: string[] = [];
    let active = -1;

    const renderChips = () => {
      chips.replaceChildren(
        ...tags.map((tag) => {
          const x = h("button", { type: "button", "aria-label": t("dialog.removeTag", { tag }) }, "×");
          x.addEventListener("click", () => {
            tags.splice(tags.indexOf(tag), 1);
            renderChips();
            tagInput.focus();
          });
          return h("span", { class: "chip" }, tag, x);
        }),
        tagInput,
      );
    };
    const addTag = (raw: string) => {
      for (const tag of normalizeTags(raw.split(","))) if (!tags.includes(tag)) tags.push(tag);
      tagInput.value = "";
      renderChips();
      updateSuggest();
      tagInput.focus();
    };
    const updateSuggest = () => {
      const q = fold(tagInput.value);
      suggestions = q
        ? allTags
            .filter((x) => !tags.includes(x.tag) && fold(x.tag).includes(q))
            .sort((a, b) => Number(fold(b.tag).startsWith(q)) - Number(fold(a.tag).startsWith(q)) || b.count - a.count)
            .slice(0, 8)
            .map((x) => x.tag)
        : [];
      active = suggestions.length ? 0 : -1;
      suggest.replaceChildren(
        ...suggestions.map((s, i) => {
          const count = allTags.find((x) => x.tag === s)?.count ?? 0;
          const li = h("li", { role: "option", "aria-selected": String(i === active) }, h("span", {}, s), h("span", { class: "n" }, String(count)));
          li.addEventListener("mousedown", (e) => {
            e.preventDefault();
            addTag(s);
          });
          return li;
        }),
      );
      suggest.hidden = suggestions.length === 0;
    };
    const moveActive = (d: number) => {
      if (!suggestions.length) return;
      active = (active + d + suggestions.length) % suggestions.length;
      suggest.querySelectorAll("li").forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    };
    chips.addEventListener("click", () => tagInput.focus());
    tagInput.addEventListener("input", () => {
      if (tagInput.value.includes(",")) addTag(tagInput.value);
      else updateSuggest();
    });
    tagInput.addEventListener("blur", () => setTimeout(() => (suggest.hidden = true), 120));
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") (e.preventDefault(), moveActive(1));
      else if (e.key === "ArrowUp") (e.preventDefault(), moveActive(-1));
      else if ((e.key === "Enter" || e.key === "Tab") && !(e.metaKey || e.ctrlKey)) {
        const pick = !suggest.hidden && active >= 0 ? suggestions[active] : tagInput.value;
        if (pick && pick.trim()) {
          e.preventDefault();
          addTag(pick);
        } else if (e.key === "Enter") e.preventDefault();
      } else if (e.key === "Backspace" && !tagInput.value && tags.length) {
        tags.pop();
        renderChips();
        tagInput.focus();
      }
    });
    renderChips();

    // --- category
    const NEW = "__new__";
    const select = h("select", { "aria-label": t("dialog.category") });
    const newRow = h("div", { class: "row" });
    const newInput = h("input", { class: "input", type: "text", placeholder: t("dialog.categoryName"), "aria-label": t("dialog.newCategoryLabel") });
    const newBtn = h("button", { class: "btn ghost", type: "button" }, t("dialog.create"));
    newRow.append(newInput, newBtn);
    newRow.hidden = true;
    let categories: Category[] = [];
    const renderSelect = (selected: string) => {
      select.replaceChildren(
        h("option", { value: "" }, t("dialog.noCategory")),
        ...categories.map((c) => h("option", { value: c.id }, c.name)),
        h("option", { value: NEW }, t("dialog.newCategory")),
      );
      select.value = selected;
    };
    renderSelect("");
    let lastCategory = "";
    select.addEventListener("change", () => {
      if (select.value === NEW) {
        newRow.hidden = false;
        newInput.focus();
      } else {
        lastCategory = select.value;
        newRow.hidden = true;
      }
    });
    const error = h("p", { class: "error" });
    error.hidden = true;
    const showError = (m: string) => {
      error.textContent = m;
      error.hidden = false;
    };
    const create = async () => {
      const name = newInput.value.trim();
      if (!name) return newInput.focus();
      newBtn.disabled = true;
      try {
        const c = await o.createCategory(name);
        categories = [...categories.filter((x) => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name, t.locale));
        lastCategory = c.id;
        renderSelect(c.id);
        newRow.hidden = true;
        newInput.value = "";
        error.hidden = true;
      } catch (e) {
        showError(e instanceof Error && e.message ? e.message : t("dialog.createFailed"));
      } finally {
        newBtn.disabled = false;
      }
    };
    newBtn.addEventListener("click", create);
    newInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) (e.preventDefault(), create());
    });

    // --- data (through the background; never fetch from the page)
    o.loadTags().then((list) => {
      allTags = list;
      if (tagInput.value) updateSuggest();
    }, () => {});
    o.loadCategories().then(
      (c) => {
        categories = c;
        renderSelect(lastCategory);
      },
      () => {},
    );

    // --- layout
    const img = h("img", { alt: t("dialog.preview"), src: o.preview });
    const save = h("button", { class: "btn primary", type: "submit" }, t("dialog.save"), h("kbd", {}, isMac ? "⌘↵" : "Ctrl+↵"));
    const cancel = h("button", { class: "btn ghost", type: "button" }, t("dialog.cancel"), h("kbd", {}, "Esc"));
    const form = h(
      "form",
      {},
      h(
        "div",
        { class: "body" },
        h("header", {}, h("span", { class: "brand" }, "Recorte"), h("span", { class: "site" }, o.site)),
        h("label", { class: "field" }, h("span", { class: "label" }, t("dialog.title")), titleInput),
        h("label", { class: "field" }, h("span", { class: "label" }, t("dialog.note")), noteInput),
        h("div", { class: "field" }, h("span", { class: "label" }, t("dialog.tags")), chips, suggest),
        h("div", { class: "field" }, h("span", { class: "label" }, t("dialog.category")), select, newRow),
        o.truncated && h("p", { class: "note" }, t("dialog.truncated", { px: formatNumber(MAX_FULL_PAGE_HEIGHT, t.locale) })),
        error,
      ),
      h("footer", {}, cancel, save),
    );
    const preview = h("div", { class: "preview" }, o.link ? linkCard(o.link, o.site, o.title) : img);
    // A very tall capture is shrunk to fit: say it is whole.
    img.addEventListener("load", () => {
      if (img.naturalHeight > img.naturalWidth * 3) preview.append(h("span", { class: "tall" }, t("dialog.tall")));
    });
    const panel = h("div", { class: "panel", role: "dialog", "aria-modal": "true", "aria-label": t("dialog.label") }, preview, form);
    const backdrop = h("div", { class: "backdrop" }, panel);
    container.append(backdrop);

    const submit = () => {
      if (tagInput.value.trim()) addTag(tagInput.value);
      finish({
        title: titleInput.value.trim(),
        note: noteInput.value.trim(),
        tags: [...tags],
        categoryId: select.value && select.value !== NEW ? select.value : null,
      });
    };
    form.addEventListener("submit", (e) => (e.preventDefault(), submit()));
    cancel.addEventListener("click", () => finish(null));
    // A click outside the panel does nothing: only Cancel / Esc discard the capture.
    container.ownerDocument.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (!suggest.hidden) suggest.hidden = true;
        else if (!newRow.hidden) {
          newRow.hidden = true;
          renderSelect(lastCategory);
          select.focus();
        } else finish(null);
      }
    });

    titleInput.focus();
    titleInput.select();
  });
}

const TOAST_CSS = `
.toast { position: fixed; right: 20px; bottom: 20px; display: flex; align-items: center; gap: 14px; pointer-events: auto;
  padding: 11px 12px 11px 16px; background: #000; border-radius: 999px; animation: rc-fade .2s ease-out;
  box-shadow: 0 0 0 1px rgb(255 255 255 / .12), 0 20px 50px -12px rgb(0 0 0 / .9), 0 0 60px -20px rgb(255 255 255 / .3); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: #fff; box-shadow: 0 0 12px rgb(255 255 255 / .8); }
.toast.error .dot { background: #ff8a8a; box-shadow: 0 0 12px rgb(255 120 120 / .8); }
.toast span { font-weight: 400; }
.toast button { all: unset; cursor: pointer; font-weight: 500; padding: 5px 12px; border-radius: 999px; background: #fff; color: #000; }
`;

export function showToast(text: string, tone: "ok" | "error", action?: { label: string; run(): void }): void {
  document.querySelectorAll('recorte-ui[data-recorte="toast"]').forEach((e) => e.remove());
  const ui = mount(TOAST_CSS, { interactive: false, name: "toast" });
  const el = h("div", { class: `toast ${tone}`, role: "status" }, h("i", { class: "dot" }), h("span", {}, text));
  if (action) {
    const b = h("button", { type: "button" }, action.label);
    b.addEventListener("click", () => {
      action.run();
      ui.destroy();
    });
    el.append(b);
  }
  ui.container.append(el);
  setTimeout(() => ui.destroy(), tone === "error" ? 8000 : 5000);
}
