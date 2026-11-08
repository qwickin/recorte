<img src="assets/icon.svg" width="64" height="64" alt="">

# Recorte

O Recorte guarda capturas de ecrã da web no teu próprio servidor.

- **Extensão** para Chrome e Firefox. Captura uma área, o ecrã visível, a página inteira ou uma imagem. Guarda também o texto da página, para a pesquisa encontrar a captura. Com o botão direito guarda também links ("Guardar link no Recorte", "Guardar esta página (link)"): o servidor vai buscar o título, a descrição e a imagem do link (e, num post do X com vídeo, o vídeo embebido).
- **Servidor.** Guarda tudo em disco e sugere etiquetas com IA local (SigLIP2, sem GPU e sem enviar nada para fora): tipo de página, aspeto visual e cores.
- **Galeria.** Scroll infinito e filtros. A pesquisa ⌘K / Ctrl+K entende o significado em português e em inglês: "doce português" encontra um pastel de nata numa página em inglês.

Tudo corre num só container: API, processamento, galeria, ZIPs das extensões e o Meilisearch (a pesquisa), que só escuta dentro do container.

## Requisitos

- Docker, em amd64 ou arm64.
- **2 GB de RAM no mínimo, 4 GB recomendados.** Em uso, o container ocupa cerca de 1,5 a 2 GB (app ~0,6 GB, Meilisearch ~1 GB).
- **Internet no primeiro arranque.** O Meilisearch descarrega aí o modelo de embeddings (`paraphrase-multilingual-MiniLM-L12-v2`, ~450 MB, guardado no volume). O modelo de visão já vem dentro da imagem.
- Para construir a partir do código: Git (com o histórico) e Node 24, porque as versões saem do Git.

## Instalação

```sh
docker run -d --name recorte --restart unless-stopped -p 8080:8080 -v recorte:/data ghcr.io/qwickin/screenshotextension
```

Não é preciso `.env` nem configuração. Depois:

1. Abre `http://<IP-do-servidor>:8080` no browser. Aparece o assistente de configuração (`/setup`), em três passos:
   1. **Conta.** O teu email e uma palavra-passe (com confirmação). Servem para a galeria e para a extensão. O email é só o nome de utilizador: o servidor nunca envia emails.
   2. **Servidor.** Confirma o endereço público (vem preenchido com o endereço que usaste) e, se quiseres, liga uma IA na cloud compatível com a OpenAI (URL, chave, modelo). Com a IA na cloud, uma versão reduzida de cada captura e o seu texto vão para esse serviço de terceiros.
   3. **Extensão.** Descarrega o ZIP para Chrome ou Firefox e segue os passos. Na extensão indicas o URL público, o email e a palavra-passe.
2. **O assistente só fica aberto 15 minutos depois de o container arrancar**, e só enquanto não houver conta. Os registos dizem-no (`docker logs recorte`: "Abre http://…/setup nos próximos 15 minutos para configurar"). Se o tempo passar, reinicia o container (`docker restart recorte`) e volta a abrir `/setup`.

Tudo fica no volume `recorte` (`/data` no container). O endereço público e a IA na cloud mudam-se depois em **Definições → Servidor**.

Para mudar a porta: `-p 9000:8080`. Para usar uma pasta do host em vez do volume: `-v /srv/recorte:/data` (em Linux, `sudo chown 1000:1000 /srv/recorte` antes, porque a app corre como uid 1000).

### Com docker compose

```sh
git clone https://github.com/qwickin/screenshotextension.git recorte
cd recorte/docker
mkdir -p data && sudo chown 1000:1000 data   # o chown só em Linux
docker compose up -d                         # imagem publicada
../scripts/up.sh                             # ou: constrói a partir deste checkout, com as versões do Git
```

O `compose.yml` tem um só serviço (`app`) e guarda tudo em `docker/data`. O `.env` é opcional: o `.env.example` lista o que se pode definir (tudo comentado). O `scripts/up.sh` (ou `pnpm stack:up` na raiz) calcula as versões com `scripts/version.mjs` e passa-as ao build; um `docker compose up -d --build` direto carimba a versão `0.0.0`, e então o aviso de nova versão da extensão nunca aparece.

