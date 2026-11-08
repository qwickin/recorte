import type { Locale } from "./i18n/locale";
import { normalizeTag } from "./tags";

/**
 * AI tags are stored as language-neutral IDs and shown in the viewer's language.
 *
 * One line per tag: `id|en-US|pt-BR|es|fr|it`.
 * - The ID is frozen. Every meta.json (`ai.topics`, `user.hiddenAiTags`, `user.tags`), every SQLite `item_tags` row and
 *   every search document refers to it, so never rename or remove one (test/tag-ids.json guards this). To change how a
 *   tag reads, change its labels.
 * - IDs are English, lowercase and unique. The English label starts out as the same text (with proper nouns
 *   capitalised).
 * - Labels are short natural tag names, not literal translations. Proper nouns stay as they are.
 * - No two IDs share a label once normalised (case, spaces and accents folded): a tag a person types is stored as the
 *   ID whose label it matches (`canonicalTag`), so "modo escuro" and "dark mode" are one tag.
 * The matching vocabulary of the text tagger (pt-PT names, synonyms, aliases) lives in packages/ai/src/topics-vocab.ts,
 * keyed by the same IDs.
 */
const RAW = `
documentation|documentation|documentação|documentación|documentation|documentazione
tutorial|tutorial|tutorial|tutorial|tutoriel|tutorial
article|article|artigo|artículo|article|articolo
news|news|notícia|noticia|actualité|notizia
opinion|opinion|opinião|opinión|opinion|opinione
interview|interview|entrevista|entrevista|interview|intervista
review|review|análise|reseña|critique|recensione
comparison|comparison|comparação|comparativa|comparatif|confronto
encyclopedia|encyclopedia|enciclopédia|enciclopedia|encyclopédie|enciclopedia
scientific paper|scientific paper|artigo científico|artículo científico|article scientifique|articolo scientifico
repository|repository|repositório|repositorio|dépôt|repository
code|code|código|código|code|codice
link list|link list|lista de links|lista de enlaces|liste de liens|lista di link
map|map|mapa|mapa|carte|mappa
chart|chart|gráfico|gráfico|graphique|grafico
table|table|tabela|tabla|tableau|tabella
shop|shop|loja|tienda|boutique|negozio
product|product|produto|producto|produit|prodotto
recipe|recipe|receita|receta|recette|ricetta
comic|comic|quadrinhos|cómic|bande dessinée|fumetti
gallery|gallery|galeria|galería|galerie|galleria
photo|photo|foto|foto|photo|foto
illustration|illustration|ilustração|ilustración|illustration|illustrazione
dashboard|dashboard|dashboard|panel|tableau de bord|dashboard
form|form|formulário|formulario|formulaire|modulo
social media|social media|redes sociais|redes sociales|réseaux sociaux|social media
post|post|post|publicación|publication|post
video|video|vídeo|vídeo|vidéo|video
podcast|podcast|podcast|podcast|podcast|podcast
chat|chat|conversa|chat|conversation|chat
email|email|e-mail|correo|e-mail|email
search results|search results|resultados de busca|resultados de búsqueda|résultats de recherche|risultati di ricerca
pricing|pricing|preços|precios|tarifs|prezzi
diagram|diagram|diagrama|diagrama|diagramme|diagramma
presentation|presentation|apresentação|presentación|présentation|presentazione
calendar|calendar|calendário|calendario|calendrier|calendario
spreadsheet|spreadsheet|planilha|hoja de cálculo|tableur|foglio di calcolo
terminal|terminal|terminal|terminal|terminal|terminale
landing page|landing page|landing page|landing page|landing page|landing page
portfolio|portfolio|portfólio|portafolio|portfolio|portfolio
cv|CV|currículo|currículum|CV|curriculum
course|course|curso|curso|cours|corso
forum|forum|fórum|foro|forum|forum
blog|blog|blog|blog|blog|blog
book|book|livro|libro|livre|libro
event|event|evento|evento|événement|evento
job posting|job posting|vaga de emprego|oferta de empleo|offre d'emploi|offerta di lavoro
changelog|changelog|changelog|registro de cambios|notes de version|changelog
template|template|template|plantilla|modèle|template
game|game|jogo|juego|jeu|gioco
app|app|aplicativo|app|application|app
profile|profile|perfil|perfil|profil|profilo
quote|quote|citação|cita|citation|citazione
list|list|lista|lista|liste|lista
document|document|documento|documento|document|documento
weather|weather|previsão do tempo|meteorología|météo|meteo
ui components|UI components|componentes de UI|componentes de UI|composants UI|componenti UI
dialog|dialog|diálogo|diálogo|boîte de dialogue|finestra di dialogo
dropdown|dropdown|dropdown|desplegable|menu déroulant|menu a tendina
combobox|combobox|combobox|combobox|combobox|combobox
button|button|botão|botón|bouton|pulsante
tabs|tabs|abas|pestañas|onglets|schede
tooltip|tooltip|tooltip|tooltip|infobulle|tooltip
accordion|accordion|acordeão|acordeón|accordéon|accordion
carousel|carousel|carrossel|carrusel|carrousel|carosello
date picker|date picker|seletor de data|selector de fecha|sélecteur de date|selettore di data
toggle|toggle|toggle|interruptor|interrupteur|interruttore
toast|toast|toast|toast|toast|toast
navigation|navigation|navegação|navegación|navigation|navigazione
card|card|card|tarjeta|card|card
avatar|avatar|avatar|avatar|avatar|avatar
input|input|campo de texto|campo de texto|champ de saisie|campo di testo
checkbox|checkbox|checkbox|casilla de verificación|case à cocher|checkbox
slider|slider|slider|deslizador|curseur|slider
popover|popover|popover|popover|popover|popover
command palette|command palette|paleta de comandos|paleta de comandos|palette de commandes|palette dei comandi
design|design|design|diseño|design|design
ui design|UI design|design de interface|diseño de UI|design d'interface|UI design
ux|UX|UX|UX|UX|UX
web design|web design|web design|diseño web|design web|web design
design system|design system|design system|sistema de diseño|design system|design system
design tokens|design tokens|design tokens|tokens de diseño|design tokens|design token
shadows|shadows|sombras|sombras|ombres|ombre
dark mode|dark mode|modo escuro|modo oscuro|mode sombre|modalità scura
typography|typography|tipografia|tipografía|typographie|tipografia
font|font|fonte|fuente|police|font
sans-serif|sans-serif|sans-serif|sans-serif|sans-serif|sans-serif
serif|serif|serifa|serifa|serif|serif
monospace|monospace|monoespaçada|monoespaciada|monospace|monospace
color|color|cor|color|couleur|colore
gradient|gradient|gradiente|degradado|dégradé|gradiente
icons|icons|ícones|iconos|icônes|icone
logo|logo|logotipo|logotipo|logo|logo
branding|branding|branding|branding|branding|branding
motion design|motion design|motion design|motion design|motion design|motion design
figma|Figma|Figma|Figma|Figma|Figma
prototype|prototype|protótipo|prototipo|prototype|prototipo
wireframe|wireframe|wireframe|wireframe|wireframe|wireframe
minimalism|minimalism|minimalismo|minimalismo|minimalisme|minimalismo
layout|layout|layout|maquetación|mise en page|layout
responsive design|responsive design|design responsivo|diseño responsive|responsive design|design responsive
accessibility|accessibility|acessibilidade|accesibilidad|accessibilité|accessibilità
inspiration|inspiration|inspiração|inspiración|inspiration|ispirazione
graphic design|graphic design|design gráfico|diseño gráfico|graphisme|design grafico
product design|product design|design de produto|diseño de producto|design produit|design di prodotto
interior design|interior design|design de interiores|interiorismo|design d'intérieur|design d'interni
architecture|architecture|arquitetura|arquitectura|architecture|architettura
animation|animation|animação|animación|animation|animazione
3d|3D|3D|3D|3D|3D
digital illustration|digital illustration|ilustração digital|ilustración digital|illustration numérique|illustrazione digitale
ui kit|UI kit|UI kit|UI kit|UI kit|UI kit
dribbble|Dribbble|Dribbble|Dribbble|Dribbble|Dribbble
behance|Behance|Behance|Behance|Behance|Behance
awwwards|Awwwards|Awwwards|Awwwards|Awwwards|Awwwards
programming|programming|programação|programación|programmation|programmazione
web development|web development|desenvolvimento web|desarrollo web|développement web|sviluppo web
frontend|frontend|front-end|frontend|front-end|frontend
backend|backend|back-end|backend|back-end|backend
javascript|JavaScript|JavaScript|JavaScript|JavaScript|JavaScript
typescript|TypeScript|TypeScript|TypeScript|TypeScript|TypeScript
python|Python|Python|Python|Python|Python
rust|Rust|Rust|Rust|Rust|Rust
go|Go|Go|Go|Go|Go
java|Java|Java|Java|Java|Java
kotlin|Kotlin|Kotlin|Kotlin|Kotlin|Kotlin
swift|Swift|Swift|Swift|Swift|Swift
c++|C++|C++|C++|C++|C++
c#|C#|C#|C#|C#|C#
php|PHP|PHP|PHP|PHP|PHP
ruby|Ruby|Ruby|Ruby|Ruby|Ruby
elixir|Elixir|Elixir|Elixir|Elixir|Elixir
sql|SQL|SQL|SQL|SQL|SQL
html|HTML|HTML|HTML|HTML|HTML
css|CSS|CSS|CSS|CSS|CSS
flexbox|flexbox|flexbox|flexbox|flexbox|flexbox
css grid|CSS grid|CSS grid|CSS grid|CSS grid|CSS grid
sass|Sass|Sass|Sass|Sass|Sass
tailwind css|Tailwind CSS|Tailwind CSS|Tailwind CSS|Tailwind CSS|Tailwind CSS
bootstrap|Bootstrap|Bootstrap|Bootstrap|Bootstrap|Bootstrap
react|React|React|React|React|React
vue|Vue|Vue|Vue|Vue|Vue
angular|Angular|Angular|Angular|Angular|Angular
svelte|Svelte|Svelte|Svelte|Svelte|Svelte
next.js|Next.js|Next.js|Next.js|Next.js|Next.js
astro|Astro|Astro|Astro|Astro|Astro
node.js|Node.js|Node.js|Node.js|Node.js|Node.js
deno|Deno|Deno|Deno|Deno|Deno
bun|Bun|Bun|Bun|Bun|Bun
npm|npm|npm|npm|npm|npm
vite|Vite|Vite|Vite|Vite|Vite
webassembly|WebAssembly|WebAssembly|WebAssembly|WebAssembly|WebAssembly
graphql|GraphQL|GraphQL|GraphQL|GraphQL|GraphQL
api|API|API|API|API|API
docker|Docker|Docker|Docker|Docker|Docker
kubernetes|Kubernetes|Kubernetes|Kubernetes|Kubernetes|Kubernetes
linux|Linux|Linux|Linux|Linux|Linux
macos|macOS|macOS|macOS|macOS|macOS
windows|Windows|Windows|Windows|Windows|Windows
ios|iOS|iOS|iOS|iOS|iOS
android|Android|Android|Android|Android|Android
git|Git|Git|Git|Git|Git
github|GitHub|GitHub|GitHub|GitHub|GitHub
gitlab|GitLab|GitLab|GitLab|GitLab|GitLab
database|database|banco de dados|base de datos|base de données|database
postgresql|PostgreSQL|PostgreSQL|PostgreSQL|PostgreSQL|PostgreSQL
sqlite|SQLite|SQLite|SQLite|SQLite|SQLite
mysql|MySQL|MySQL|MySQL|MySQL|MySQL
mongodb|MongoDB|MongoDB|MongoDB|MongoDB|MongoDB
redis|Redis|Redis|Redis|Redis|Redis
cloud|cloud|nuvem|nube|cloud|cloud
aws|AWS|AWS|AWS|AWS|AWS
cloudflare|Cloudflare|Cloudflare|Cloudflare|Cloudflare|Cloudflare
vercel|Vercel|Vercel|Vercel|Vercel|Vercel
serverless|serverless|serverless|serverless|serverless|serverless
devops|DevOps|DevOps|DevOps|DevOps|DevOps
testing|testing|testes|pruebas|tests|test
cybersecurity|cybersecurity|cibersegurança|ciberseguridad|cybersécurité|sicurezza informatica
cryptography|cryptography|criptografia|criptografía|cryptographie|crittografia
privacy|privacy|privacidade|privacidad|vie privée|privacy
open source|open source|código aberto|código abierto|open source|open source
library|library|biblioteca|biblioteca|bibliothèque|libreria
framework|framework|framework|framework|framework|framework
cli|CLI|CLI|CLI|CLI|CLI
vs code|VS Code|VS Code|VS Code|VS Code|VS Code
ai|AI|IA|IA|IA|IA
machine learning|machine learning|aprendizado de máquina|aprendizaje automático|apprentissage automatique|machine learning
deep learning|deep learning|deep learning|aprendizaje profundo|apprentissage profond|deep learning
neural networks|neural networks|redes neurais|redes neuronales|réseaux de neurones|reti neurali
llm|LLM|LLM|LLM|LLM|LLM
nlp|NLP|PLN|PLN|NLP|NLP
machine translation|machine translation|tradução automática|traducción automática|traduction automatique|traduzione automatica
computer vision|computer vision|visão computacional|visión artificial|vision par ordinateur|visione artificiale
transformers|transformers|transformers|transformers|transformers|transformers
data science|data science|ciência de dados|ciencia de datos|science des données|data science
statistics|statistics|estatística|estadística|statistiques|statistica
blockchain|blockchain|blockchain|blockchain|blockchain|blockchain
cryptocurrency|cryptocurrency|criptomoedas|criptomonedas|cryptomonnaies|criptovalute
hardware|hardware|hardware|hardware|matériel|hardware
laptop|laptop|notebook|portátil|ordinateur portable|portatile
smartphone|smartphone|celular|smartphone|smartphone|smartphone
tablet|tablet|tablet|tableta|tablette|tablet
mac|Mac|Mac|Mac|Mac|Mac
gpu|GPU|GPU|GPU|GPU|GPU
robotics|robotics|robótica|robótica|robotique|robotica
iot|IoT|IoT|IoT|IoT|IoT
networking|networking|redes|redes|réseaux|reti
internet|internet|internet|internet|internet|internet
browser|browser|navegador|navegador|navigateur|browser
performance|performance|desempenho|rendimiento|performance|prestazioni
seo|SEO|SEO|SEO|SEO|SEO
analytics|analytics|analytics|analítica web|analytics|analytics
svg|SVG|SVG|SVG|SVG|SVG
webgl|WebGL|WebGL|WebGL|WebGL|WebGL
game development|game development|desenvolvimento de jogos|desarrollo de videojuegos|développement de jeux|sviluppo di videogiochi
virtual reality|virtual reality|realidade virtual|realidad virtual|réalité virtuelle|realtà virtuale
3d printing|3D printing|impressão 3D|impresión 3D|impression 3D|stampa 3D
electronics|electronics|eletrônica|electrónica|électronique|elettronica
self-hosting|self-hosting|self-hosting|self-hosting|auto-hébergement|self-hosting
automation|automation|automação|automatización|automatisation|automazione
no-code|no-code|no-code|no-code|no-code|no-code
software|software|software|software|logiciel|software
saas|SaaS|SaaS|SaaS|SaaS|SaaS
productivity|productivity|produtividade|productividad|productivité|produttività
markdown|Markdown|Markdown|Markdown|Markdown|Markdown
algorithms|algorithms|algoritmos|algoritmos|algorithmes|algoritmi
operating systems|operating systems|sistemas operacionais|sistemas operativos|systèmes d'exploitation|sistemi operativi
browser extension|browser extension|extensão de navegador|extensión de navegador|extension de navigateur|estensione del browser
technology|technology|tecnologia|tecnología|technologie|tecnologia
product photography|product photography|fotografia de produto|fotografía de producto|photo de produit|fotografia di prodotto
science|science|ciência|ciencia|science|scienza
research|research|pesquisa|investigación|recherche|ricerca
physics|physics|física|física|physique|fisica
chemistry|chemistry|química|química|chimie|chimica
biology|biology|biologia|biología|biologie|biologia
genetics|genetics|genética|genética|génétique|genetica
astronomy|astronomy|astronomia|astronomía|astronomie|astronomia
math|math|matemática|matemáticas|mathématiques|matematica
medicine|medicine|medicina|medicina|médecine|medicina
health|health|saúde|salud|santé|salute
medication|medication|medicamentos|medicamentos|médicaments|farmaci
diabetes|diabetes|diabetes|diabetes|diabète|diabete
obesity|obesity|obesidade|obesidad|obésité|obesità
nutrition|nutrition|nutrição|nutrición|nutrition|nutrizione
fitness|fitness|fitness|fitness|fitness|fitness
psychology|psychology|psicologia|psicología|psychologie|psicologia
mental health|mental health|saúde mental|salud mental|santé mentale|salute mentale
neuroscience|neuroscience|neurociência|neurociencia|neurosciences|neuroscienze
sleep|sleep|sono|sueño|sommeil|sonno
environment|environment|meio ambiente|medio ambiente|environnement|ambiente
climate change|climate change|mudanças climáticas|cambio climático|changement climatique|cambiamento climatico
energy|energy|energia|energía|énergie|energia
sustainability|sustainability|sustentabilidade|sostenibilidad|durabilité|sostenibilità
nature|nature|natureza|naturaleza|nature|natura
animals|animals|animais|animales|animaux|animali
plants|plants|plantas|plantas|plantes|piante
cartography|cartography|cartografia|cartografía|cartographie|cartografia
geography|geography|geografia|geografía|géographie|geografia
history|history|história|historia|histoire|storia
archaeology|archaeology|arqueologia|arqueología|archéologie|archeologia
philosophy|philosophy|filosofia|filosofía|philosophie|filosofia
religion|religion|religião|religión|religion|religione
politics|politics|política|política|politique|politica
elections|elections|eleições|elecciones|élections|elezioni
economy|economy|economia|economía|économie|economia
finance|finance|finanças|finanzas|finance|finanza
investing|investing|investimentos|inversión|investissement|investimenti
payments|payments|pagamentos|pagos|paiements|pagamenti
business|business|negócios|negocios|affaires|business
startups|startups|startups|startups|startups|startup
marketing|marketing|marketing|marketing|marketing|marketing
sales|sales|vendas|ventas|ventes|vendite
e-commerce|e-commerce|e-commerce|comercio electrónico|e-commerce|e-commerce
jobs|jobs|empregos|empleo|emploi|lavoro
education|education|educação|educación|éducation|istruzione
university|university|universidade|universidad|université|università
law|law|direito|derecho|droit|diritto
war|war|guerra|guerra|guerre|guerra
society|society|sociedade|sociedad|société|società
communication|communication|comunicação|comunicación|communication|comunicazione
linguistics|linguistics|linguística|lingüística|linguistique|linguistica
culture|culture|cultura|cultura|culture|cultura
art|art|arte|arte|art|arte
music|music|música|música|musique|musica
movies|movies|cinema|cine|cinéma|cinema
tv series|TV series|séries|series|séries|serie TV
literature|literature|literatura|literatura|littérature|letteratura
video games|video games|videogames|videojuegos|jeux vidéo|videogiochi
sports|sports|esportes|deportes|sport|sport
football|football|futebol|fútbol|football|calcio
cycling|cycling|ciclismo|ciclismo|cyclisme|ciclismo
running|running|corrida|running|course à pied|corsa
travel|travel|viagens|viajes|voyage|viaggi
tourism|tourism|turismo|turismo|tourisme|turismo
food|food|gastronomia|gastronomía|gastronomie|gastronomia
cooking|cooking|culinária|cocina|cuisine|cucina
dessert|dessert|sobremesa|postre|dessert|dessert
pastry|pastry|confeitaria|pastelería|pâtisserie|pasticceria
sweets|sweets|doces|dulces|confiserie|dolci
cookies|cookies|biscoitos|galletas|biscuits|biscotti
cake|cake|bolo|tarta|gâteau|torta
bread|bread|pão|pan|pain|pane
chocolate|chocolate|chocolate|chocolate|chocolat|cioccolato
coffee|coffee|café|café|café|caffè
wine|wine|vinho|vino|vin|vino
beer|beer|cerveja|cerveza|bière|birra
vegetarian|vegetarian|vegetariano|vegetariano|végétarien|vegetariano
meat|meat|carne|carne|viande|carne
fish|fish|peixe|pescado|poisson|pesce
portuguese cuisine|Portuguese cuisine|culinária portuguesa|cocina portuguesa|cuisine portugaise|cucina portoghese
home|home|casa|hogar|maison|casa
home decor|home decor|decoração|decoración|décoration|decorazione
furniture|furniture|móveis|muebles|meubles|mobili
bookcase|bookcase|estante|estantería|étagère|scaffale
lighting|lighting|iluminação|iluminación|éclairage|illuminazione
diy|DIY|faça você mesmo|bricolaje|bricolage|fai da te
real estate|real estate|imóveis|inmobiliaria|immobilier|immobiliare
cars|cars|carros|coches|voitures|auto
electric vehicles|electric vehicles|carros elétricos|coches eléctricos|voitures électriques|auto elettriche
transportation|transportation|transporte|transporte|transports|trasporti
aviation|aviation|aviação|aviación|aviation|aviazione
trains|trains|trens|trenes|trains|treni
fashion|fashion|moda|moda|mode|moda
beauty|beauty|beleza|belleza|beauté|bellezza
family|family|família|familia|famille|famiglia
kids|kids|crianças|niños|enfants|bambini
pets|pets|pets|mascotas|animaux de compagnie|animali domestici
humor|humor|humor|humor|humour|umorismo
safety|safety|segurança|seguridad|sécurité|sicurezza
agriculture|agriculture|agricultura|agricultura|agriculture|agricoltura
oceans|oceans|oceanos|océanos|océans|oceani
space|space|espaço|espacio|espace|spazio
portugal|Portugal|Portugal|Portugal|Portugal|Portogallo
lisbon|Lisbon|Lisboa|Lisboa|Lisbonne|Lisboa
porto|Porto|Porto|Oporto|Porto|Porto
coimbra|Coimbra|Coimbra|Coimbra|Coimbra|Coimbra
braga|Braga|Braga|Braga|Braga|Braga
algarve|Algarve|Algarve|Algarve|Algarve|Algarve
madeira|Madeira|Madeira|Madeira|Madère|Madeira
azores|Azores|Açores|Azores|Açores|Azzorre
sintra|Sintra|Sintra|Sintra|Sintra|Sintra
spain|Spain|Espanha|España|Espagne|Spagna
france|France|França|Francia|France|Francia
united kingdom|United Kingdom|Reino Unido|Reino Unido|Royaume-Uni|Regno Unito
germany|Germany|Alemanha|Alemania|Allemagne|Germania
italy|Italy|Itália|Italia|Italie|Italia
united states|United States|Estados Unidos|Estados Unidos|États-Unis|Stati Uniti
brazil|Brazil|Brasil|Brasil|Brésil|Brasile
japan|Japan|Japão|Japón|Japon|Giappone
china|China|China|China|Chine|Cina
india|India|Índia|India|Inde|India
europe|Europe|Europa|Europa|Europe|Europa
ukraine|Ukraine|Ucrânia|Ucrania|Ukraine|Ucraina
russia|Russia|Rússia|Rusia|Russie|Russia
africa|Africa|África|África|Afrique|Africa
city|city|cidade|ciudad|ville|città
youtube|YouTube|YouTube|YouTube|YouTube|YouTube
x|X|X|X|X|X
instagram|Instagram|Instagram|Instagram|Instagram|Instagram
facebook|Facebook|Facebook|Facebook|Facebook|Facebook
tiktok|TikTok|TikTok|TikTok|TikTok|TikTok
linkedin|LinkedIn|LinkedIn|LinkedIn|LinkedIn|LinkedIn
reddit|Reddit|Reddit|Reddit|Reddit|Reddit
hacker news|Hacker News|Hacker News|Hacker News|Hacker News|Hacker News
wikipedia|Wikipedia|Wikipédia|Wikipedia|Wikipédia|Wikipedia
stack overflow|Stack Overflow|Stack Overflow|Stack Overflow|Stack Overflow|Stack Overflow
medium|Medium|Medium|Medium|Medium|Medium
substack|Substack|Substack|Substack|Substack|Substack
notion|Notion|Notion|Notion|Notion|Notion
google|Google|Google|Google|Google|Google
google fonts|Google Fonts|Google Fonts|Google Fonts|Google Fonts|Google Fonts
apple|Apple|Apple|Apple|Apple|Apple
microsoft|Microsoft|Microsoft|Microsoft|Microsoft|Microsoft
amazon|Amazon|Amazon|Amazon|Amazon|Amazon
meta|Meta|Meta|Meta|Meta|Meta
nvidia|NVIDIA|NVIDIA|NVIDIA|NVIDIA|NVIDIA
openai|OpenAI|OpenAI|OpenAI|OpenAI|OpenAI
anthropic|Anthropic|Anthropic|Anthropic|Anthropic|Anthropic
mozilla|Mozilla|Mozilla|Mozilla|Mozilla|Mozilla
openstreetmap|OpenStreetMap|OpenStreetMap|OpenStreetMap|OpenStreetMap|OpenStreetMap
spotify|Spotify|Spotify|Spotify|Spotify|Spotify
netflix|Netflix|Netflix|Netflix|Netflix|Netflix
arxiv|arXiv|arXiv|arXiv|arXiv|arXiv
`;

