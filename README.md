<img src="assets/icon.svg" width="64" height="64" alt="">

# Recorte

O Recorte guarda capturas de ecrã da web no teu próprio servidor.

- **Extensão** para Chrome e Firefox. Captura uma área, o ecrã visível, a página inteira ou uma imagem. Guarda também o texto da página, para a pesquisa encontrar a captura.
- **Servidor.** Guarda tudo em disco e sugere etiquetas com IA local (SigLIP2, sem GPU e sem enviar nada para fora): tipo de página, aspeto visual e cores.
- **Galeria.** Scroll infinito e filtros. A pesquisa ⌘K / Ctrl+K entende o significado em português e em inglês: "doce português" encontra um pastel de nata numa página em inglês.

Tudo corre em `docker compose`, com dois serviços:

- `app`: API, processamento, galeria e ZIPs das extensões;
- `search`: Meilisearch, só na rede interna.

## Requisitos

- Docker com Compose v2 (**2.24 ou mais recente** para o override do Caddy, que usa `!reset`), em amd64 ou arm64.
- Para construir a partir do código: Git (com o histórico) e Node 24, porque as versões saem do Git.
- **2 GB de RAM no mínimo, 4 GB recomendados.** Em uso, a app ocupa cerca de 0,6 GB e o Meilisearch cerca de 1,2 GB.
- **Internet no primeiro arranque.** O Meilisearch descarrega aí o modelo de embeddings (`paraphrase-multilingual-MiniLM-L12-v2`). O modelo de visão já vem dentro da imagem.

## Instalação

```sh
git clone https://github.com/qwickin/screenshotextension.git recorte
cd recorte/docker
cp .env.example .env
# Edita .env: MEILI_MASTER_KEY (obrigatória, pelo menos 16 caracteres; p. ex. `openssl rand -base64 32`) e PUBLIC_URL
mkdir -p data meili
sudo chown 1000:1000 data      # só em Linux: a app corre como utilizador sem privilégios (uid 1000)
../scripts/up.sh               # constrói a imagem a partir deste checkout e arranca a stack
```

O `scripts/up.sh` (ou `pnpm stack:up` na raiz) calcula as versões com `scripts/version.mjs` e passa-as ao build. Corre depois `docker compose -f docker/compose.yml up -d --build`. Um `docker compose up -d --build` direto também funciona, mas carimba a versão `0.0.0`, e então o aviso de nova versão da extensão nunca aparece.

Depois de o CI publicar a imagem em `ghcr.io/qwickin/screenshotextension` (e de o pacote ficar público no GitHub), basta `docker compose up -d` para usar a imagem publicada.

A galeria fica em `http://localhost:8080`. Para mudar a porta, define `RECORTE_PORT` no `.env`.

### Primeiro arranque: a conta do dono

O Recorte tem uma conta, a do dono. Há duas formas de a criar.

- **Pelo browser.** Abre `/setup` e introduz o código de configuração que aparece nos registos:

  ```sh
  docker compose logs app | grep Setup
  # Setup: open http://localhost:8080/setup — token: …
  ```

  Também podes fixar o código com `SETUP_TOKEN` no `.env`.
- **Pelo `.env`.** Define `ADMIN_EMAIL` e `ADMIN_PASSWORD` antes do primeiro arranque e a conta é criada automaticamente. A seguir, **apaga o `ADMIN_PASSWORD` do `.env`**: depois de a conta existir já não é usado, e assim a palavra-passe não fica em texto simples no disco.

### HTTPS com um domínio (Caddy)

Fora de `localhost` é preciso HTTPS, porque os cookies de sessão são `Secure`. O ficheiro `compose.caddy.yml` junta à stack um Caddy que pede e renova o certificado Let's Encrypt.

1. Aponta o DNS do domínio (registos A/AAAA) para o servidor e abre as portas 80 e 443.
2. No `.env`, define `DOMAIN=recorte.exemplo.pt`. O `PUBLIC_URL` passa a `https://$DOMAIN` automaticamente.
3. Arranca a stack:

   ```sh
   ../scripts/up.sh --caddy                            # a partir do checkout
   # ou, com a imagem publicada:
   docker compose -f compose.yml -f compose.caddy.yml up -d
   ```

Com este override, a porta 8080 deixa de estar publicada e só o Caddy (80/443) fica exposto.

Se usares outro reverse proxy, ele tem de passar `X-Forwarded-Proto` e `Host`/`X-Forwarded-Host`, e não pode fazer buffering de `/api/events` (SSE). Define também o `PUBLIC_URL` com o endereço público.

## Instalar a extensão

As extensões descarregam-se da própria galeria: página **Extensão**, com sessão iniciada. Os ZIPs trazem a versão da extensão que corresponde ao servidor.

**Chrome / Edge / Brave**
1. Descarrega o ZIP do Chrome e descompacta-o numa pasta que vais manter.
2. Abre `chrome://extensions` e ativa o **Modo de programador**.
3. Clica em **Carregar expandida** e escolhe a pasta.
4. Nas opções da extensão, indica o endereço do servidor, o email e a palavra-passe. A palavra-passe não fica guardada: é trocada por um token do dispositivo.

