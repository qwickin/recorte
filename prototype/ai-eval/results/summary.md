| approach | micro P | micro R | F1 | tags/item | p50 ms | p95 ms | max ms | load ms | +RSS loaded MB | peak RSS MB | platform/threads |
|---|---|---|---|---|---|---|---|---|---|---|---|
| current | 50% | 10% | 17% | 1.1 | 53 | 70 | 70 | 174 | 161 | 604 | darwin-arm64/2t |
| lex-e5-visual | 69% | 75% | 72% | 6.0 | 171 | 1018 | 1018 | 551 | 576 | 1211 | darwin-arm64/2t |
| lex-e5 | 69% | 75% | 72% | 6.0 | 132 | 1196 | 1196 | 685 | 421 | 839 | darwin-arm64/2t |
| lex-minilm | 69% | 73% | 71% | 5.8 | 133 | 861 | 861 | 503 | 466 | 862 | darwin-arm64/2t |
| lexical-visual | 69% | 72% | 70% | 5.7 | 66 | 484 | 484 | 245 | 160 | 593 | darwin-arm64/2t |
| lexical | 69% | 72% | 70% | 5.7 | 13 | 343 | 343 | 0 | 0 | 303 | darwin-arm64/2t |

Per page (bold = matches the ground truth):

**ff-surfaces** — expected: componentes ui, dialog, dropdown|combobox, design system, modo escuro, sombras|elevação, documentação
- current: **componentes ui**, **modo escuro**
- lex-e5-visual: **documentação**, **sombras**, **componentes ui**, **dropdown**, **modo escuro**, **dialog**
- lex-e5: **documentação**, **sombras**, **componentes ui**, **dropdown**, **modo escuro**, **dialog**
- lex-minilm: **documentação**, **sombras**, **modo escuro**
- lexical-visual: **documentação**, **sombras**, **modo escuro**
- lexical: **documentação**, **sombras**, **modo escuro**

**gh-readability** — expected: repositório, github, javascript, open source|biblioteca, npm, código
- current: **repositório**, modo escuro
- lex-e5-visual: **github**, **repositório**, documentação, **javascript**, **biblioteca**, mozilla, node.js
- lex-e5: **github**, documentação, **javascript**, **biblioteca**, mozilla, **repositório**, node.js
- lex-minilm: **biblioteca**, **github**, documentação, **javascript**, **repositório**, mozilla, node.js
- lexical-visual: **repositório**, documentação, **javascript**, **biblioteca**, **github**, mozilla, node.js
- lexical: documentação, **javascript**, **biblioteca**, **github**, **repositório**, mozilla, node.js

**mdn-flexbox** — expected: documentação, css, flexbox, layout, desenvolvimento web|html, tutorial
- current: —
- lex-e5-visual: **flexbox**, **layout**, **css**, **documentação**, mozilla, programação
- lex-e5: **flexbox**, **layout**, **css**, **documentação**, mozilla, programação
- lex-minilm: **flexbox**, **css**, **layout**, **documentação**, mozilla, programação
- lexical-visual: **flexbox**, **css**, **layout**, **documentação**, mozilla, programação
- lexical: **flexbox**, **css**, **layout**, **documentação**, mozilla, programação

**tailwind-docs** — expected: documentação, css, tailwind css, flexbox, layout, modo escuro
- current: **modo escuro**
- lex-e5-visual: **flexbox**, **tailwind css**, **documentação**, **layout**, css grid, **css**, **modo escuro**
- lex-e5: **flexbox**, **tailwind css**, **documentação**, **layout**, css grid, **css**
- lex-minilm: **flexbox**, **tailwind css**, **documentação**, **layout**, **css**
- lexical-visual: **flexbox**, **documentação**, **tailwind css**, **layout**, **css**, **modo escuro**
- lexical: **flexbox**, **documentação**, **tailwind css**, **layout**, **css**

**shadcn-combobox** — expected: componentes ui, combobox|dropdown, react, tailwind css, documentação, design system, modo escuro
- current: **componentes ui**, **modo escuro**
- lex-e5-visual: **combobox**, **documentação**, ui design, **react**, **componentes ui**, next.js, input
- lex-e5: **combobox**, **documentação**, ui design, **react**, next.js, **componentes ui**, input
- lex-minilm: **combobox**, **documentação**, ui design, **react**, **componentes ui**, next.js, javascript
- lexical-visual: **documentação**, **combobox**, ui design, **react**, **componentes ui**, next.js, javascript
- lexical: **documentação**, **combobox**, ui design, **react**, next.js, **componentes ui**, javascript

