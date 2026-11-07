# Recorte: documento de design

- Data: 2026-11-07
- Estado: aprovado
- Repositório: `github.com/qwickin/screenshotextension`
- "Recorte" é um nome provisório.

## 1. Intenção

Um arquivo visual privado da web. Com uma extensão de browser (Chrome e Firefox) o utilizador captura parte de uma
página: uma área, a parte visível ou a página inteira. Antes de guardar, pode juntar título, nota, etiquetas e
categoria. A captura vai para o seu próprio servidor. Lá, uma IA leve a correr dentro do container classifica a
imagem, e o texto da página (extraído pela extensão) alimenta a pesquisa. Tudo aparece numa galeria preta e minimal,
com scroll infinito em masonry, uma nuvem de etiquetas em marquee e pesquisa por ⌘K que junta texto e significado,
em português e inglês.

**Porquê.** Encontrar mais tarde o que se viu na web a partir do que se lembra: o tipo de página, o assunto, o texto,
a cor, o site. Sem depender de serviços externos e com uma instalação trivial: o utilizador adiciona um
`docker compose` ao seu servidor (local, VPS ou dedicado) e a extensão fica pronta a usar.

O produto vai crescer para guardar também posts do X.com (fase 2) e artigos de sites de leitura, ao estilo do
Linkwarden (fase 3). Este documento especifica em detalhe a **fase 1**. Das fases 2 e 3 define só o que o modelo de
dados precisa para não mudar depois.

## 2. Objetivos, não-objetivos e anti-objetivos

**Objetivos (fase 1)**
- Capturar em poucos gestos: atalho, seleção da área, Enter.
- Mostrar um diálogo antes de enviar, com título, nota, etiquetas extra e categoria.
- Classificar com IA leve dentro do container: só CPU, sem GPU, sem Ollama e sem contas externas.
- Pesquisa híbrida (texto completo e semântica) que funcione entre português e inglês.
- Galeria com o aspeto e o comportamento do protótipo aprovado (`prototype/gallery`).
- Instalação com `docker compose up`. As extensões descarregam-se como ZIP a partir do próprio servidor.

**Não-objetivos (fase 1)**
- Apps móveis, partilha entre utilizadores e links públicos.
- OCR, porque o texto vem do DOM. Descarregar vídeos.
- Publicação nas lojas de extensões, assinatura e atualização automática das extensões.
- Interface em inglês: a fase 1 é só em pt-PT.
- Anotações sobre a imagem. Armazenamento S3.

**Anti-objetivos.** Seria um falhanço mesmo que tecnicamente funcionasse:
- Uma nuvem de etiquetas cheia de ruído. O protótipo com um LLM gerou 86 etiquetas soltas para 29 capturas, como
  "botões de ação" ou "modo claro". Daí o vocabulário visual fechado.
- Perder uma captura porque o servidor estava em baixo.
- Etiquetas ou notas do utilizador alteradas ou apagadas pela IA ou por um reprocessamento.
- Instalação pesada: exigir GPU, Ollama ou chaves de API por defeito.
- Galeria ou imagens acessíveis sem sessão iniciada.

## 3. Restrições

- **Hardware alvo:** qualquer anfitrião Docker com 2 vCPU e **2 GB de RAM no mínimo** (4 GB recomendados), sem GPU.
- **Licenças:** tudo tem de ser redistribuível. Por isso ficam de fora MobileCLIP e FastVLM (licença Apple de
  investigação) e LFM2-VL.
- **Browsers:** Chrome atual e Firefox desktop atual.
- **Distribuição das extensões:** só ZIP descarregado da galeria (decisão do utilizador). Ver §12, limitações.
- **Versões:** derivadas automaticamente do Git (decisão do utilizador; a leitura está em §10).
- **HTTPS:** os cookies `Secure` exigem HTTPS fora de `localhost`. O compose traz um exemplo com reverse proxy.
- **Internet no primeiro arranque:** o Meilisearch descarrega aí o modelo de embeddings.

## 4. Arquitetura

Monorepo com workspaces pnpm:

```
apps/extension   WXT (Chrome MV3 + Firefox) — captura, diálogo, fila offline
apps/server      Node 24 + Hono + TypeScript — API, worker de processamento, serve a galeria e os ZIPs
apps/gallery     Vite + React 19 + HeroUI v3 + Tailwind 4 — parte do protótipo
packages/shared  esquemas Zod + tipos: o contrato da API, usado pelos três
packages/ai      classificador (SigLIP2), vocabulário, script que gera os rótulos
docker/          Dockerfile, compose.yml, exemplo com Caddy
scripts/         version.mjs (versão a partir do Git), build-labels, etc.
```

**Runtime: `docker compose` com 2 serviços**
- `app` (imagem do projeto):
  - a API, o worker de processamento em processo e o SQLite;
  - a galeria (build estático) e os ZIPs das extensões;
  - o modelo de visão, embutido na imagem.
  - Volume: `/data`. É o único serviço com porta publicada.
- `search`: `getmeili/meilisearch:v1.56.1`, com versão fixa (foi a medida).
  - Só na rede interna do compose, sem porta publicada. A master key vem de uma variável de ambiente.
  - Volume: `/meili_data`.

**Fluxo de uma captura**

```
extensão: captura → recorte → extração de texto do DOM → diálogo → fila (IndexedDB) → POST /api/items
servidor: guarda ficheiros + meta.json → linha no SQLite → SSE "item.created" (aparece na galeria)
worker:   miniatura + cores → SigLIP2 (tipo, visual) → palavras-chave → [IA cloud opcional]
          → atualiza meta.json + SQLite → indexa no Meilisearch → SSE "item.updated"
```

**Responsabilidade de cada armazenamento**

| O quê | Onde | Notas |
|---|---|---|
| Fonte de verdade de cada item | `meta.json` na pasta do item | Campos do utilizador e da IA em blocos separados. Tem `schemaVersion`. |
| Listagem, filtros, contagens de etiquetas, contas, categorias, tarefas | SQLite (`/data/recorte.db`) | O scroll infinito usa keyset (`createdAt DESC, id DESC`). |
| Pesquisa ⌘K (texto + semântica) | Meilisearch | Só pesquisa. Não lista o feed: o limite `maxTotalHits` (1000 por defeito) cortaria o scroll infinito. |

O SQLite e o Meilisearch reconstroem-se a partir dos `meta.json` (ação "Reconstruir índice"). É também esse o
caminho para atualizar o Meilisearch de versão: apagar o volume e reindexar.

## 5. Modelo de dados

Cada item tem um tipo, preparado desde já para as fases 2 e 3:

```ts
type ItemType = "screenshot" | "post" | "article";       // post = fase 2 (X.com), article = fase 3

type Item = {
  id: string;                    // ULID (ordenável por tempo)
  userId: string;
  type: ItemType;
  kind?: "area" | "visible" | "full" | "image";           // subtipo de screenshot; "image" = "Guardar esta imagem"
  source: { url: string; site: string; pageTitle: string }; // site = hostname sem "www."
  createdAt: string; updatedAt: string; deletedAt: string | null;
  media: Media[];                // media[0] é a imagem do tile
  user: {                        // nunca escrito pela IA
    title?: string; note?: string; tags: string[]; categoryId: string | null;
    hiddenAiTags: string[];      // etiquetas da IA que o utilizador removeu; sobrevivem a reprocessamentos
  };
  ai: {                          // reescrito a cada processamento
    tipo: string[]; visual: string[]; keys: string[]; colors: string[];   // colors = nomes (azul, preto…)
    title?: string; description?: string;                                 // só com IA cloud ligada
    model: string; processedAt: string | null;
  };
  text: { selection: string; meta: { description?: string; og?: Record<string, string> }; headings: string[]; alts: string[] };
  post?: {                       // fase 2 (só o esboço)
    author: { name: string; handle: string; avatar?: string };
    text: string; publishedAt: string; permalink: string; quoted?: { author: string; text: string; permalink: string };
    hasVideo: boolean; embedUrl?: string;   // vídeo: fica no X; mostra-se por iframe platform.twitter.com/embed
  };
};

type Media = { file: string; thumb: string; width: number; height: number; color: string; role: "main" | "photo" | "video-poster" };
```

- O título mostrado é `user.title ?? ai.title ?? source.pageTitle`.
- As etiquetas mostradas são (`user.tags` ∪ `ai.tipo` ∪ `ai.visual`) − `user.hiddenAiTags`. A origem de cada uma
  fica visível no detalhe.
