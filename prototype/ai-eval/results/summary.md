| approach | micro P | micro R | F1 | tags/item | p50 ms | p95 ms | max ms | load ms | +RSS loaded MB | peak RSS MB | platform/threads |
|---|---|---|---|---|---|---|---|---|---|---|---|
| current | 50% | 10% | 17% | 1.1 | 53 | 70 | 70 | 174 | 161 | 604 | darwin-arm64/2t |
| lex-e5-visual | 69% | 75% | 72% | 6.0 | 171 | 1018 | 1018 | 551 | 576 | 1211 | darwin-arm64/2t |
| lex-e5 | 69% | 75% | 72% | 6.0 | 124 | 955 | 955 | 550 | 434 | 913 | darwin-arm64/2t |
| lex-minilm-visual | 68% | 72% | 70% | 5.8 | 180 | 929 | 929 | 528 | 596 | 1113 | darwin-arm64/2t |
| lex-minilm | 69% | 73% | 71% | 5.8 | 133 | 861 | 861 | 503 | 466 | 862 | darwin-arm64/2t |
| lexical-visual | 70% | 74% | 72% | 5.8 | 92 | 498 | 498 | 244 | 168 | 580 | darwin-arm64/2t |
| lexical | 70% | 74% | 72% | 5.8 | 12 | 343 | 343 | 0 | 1 | 296 | darwin-arm64/2t |
| llm-qwen25 | 48% | 35% | 40% | 4.0 | 2911 | 3267 | 3267 | 1031 | 1865 | 4568 | darwin-arm64/2t |
| llm-qwen3 | 61% | 53% | 57% | 4.8 | 4566 | 8305 | 8305 | 1338 | 1933 | 5669 | darwin-arm64/2t |
| llm-smollm2 | 45% | 5% | 8% | 0.6 | 2156 | 2901 | 2901 | 806 | 1248 | 3577 | darwin-arm64/2t |

Per page (bold = matches the ground truth):

**ff-surfaces** — expected: componentes ui, dialog, dropdown|combobox, design system, modo escuro, sombras|elevação, documentação
- current: **componentes ui**, **modo escuro**
- lex-e5-visual: **documentação**, **sombras**, **componentes ui**, **dropdown**, **modo escuro**, **dialog**
- lex-e5: **documentação**, **sombras**, **componentes ui**, **dropdown**, **modo escuro**, **dialog**
- lex-minilm-visual: **documentação**, **sombras**, **modo escuro**
- lex-minilm: **documentação**, **sombras**, **modo escuro**
- lexical-visual: **documentação**, **sombras**, **componentes ui**, **dropdown**, **modo escuro**, **dialog**
- lexical: **documentação**, **sombras**, **componentes ui**, **dropdown**, **modo escuro**, **dialog**
- llm-qwen25: **documentação**, **sombras**, **modo escuro**, **dropdown**, **dialog**, iluminação, cor
- llm-qwen3: **documentação**, diagrama, **componentes ui**, **design system**, ui design, gradiente, css grid
- llm-smollm2: —

**gh-readability** — expected: repositório, github, javascript, open source|biblioteca, npm, código
- current: **repositório**, modo escuro
- lex-e5-visual: **github**, **repositório**, documentação, **javascript**, **biblioteca**, mozilla, node.js
- lex-e5: **github**, documentação, **javascript**, **biblioteca**, mozilla, **repositório**, node.js
- lex-minilm-visual: **biblioteca**, **github**, **repositório**, documentação, **javascript**, mozilla, node.js
- lex-minilm: **biblioteca**, **github**, documentação, **javascript**, **repositório**, mozilla, node.js
- lexical-visual: **repositório**, documentação, **javascript**, **biblioteca**, **github**, mozilla, node.js
- lexical: documentação, **javascript**, **biblioteca**, **github**, **repositório**, mozilla, node.js
- llm-qwen25: **biblioteca**, **github**, tecnologia, software
- llm-qwen3: **biblioteca**, **npm**, documentação, **javascript**, node.js, git, open source
- llm-smollm2: —