**motion-docs** — expected: animação, react, documentação, javascript, biblioteca
- current: —
- lex-e5-visual: **react**, motion design, **animação**, **documentação**, componentes ui, **javascript**, ui design
- lex-e5: **react**, motion design, **animação**, **documentação**, componentes ui, **javascript**, ui design
- lex-minilm: **animação**, **react**, motion design, **documentação**, componentes ui, ui design, **javascript**
- lexical-visual: **react**, **animação**, motion design, **documentação**, componentes ui, ui design, **javascript**
- lexical: **react**, **animação**, motion design, **documentação**, componentes ui, ui design, **javascript**

**news-guardian** — expected: notícia|artigo, ciência, psicologia, comunicação|conversa, investigação|estudo
- current: **artigo**
- lex-e5-visual: **ciência**, **conversa**, **psicologia**
- lex-e5: **ciência**, **conversa**, **artigo**, **psicologia**
- lex-minilm: **ciência**, **conversa**, **artigo**, **psicologia**
- lexical-visual: **ciência**, **conversa**, **psicologia**
- lexical: **ciência**, **conversa**, **artigo**, **psicologia**

**news-publico** — expected: notícia|artigo, saúde, medicina|medicamentos, diabetes, ciência, obesidade
- current: **artigo**
- lex-e5-visual: **diabetes**, **medicamentos**, medicina, **saúde**, **notícia**, artigo, **obesidade**
- lex-e5: **diabetes**, **medicamentos**, medicina, **saúde**, **notícia**, **obesidade**, artigo
- lex-minilm: **diabetes**, **medicamentos**, medicina, **saúde**, **notícia**, artigo, **obesidade**
- lexical-visual: **medicina**, **diabetes**, medicamentos, **saúde**, **notícia**, artigo, **obesidade**
- lexical: **medicina**, **diabetes**, medicamentos, **saúde**, **notícia**, artigo, **obesidade**

**recipe-allrecipes** — expected: receita, culinária, sobremesa|doces, bolachas, chocolate
- current: **receita**
- lex-e5-visual: **receita**, **bolachas**, **chocolate**, **culinária**, **doces**
- lex-e5: **receita**, **bolachas**, **chocolate**, **culinária**, **doces**
- lex-minilm: **receita**, **bolachas**, **chocolate**, **culinária**, **doces**
- lexical-visual: **receita**, **bolachas**, **chocolate**, **culinária**, **doces**
- lexical: **receita**, **bolachas**, **chocolate**, **culinária**, **doces**

**map-osm** — expected: mapa, lisboa, portugal, cartografia|geografia
- current: **mapa**
- lex-e5-visual: **mapa**, openstreetmap
- lex-e5: **mapa**, openstreetmap
- lex-minilm: **mapa**, openstreetmap
- lexical-visual: **mapa**
- lexical: **mapa**

**product-ikea** — expected: loja|e-commerce, mobiliário, estante, decoração|casa, preços
- current: landing page
- lex-e5-visual: **estante**, **preços**, **casa**, **mobiliário**, design, design de interiores
- lex-e5: **estante**, **preços**, **casa**, **mobiliário**, design, design de interiores
- lex-minilm: **estante**, **preços**, **casa**, **mobiliário**, design, design de interiores
- lexical-visual: **estante**, **preços**, **casa**, **mobiliário**, design, design de interiores
- lexical: **estante**, **preços**, **casa**, **mobiliário**, design, design de interiores

**product-apple** — expected: apple, portátil, mac, hardware|tecnologia, loja|produto
- current: landing page
- lex-e5-visual: **mac**, **apple**, **loja**, inteligência artificial, tablet, smartphone, **portátil**
- lex-e5: **mac**, **apple**, **loja**, inteligência artificial, tablet, smartphone, **portátil**
- lex-minilm: **mac**, **apple**, **loja**, inteligência artificial, tablet, smartphone, **portátil**
- lexical-visual: **mac**, **apple**, **loja**, inteligência artificial, tablet, smartphone, **portátil**
- lexical: **mac**, **apple**, **loja**, inteligência artificial, tablet, smartphone, **portátil**

**design-dribbble** — expected: inspiração, web design, design|ui design, landing page, galeria, dribbble
- current: imagens
- lex-e5-visual: **inspiração**, **dribbble**, **landing page**, **design**, **web design**, inteligência artificial
- lex-e5: **inspiração**, **dribbble**, **design**, **landing page**, **web design**, inteligência artificial
- lex-minilm: **inspiração**, **dribbble**, **landing page**, **design**, **web design**, inteligência artificial
- lexical-visual: **inspiração**, **design**, **dribbble**, **landing page**, inteligência artificial
- lexical: **inspiração**, **design**, **dribbble**, **landing page**, inteligência artificial

