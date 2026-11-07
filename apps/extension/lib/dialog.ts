import { type Category, type TagCount, normalizeTag, normalizeTags } from "@recorte/shared";
import type { DialogInput } from "./messages";
import { h, mount } from "./ui";

/**
 * Pre-save dialog (spec §6) with the gallery's look. It is rendered inside an extension-origin page
 * (entrypoints/dialog) shown in an iframe over the web page, so the page can neither read the form nor observe
 * the keystrokes typed into it.
 */

export interface DialogOptions {
  preview: string;
  title: string;
  site: string;
  truncated: boolean;
  loadTags(): Promise<TagCount[]>;
  loadCategories(): Promise<Category[]>;
  createCategory(name: string): Promise<Category>;
}

export const DIALOG_CSS = `
.backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / .62); backdrop-filter: blur(6px);
  display: grid; place-items: center; padding: 24px; animation: rc-dim .18s ease-out; }
.panel { position: relative; width: min(920px, 100%); max-height: min(640px, calc(100vh - 48px)); display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(300px, 1fr); background: #000; border-radius: 18px; overflow: hidden;
  box-shadow: 0 0 0 1px rgb(255 255 255 / .08), 0 1px 0 0 rgb(255 255 255 / .06) inset,
    0 50px 120px -30px rgb(0 0 0 / .95), 0 0 120px -40px rgb(255 255 255 / .14);
  animation: rc-fade .22s cubic-bezier(.2,.7,.2,1); }
@media (max-width: 720px) { .panel { grid-template-columns: 1fr; } .preview { max-height: 32vh; } }
.preview { position: relative; background: #050505; border-right: 1px solid var(--hair); overflow: auto;
  display: flex; align-items: flex-start; justify-content: center; padding: 20px; }
.preview img { display: block; max-width: 100%; height: auto; border-radius: 8px;
  box-shadow: 0 0 0 1px var(--hair), 0 20px 60px -20px rgb(255 255 255 / .12); }
form { display: flex; flex-direction: column; gap: 16px; padding: 22px 22px 18px; overflow: auto; min-height: 0; }
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
footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: auto; padding-top: 4px; }
.note { margin: 0; font-size: 12px; color: var(--ink-3); }
.error { margin: 0; font-size: 12px; color: #ff8a8a; }
`;

/** Accent- and case-insensitive key for matching. */
const fold = (s: string) => normalizeTag(s).normalize("NFD").replace(/\p{M}/gu, "");

/** Renders the dialog into `container`; resolves with the user's input, or null when cancelled. */
export function renderSaveDialog(container: HTMLElement, o: DialogOptions): Promise<DialogInput | null> {
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
    const titleInput = h("input", { class: "input", type: "text", "aria-label": "Título", maxlength: "500" });
    titleInput.value = o.title;
    // Plain Enter must not submit implicitly: saving is Cmd/Ctrl+Enter or the button.
    titleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) e.preventDefault();
    });
    const noteInput = h("textarea", { rows: "3", "aria-label": "Nota", placeholder: "Porque guardaste isto?" });

    const tags: string[] = [];
    let allTags: TagCount[] = [];
    const chips = h("div", { class: "chips" });
    const tagInput = h("input", {
      class: "tag-input",
      type: "text",
      "aria-label": "Etiquetas",
      placeholder: "Adicionar etiqueta",
      autocomplete: "off",
    });
    const suggest = h("ul", { class: "suggest", role: "listbox" });
    suggest.hidden = true;
    let suggestions: string[] = [];
    let active = -1;

    const renderChips = () => {
      chips.replaceChildren(
        ...tags.map((t) => {
          const x = h("button", { type: "button", "aria-label": `Remover ${t}` }, "×");
          x.addEventListener("click", () => {
            tags.splice(tags.indexOf(t), 1);
            renderChips();
            tagInput.focus();
          });
          return h("span", { class: "chip" }, t, x);
        }),
        tagInput,
      );
    };
    const addTag = (raw: string) => {
      for (const t of normalizeTags(raw.split(","))) if (!tags.includes(t)) tags.push(t);
      tagInput.value = "";
      renderChips();
      updateSuggest();
      tagInput.focus();
    };
    const updateSuggest = () => {
      const q = fold(tagInput.value);
      suggestions = q
        ? allTags
            .filter((t) => !tags.includes(t.tag) && fold(t.tag).includes(q))
            .sort((a, b) => Number(fold(b.tag).startsWith(q)) - Number(fold(a.tag).startsWith(q)) || b.count - a.count)
            .slice(0, 8)
            .map((t) => t.tag)
        : [];
      active = suggestions.length ? 0 : -1;
      suggest.replaceChildren(
        ...suggestions.map((s, i) => {
          const count = allTags.find((t) => t.tag === s)?.count ?? 0;
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
    const select = h("select", { "aria-label": "Categoria" });
    const newRow = h("div", { class: "row" });
    const newInput = h("input", { class: "input", type: "text", placeholder: "Nome da categoria", "aria-label": "Nova categoria" });
    const newBtn = h("button", { class: "btn ghost", type: "button" }, "Criar");
    newRow.append(newInput, newBtn);
    newRow.hidden = true;
    let categories: Category[] = [];
    const renderSelect = (selected: string) => {
      select.replaceChildren(
        h("option", { value: "" }, "Sem categoria"),
        ...categories.map((c) => h("option", { value: c.id }, c.name)),
        h("option", { value: NEW }, "+ Nova categoria…"),
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
        categories = [...categories.filter((x) => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name, "pt"));
        lastCategory = c.id;
        renderSelect(c.id);
        newRow.hidden = true;
        newInput.value = "";
        error.hidden = true;
      } catch (e) {
        showError(e instanceof Error ? e.message : "Não foi possível criar a categoria.");
      } finally {
        newBtn.disabled = false;
      }
    };
    newBtn.addEventListener("click", create);
    newInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) (e.preventDefault(), create());
    });

    // --- data (through the background; never fetch from the page)
    o.loadTags().then((t) => {
      allTags = t;
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
    const img = h("img", { alt: "Pré-visualização da captura", src: o.preview });
    const save = h("button", { class: "btn primary", type: "submit" }, "Guardar", h("kbd", {}, isMac ? "⌘↵" : "Ctrl+↵"));
    const cancel = h("button", { class: "btn ghost", type: "button" }, "Cancelar", h("kbd", {}, "Esc"));
    const form = h(
      "form",
      {},
      h("header", {}, h("span", { class: "brand" }, "Recorte"), h("span", { class: "site" }, o.site)),
      h("label", { class: "field" }, h("span", { class: "label" }, "Título"), titleInput),
      h("label", { class: "field" }, h("span", { class: "label" }, "Nota"), noteInput),
      h("div", { class: "field" }, h("span", { class: "label" }, "Etiquetas"), chips, suggest),
      h("div", { class: "field" }, h("span", { class: "label" }, "Categoria"), select, newRow),
      o.truncated && h("p", { class: "note" }, "A página é muito alta: foram guardados os primeiros 12 000 px."),
      error,
      h("footer", {}, cancel, save),
    );
    const panel = h("div", { class: "panel", role: "dialog", "aria-modal": "true", "aria-label": "Guardar no Recorte" }, h("div", { class: "preview" }, img), form);
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
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) finish(null);
    });
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