export type TagLabels = Record<Locale, string>;

const COLUMNS: readonly Locale[] = ["en-US", "pt-BR", "es", "fr", "it"];

const TABLE: ReadonlyMap<string, TagLabels> = new Map(
  RAW.split("\n")
    .filter((l) => l.includes("|"))
    .map((l) => {
      const [id, ...labels] = l.split("|");
      return [id!, Object.fromEntries(COLUMNS.map((c, i) => [c, labels[i]!])) as TagLabels];
    }),
);

/** Every tag ID, in table order. */
export const TAG_IDS: readonly string[] = [...TABLE.keys()];

export const isTagId = (tag: string): boolean => TABLE.has(tag);

/** The five labels of a tag ID (undefined for anything else, e.g. a tag the person typed). */
export const tagLabels = (id: string): TagLabels | undefined => TABLE.get(id);

/** How a tag reads in `locale`: the label of an ID, any other tag verbatim. */
export function tagLabel(tag: string, locale: Locale): string {
  return TABLE.get(tag)?.[locale] ?? tag;
}

/** Every distinct label of an ID (all five languages); any other tag as it is. Search indexes these. */
export function tagLabelsAll(tag: string): string[] {
  const l = TABLE.get(tag);
  return l ? [...new Set(COLUMNS.map((c) => l[c]))] : [tag];
}