**video-youtube** — expected: vídeo, youtube, redes neuronais, deep learning|machine learning, inteligência artificial, matemática
- current: **vídeo**, modo escuro
- lex-e5-visual: **redes neuronais**, **vídeo**, **deep learning**, **inteligência artificial**, **youtube**, **matemática**, machine learning
- lex-e5: **redes neuronais**, **vídeo**, **deep learning**, **inteligência artificial**, **youtube**, **matemática**, machine learning
- lex-minilm: **redes neuronais**, **vídeo**, **deep learning**, **inteligência artificial**, **youtube**, **matemática**, machine learning
- lexical-visual: **vídeo**, **redes neuronais**, **inteligência artificial**, **deep learning**, **youtube**, **matemática**, portugal
- lexical: **redes neuronais**, **vídeo**, **inteligência artificial**, **deep learning**, **youtube**, **matemática**, portugal

**x-post** — expected: rede social, x|twitter, publicação|post
- current: fotografia
- lex-e5-visual: **publicação**, **rede social**, **x**
- lex-e5: **publicação**, **rede social**, **x**
- lex-minilm: **publicação**, **rede social**, **x**
- lexical-visual: **publicação**, **rede social**, **x**
- lexical: **publicação**, **rede social**, **x**

**wiki-nata** — expected: pastelaria|doces, sobremesa, portugal, lisboa, culinária|gastronomia, wikipedia|enciclopédia
- current: receita
- lex-e5-visual: **pastelaria**, **portugal**, **enciclopédia**, doces, **lisboa**, religião, wikipedia
- lex-e5: **pastelaria**, **portugal**, **enciclopédia**, doces, **lisboa**, religião, wikipedia
- lex-minilm: **enciclopédia**, **pastelaria**, **portugal**, wikipedia, doces, **lisboa**, religião
- lexical-visual: **pastelaria**, **enciclopédia**, **portugal**, doces, **lisboa**, religião, wikipedia
- lexical: **pastelaria**, **enciclopédia**, **portugal**, doces, **lisboa**, religião, wikipedia

**stripe-pricing** — expected: preços, pagamentos, finanças|fintech, saas|software, negócios|empresas
- current: gradiente
- lex-e5-visual: **preços**, **pagamentos**, **negócios**, **finanças**, vendas, api, criptomoedas
- lex-e5: **preços**, **pagamentos**, **negócios**, **finanças**, vendas, api, criptomoedas
- lex-minilm: **preços**, **pagamentos**, **negócios**, **finanças**, vendas, api, economia
- lexical-visual: **preços**, **pagamentos**, **negócios**, **finanças**, vendas, api, culinária
- lexical: **preços**, **pagamentos**, **negócios**, **finanças**, vendas, api, culinária

**arxiv-attention** — expected: artigo científico, inteligência artificial, machine learning|deep learning, redes neuronais, nlp|processamento de linguagem natural, tradução automática
- current: artigo
- lex-e5-visual: **artigo científico**, transformers, **tradução automática**, ciência, **machine learning**, **inteligência artificial**, arxiv
- lex-e5: **artigo científico**, transformers, **tradução automática**, ciência, **machine learning**, **inteligência artificial**, arxiv
- lex-minilm: **artigo científico**, transformers, **tradução automática**, ciência, **inteligência artificial**, **machine learning**, **redes neuronais**
- lexical-visual: **artigo científico**, transformers, **tradução automática**, ciência, **inteligência artificial**, **machine learning**, arxiv
- lexical: **artigo científico**, transformers, **tradução automática**, ciência, **inteligência artificial**, **machine learning**, arxiv

**hn-front** — expected: lista de links, notícias|notícia, tecnologia, fórum|comunidade, programação
- current: wiki
- lex-e5-visual: hacker news, **lista de links**, github, microsoft, ciência, inteligência artificial, windows
- lex-e5: hacker news, **lista de links**, github, microsoft, ciência, inteligência artificial, windows
- lex-minilm: hacker news, **lista de links**, ciência, github, inteligência artificial, microsoft, windows
- lexical-visual: hacker news, **lista de links**, ciência, github, inteligência artificial, microsoft, windows
- lexical: hacker news, **lista de links**, ciência, github, inteligência artificial, microsoft, windows

**fonts-inter** — expected: tipografia, tipo de letra|fonte, design, sans-serif, google fonts|google
- current: resultados de pesquisa
- lex-e5-visual: **google fonts**, **tipo de letra**, **sans-serif**, **tipografia**, **design**
- lex-e5: **google fonts**, **tipo de letra**, **sans-serif**, **tipografia**, **design**
- lex-minilm: **google fonts**, **tipo de letra**, google, **design**, **tipografia**, **sans-serif**
- lexical-visual: **tipo de letra**, **google fonts**, **tipografia**, **design**, **sans-serif**
- lexical: **tipo de letra**, **google fonts**, **design**, **tipografia**, **sans-serif**
