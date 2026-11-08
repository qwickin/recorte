# syntax=docker/dockerfile:1.7
# Recorte image: API + worker + SQLite, embedded Meilisearch, gallery build, extension ZIPs, SigLIP2 vision model (spec §4, §9).
#   docker run -d -p 8080:8080 -v recorte:/data ghcr.io/qwickin/recorte
# Build from the repo root:  docker build -f docker/Dockerfile --build-arg APP_VERSION=… --build-arg EXTENSION_VERSION=… .
# Versions come from scripts/version.mjs (the .git folder is not in the build context).

ARG NODE_IMAGE=node:24-slim
ARG PNPM_VERSION=12.16.1

# ---------------------------------------------------------------------------
# base: node + pnpm
FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@${PNPM_VERSION} && pnpm --version
WORKDIR /src

# ---------------------------------------------------------------------------
# build: gallery + both extension ZIPs. Arch-independent output, so it runs on the build platform
# (multi-arch CI builds it once, natively, instead of under QEMU).
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
ARG PNPM_VERSION
ARG EXTENSION_VERSION=0.0.0
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /src
COPY . .
RUN --mount=type=cache,id=recorte-pnpm,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store
RUN pnpm --filter @recorte/gallery build
RUN cd apps/extension && EXTENSION_VERSION=${EXTENSION_VERSION} pnpm exec wxt zip \
 && EXTENSION_VERSION=${EXTENSION_VERSION} pnpm exec wxt zip -b firefox \
 && mkdir -p /out/downloads \
 && cp .output/recorte-chrome.zip .output/recorte-firefox.zip /out/downloads/

# ---------------------------------------------------------------------------
# model: vision_model_int8.onnx + processor/config at a pinned revision (sha256-checked).
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS model
COPY docker/fetch-model.mjs /fetch-model.mjs
RUN node /fetch-model.mjs /out/models

# ---------------------------------------------------------------------------
# meili: the official Meilisearch binary for the target arch (sha256-checked). Downloaded on the build
# platform; it only runs in the runtime stage.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS meili
ARG TARGETARCH
COPY docker/fetch-meili.mjs /fetch-meili.mjs
RUN node /fetch-meili.mjs "${TARGETARCH:-amd64}" /out/meilisearch

# ---------------------------------------------------------------------------
# deps: production dependencies of the server (and its workspace packages) for the target arch.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY packages/ai/package.json packages/ai/
COPY packages/shared/package.json packages/shared/
# The other workspace manifests must exist for the frozen lockfile check.
COPY apps/gallery/package.json apps/gallery/
COPY apps/extension/package.json apps/extension/
COPY e2e/package.json e2e/
RUN --mount=type=cache,id=recorte-pnpm,target=/pnpm-store \
    pnpm install --frozen-lockfile --prod --filter "@recorte/server..." --store-dir /pnpm-store \
 # onnxruntime-node ships binaries for every OS/arch (~280 MB): keep only this platform's.
 && ORT_ARCH=$(case "$(uname -m)" in x86_64) echo x64;; aarch64) echo arm64;; *) uname -m;; esac) \
 && for d in node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*; do \
      rm -rf "$d/darwin" "$d/win32"; find "$d/linux" -mindepth 1 -maxdepth 1 ! -name "$ORT_ARCH" -exec rm -rf {} +; \
    done \
 # transformers.js bundles the onnxruntime-web code it needs; the package's browser builds (~140 MB) are unused in Node.
 && rm -rf node_modules/.pnpm/onnxruntime-web@*/node_modules/onnxruntime-web/dist \
 && rm -rf apps/gallery apps/extension e2e
COPY tsconfig.base.json ./
COPY apps/server/tsconfig.json apps/server/
COPY apps/server/bin apps/server/bin
COPY apps/server/src apps/server/src
COPY packages/ai/src packages/ai/src
COPY packages/ai/labels.siglip2.json packages/ai/
COPY packages/shared/src packages/shared/src

# ---------------------------------------------------------------------------
# runtime
FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=0.0.0
ARG EXTENSION_VERSION=0.0.0
LABEL org.opencontainers.image.title="Recorte" \
      org.opencontainers.image.description="Self-hosted screenshot library: extension captures, AI tags, semantic search" \
      org.opencontainers.image.version="${APP_VERSION}"
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    EXTENSION_VERSION=${EXTENSION_VERSION} \
    PORT=8080 \
    DATA_DIR=/data \
    GALLERY_DIR=/app/gallery \
    DOWNLOADS_DIR=/app/downloads \
    RECORTE_MODEL_DIR=/app/models \
    MEILI_BIN=/usr/local/bin/meilisearch
WORKDIR /app
COPY --from=deps /src /app
COPY --from=build /src/apps/gallery/dist /app/gallery
COPY --from=build /out/downloads /app/downloads
COPY --from=model /out/models /app/models
COPY --from=meili /out/meilisearch /usr/local/bin/meilisearch
COPY docker/entrypoint.sh /usr/local/bin/recorte-entrypoint
# `recorte reset-password` on PATH (docker exec recorte recorte reset-password).
# `meilisearch --version` fails the build if the binary cannot run on this base image.
RUN meilisearch --version \
 && printf '#!/bin/sh\nexec node /app/apps/server/bin/recorte.mjs "$@"\n' > /usr/local/bin/recorte \
 && chmod +x /usr/local/bin/recorte \
 && mkdir -p /data && chown node:node /data
USER node
WORKDIR /app/apps/server
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["recorte-entrypoint"]
CMD ["node", "--import", "tsx", "src/main.ts"]