- O mesmo conjunto alimenta as contagens do marquee (`item_tags`) e o índice de pesquisa.
- A IA nunca cria etiquetas fora do vocabulário fechado, para proteger a nuvem do marquee.

**Ficheiros:** `/data/items/<userId>/<yyyy>/<mm>/<itemId>/`, com:
- `original.webp`;
- `thumb.webp` (640 px de largura);
- `meta.json`;
- `media-N.*`, nos posts.

**SQLite:**
- `users`, `devices`, `sessions`, `tickets`, `categories`, `jobs`;
- `items`: espelho para listar, com `id, userId, type, kind, site, title, createdAt, deletedAt, categoryId,
  thumb, width, height, color`;
- `item_tags`: `itemId, tag, origin user|ai`, para filtros e contagens;
- `item_colors`.

## 6. Extensão (fase 1)

**Tecnologia:** WXT. Um só build genérico: o URL do servidor configura-se em runtime, nas opções.

**Ligação ao servidor**
1. Nas opções, o utilizador mete o URL do servidor, o email e a password.
2. A extensão chama `POST /api/devices` e recebe um **token de dispositivo**: aleatório, guardado no servidor só
   em hash, e revogável.
3. A password nunca é guardada.

Cada pedido envia `Authorization: Bearer <token>` e `X-Extension-Version`.

**Modos de captura**
- **Área:** overlay com cruz, escurecimento fora da seleção, dimensões visíveis e Esc para cancelar. Captura a
  parte visível e recorta pelo retângulo × `devicePixelRatio`. Na fase 1 a seleção fica limitada ao ecrã visível.
- **Parte visível:** `captureVisibleTab`.
- **Página inteira:**
  - No Firefox, `tabs.captureTab` com `rect` de toda a página (Firefox 82+).
  - No Chrome, scroll e costura com `captureVisibleTab`, no máximo 2 chamadas por segundo (limite documentado).
    Esconde os elementos `fixed`/`sticky` a partir da segunda faixa e repõe o scroll no fim.
  - Altura máxima de 12 000 px CSS. Acima disso trunca e regista isso no `meta.json`.
- **"Guardar esta imagem":** opção no menu de contexto sobre uma imagem. Faz scroll até ela, captura e recorta ao
  retângulo do elemento. O texto vem do `alt` e da legenda.
- **Gatilhos:**
  - os botões do popup;
  - os atalhos (`commands`), configuráveis, com sugestões Alt+Shift+S (área), Alt+Shift+V (visível) e
    Alt+Shift+F (página inteira);
  - o menu de contexto.

**Extração de texto (no content script)**
- Nós de texto que intersetam o retângulo capturado mais uma margem de 48 px.
- `document.title`, meta description, `og:*`, h1–h3 da página (até 20) e o `alt` das imagens dentro da área.
- Na página inteira, o conteúdo principal com Readability (Mozilla).
- Limite total de 20 000 caracteres. Não se envia HTML bruto.

**Diálogo antes de enviar**
- Injetado na página dentro de Shadow DOM, com o aspeto da galeria.
- Mostra a pré-visualização, o título (pré-preenchido com o da página, editável), a nota, as etiquetas (chips com
  autocomplete das etiquetas existentes) e a categoria (lista, mais "Nova categoria").
- **Guardar**: Cmd/Ctrl+Enter. **Cancelar**: Esc.
- O autocomplete e a lista de categorias passam pelo service worker, nunca por `fetch` direto do content script.
- Opção nas definições: "Guardar sem perguntar".

**Envio e fila offline**
- O service worker faz `POST /api/items` (multipart: imagem e JSON).
- A imagem é codificada no cliente em WebP (qualidade ≈ 0,9) com `OffscreenCanvas`.
- Se o envio falhar, o item fica no IndexedDB e é reenviado com backoff exponencial. O badge do ícone mostra
  quantos estão pendentes.
- Quando a gravação termina aparece o aviso "Guardado", com o link "Abrir".

**Popup**
- Os 3 modos de captura e o botão "Abrir galeria".
- O estado da fila.
- O aviso "Nova versão disponível", quando a versão instalada for mais antiga do que a que o servidor traz.

**Abrir galeria:** `POST /api/auth/ticket` devolve um ticket de uso único (60 s). A extensão abre
`<servidor>/auth/ticket?t=…` e o servidor cria o cookie de sessão e redireciona para `/`.