**mdn-flexbox** — expected: documentação, css, flexbox, layout, desenvolvimento web|html, tutorial
- current: —
- lex-e5-visual: **flexbox**, **layout**, **css**, **documentação**, mozilla, programação
- lex-e5: **flexbox**, **layout**, **css**, **documentação**, mozilla, programação
- lex-minilm-visual: **flexbox**, **css**, **layout**, **documentação**, mozilla, programação
- lex-minilm: **flexbox**, **css**, **layout**, **documentação**, mozilla, programação
- lexical-visual: **flexbox**, **css**, **layout**, **documentação**, mozilla, programação
- lexical: **flexbox**, **css**, **layout**, **documentação**, mozilla, programação
- llm-qwen25: —
- llm-qwen3: **flexbox**, **css**, **layout**, **documentação**, **tutorial**, mozilla, programação
- llm-smollm2: —

**tailwind-docs** — expected: documentação, css, tailwind css, flexbox, layout, modo escuro
- current: **modo escuro**
- lex-e5-visual: **flexbox**, **tailwind css**, **documentação**, **layout**, css grid, **css**, **modo escuro**
- lex-e5: **flexbox**, **tailwind css**, **documentação**, **layout**, css grid, **css**
- lex-minilm-visual: **flexbox**, **tailwind css**, **documentação**, **layout**, **css**, **modo escuro**
- lex-minilm: **flexbox**, **tailwind css**, **documentação**, **layout**, **css**
- lexical-visual: **flexbox**, **documentação**, **tailwind css**, **layout**, **css**, **modo escuro**
- lexical: **flexbox**, **documentação**, **tailwind css**, **layout**, **css**
- llm-qwen25: **flexbox**
- llm-qwen3: **flexbox**, **tailwind css**, **documentação**, **layout**, **css**
- llm-smollm2: —

**shadcn-combobox** — expected: componentes ui, combobox|dropdown, react, tailwind css, documentação, design system, modo escuro
- current: **componentes ui**, **modo escuro**
- lex-e5-visual: **combobox**, **documentação**, ui design, **react**, **componentes ui**, next.js, input
- lex-e5: **combobox**, **documentação**, ui design, **react**, next.js, **componentes ui**, input
- lex-minilm-visual: **combobox**, **documentação**, ui design, **react**, **componentes ui**, next.js, javascript
- lex-minilm: **combobox**, **documentação**, ui design, **react**, **componentes ui**, next.js, javascript
- lexical-visual: **documentação**, **combobox**, ui design, **react**, **componentes ui**, next.js, javascript
- lexical: **documentação**, **combobox**, ui design, **react**, next.js, **componentes ui**, javascript
- llm-qwen25: **combobox**, ui design, **react**, **componentes ui**, next.js, javascript, lista
- llm-qwen3: **combobox**, **documentação**, ui design, **react**, **componentes ui**, next.js, javascript
- llm-smollm2: —

**motion-docs** — expected: animação, react, documentação, javascript, biblioteca
- current: —
- lex-e5-visual: **react**, motion design, **animação**, **documentação**, componentes ui, **javascript**, ui design
- lex-e5: **react**, motion design, **animação**, **documentação**, componentes ui, **javascript**, ui design
- lex-minilm-visual: **animação**, **react**, motion design, **documentação**, componentes ui, ui design, **javascript**
- lex-minilm: **animação**, **react**, motion design, **documentação**, componentes ui, ui design, **javascript**
- lexical-visual: **react**, **animação**, motion design, **documentação**, componentes ui, ui design, **javascript**
- lexical: **react**, **animação**, motion design, **documentação**, componentes ui, ui design, **javascript**
- llm-qwen25: **animação**, **react**, motion design, **documentação**, componentes ui, tutorial, ui design
- llm-qwen3: **animação**, **react**, motion design, **documentação**, componentes ui, tutorial, ui design
- llm-smollm2: —

**news-guardian** — expected: notícia|artigo, ciência, psicologia, comunicação|conversa, investigação|estudo
- current: **artigo**
- lex-e5-visual: **ciência**, **conversa**, **psicologia**
- lex-e5: **ciência**, **conversa**, **artigo**, **psicologia**
- lex-minilm-visual: **ciência**, **conversa**, **psicologia**
- lex-minilm: **ciência**, **conversa**, **artigo**, **psicologia**
- lexical-visual: **ciência**, **conversa**, **psicologia**
- lexical: **ciência**, **conversa**, **artigo**, **psicologia**
- llm-qwen25: **ciência**, linguística, **conversa**, artigo científico, inteligência artificial, vídeo, braga
- llm-qwen3: **ciência**, **conversa**, **artigo**, **psicologia**, google, **investigação**, dialog
- llm-smollm2: —

