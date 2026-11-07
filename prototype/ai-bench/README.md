# Benchmark: etiquetagem leve dentro do container

Zero-shot com vocabulário fechado (`vocab.mjs`: prompts em inglês, nomes em PT) sobre as 29 capturas do protótipo.

```bash
npm install
node bench.mjs siglip2-fp32 2                 # calcula e guarda os rótulos (labels-*.json) com o codificador de texto fp32
VISION_ONLY=1 node bench.mjs siglip2-int8 2   # runtime: só o codificador de imagem (int8) + rótulos pré-calculados
node gen.mjs florence | smolvlm               # comparação com modelos generativos (3 capturas)
```

Resultados em `results/` (top-3 por grupo e por captura). Medido num M4 Max e em `node:24-slim` com `--cpus=2 --memory=1g`.
