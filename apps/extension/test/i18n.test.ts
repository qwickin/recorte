import { allDictionaryIssues, LOCALES, type Locale } from "@recorte/shared";
import { describe, expect, it } from "vitest";
import { DICTIONARIES, makeT, resolveLocale } from "../lib/i18n";
import { en } from "../lib/i18n/en";
import { COMMANDS, formatShortcut } from "../lib/shortcuts";

// public/_locales: what the browser shows (name, description, shortcut names).
const locales = import.meta.glob<Record<string, { message: string }>>("../public/_locales/*/messages.json", { import: "default", eager: true });
const folder = (l: Locale) => (l === "en-US" ? "en" : l.replace("-", "_"));
const messagesOf = (l: Locale) => locales[`../public/_locales/${folder(l)}/messages.json`];

// Every extension source file outside lib/i18n, as text.
const files = import.meta.glob<string>(["../entrypoints/**/*.{ts,html}", "../lib/**/*.ts", "!../lib/i18n/**", "../wxt.config.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("extension dictionaries", () => {
  it("every locale has exactly the English keys, the same {arguments} and valid syntax", () => {
    expect(allDictionaryIssues(DICTIONARIES)).toEqual([]);
  });
  it("every key is used somewhere in the extension", () => {
    const code = Object.values(files).join("\n");
    expect(Object.keys(files).length).toBeGreaterThan(15);
    const unused = Object.keys(en).filter((k) => !code.includes(`"${k}"`));
    expect(unused).toEqual([]);
  });
  it("pt-BR is Brazilian Portuguese, not European", () => {
    const text = Object.values(DICTIONARIES["pt-BR"]).join("\n");
    for (const ptPT of [/ecrã/i, /palavra-passe/i, /separador/i, /\bguard(ar|ad)/i, /\bligad|\bligar\b|\bliga a\b/i, /descarreg/i, /\bVolta a\b/, /\bAbre\b/, /\bEspera\b/, /\bconta(s)? (tua|teu)/i, /\btu(a|as)\b/i]) {
      expect(text, String(ptPT)).not.toMatch(ptPT);
    }
  });
});

describe("browser-shown strings (public/_locales)", () => {
  it("has one folder per locale with the same message names as English", () => {
    const names = Object.keys(messagesOf("en-US") ?? {}).sort();
    expect(names).toEqual(["cmdCaptureArea", "cmdCaptureFull", "cmdCaptureVisible", "extDescription", "extName"]);
    expect(Object.keys(locales)).toHaveLength(LOCALES.length);
    for (const l of LOCALES) {
      const m = messagesOf(l);
      expect(m, l).toBeDefined();
      expect(Object.keys(m!).sort(), l).toEqual(names);
      expect(m!.extName!.message).toBe("Recorte");
      expect(m!.extDescription!.message.length, l).toBeLessThanOrEqual(132);
      for (const n of names) expect(m![n]!.message.trim(), `${l} ${n}`).not.toBe("");
    }
  });
  it("the manifest's __MSG_ references and the shortcut names agree with the runtime dictionary", () => {
    for (const l of LOCALES) {
      const m = messagesOf(l)!;
      const t = makeT(l);
      for (const c of Object.values(COMMANDS)) expect(m[c.manifest]!.message, l).toBe(t(c.ui));
    }
    const config = files["../wxt.config.ts"]!;
    expect(config).toContain('default_locale: "en"');
    expect(config).toContain("__MSG_extName__");
  });
});

describe("language choice", () => {
  it("the Options override wins, else the browser UI language, else English", () => {
    expect(resolveLocale("fr", "pt-BR")).toBe("fr");
    expect(resolveLocale(null, "pt-PT")).toBe("pt-BR");
    expect(resolveLocale(null, "es-419")).toBe("es");
    expect(resolveLocale(null, "it")).toBe("it");
    expect(resolveLocale(null, "de")).toBe("en-US");
    expect(resolveLocale(undefined, "")).toBe("en-US");
  });
  it("copy and plurals follow the locale", () => {
    expect(makeT("en-US")("popup.queuePending", { count: 1 })).toBe("1 capture waiting to upload");
    expect(makeT("en-US")("popup.queuePending", { count: 3 })).toBe("3 captures waiting to upload");
    expect(makeT("pt-BR")("popup.queuePending", { count: 3 })).toBe("3 capturas esperando envio");
    expect(makeT("fr")("menu.saveLink")).toBe("Enregistrer le lien dans Recorte");
    expect(makeT("it")("dialog.truncated", { px: "12.000" })).toBe("La pagina è molto alta: sono stati salvati i primi 12.000 px.");
  });
  it("shortcut key names can be localized", () => {
    expect(formatShortcut("Alt+Shift+Space", false)).toBe("Alt+Shift+Space");
    expect(formatShortcut("Alt+Shift+Space", false, { space: makeT("pt-BR")("key.space") })).toBe("Alt+Shift+Espaço");
  });
});