**news-publico** — expected: notícia|artigo, saúde, medicina|medicamentos, diabetes, ciência, obesidade
- current: **artigo**
- lex-e5-visual: **diabetes**, **medicamentos**, medicina, **saúde**, **notícia**, artigo, **obesidade**
- lex-e5: **diabetes**, **medicamentos**, medicina, **saúde**, **notícia**, **obesidade**, artigo
- lex-minilm-visual: **diabetes**, **medicamentos**, medicina, **saúde**, **notícia**, artigo, **obesidade**
- lex-minilm: **diabetes**, **medicamentos**, medicina, **saúde**, **notícia**, artigo, **obesidade**
- lexical-visual: **medicina**, **diabetes**, medicamentos, **saúde**, **notícia**, artigo, **obesidade**
- lexical: **medicina**, **diabetes**, medicamentos, **saúde**, **notícia**, artigo, **obesidade**
- llm-qwen25: **diabetes**, **medicamentos**, **ciência**
- llm-qwen3: **diabetes**, **medicamentos**, medicina, **saúde**, **notícia**, artigo, **obesidade**
- llm-smollm2: —

**recipe-allrecipes** — expected: receita, culinária, sobremesa|doces, bolachas, chocolate
- current: **receita**
- lex-e5-visual: **receita**, **bolachas**, **chocolate**, **culinária**, **doces**
- lex-e5: **receita**, **bolachas**, **chocolate**, **culinária**, **doces**
- lex-minilm-visual: **receita**, **bolachas**, **chocolate**, **culinária**, **doces**
- lex-minilm: **receita**, **bolachas**, **chocolate**, **culinária**, **doces**
- lexical-visual: **receita**, **bolachas**, **chocolate**, **culinária**, **doces**
- lexical: **receita**, **bolachas**, **chocolate**, **culinária**, **doces**
- llm-qwen25: —
- llm-qwen3: **receita**, **bolachas**, **chocolate**
- llm-smollm2: —

**map-osm** — expected: mapa, lisboa, portugal, cartografia|geografia
- current: **mapa**
- lex-e5-visual: **mapa**, openstreetmap
- lex-e5: **mapa**, openstreetmap
- lex-minilm-visual: **mapa**, openstreetmap
- lex-minilm: **mapa**, openstreetmap
- lexical-visual: **mapa**
- lexical: **mapa**
- llm-qwen25: openstreetmap, **mapa**, openai, dropdown, redes neuronais, **cartografia**, espaço
- llm-qwen3: **mapa**, openstreetmap, open source, **geografia**, cartografia
- llm-smollm2: —

**product-ikea** — expected: loja|e-commerce, mobiliário, estante, decoração|casa, preços
- current: landing page
- lex-e5-visual: **estante**, **preços**, **casa**, **mobiliário**, design, design de interiores
- lex-e5: **estante**, **preços**, **casa**, **mobiliário**, design, design de interiores
- lex-minilm-visual: **estante**, **preços**, **casa**, **mobiliário**, design, design de interiores
- lex-minilm: **estante**, **preços**, **casa**, **mobiliário**, design, design de interiores
- lexical-visual: **estante**, **preços**, **casa**, **mobiliário**, design, design de interiores
- lexical: **estante**, **preços**, **casa**, **mobiliário**, design, design de interiores
- llm-qwen25: —
- llm-qwen3: **estante**, **preços**, **casa**, **mobiliário**, **loja**, design, livro
- llm-smollm2: —