## 7. Servidor (fase 1)

**Contas e acesso**
- **Primeiro arranque:** sem utilizadores, `/setup` pede um `SETUP_TOKEN`. Esse token é gerado e escrito nos logs
  do container, ou vem por variável de ambiente.
  - Alternativa: `ADMIN_EMAIL` e `ADMIN_PASSWORD` por variável de ambiente.
  - Passwords guardadas com argon2id.
- **Gestão de contas na fase 1:** só a conta do dono (§16). Além disso:
  - cada utilizador muda a sua password em Definições;
  - uma password esquecida repõe-se com `docker compose exec app recorte reset-password <email>`, porque não há
    envio de email.
- **Isolamento:** cada login vê só os seus itens. Há `userId` em tudo e o servidor aplica-o em todas as consultas,
  incluindo um filtro obrigatório em cada pesquisa ao Meilisearch.
- **Sessões da galeria:** cookie `httpOnly`, `SameSite=Lax`, e `Secure` quando o pedido vem por HTTPS. Pedidos que
  alteram dados verificam também o `Origin`.
- **Visitas diretas sem sessão:** vão para a página de login.
- **Imagens:** servidas só por uma rota autenticada, `GET /api/items/:id/files/:name`. Nunca há pasta estática
  pública com imagens.

**API (o contrato vive em `packages/shared`, validado com Zod dos dois lados)**

| Área | Rotas |
|---|---|
| Setup e sessão | `POST /api/setup`, `POST /api/login`, `POST /api/logout`, `GET /auth/ticket` |
| Dispositivos | `POST /api/devices` (login → token), `GET /api/devices`, `DELETE /api/devices/:id`, `POST /api/auth/ticket` |
| Itens | `POST /api/items`, `GET /api/items?cursor&limit&tags&category&site&type&color&from&to`, `GET/PATCH/DELETE /api/items/:id`, `POST /api/items/:id/restore`, `POST /api/items/bulk` |
| Ficheiros | `GET /api/items/:id/files/:name` |
| Etiquetas e categorias | `GET /api/tags` (contagens e origem), CRUD de `/api/categories` |
| Pesquisa | `GET /api/search?q&type&site&tags&category&color` |
| Tempo real | `GET /api/events` (SSE: `item.created`, `item.updated`, `item.deleted`) |
| Extensão | `GET /api/extension` (versão disponível, URLs dos ZIPs), `GET /downloads/recorte-chrome.zip`, `GET /downloads/recorte-firefox.zip` |
| Manutenção | `POST /api/admin/reprocess`, `POST /api/admin/reindex`, `GET /api/export` (ZIP com imagens e `meta.json`) |

**Regras dos itens**
- Os filtros de etiquetas são AND.
- Apagar é soft-delete com 30 dias no lixo. Depois desse prazo, uma tarefa diária remove os ficheiros.
- O `PATCH` só mexe no bloco `user`: título, nota, etiquetas, categoria e `hiddenAiTags`. É assim que se remove uma
  etiqueta errada da IA.

**Processamento (tarefas no SQLite, worker no mesmo processo, concorrência 1, novas tentativas com backoff)**
1. **Imagem:** gera `original.webp` (largura máxima 3200 px) e `thumb.webp` (640 px). Calcula a cor dominante e
   uma paleta de 3 cores, mapeada para cerca de 12 nomes (preto, branco, cinzento, vermelho, laranja, amarelo,
   verde, azul, roxo, rosa, castanho, bege).
2. **Classificador visual:**
   - Modelo: SigLIP2-base (`onnx-community/siglip2-base-patch16-224-ONNX`, Apache-2.0), só o codificador de imagem,
     em int8 (95 MB), com transformers.js e onnxruntime-node.
   - Os rótulos são embeddings pré-calculados em fp32 num ficheiro JSON commitado (§9).
   - Preparação da imagem: letterbox para quadrado. Nas capturas muito altas usa só o topo (proporção ≤ 1,5).
   - **tipo**: top-1, só se a probabilidade passar o limiar.
   - **visual**: só rótulos informativos (`modo escuro`, `gradiente`, `imagens`), cada um com o seu limiar.
   - Não há grupo de **assunto** no classificador: no benchmark errou demasiado (o Hacker News saiu "arte", o arXiv
     "história").
