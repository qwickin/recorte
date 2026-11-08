| approach | micro P | micro R | F1 | tags/item | p50 ms | p95 ms | max ms | load ms | +RSS loaded MB | peak RSS MB | platform/threads |
|---|---|---|---|---|---|---|---|---|---|---|---|
| current | 46% | 11% | 17% | 1.1 | 53 | 64 | 64 | 235 | 154 | 542 | darwin-arm64/2t |
| lex-e5-visual | 44% | 53% | 48% | 5.7 | 216 | 1168 | 1168 | 636 | 597 | 1208 | darwin-arm64/2t |
| lex-e5 | 42% | 49% | 46% | 5.5 | 113 | 1278 | 1278 | 551 | 477 | 945 | darwin-arm64/2t |
| lex-minilm-visual | 43% | 51% | 47% | 5.6 | 164 | 1036 | 1036 | 667 | 620 | 1228 | darwin-arm64/2t |
| lex-minilm | 42% | 47% | 44% | 5.4 | 111 | 979 | 979 | 536 | 524 | 1008 | darwin-arm64/2t |
| lexical-visual | 44% | 51% | 47% | 5.5 | 71 | 390 | 390 | 135 | 149 | 566 | darwin-arm64/2t |
| lexical | 42% | 47% | 45% | 5.3 | 17 | 321 | 321 | 0 | 0 | 276 | darwin-arm64/2t |
| llm-qwen3 | 34% | 39% | 36% | 5.4 | 4242 | 4994 | 4994 | 985 | 1866 | 6557 | darwin-arm64/2t |

Per page (bold = matches the ground truth):

**h-radix-dialog** — expected: componentes ui, dialog, react, documentação, acessibilidade, modo escuro
- current: **modo escuro**
- lex-e5-visual: **dialog**, **componentes ui**, **documentação**, ui design, **react**, botão, 3d
- lex-e5: **dialog**, **componentes ui**, **documentação**, ui design, **react**, botão, 3d
- lex-minilm-visual: **dialog**, **documentação**, **componentes ui**, ui design, botão, **react**, 3d
- lex-minilm: **dialog**, **documentação**, **componentes ui**, ui design, botão, **react**, 3d
- lexical-visual: **dialog**, **documentação**, **componentes ui**, ui design, botão, **react**, 3d
- lexical: **dialog**, **documentação**, **componentes ui**, ui design, botão, **react**, 3d
- llm-qwen3: **dialog**, ui design, **react**, design, perfil, tutorial, **acessibilidade**

**h-headless-combobox** — expected: componentes ui, combobox|dropdown, react, documentação, acessibilidade
- current: modo escuro
- lex-e5-visual: **combobox**, **componentes ui**, ui design, formulário, dropdown, 3d, **react**
- lex-e5: **combobox**, **componentes ui**, ui design, formulário, dropdown, 3d, **react**
- lex-minilm-visual: **combobox**, **componentes ui**, ui design, formulário, dropdown, 3d, design
- lex-minilm: **combobox**, **componentes ui**, ui design, formulário, dropdown, 3d, design
- lexical-visual: **combobox**, **componentes ui**, ui design, formulário, dropdown, 3d, design
- lexical: **combobox**, **componentes ui**, ui design, formulário, dropdown, 3d, design
- llm-qwen3: **combobox**, ui design, input, dropdown, **react**, html, motion design

**h-mui-select** — expected: componentes ui, dropdown|combobox, react, documentação, design system|ui design, formulário
- current: repositório
- lex-e5-visual: **dropdown**, **componentes ui**, **ui design**, **react**, bolachas, lista, design
- lex-e5: **dropdown**, **componentes ui**, **ui design**, **react**, bolachas, lista, design
- lex-minilm-visual: **dropdown**, **componentes ui**, **ui design**, **react**, design, bolachas, lista
- lex-minilm: **dropdown**, **componentes ui**, **ui design**, **react**, design, bolachas, lista
- lexical-visual: **dropdown**, **componentes ui**, **ui design**, bolachas, lista, design, **react**
- lexical: **dropdown**, **componentes ui**, **ui design**, bolachas, lista, design, **react**
- llm-qwen3: **dropdown**, **componentes ui**, **ui design**, **react**, design, bolachas, lista

**h-recipe-pt** — expected: culinária|gastronomia, receita, tutorial
- current: —
- lex-e5-visual: **receita**, sobremesa, **gastronomia**, bolachas, culinária, doces, portugal
- lex-e5: **receita**, sobremesa, **gastronomia**, bolachas, culinária, doces, portugal
- lex-minilm-visual: **receita**, bolachas, **gastronomia**, sobremesa, culinária, doces, privacidade
- lex-minilm: **receita**, bolachas, **gastronomia**, sobremesa, culinária, doces, privacidade
- lexical-visual: **receita**, sobremesa, **gastronomia**, bolachas, culinária, doces, portugal
- lexical: **receita**, sobremesa, **gastronomia**, bolachas, culinária, doces, portugal
- llm-qwen3: **receita**, bolachas, **gastronomia**, sobremesa, culinária, doces, privacidade