**product-apple** — expected: apple, portátil, mac, hardware|tecnologia, loja|produto
- current: landing page
- lex-e5-visual: **mac**, **apple**, **loja**, inteligência artificial, tablet, smartphone, **portátil**
- lex-e5: **mac**, **apple**, **loja**, inteligência artificial, tablet, smartphone, **portátil**
- lex-minilm-visual: **mac**, **apple**, **loja**, inteligência artificial, tablet, smartphone, **portátil**
- lex-minilm: **mac**, **apple**, **loja**, inteligência artificial, tablet, smartphone, **portátil**
- lexical-visual: **mac**, **apple**, **loja**, inteligência artificial, tablet, smartphone, **portátil**
- lexical: **mac**, **apple**, **loja**, inteligência artificial, tablet, smartphone, **portátil**
- llm-qwen25: **mac**, software, **hardware**, tecnologia
- llm-qwen3: **mac**, **apple**, tablet, smartphone
- llm-smollm2: —

**design-dribbble** — expected: inspiração, web design, design|ui design, landing page, galeria, dribbble
- current: imagens
- lex-e5-visual: **inspiração**, **dribbble**, **landing page**, **design**, **web design**, inteligência artificial
- lex-e5: **inspiração**, **dribbble**, **design**, **landing page**, **web design**, inteligência artificial
- lex-minilm-visual: **inspiração**, **landing page**, **dribbble**, **design**, **web design**, inteligência artificial
- lex-minilm: **inspiração**, **dribbble**, **landing page**, **design**, **web design**, inteligência artificial
- lexical-visual: **inspiração**, **design**, **dribbble**, **landing page**, inteligência artificial
- lexical: **inspiração**, **design**, **dribbble**, **landing page**, inteligência artificial
- llm-qwen25: **inspiração**, **design**, **web design**, branding, design de produto
- llm-qwen3: **inspiração**, **dribbble**, **design**, **web design**, inteligência artificial, ui design, llm
- llm-smollm2: —

**video-youtube** — expected: vídeo, youtube, redes neuronais, deep learning|machine learning, inteligência artificial, matemática
- current: **vídeo**, modo escuro
- lex-e5-visual: **redes neuronais**, **vídeo**, **deep learning**, **inteligência artificial**, **youtube**, **matemática**, machine learning
- lex-e5: **redes neuronais**, **vídeo**, **deep learning**, **inteligência artificial**, **youtube**, **matemática**, machine learning
- lex-minilm-visual: **redes neuronais**, **vídeo**, **deep learning**, **inteligência artificial**, **youtube**, **matemática**, redes
- lex-minilm: **redes neuronais**, **vídeo**, **deep learning**, **inteligência artificial**, **youtube**, **matemática**, machine learning
- lexical-visual: **vídeo**, **redes neuronais**, **inteligência artificial**, **deep learning**, **youtube**, **matemática**, portugal
- lexical: **redes neuronais**, **vídeo**, **inteligência artificial**, **deep learning**, **youtube**, **matemática**, portugal
- llm-qwen25: python
- llm-qwen3: —
- llm-smollm2: —

**x-post** — expected: rede social, x|twitter, publicação|post
- current: fotografia
- lex-e5-visual: **publicação**, **rede social**, **x**
- lex-e5: **publicação**, **rede social**, **x**
- lex-minilm-visual: **publicação**, **rede social**, **x**
- lex-minilm: **publicação**, **rede social**, **x**
- lexical-visual: **publicação**, **rede social**, **x**
- lexical: **publicação**, **rede social**, **x**
- llm-qwen25: **publicação**, **x**, iot, git, node.js, toggle, kotlin
- llm-qwen3: **publicação**, **rede social**, **x**, iot, git, github, toggle
- llm-smollm2: **publicação**, **rede social**, **x**, iot, github, node.js, toggle

**wiki-nata** — expected: pastelaria|doces, sobremesa, portugal, lisboa, culinária|gastronomia, wikipedia|enciclopédia
- current: receita
- lex-e5-visual: **pastelaria**, **portugal**, **enciclopédia**, doces, **lisboa**, religião, wikipedia
- lex-e5: **pastelaria**, **portugal**, **enciclopédia**, doces, **lisboa**, religião, wikipedia
- lex-minilm-visual: **enciclopédia**, **pastelaria**, **portugal**, wikipedia, doces, **lisboa**, religião
- lex-minilm: **enciclopédia**, **pastelaria**, **portugal**, wikipedia, doces, **lisboa**, religião
- lexical-visual: **pastelaria**, **enciclopédia**, **portugal**, doces, **lisboa**, religião, wikipedia
- lexical: **pastelaria**, **enciclopédia**, **portugal**, doces, **lisboa**, religião, wikipedia
- llm-qwen25: **lisboa**, **gastronomia**, saúde
- llm-qwen3: **pastelaria**
- llm-smollm2: —