3. **Palavras-chave:** extração determinística (sem IA) a partir do título, do texto da seleção, dos headings, da
   meta description e do domínio. Usa stopwords pt e en, unigramas e bigramas, e devolve as 12 melhores em
   `ai.keys`.
4. **IA cloud (opcional, desligada por defeito):**
   - Ativa-se com `AI_CLOUD_URL` (API compatível com OpenAI), `AI_CLOUD_KEY` e `AI_CLOUD_MODEL`.
   - Gera `ai.title` e `ai.description` (pt-PT) e acrescenta chaves a `ai.keys`, a partir da imagem reduzida e do
     texto.
   - Não cria etiquetas: as chaves só servem a pesquisa.
   - Aviso nas definições: envia as imagens a terceiros.
5. **Gravação:** reescreve o bloco `ai` do `meta.json`, atualiza o SQLite, indexa no Meilisearch e emite
   `item.updated`.

**Reprocessar e reconstruir**
- "Reprocessar tudo" corre os passos 1 a 5 a partir dos ficheiros guardados e nunca toca no bloco `user`.
- "Reconstruir índice" volta a gerar o SQLite (`items`, `item_tags`, `item_colors`) e o Meilisearch a partir dos
  `meta.json`.

**Meilisearch**
- Índice `items`, com um documento por item: `id`, `userId`, `type`, `site`, título, nota, descrição, etiquetas,
  `keys`, excerto do texto, cores, `categoryId`, `createdAt`.
- **Etiquetas em PT e EN:** cada etiqueta do vocabulário é indexada também com as palavras do rótulo em inglês, para
  "mapa" e "map" encontrarem o mesmo.
- `filterableAttributes`: `userId`, `type`, `site`, `tags`, `categoryId`, `colors`, `createdAt`.
  `sortableAttributes`: `createdAt`.
- Os itens apagados saem do índice e voltam se forem restaurados.
- **Embedder `ml`:** `source: huggingFace`, modelo `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`.
  O modelo multilingue foi confirmado pelo utilizador.
  - O `documentTemplate` junta título, nota, etiquetas, chaves e um excerto do texto.
  - Subir o `documentTemplateMaxBytes`, que por defeito é curto.
- **Pesquisa:** `hybrid: { embedder: "ml", semanticRatio: 0.6 }`, com o filtro `userId = …` sempre imposto pelo
  servidor. Devolve highlights e `_rankingScore`.
- **Evidência:** nas 29 capturas do protótipo, com o texto das páginas em inglês e 6 pesquisas em português
  ("doce português", "relógio mecânico", "artigo sobre inteligência artificial"…):
  - só por palavras: 0 em 6 com resultado;
  - híbrida: a resposta certa em 1.º lugar nas 6, em ~100 ms;
  - RAM do container: 1,3 GB, incluindo cache.

## 8. Galeria (fase 1)

Parte de `prototype/gallery`, que é a referência visual aprovada:
- fundo `#000`, texto branco e Albert Sans fina;
- fades e glows subtis, e o glow de cada tile com a sua cor dominante;
- marquee de etiquetas no hero, em que o tamanho mostra a frequência;
- masonry em CSS Grid com colocação explícita na coluna mais curta;
- ⌘K / Ctrl+K e `/` para pesquisar.

O mock (`src/api/mock.ts`) é substituído por um cliente da API real, com o contrato de `src/api/types.ts` evoluído
para `packages/shared`.

**Páginas:** `/setup`, `/login`, `/` (galeria), `/extensao`, `/definicoes` e `/lixo`. O que cada uma faz:
- **Galeria:**
  - hero com o marquee (etiquetas de `item_tags`, do utilizador e da IA);
  - barra de filtros: site, tipo, cor, data e categoria;
  - masonry com scroll infinito sobre o SQLite;
  - itens novos entram em tempo real por SSE, com fade.
- **Seleção múltipla:** apagar, juntar etiquetas e mudar a categoria.
- **Detalhe:**
  - editar o título, a nota, as etiquetas e a categoria; apagar;
  - copiar o texto extraído e abrir a página;
  - ←/→ para a captura anterior ou seguinte;
  - uma faixa de relacionadas, do mesmo site ou com etiquetas em comum.
