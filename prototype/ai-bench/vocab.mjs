// Closed vocabulary: English prompts for the model, Portuguese names for the UI. Grouped so each group is ranked on its own.
const t = (pt, en) => ({ pt, en });
export const VOCAB = {
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
  assunto: [
    t("programação", "software programming"), t("web design", "web design"), t("inteligência artificial", "artificial intelligence and machine learning"),
    t("ciência", "science"), t("astronomia", "space and astronomy"), t("viagens", "travel and tourism"), t("arquitetura", "architecture and buildings"),
    t("comida", "food and cooking"), t("finanças", "finance and payments"), t("produtividade", "productivity and project management"),
    t("história", "history"), t("natureza", "nature"), t("desporto", "sports"), t("música", "music"), t("moda", "fashion"),
    t("saúde", "health"), t("educação", "education"), t("jogos", "video games"), t("carros", "cars"), t("arte", "art"),
    t("engenharia", "engineering and mechanisms"), t("humor", "humor"), t("notícias", "news"), t("compras", "shopping"),
  ],
  visual: [
    t("modo escuro", "a dark background"), t("modo claro", "a white background"), t("gradiente", "a colorful gradient"),
    t("imagens", "many images and photos"), t("minimalista", "a minimalist layout with lots of empty space"), t("texto denso", "dense text"),
  ],
};
export const prompt = (group, en) =>
  group === "tipo" ? `a screenshot of ${en}` : group === "assunto" ? `a screenshot of a web page about ${en}` : `a screenshot of a web page with ${en}`;