**stripe-pricing** — expected: preços, pagamentos, finanças|fintech, saas|software, negócios|empresas
- current: gradiente
- lex-e5-visual: **preços**, **pagamentos**, **negócios**, **finanças**, vendas, api, criptomoedas
- lex-e5: **preços**, **pagamentos**, **negócios**, **finanças**, vendas, api, criptomoedas
- lex-minilm-visual: **preços**, **pagamentos**, **negócios**, **finanças**, vendas, api, ciência de dados
- lex-minilm: **preços**, **pagamentos**, **negócios**, **finanças**, vendas, api, economia
- lexical-visual: **preços**, **pagamentos**, **negócios**, **finanças**, vendas, api, culinária
- lexical: **preços**, **pagamentos**, **negócios**, **finanças**, vendas, api, culinária
- llm-qwen25: **preços**, **pagamentos**, tecnologia, marketing, **software**
- llm-qwen3: —
- llm-smollm2: —

**arxiv-attention** — expected: artigo científico, inteligência artificial, machine learning|deep learning, redes neuronais, nlp|processamento de linguagem natural, tradução automática
- current: artigo
- lex-e5-visual: **artigo científico**, transformers, **tradução automática**, ciência, **machine learning**, **inteligência artificial**, arxiv
- lex-e5: **artigo científico**, transformers, **tradução automática**, ciência, **machine learning**, **inteligência artificial**, arxiv
- lex-minilm-visual: **artigo científico**, transformers, **tradução automática**, ciência, **inteligência artificial**, **machine learning**, produtividade
- lex-minilm: **artigo científico**, transformers, **tradução automática**, ciência, **inteligência artificial**, **machine learning**, **redes neuronais**
- lexical-visual: **artigo científico**, transformers, **tradução automática**, ciência, **inteligência artificial**, **machine learning**, arxiv
- lexical: **artigo científico**, transformers, **tradução automática**, ciência, **inteligência artificial**, **machine learning**, arxiv
- llm-qwen25: **artigo científico**, linguística, tecnologia, **inteligência artificial**, análise
- llm-qwen3: —
- llm-smollm2: —

**hn-front** — expected: lista de links, notícias|notícia, tecnologia, fórum|comunidade, programação
- current: wiki
- lex-e5-visual: hacker news, **lista de links**, github, microsoft, ciência, inteligência artificial, windows
- lex-e5: hacker news, **lista de links**, github, microsoft, ciência, inteligência artificial, windows
- lex-minilm-visual: hacker news, **lista de links**, ciência, github, inteligência artificial, microsoft, windows
- lex-minilm: hacker news, **lista de links**, ciência, github, inteligência artificial, microsoft, windows
- lexical-visual: hacker news, **lista de links**, ciência, github, inteligência artificial, microsoft, windows
- lexical: hacker news, **lista de links**, ciência, github, inteligência artificial, microsoft, windows
- llm-qwen25: —
- llm-qwen3: —
- llm-smollm2: —

**fonts-inter** — expected: tipografia, tipo de letra|fonte, design, sans-serif, google fonts|google
- current: resultados de pesquisa
- lex-e5-visual: **google fonts**, **tipo de letra**, **sans-serif**, **tipografia**, **design**
- lex-e5: **google fonts**, **tipo de letra**, **sans-serif**, **tipografia**, **design**
- lex-minilm-visual: **google fonts**, **tipo de letra**, google, **tipografia**, **design**, **sans-serif**
- lex-minilm: **google fonts**, **tipo de letra**, google, **design**, **tipografia**, **sans-serif**
- lexical-visual: **tipo de letra**, **google fonts**, **tipografia**, **design**, **sans-serif**
- lexical: **tipo de letra**, **google fonts**, **design**, **tipografia**, **sans-serif**
- llm-qwen25: **design**, **tipografia**, **sans-serif**, privacidade, direito, religião, browser
- llm-qwen3: **google fonts**, **tipo de letra**, google, **design**, **tipografia**, **sans-serif**, web design
- llm-smollm2: **design**, serif, web design, **sans-serif**