- **Pesquisa ⌘K:** usa `/api/search` com highlights e abre o detalhe. Sai o rótulo "pesquisa simulada" do protótipo.
- **Extensão:**
  - dois botões, "Descarregar para Chrome (ZIP)" e "Descarregar para Firefox (ZIP)", com a versão;
  - passos de instalação curtos;
  - a lista de dispositivos ligados, com a versão instalada e o aviso "desatualizada" quando for o caso.
- **Definições:** categorias, dispositivos (revogar), exportar ZIP, reprocessar, reconstruir índice e o aviso da IA
  cloud.
- **CSP:** `img-src 'self' data: blob:`, `connect-src 'self'`, e `frame-src https://platform.twitter.com` a pensar na
  fase 2.

## 9. Artefactos de IA e build

- `packages/ai/vocab.ts`: vocabulário fechado, com prompts em inglês e nomes em pt-PT. Parte de
  `prototype/ai-bench/vocab.mjs`. No grupo `visual`, só ficam os rótulos informativos.
- `scripts/build-labels.mjs`: corre o codificador de texto em fp32 (precisa de 1,6 a 3,8 GB, só na máquina de
  desenvolvimento) e gera `packages/ai/labels.siglip2.json`, que é **commitado**. Corre-se quando o vocabulário muda,
  e mudar o vocabulário obriga a uma versão nova da imagem.
- **Dockerfile:**
  - descarrega o `vision_model_int8.onnx` de uma revisão fixa do Hugging Face no build, por isso a imagem traz o
    modelo;
  - copia os ZIPs das extensões gerados pelo build (`wxt zip`).
- **Medições:**
  - Docker `node:24-slim`, `--cpus=2 --memory=1g`, arm64 em núcleos M4: 79 ms por imagem, 389 MB de RAM.
  - Também carrega em amd64 (emulado).
  - Num VPS x86 estimo 2 a 4 vezes mais lento.

## 10. Versões automáticas a partir do Git

Esta é a leitura de "Version Control pelo Git, de forma automática". É uma escolha minha (§11).
- **Formato:** `MAJOR.MINOR.PATCH`, derivado de `git describe`. `MAJOR.MINOR` vem da última tag `vX.Y`; `PATCH` é o
  número de commits desde essa tag. Sem tags fica `0.0.<n.º de commits>`.
- O Chrome só aceita 1 a 4 inteiros ≤ 65535, por isso não há hash nem `-dirty`.
- `scripts/version.mjs` calcula a versão fora do Docker, porque o `.git` não entra no contexto de build. A versão
  passa como `APP_VERSION` e fica carimbada nos dois manifests, no servidor e na galeria.
- **CI (GitHub Actions):** em cada push para `main` corre a validação, gera os ZIPs e publica a imagem
  multi-arquitetura (amd64 e arm64) no GHCR, com a etiqueta da versão e `latest`.
- **Duas versões:**
  - A da **app** (servidor e galeria) conta todos os commits.
  - A da **extensão** conta só os commits que tocam em `apps/extension` ou `packages/shared` desde a tag.
  - Assim o aviso "desatualizada" só aparece quando a extensão mudou de facto, e não a cada deploy.
- **Aviso de atualização da extensão:** compara o `X-Extension-Version` com a versão da extensão que o servidor
  traz.

## 11. Escolhas minhas (para confirmar ao ler)

1. Cada login vê só os seus itens. Não há partilha na fase 1.
2. Cada item tem uma categoria (como as coleções do Linkwarden) e quantas etiquetas o utilizador quiser.
3. Os 2 serviços acima. O SQLite trata da listagem e o Meilisearch só da pesquisa.
4. `semanticRatio` inicial de 0,6, ajustável.
5. A leitura das versões em §10: tags `vX.Y` mais o número de commits, e CI no GitHub com imagem no GHCR.
6. Na fase 1, a seleção de área fica limitada ao ecrã visível. A página inteira tem máximo de 12 000 px.
7. WebP codificado no cliente. O servidor guarda o original em WebP com largura máxima de 3200 px.
8. A ligação da extensão é por email e password nas opções, trocados por um token de dispositivo. Não há código de
   emparelhamento.
9. Os ZIPs só se descarregam com sessão iniciada.
10. O nome "Recorte" e os textos da interface em pt-PT.
11. As etiquetas da IA podem ser removidas por item (`hiddenAiTags`) e a remoção sobrevive ao reprocessamento. A IA
    cloud não cria etiquetas.