**h-news-pt** — expected: notícia|artigo, política, portugal
- current: wiki, modo escuro
- lex-e5-visual: lisboa, segurança, **portugal**, branding, google, privacidade, direito
- lex-e5: lisboa, segurança, **portugal**, branding, google, privacidade, direito
- lex-minilm-visual: lisboa, segurança, **portugal**, privacidade, branding, google, direito
- lex-minilm: lisboa, segurança, **portugal**, privacidade, branding, google, direito
- lexical-visual: lisboa, segurança, **portugal**, branding, google, privacidade, direito
- lexical: lisboa, segurança, **portugal**, branding, google, privacidade, direito
- llm-qwen3: lisboa, opinião, **política**, guerra

**h-gh-ripgrep** — expected: repositório, github, rust, open source, cli|terminal, código
- current: **repositório**
- lex-e5-visual: **repositório**, **github**, documentação, git, windows, macos, bricolage
- lex-e5: **repositório**, **github**, documentação, git, windows, macos, bricolage
- lex-minilm-visual: **repositório**, **github**, git, windows, macos, bricolage, linux
- lex-minilm: **repositório**, **github**, git, windows, macos, bricolage, linux
- lexical-visual: **repositório**, documentação, **github**, git, windows, macos, bricolage
- lexical: **repositório**, documentação, **github**, git, windows, macos, bricolage
- llm-qwen3: **github**, git, changelog, resultados de pesquisa, **terminal**

**h-blog-jvns** — expected: blogue|artigo, eletrónica, ciclismo, bricolage, tutorial
- current: —
- lex-e5-visual: **ciclismo**, **eletrónica**, desporto
- lex-e5: **ciclismo**, **eletrónica**, desporto
- lex-minilm-visual: **ciclismo**, **eletrónica**, desporto
- lex-minilm: **ciclismo**, **eletrónica**, desporto
- lexical-visual: **ciclismo**, **eletrónica**, desporto
- lexical: **ciclismo**, **eletrónica**, desporto
- llm-qwen3: **ciclismo**, **eletrónica**, desporto, publicação, segurança, llm, **tutorial**

**h-wiki-belem** — expected: enciclopédia|wikipedia, lisboa, portugal, história, arquitetura, cultura|turismo
- current: wiki
- lex-e5-visual: **lisboa**, **enciclopédia**, **portugal**, wikipedia, **história**, **arquitetura**, guerra
- lex-e5: **lisboa**, **enciclopédia**, **portugal**, wikipedia, **história**, **arquitetura**, guerra
- lex-minilm-visual: **enciclopédia**, **lisboa**, **portugal**, wikipedia, **história**, **arquitetura**, guerra
- lex-minilm: **enciclopédia**, **lisboa**, **portugal**, wikipedia, **história**, **arquitetura**, guerra
- lexical-visual: **enciclopédia**, **lisboa**, **portugal**, wikipedia, **história**, **arquitetura**, guerra
- lexical: **enciclopédia**, **lisboa**, **portugal**, wikipedia, **história**, **arquitetura**, guerra
- llm-qwen3: **enciclopédia**, wikipedia, **história**, **arquitetura**, **cultura**, religião, self-hosting

**h-commons-photo** — expected: fotografia, natureza, plantas
- current: **fotografia**
- lex-e5-visual: wikipedia, enciclopédia
- lex-e5: wikipedia, enciclopédia
- lex-minilm-visual: linguística
- lex-minilm: linguística
- lexical-visual: —
- lexical: —
- llm-qwen3: dropdown, open source, animação, wikipedia, nlp, tradução automática, internet

**h-three-demo** — expected: 3d, webgl, animação, javascript
- current: **3d**, imagens
- lex-e5-visual: **webgl**, **animação**, **3d**, física
- lex-e5: **webgl**, **animação**, física
- lex-minilm-visual: **webgl**, **animação**, **3d**, física
- lex-minilm: **webgl**, **animação**, física
- lexical-visual: **webgl**, **animação**, **3d**, física
- lexical: **webgl**, **animação**, física
- llm-qwen3: —

**h-linear-landing** — expected: landing page, saas|software, produtividade, inteligência artificial, modo escuro
- current: **landing page**, **modo escuro**
- lex-e5-visual: produto, **inteligência artificial**, ios, arquitetura, negócios, **modo escuro**
- lex-e5: produto, **inteligência artificial**, ios, arquitetura, negócios
- lex-minilm-visual: produto, **inteligência artificial**, ios, arquitetura, negócios, **modo escuro**
- lex-minilm: produto, **inteligência artificial**, ios, arquitetura, negócios
- lexical-visual: produto, **inteligência artificial**, ios, arquitetura, negócios, **modo escuro**
- lexical: produto, **inteligência artificial**, ios, arquitetura, negócios
- llm-qwen3: produto, aplicação, **inteligência artificial**, ios, design, react, automação

**h-python-docs** — expected: documentação, python, tutorial, programação, código
- current: wiki
- lex-e5-visual: **python**, **documentação**, llm, inteligência artificial
- lex-e5: **python**, **documentação**, llm, inteligência artificial
- lex-minilm-visual: **python**, **documentação**, llm, inteligência artificial
- lex-minilm: **python**, **documentação**, llm, inteligência artificial
- lexical-visual: **python**, **documentação**, llm, inteligência artificial
- lexical: **python**, **documentação**, llm, inteligência artificial
- llm-qwen3: —
