import { describe, expect, it } from "vitest";
import { cleanLangTag, clampUploadText } from "@recorte/shared";
import { answerLanguage, detectLanguage } from "../src/cloud";
import { parsePage } from "../src/links/parse";

const base = { pageTitle: "", headings: [] as string[], text: "" };

describe("cloud AI language", () => {
  it("uses the page's <html lang>", () => {
    expect(answerLanguage({ ...base, lang: "pt-BR" })).toBe("Brazilian Portuguese");
    expect(answerLanguage({ ...base, lang: "pt-PT" })).toBe("European Portuguese");
    expect(answerLanguage({ ...base, lang: "fr" })).toBe("French");
    expect(answerLanguage({ ...base, lang: "de-DE", text: "the cat is on the table and it is not mine" })).toMatch(/German/);
  });
  it("without a usable lang, detects the language from the text", () => {
    expect(answerLanguage({ ...base, lang: "not a tag!", text: "La receta de la abuela es muy fácil y se hace con harina, azúcar y los huevos del día." })).toBe("Spanish");
    expect(answerLanguage({ ...base, pageTitle: "Le guide", text: "Ce tutoriel est pour les débutants qui veulent apprendre avec nous dans la cuisine." })).toBe("French");
    expect(answerLanguage({ ...base, text: "Esta receita não é difícil e também é muito boa para o jantar com os amigos." })).toBe("Portuguese");
    expect(answerLanguage({ ...base, text: "Questo è il modo più semplice per fare la pizza che non si attacca alla teglia." })).toBe("Italian");
  });
  it("falls back to English when unsure", () => {
    expect(answerLanguage(base)).toBe("English");
    expect(answerLanguage({ ...base, text: "Mapa de Lisboa" })).toBe("English");
    expect(detectLanguage("React Tailwind dashboard")).toBeNull();
    expect(detectLanguage("This is the guide for the people who want to learn it with you")).toBe("en");
  });
});

describe("page language tag", () => {
  it("cleans what pages write and drops what is not a language tag (never rejects an upload)", () => {
    expect(cleanLangTag(" pt_br ")).toBe("pt-BR");
    expect(cleanLangTag("EN-us")).toBe("en-US");
    expect(cleanLangTag("english")).toBeUndefined();
    expect(cleanLangTag("")).toBeUndefined();
    const t = clampUploadText({ selection: "", meta: { lang: "x<script>" }, headings: [], alts: [] }).text;
    expect(t.meta.lang).toBeUndefined();
    expect(clampUploadText({ selection: "", meta: { lang: "it-IT" }, headings: [], alts: [] }).text.meta.lang).toBe("it-IT");
  });
  it("a fetched link's <html lang> is read", () => {
    expect(parsePage('<html lang="es-ES"><head><title>x</title></head><body></body></html>', "https://e.test/").lang).toBe("es-ES");
    expect(parsePage("<html><body></body></html>", "https://e.test/").lang).toBeUndefined();
  });
});