**Firefox**
- Uma extensão sem assinatura só carrega como **extra temporário**: abre `about:debugging#/runtime/this-firefox`, clica em **Carregar extra temporário…** e escolhe o ZIP. O extra desaparece quando o Firefox reinicia.
- Para ficar instalada de vez, usa o **Firefox Developer Edition** ou o **Nightly**:
  1. Em `about:config`, põe `xpinstall.signatures.required` a `false`.
  2. Instala o ZIP em `about:addons` → ⚙ → **Instalar extra a partir de ficheiro…**.

Nenhum browser atualiza estas extensões sozinho. Quando o servidor traz uma versão nova, a extensão mostra "Nova versão disponível"; basta descarregar e carregar outra vez.

## Repor a palavra-passe

Não há envio de email. No servidor:

```sh
docker compose exec app recorte reset-password <email>                         # gera e mostra uma nova
docker compose exec app recorte reset-password <email> --password '<nova>'     # define-a tu
```

Repor a palavra-passe termina todas as sessões e desliga todas as extensões. Cada extensão tem de voltar a ligar-se.

## Cópias de segurança

- **Tudo o que importa está em `docker/data`** (`/data` no container): as imagens, um `meta.json` por captura e o SQLite (`app.db`). Copia essa pasta, de preferência com a app parada (`docker compose stop app`). A galeria também exporta tudo num ZIP: **Definições → Exportar**.
- **`docker/meili` não precisa de cópia.** O índice de pesquisa reconstrói-se a partir dos `meta.json`: **Definições → Reconstruir índice**. É também assim que se atualiza o Meilisearch: para o serviço, apaga `docker/meili`, arranca e reconstrói o índice.

## Atualizar

```sh
git pull && ../scripts/up.sh                 # a partir do checkout
docker compose pull && docker compose up -d  # com a imagem publicada
```

## Desenvolvimento

Precisas de Node 24 e pnpm 12.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test                                   # testes unitários de todos os pacotes + scripts/
pnpm build                                  # galeria (apps/gallery/dist) + extensão (apps/extension/.output)
pnpm --filter @recorte/extension zip        # recorte-chrome.zip e recorte-firefox.zip
pnpm --filter @recorte/server dev           # servidor em :8080 (sem MEILI_URL a pesquisa fica desligada)
pnpm --filter @recorte/gallery dev          # galeria com proxy para o servidor
pnpm --filter @recorte/extension dev        # extensão em modo de desenvolvimento (WXT)
pnpm --filter @recorte/e2e e2e              # E2E: stack compose real + Chromium
```

O E2E constrói a imagem e arranca a stack num projeto compose à parte (`recorte-e2e`), numa porta livre e com os dados numa pasta temporária. No fim corre `docker compose down -v`. Usa o Chromium da cache do Playwright, ou o caminho em `CHROMIUM_PATH`.

Estrutura:

| Pasta | O quê |
|---|---|
| `apps/server` | Node 24 + Hono: API, worker, SQLite |
| `apps/gallery` | Vite + React 19 + HeroUI |
| `apps/extension` | WXT (Chrome MV3, Firefox MV2) |
| `packages/shared` | contrato da API (Zod) |
| `packages/ai` | classificador SigLIP2, vocabulário, rótulos |
| `docker/` | Dockerfile, compose, Caddy |
| `scripts/` | `version.mjs` |
| `e2e/` | teste ponta a ponta |

## Versões

As versões saem do Git (`scripts/version.mjs`):

- **App** (servidor e galeria): `MAJOR.MINOR.<commits desde a tag>`.
- **Extensão:** `MAJOR.MINOR.<commits desde a tag que tocam em apps/extension ou packages/shared>`. Assim, o aviso de versão nova só aparece quando a extensão mudou de facto.
- `MAJOR.MINOR` vem da última tag `vX.Y`. Sem tags, a versão fica `0.0.<n.º de commits>`.
- Só há inteiros, sem hash nem `-dirty`, porque o Chrome não aceita outra coisa.

```sh
node scripts/version.mjs        # {"app":"0.1.12","extension":"0.1.3"}
git tag v0.2 && git push --tags # começa a série 0.2.x
```

O CI (`.github/workflows/ci.yml`) valida tudo e gera os ZIPs em cada push e em cada pull request. A imagem só é publicada pelo CI, em pushes para `main` e em pushes de tags `v*`: criar uma tag localmente não publica nada. A imagem é multi-arquitetura (amd64 e arm64), vai para `ghcr.io/qwickin/screenshotextension` e leva a etiqueta da versão e `latest`. As actions do workflow estão fixadas por SHA, e o Dependabot (`.github/dependabot.yml`) propõe as atualizações todas as semanas.

Para construir localmente com as versões certas:

```sh
docker build -f docker/Dockerfile \
  --build-arg APP_VERSION=$(node scripts/version.mjs --app) \
  --build-arg EXTENSION_VERSION=$(node scripts/version.mjs --extension) \
  -t recorte .
```

## Limitações conhecidas

- **Extensões:** o Chrome obriga ao modo de programador. No Firefox estável, a extensão é só temporária.
- **Captura:** a seleção de área fica limitada ao ecrã visível, e a página inteira tem no máximo 12 000 px.
- **Pesquisa:** com o embedder local, o Meilisearch recomenda um embedder na cloud acima de cerca de 10 000 documentos atualizados com frequência. Para uso pessoal chega.
