# AI tagging — evaluation and choice (round 2, part B)

**Shipped: `lexical-visual`** (`packages/ai/src/tag-item.ts`, tagger `topics-v1`): a text tagger over the whole-page
context (curated pt-PT vocabulary, field weights, URL/og rules), plus the SigLIP2 screenshot model's content-type
probabilities as extra evidence and its visual tags. No new model, so nothing extra is baked into the Docker image.

## Method

- **Dev set**: 20 real pages captured with the extension's own extractor (`dataset/`), with ground truth written by hand (`ground-truth.json`). The vocabulary and weights were tuned on this set.
- **Held-out set**: 12 different pages (`holdout/`). Their ground truth (`ground-truth-holdout.json`) was written and committed (dec481f) before any approach was run on them.
- **Metrics** (`run.mts` + `score.mts`): micro precision, recall and F1. Alternatives (`a|b`) count once. Also measured: latency and memory, with 2 threads on darwin-arm64.

## Results

| approach | dev F1 | held-out F1 | p95 ms | +RSS MB | peak RSS MB |
|---|---|---|---|---|---|
| current (SigLIP2 zero-shot only) | 17% | 17% | 70 | 161 | 604 |
| lexical (text only) | 72% | 44% | 343 | 0 | 296 |
| **lexical-visual (shipped)** | **72%** | **46%** | 498 | 168 | 580 |
| lex-minilm (+ MiniLM embeddings) | 71%* | 44% | 861 | 466 | 862 |
| lex-e5-visual (+ e5-small embeddings) | 72%* | 48% | 1018 | 576 | 1211 |
| llm-qwen3 (0.6B picks from candidates) | 57%* | 36% | 8305 | 1933 | 5669 |
| llm-qwen2.5 0.5B / SmolLM2 360M | 40% / 8%* | — | ~3000 | 1250–1865 | 3.5–4.5 GB |

\* Run before the UI-components gate fix below; they were not re-run (the gate only matters for the lexical-based rows).

## Why this one

- The text tagger is the gain: recall goes from about 10% to about 50% on unseen pages.
- Embeddings add 1–2 points on the held-out set, for 3–7× the memory and 2–3× the latency.
- The small LLMs are worse and far too heavy for the container.

## Honest caveats

- **Overfitting**: dev F1 72% vs held-out 46%. The vocabulary was shaped by the dev pages. Unseen pages still get about one correct tag in two, and some boilerplate noise.
- **Your example** (fluidfunctionalism.com/docs/surfaces) now gives documentação, sombras, componentes ui, dropdown, modo escuro and dialog. The fix: on a UI-components page, a component name needs 80% of the threshold. It cost 1 held-out point: python-docs picked up "componentes ui, input, command palette". The held-out numbers above are after the fix. I had already seen the held-out outputs, so I did not tune against them.
- **Precision problems seen on the held-out set** (not fixed, to keep it honest):
  - cookie-banner text gives "bolachas";
  - "3d" on component docs;
  - generic "google / branding / privacidade" on news.
  The next step is a boilerplate filter (cookie and consent blocks, footers) in the extractor, then a new held-out set.

## In the product

- `ai.topics` holds the AI's shown tags. Items without it (older items) fall back to `tipo ∪ visual`.
- On startup, every live item is queued once per tagger version (`taggerVersion` setting), so older items get re-tagged automatically.
- Text tags also run for links without an image and when the visual model is missing.