### Variáveis de ambiente (opcionais)

| Variável | O quê |
|---|---|
| `PUBLIC_URL` | Endereço público. Se estiver definida, manda sobre o valor guardado na galeria (e o campo fica bloqueado). |
| `AI_CLOUD_URL`, `AI_CLOUD_KEY`, `AI_CLOUD_MODEL` | IA na cloud. Idem: mandam sobre as Definições. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Os dois juntos criam a conta no primeiro arranque, sem o assistente. Apaga depois a `ADMIN_PASSWORD`: já não é usada e assim não fica em texto simples. |
| `MEILI_URL`, `MEILI_MASTER_KEY` | Meilisearch externo (ver abaixo). Sem `MEILI_URL`, a app arranca o Meilisearch embutido. |

### Avançado: HTTPS com um domínio (Caddy)

Em `http://<IP>` a sessão funciona (o cookie só é `Secure` em HTTPS). Para usar um domínio com HTTPS, o ficheiro `compose.caddy.yml` junta um Caddy que pede e renova o certificado Let's Encrypt.

1. Aponta o DNS do domínio (registos A/AAAA) para o servidor e abre as portas 80 e 443.
2. No `docker/.env`, define `DOMAIN=recorte.exemplo.pt`. O `PUBLIC_URL` passa a `https://$DOMAIN` automaticamente.
3. Arranca (Compose **2.24 ou mais recente**, por causa do `!reset`):

   ```sh
   ../scripts/up.sh --caddy                            # a partir do checkout
   # ou, com a imagem publicada:
   docker compose -f compose.yml -f compose.caddy.yml up -d
   ```

Com este override, a porta 8080 deixa de estar publicada e só o Caddy (80/443) fica exposto.

Se usares outro reverse proxy, ele tem de passar `X-Forwarded-Proto` e `Host`/`X-Forwarded-Host`, e não pode fazer buffering de `/api/events` (SSE). Indica o endereço público em **Definições → Servidor** (ou `PUBLIC_URL`).

### Avançado: Meilisearch noutro serviço

O Meilisearch embutido escuta só em `127.0.0.1:7700` dentro do container, com os dados em `/data/meili` e a chave-mestra gerada no primeiro arranque em `/data/secrets/meili.key` (modo 0600). Para o correr à parte, define `MEILI_MASTER_KEY` no `docker/.env` e usa o override:

```sh
docker compose -f compose.yml -f compose.meili-external.yml up -d
```

Com `MEILI_URL` definido, a app não arranca o Meilisearch embutido.

## Instalar a extensão

As extensões descarregam-se da própria galeria: página **Extensão**, com sessão iniciada. Os ZIPs trazem a versão da extensão que corresponde ao servidor.

**Chrome / Edge / Brave**
1. Descarrega o ZIP do Chrome e descompacta-o numa pasta que vais manter.
2. Abre `chrome://extensions` e ativa o **Modo de programador**.
3. Clica em **Carregar expandida** e escolhe a pasta.
4. Nas opções da extensão, indica o URL público do servidor (p. ex. `http://192.168.1.20:8080`) o teu email e a palavra-passe. O nome do dispositivo é opcional. A palavra-passe não fica guardada: é trocada por um token do dispositivo.

**Firefox**
- Uma extensão sem assinatura só carrega como **extra temporário**: abre `about:debugging#/runtime/this-firefox`, clica em **Carregar extra temporário…** e escolhe o ZIP. O extra desaparece quando o Firefox reinicia.
- Para ficar instalada de vez, usa o **Firefox Developer Edition** ou o **Nightly**:
  1. Em `about:config`, põe `xpinstall.signatures.required` a `false`.
  2. Instala o ZIP em `about:addons` → ⚙ → **Instalar extra a partir de ficheiro…**.

Nenhum browser atualiza estas extensões sozinho. Quando o servidor traz uma versão nova, a extensão mostra "Nova versão disponível"; basta descarregar e carregar outra vez.

## Repor a palavra-passe

O servidor não envia emails. Repõe-se no próprio servidor:

```sh
docker exec recorte recorte reset-password tu@exemplo.pt                        # gera e mostra uma nova
docker exec recorte recorte reset-password tu@exemplo.pt --password '<nova>'    # define-a tu
# com compose: docker compose exec app recorte reset-password …
```

Repor a palavra-passe termina todas as sessões e desliga todas as extensões. Cada extensão tem de voltar a ligar-se.

## Cópias de segurança

- **Tudo está em `/data`** (o volume `recorte`, ou `docker/data` com compose): as imagens, um `meta.json` por captura, o SQLite (`recorte.db`, com as definições), `secrets/` e o índice do Meilisearch (`meili/`). Copia-o com a app parada (`docker stop recorte`), p. ex. `docker run --rm -v recorte:/data -v "$PWD":/backup alpine tar czf /backup/recorte.tgz -C /data .`. A galeria também exporta as capturas num ZIP: **Definições → Exportar**.
- **`/data/meili` não precisa de cópia.** O índice de pesquisa reconstrói-se a partir dos `meta.json`: **Definições → Reconstruir índice**. Para o reconstruir de raiz, para o container, apaga `/data/meili`, arranca e reconstrói o índice.

## Atualizar

```sh
docker pull ghcr.io/qwickin/screenshotextension
docker stop recorte && docker rm recorte     # paragem limpa (SQLite e Meilisearch); os dados ficam no volume
docker run -d --name recorte --restart unless-stopped -p 8080:8080 -v recorte:/data ghcr.io/qwickin/screenshotextension
git pull && ../scripts/up.sh                 # compose, a partir do checkout
docker compose pull && docker compose up -d  # compose, com a imagem publicada
```

**Vindo da versão com dois serviços (`app` + `search`):** a conta mantém-se, com o mesmo email e a mesma palavra-passe (`SETUP_TOKEN` já não existe). Se a conta foi criada pela versão que pedia só a palavra-passe, o primeiro login com a palavra-passe certa fica com o email que indicares (ou usa `recorte reset-password <email>`). O Meilisearch passa a correr dentro do container, com um índice novo em `docker/data/meili`: depois de atualizar, carrega uma vez em **Definições → Reconstruir índice**. Na primeira atualização, remove também o serviço `search` antigo, que de outro modo continua a correr sozinho: `docker compose up -d --remove-orphans` (com o Caddy: `docker compose -f compose.yml -f compose.caddy.yml up -d --remove-orphans`). A pasta antiga `docker/meili` pode ser apagada. As extensões têm de voltar a ligar-se só se a palavra-passe mudar.

## Desenvolvimento

Precisas de Node 24 e pnpm 12.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test                                   # testes unitários de todos os pacotes + scripts/
pnpm build                                  # galeria (apps/gallery/dist) + extensão (apps/extension/.output)
pnpm --filter @recorte/extension zip        # recorte-chrome.zip e recorte-firefox.zip
pnpm --filter @recorte/server dev           # servidor em :8080 (sem MEILI_URL nem MEILI_BIN a pesquisa fica desligada)
pnpm --filter @recorte/gallery dev          # galeria com proxy para o servidor
pnpm --filter @recorte/extension dev        # extensão em modo de desenvolvimento (WXT)
pnpm --filter @recorte/e2e e2e              # E2E: imagem real (docker run) + Chromium
```

O E2E constrói a imagem e corre-a como no `docker run` acima, sem configuração, numa porta livre e com um volume próprio; faz o `/setup` com email e palavra-passe e no fim apaga o container e o volume. Usa o Chromium da cache do Playwright, ou o caminho em `CHROMIUM_PATH`.

Estrutura:

| Pasta | O quê |
|---|---|
| `apps/server` | Node 24 + Hono: API, worker, SQLite |
| `apps/gallery` | Vite + React 19 + HeroUI |
| `apps/extension` | WXT (Chrome MV3, Firefox MV2) |
| `packages/shared` | contrato da API (Zod) |
| `packages/ai` | classificador SigLIP2, vocabulário, rótulos |
| `docker/` | Dockerfile (com o Meilisearch embutido), compose, Caddy |
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
