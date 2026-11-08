import { allDictionaryIssues, createTranslator, LOCALES } from "@recorte/shared";
import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "./dictionaries";
import { en } from "./messages/en";

// Every gallery source file outside src/i18n, as text.
const files = import.meta.glob<string>(["../**/*.ts", "../**/*.tsx", "!./**", "!../**/*.test.ts"], { query: "?raw", import: "default", eager: true });

describe("gallery dictionaries", () => {
  it("every locale has exactly the English keys, the same {arguments} and valid syntax", () => {
    expect(allDictionaryIssues(DICTIONARIES)).toEqual([]);
  });

  it("every key is used somewhere in the gallery (no dead copy)", () => {
    const code = Object.values(files).join("\n");
    expect(Object.keys(files).length).toBeGreaterThan(20);
    // Keys built from a value: kindKey / typeKey / colorKey, and the numbered example lists.
    const dynamic = /^(kind|type|color)\.|^palette\.suggestion\d$|^marquee\.examples\d$/;
    const unused = Object.keys(en).filter((k) => !dynamic.test(k) && !code.includes(`"${k}"`));
    expect(unused).toEqual([]);
  });

  it("pt-BR is Brazilian Portuguese, not European", () => {
    const text = Object.values(DICTIONARIES["pt-BR"]).join("\n");
    for (const ptPT of [/ecrã/i, /palavra-passe/i, /utilizador/i, /ficheiro/i, /\bguard(ar|ad)/i, /\bapag/i, /defini[çc]/i, /descarreg/i, /\blixo\b/i, /registos/i, /\bTenta\b/, /\bcarrega em\b/i, /\ba carregar\b/i, /\bta(s)? (tuas?|teus?)\b/i]) {
      expect(text, String(ptPT)).not.toMatch(ptPT);
    }
  });

  it("plurals and arguments come out right in every locale", () => {
    for (const l of LOCALES) {
      const t = createTranslator(l, DICTIONARIES);
      expect(t("common.captures", { count: 1 })).toMatch(/^1 \S/);
      expect(t("common.captures", { count: 2 })).toMatch(/^2 \S/);
      expect(t("dock.tagAdded", { tag: "react", count: 3 })).toContain("react");
    }
    const t = createTranslator("en-US", DICTIONARIES);
    expect(t("common.captures", { count: 1 })).toBe("1 capture");
    expect(t("common.captures", { count: 1234 })).toBe("1,234 captures");
    expect(t("trash.restored", { count: 1 })).toBe("Capture restored to the gallery.");
    expect(t("trash.restored", { count: 4 })).toBe("4 captures restored to the gallery.");
    const pt = createTranslator("pt-BR", DICTIONARIES);
    expect(pt("settings.reprocessDone", { count: 2 })).toBe("2 capturas vão ser reprocessadas. Suas tags, títulos e notas não mudam.");
    const fr = createTranslator("fr", DICTIONARIES);
    expect(fr("common.captures", { count: 0 })).toBe("0 capture");
  });
});