/** Matching key of a label or a typed tag: normalised (trim, spaces, case) and accent-folded. */
export const tagKey = (s: string): string => normalizeTag(s).normalize("NFD").replace(/\p{M}/gu, "");

const BY_KEY: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [id, labels] of TABLE) for (const l of [id, ...COLUMNS.map((c) => labels[c])]) m.set(tagKey(l), id);
  return m;
})();

/**
 * A tag as stored: normalised, and the ID when it equals (normalised) one of the five labels of a tag or the ID
 * itself. Never matched against the tagger's aliases. Applied by the server at every write of `user.tags` and
 * `user.hiddenAiTags`.
 */
export function canonicalTag(s: string): string {
  const n = normalizeTag(s);
  return BY_KEY.get(tagKey(n)) ?? n;
}

export function canonicalTags(a: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of a) {
    const c = canonicalTag(t);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * The screenshot model's raw labels (`ai.tipo` / `ai.visual` keep these internal pt-PT keys) → tag IDs, for display.
 * A label without a matching tag ("imagens", "modo claro", "texto denso") is not shown.
 */
export const SCREENSHOT_TAG_IDS: Readonly<Record<string, string>> = {
  "landing page": "landing page",
  documentação: "documentation",
  artigo: "article",
  wiki: "encyclopedia",
  "artigo científico": "scientific paper",
  repositório: "repository",
  código: "code",
  "lista de links": "link list",
  mapa: "map",
  gráfico: "chart",
  tabela: "table",
  loja: "shop",
  receita: "recipe",
  "banda desenhada": "comic",
  galeria: "gallery",
  fotografia: "photo",
  ilustração: "illustration",
  dashboard: "dashboard",
  formulário: "form",
  "rede social": "social media",
  vídeo: "video",
  conversa: "chat",
  email: "email",
  "resultados de pesquisa": "search results",
  preços: "pricing",
  diagrama: "diagram",
  apresentação: "presentation",
  "3d": "3d",
  meteorologia: "weather",
  calendário: "calendar",
  "folha de cálculo": "spreadsheet",
  terminal: "terminal",
  tipografia: "typography",
  "componentes ui": "ui components",
  "modo escuro": "dark mode",
  gradiente: "gradient",
  minimalista: "minimalism",
};

/**
 * The AI's shown tags, as IDs: the text tagger's `topics`, else (older items, or no text to go on) the screenshot
 * model's `tipo ∪ visual` mapped to IDs.
 */
export function aiTags(ai: { tipo: string[]; visual: string[]; topics?: string[] }): string[] {
  if (ai.topics?.length) return ai.topics;
  const out: string[] = [];
  for (const raw of [...ai.tipo, ...ai.visual]) {
    const id = SCREENSHOT_TAG_IDS[raw];
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}