12. Há duas versões automáticas, a da app e a da extensão (§10).
13. A password repõe-se por um comando no container, sem email.

## 12. Limitações conhecidas

- **Firefox:** um ZIP sem assinatura só carrega como extra temporário em `about:debugging` e desaparece quando o
  browser reinicia. Para ficar instalado é preciso o Firefox Developer Edition ou Nightly com
  `xpinstall.signatures.required=false`.
- **Chrome:** obriga ao modo de programador e a carregar a pasta descompactada.
- **Atualização das extensões:** em nenhum dos browsers é automática. Por isso existe o aviso "Nova versão
  disponível".
- **Meilisearch:** com o embedder local, a documentação recomenda um embedder na cloud acima de cerca de
  10 000 documentos atualizados com frequência. Para uso pessoal chega.
- **Primeiro arranque:** precisa de internet para o modelo do Meilisearch.

## 13. Fases 2 e 3 (esboço)

- **Fase 2, X.com:**
  - Um content script em `x.com` põe um botão "Guardar" em cada post, através de um `MutationObserver` na barra de
    ações.
  - Lê o texto, o autor, a data, o permalink e as fotos (em qualidade original). Abre o mesmo diálogo e cria um item
    `type: "post"`.
  - O servidor descarrega as fotos. No vídeo guarda a imagem de capa e o `embedUrl`; o iframe só carrega ao clicar.
  - Se a leitura do HTML do X falhar, captura a área do post como screenshot.
  - Testado: o iframe `platform.twitter.com/embed/Tweet.html` funciona num browser. O endpoint oEmbed responde 402,
    por isso não se usa.
- **Fase 3, sites de leitura:** um item `type: "article"` com conteúdo Readability, imagem principal e link, uma
  vista de leitura na galeria e outras redes sociais.

## 14. Deixado ao builder

- A biblioteca de extração de palavras-chave, os limiares exatos do classificador (afinados sobre o conjunto do
  benchmark) e a lista final de rótulos `tipo`.
- O desenho exato da barra de filtros, da seleção múltipla e das páginas novas, dentro da linguagem do protótipo.
- A UI do diálogo da extensão (React, ou outra coisa, no Shadow DOM) e as permissões da extensão. O utilizador não
  quer restrições de privacidade extra.
- A estratégia de testes. Mínimo: unitários do servidor e dos esquemas, mais testes E2E com Playwright a carregar a
  extensão real e a galeria.
- Os detalhes do Dockerfile (camadas, utilizador não-root, retirar binários desnecessários).

## 15. Referências

- `prototype/gallery`: protótipo aprovado da galeria ("é exatamente isso que pretendo").
- `prototype/ai-bench`: benchmark dos classificadores (CLIP, SigLIP, SigLIP2, Florence-2, SmolVLM), vocabulário e
  resultados.
- Decisões do utilizador nesta conversa:
  - WXT; backend TypeScript; sem Ollama; IA leve no container; IA cloud opcional; modelo multilingue para a
    pesquisa;
  - pesquisa híbrida noutro container; diálogo antes de enviar com etiquetas e categorias;
  - ZIPs das extensões na galeria; versões pelo Git;
  - sugestões aceites, e onde estão no documento:
    - 1, nota ao capturar: §6;
    - 2, editar e apagar: §7 e §8;
    - 3, copiar texto: §8;
    - 4, atalhos e menu de contexto: §6;
    - 5, fila offline: §6;
    - 7, filtros de cor, site e data: §7 e §8;
    - 8, detalhe navegável e tempo real: §8;
    - 10, metadata em ficheiro: §4 e §5;
    - 12, monorepo: §4;
  - a 9 (compose, multi-arch, `/data`, exportação) não foi comentada. Assumi que fica, com a página da extensão (§4,
    §8 e §10);
  - rejeitadas: 6 (privacidade) e 11 (versão da API e limites de pedidos).

## 16. Respostas do utilizador (2026-11-07)

1. Contas: na fase 1 só existe a conta do dono (criada no `/setup`). Os dados ficam separados por `userId` desde já;
   o ecrã de utilizadores fica para depois. As rotas `/api/admin/*` pertencem ao dono.
2. Atualizações: só o aviso de nova versão da extensão (§10). O servidor não faz pedidos ao GitHub.
3. Execução: tudo de uma vez ("one-shot"), sem pausas para revisão intermédia.
