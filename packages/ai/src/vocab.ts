// Closed vocabulary: English prompts for the model, Portuguese names for the UI. Each group is ranked on its own.
// Derived from prototype/ai-bench/vocab.mjs (the `assunto` group is dropped).
export interface Label {
  pt: string;
  en: string;
}
export type Group = "tipo" | "visual";

const t = (pt: string, en: string): Label => ({ pt, en });

export const VOCAB: Record<Group, Label[]> = {
  tipo: [
    t("landing page", "a product landing page with a big headline"), t("documentação", "technical documentation"),
    t("artigo", "a news or blog article with paragraphs of text"), t("wiki", "a Wikipedia encyclopedia page"),
    t("artigo científico", "a scientific paper"), t("repositório", "a code repository on GitHub"),
    t("código", "source code in a code editor"), t("lista de links", "a list of links on a news aggregator or forum"),
    t("mapa", "a street map"), t("gráfico", "a chart or graph"), t("tabela", "a data table"),
    t("loja", "an online store product page"), t("receita", "a cooking recipe"), t("banda desenhada", "a comic strip with drawings"),
    t("galeria", "a grid of photos and thumbnails"), t("fotografia", "a photograph"), t("ilustração", "an illustration"),
    t("dashboard", "an app dashboard with panels"), t("formulário", "a login or sign-up form"), t("rede social", "a social media post"),
    t("vídeo", "a video player"), t("conversa", "a chat conversation"), t("email", "an email inbox"),
    t("resultados de pesquisa", "search engine results"), t("preços", "a pricing table with plans"), t("diagrama", "a technical diagram"),
    t("apresentação", "a presentation slide"), t("3d", "3D computer graphics"), t("meteorologia", "a weather forecast"),
    t("calendário", "a calendar"), t("folha de cálculo", "a spreadsheet"), t("terminal", "a command line terminal"),
    t("tipografia", "a font specimen with large letters"), t("componentes ui", "user interface components and buttons"),
  ],
  // All six labels take part in the softmax; only INFORMATIVE_VISUAL ones are ever emitted as tags.
  visual: [
    t("modo escuro", "a dark background"), t("modo claro", "a white background"), t("gradiente", "a colorful gradient"),
    t("imagens", "many images and photos"), t("minimalista", "a minimalist layout with lots of empty space"), t("texto denso", "dense text"),
  ],
};

export const INFORMATIVE_VISUAL: ReadonlySet<string> = new Set(["modo escuro", "gradiente", "imagens"]);

export const prompt = (group: Group, en: string): string =>
  group === "tipo" ? `a screenshot of ${en}` : `a screenshot of a web page with ${en}`;

const EN_STOPWORDS = new Set(["a", "an", "the", "of", "on", "in", "with", "and", "or", "to", "for", "screenshot", "web", "page"]);

/** Search-index synonyms for a label: its pt-PT name followed by the English words of its prompt. */
export function labelSynonyms(tag: string): string[] {
  for (const items of Object.values(VOCAB)) {
    const hit = items.find((l) => l.pt === tag);
    if (hit) {
      const words = hit.en.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !EN_STOPWORDS.has(w));
      return [hit.pt, ...new Set(words)];
    }
  }
  return [];
}
