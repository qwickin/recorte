# Recorte: protótipo da galeria

Protótipo descartável da galeria (React 19 + HeroUI v3 + Tailwind 4, Vite). Os dados são reais: 29 capturas de
páginas públicas, etiquetadas por um modelo de visão local (Ollama `qwen3.5:9b`). A API é simulada no browser
(`src/api/mock.ts`) com o mesmo contrato que o servidor vai expor (`src/api/types.ts`).

```bash
npm install
npm run dev          # http://localhost:5173
```

- ⌘K / Ctrl+K (ou `/`): pesquisa. Neste protótipo a pesquisa é lexical sobre etiquetas e chaves de pesquisa;
  no servidor será híbrida (embeddings + texto).
- Clicar numa etiqueta do hero filtra a grelha (várias etiquetas = todas têm de estar presentes).

## Regenerar os dados de exemplo

```bash
node scripts/capture.mjs   # screenshots com o Chrome instalado (playwright-core)
node scripts/process.mjs   # WebP + miniaturas + cor dominante (sharp)
node scripts/tag.mjs       # etiquetas, descrição e chaves de pesquisa via Ollama (OLLAMA_MODEL=qwen3.5:9b)
```

`npm run build:embed && node scripts/make-inline.mjs` gera a versão de ficheiro único usada no preview do T3;
`node scripts/verify.mjs <pasta>` testa as interações principais com Playwright.
