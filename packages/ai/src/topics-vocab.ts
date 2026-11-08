// Curated tag vocabulary for text-based tagging (the closed set the AI may emit; spec §5).
// One line per tag:  group | pt-PT name | English synonyms (search + matching) | extra aliases (matching)
// - Aliases are matched as whole words, accent- and case-insensitive, with an optional plural "s"/"es".
// - "=Alias": case-sensitive (ambiguous words: "React", "Go", "Swift"…).
// - "~alias": indexed for search only, never used to detect the tag (too generic to be evidence).
// Groups:
//   tipo        content type (at most one is emitted)
//   componente  UI component names: only emitted on pages about UI components/design systems (no UI-chrome noise)
//   tech, design, tema, lugar, plataforma: topics
export type TopicGroup = "tipo" | "componente" | "tech" | "design" | "tema" | "lugar" | "plataforma";

export const TOPICS_RAW = `
tipo|documentação|documentation,docs|api reference,reference,guia de referência,manual,getting started,installation
tipo|tutorial|tutorial,how-to,guide|passo a passo,how to,step by step,aprende,aprender
tipo|artigo|blog post|~post,~story,~article
tipo|notícia|news,news article|notícias,breaking news,jornal,newspaper,última hora,reportagem
tipo|opinião|opinion,editorial|crónica,coluna,op-ed
tipo|entrevista|interview|entrevistado,interviewed
tipo|análise|review|reviews,avaliação,crítica,hands-on
tipo|comparação|comparison|versus,vs,comparativo,compared
tipo|enciclopédia|encyclopedia,wiki|wiki,from wikipedia
tipo|artigo científico|scientific paper,research paper,paper,preprint|abstract,arxiv,peer-reviewed,journal article,doi
tipo|repositório|repository,repo,code repository|pull requests,commits,readme,branches,clone
tipo|código|source code,code snippet|snippet,~code
tipo|lista de links|link list,link aggregator|agregador
tipo|mapa|map|maps,mapas,street map,openstreetmap,google maps,localização,location
tipo|gráfico|chart,graph,plot|charts,gráficos,bar chart,line chart,pie chart
tipo|tabela|table,data table|tabelas,spreadsheet table
tipo|loja|online store,shop,e-commerce|add to cart,adicionar ao carrinho,carrinho,shopping bag,buy now,comprar,checkout,in stock
tipo|produto|product,product page|ficha de produto,tech specs,especificações
tipo|receita|recipe|receitas,ingredients,ingredientes,modo de preparação,directions,prep time,cook time,servings,doses
tipo|banda desenhada|comic,comics,webcomic|bd,quadradinhos,manga
tipo|galeria|gallery,image grid|galerias,portfolio grid
tipo|fotografia|photo,photograph,photography|fotografias,fotos,photographer,fotógrafo
tipo|ilustração|illustration,drawing|ilustrações,desenho,illustrator
tipo|dashboard|dashboard,admin panel|painel,analytics dashboard,métricas
tipo|formulário|form,sign-up form|formulários,sign up,inscrição,contact form
tipo|rede social|social media,social network|social,tweet,tweets,followers,seguidores,timeline
tipo|publicação|post,social media post|postar,repost,retweet,status update
tipo|vídeo|video|vídeos,videos,watch,views,subscribers,subscrever,trailer,episódio,episode
tipo|podcast|podcast|podcasts,episode,listen,ouvir
tipo|conversa|chat,conversation|mensagens,messages,chat log
tipo|email|email,inbox,newsletter|e-mail,emails,caixa de correio,newsletters
tipo|resultados de pesquisa|search results|search engine results,resultados
tipo|preços|pricing,price,prices,plans|preço,tarifas,planos,per month,por mês,subscription,assinatura,free trial
tipo|diagrama|diagram,flowchart|diagramas,fluxograma,architecture diagram,schema
tipo|apresentação|presentation,slides,slide deck|slides,diapositivos,keynote
tipo|calendário|calendar,schedule|agenda,horário,calendários
tipo|folha de cálculo|spreadsheet|excel,google sheets,folhas de cálculo
tipo|terminal|terminal,command line,shell|bash,zsh,console,linha de comandos,cli
tipo|landing page|landing page,homepage,marketing site|hero,get started,sign up free,start for free
tipo|portefólio|portfolio|portfolio,case study,case studies,selected work
tipo|currículo|resume,cv|curriculum vitae,curriculo
tipo|curso|course,online course|cursos,lessons,lições,aulas
tipo|fórum|forum,discussion board|discussion,thread,threads,replies,respostas,upvote
tipo|blogue|blog|blog,blogs,blogger
tipo|livro|book|livros,books,ebook,isbn,~chapter,~capítulo,~author,~autor
tipo|evento|event,conference|eventos,conferência,meetup,festival,tickets,bilhetes,workshop
tipo|oferta de emprego|job posting,job offer|vagas,vaga,hiring,careers,recrutamento,candidatar
tipo|changelog|changelog,release notes|novidades da versão,what's new,~version,~release
tipo|template|template,theme,starter kit|templates,temas,boilerplate,starter
tipo|jogo|game,video game|jogar,play now,gameplay
tipo|aplicação|app,application|apps,aplicações,download on the app store,google play
tipo|perfil|profile,user profile|biografia,bio,followers
tipo|citação|quote,quotation|citações,quotes
tipo|lista|list,listicle|top 10,best of,os melhores
tipo|documento|pdf|documentos,pdf,relatório,report,whitepaper,~document
tipo|meteorologia|weather,forecast|tempo,previsão do tempo,temperatura,chuva,weather forecast
componente|componentes ui|ui components,ui component,component library|components,componentes,component,ui kit,primitives,headless
componente|dialog|dialog,modal|modal,modais,dialogs,dialog box,caixa de diálogo,alert dialog,popup
componente|dropdown|dropdown,select,dropdown menu|dropdowns,select menu,menu suspenso,picker,listbox
componente|combobox|combobox,autocomplete|comboboxes,typeahead,autocompletar,autocomplete input
componente|botão|button,buttons|botões,button group,icon button
componente|tabs|tabs,tab bar|separadores,abas,tab panel
componente|tooltip|tooltip,hint|tooltips,dica
componente|accordion|accordion,collapsible|acordeão,collapsible
componente|carrossel|carousel,slider|carousels,carrosséis,slideshow
componente|date picker|date picker,calendar picker|seletor de data,datepicker
componente|toggle|toggle,switch|interruptor,switches,toggles
componente|toast|toast,notification,snackbar|toasts,notificação
componente|navegação|navigation,navbar,menu|sidebar,breadcrumb,navigation menu
componente|cartão|card,cards|cartões
componente|avatar|avatar,avatars|avatares
componente|input|input,text field,text input|campo de texto,inputs,text area,textarea
componente|checkbox|checkbox,radio button|checkboxes,radio group,caixa de seleção
componente|slider|slider,range|sliders,range slider
componente|popover|popover,dropdown panel|popovers
componente|command palette|command palette,command menu|⌘k,cmd+k,command
design|design|design|designer,designers,designed,~designs
design|ui design|ui design,user interface,ui|interface,interfaces,interface de utilizador,user interfaces,~ui
design|ux|ux,user experience|experiência de utilizador,usabilidade,usability,user research
design|web design|web design,website design|websites,landing pages,site design,web designer
design|design system|design system,design systems|design tokens,tokens,sistema de design,style guide,guia de estilo
design|tokens de design|design tokens,tokens|token,css variables,variáveis css
design|sombras|shadows,box shadow,elevation|sombra,shadow,elevação,elevation
design|modo escuro|dark mode,dark theme|tema escuro
design|tipografia|typography,type design|typeface,typefaces,lettering,kerning,leading,type scale
design|tipo de letra|font,typeface,font family|fonte,fontes,fonts,tipos de letra,variable font,glyphs,weights
design|sans-serif|sans-serif,sans serif,grotesk|grotesque,neo-grotesque
design|serif|serif,serif font|serifa,serifas
design|monospace|monospace,monospaced font|mono,monoespaçada
design|cor|color,colour,color palette|cores,paleta,palette,colors,colours,paleta de cores,color picker
design|gradiente|gradient|gradientes,gradients
design|ícones|icons,iconography|ícone,icon set,icon,iconografia
design|logótipo|logotype|logótipos,logotipo,~logo,~logos
design|branding|branding,brand identity|marca,identidade visual,visual identity,brand
design|motion design|motion design,motion graphics|motion,microinteractions,microinterações
design|figma|figma|figma file,figma community,figjam
design|protótipo|prototype,prototyping|protótipos,prototypes,mockup,mockups
design|wireframe|wireframe,wireframes|wireframing,esboço
design|minimalismo|minimalism,minimalist|minimalista,minimal
design|layout|layout,page layout|layouts,grelha,grid layout,alignment,alinhamento,spacing,espaçamento
design|responsivo|responsive design,responsive|responsive,mobile-first,breakpoints,media queries
design|acessibilidade|accessibility,a11y|accessible,acessível,aria,screen reader,wcag,contrast
design|inspiração|inspiration,design inspiration|inspirações,inspire,inspiring,showcase,trending,popular designs,curated
design|design gráfico|graphic design|graphic designer,poster,cartaz,print design
design|design de produto|product design|product designer
design|design de interiores|interior design|interiores,interior,decor
design|arquitetura|architecture,architect|arquiteto,arquitetos,edifício,building,buildings
design|animação|animation,animations|animações,animate,animated,keyframes,transitions,transições,gestures,spring,easing,tween
design|3d|3d,3d graphics|three-dimensional,render,rendering,blender,modelação 3d
design|ilustração digital|digital illustration|digital art,arte digital
design|ui kit|ui kit,component kit|ui kits
design|dribbble|dribbble|dribbble shots
design|behance|behance|~behance
design|awwwards|awwwards|site of the day
tech|programação|programming,software development,coding|programar,programador,developer,developers,código-fonte,dev
tech|desenvolvimento web|web development,web dev|frontend,front-end,backend,back-end,full-stack,fullstack,web developer,webdev
tech|frontend|frontend,front-end|front end,client-side
tech|backend|backend,back-end,server-side|servidor,server
tech|javascript|javascript,js|ecmascript,=JS,vanilla js,node
tech|typescript|typescript,ts|=TS,type-safe,typed
tech|python|python|pip,django,pandas,numpy,=PyPI
tech|rust|rust,rustlang|cargo,crate,crates
tech|go|go,golang|golang,=Go
tech|java|java|jvm,spring boot,=Java
tech|kotlin|kotlin|=Kotlin
tech|swift|swift,swiftui|swiftui,=Swift
tech|c++|c++,cpp|cplusplus
tech|c#|c#,csharp,.net|dotnet,.net
tech|php|php|laravel,composer,wordpress
tech|ruby|ruby,ruby on rails|rails,=Ruby
tech|elixir|elixir|phoenix,erlang
tech|sql|sql|
tech|html|html,html5|markup,semantic html
tech|css|css,css3|stylesheet,stylesheets,cascading style sheets,css property,css properties
tech|flexbox|flexbox,flex layout|flex,flex-direction,flex container,flex items,flex-wrap,justify-content,align-items
tech|css grid|css grid,grid layout|grid-template,grid-template-columns,grid container
tech|sass|sass,scss|=Sass
tech|tailwind css|tailwind css,tailwind|tailwindcss,tailwind,utility classes,utility-first
tech|bootstrap|bootstrap|=Bootstrap
tech|react|react,react.js|=React,reactjs,jsx,react hooks,usestate,useeffect,react components
tech|vue|vue,vue.js|vuejs,=Vue,nuxt
tech|angular|angular|=Angular,angularjs
tech|svelte|svelte|sveltekit
tech|next.js|next.js,nextjs|nextjs,next.js,=Next.js,app router
tech|astro|astro|=Astro,astro.build
tech|node.js|node.js,nodejs|nodejs,node.js,npm,=Node
tech|deno|deno|=Deno
tech|bun|bun|=Bun,bun.sh
tech|npm|npm,package manager|npm install,package.json,pnpm,yarn
tech|vite|vite|=Vite,vitejs
tech|webassembly|webassembly,wasm|wasm
tech|graphql|graphql|=GraphQL
tech|api|api,rest api,web api|apis,endpoint,endpoints,webhooks
tech|docker|docker|dockerfile,docker compose
tech|kubernetes|kubernetes,k8s|helm,kubectl
tech|linux|linux|ubuntu,debian,arch linux,fedora,kernel
tech|macos|macos|mac os,os x,=macOS
tech|windows|windows|=Windows,windows 11
tech|ios|ios,iphone app|=iOS,ipados
tech|android|android|=Android,apk
tech|git|git,version control|commit,commits,branch,merge,rebase,controle de versões
tech|github|github|=GitHub,github actions,github.com
tech|gitlab|gitlab|=GitLab
tech|base de dados|database,databases|bases de dados,db,dbms
tech|postgresql|postgresql,postgres|=Postgres
tech|sqlite|sqlite|=SQLite
tech|mysql|mysql|mariadb
tech|mongodb|mongodb|=MongoDB
tech|redis|redis|=Redis
tech|cloud|cloud,cloud computing|nuvem,computação em nuvem,cloud hosting
tech|aws|aws,amazon web services|=AWS,s3,ec2,lambda
tech|cloudflare|cloudflare|=Cloudflare,workers
tech|vercel|vercel|=Vercel
tech|serverless|serverless|edge functions,faas
tech|devops|devops,ci/cd|continuous integration,deploy,deployment,pipelines
tech|testes|testing,tests,unit tests|testes unitários,test suite,vitest,jest,playwright,e2e
tech|segurança informática|cybersecurity,security,infosec|segurança,vulnerabilidade,vulnerability,exploit,malware,hacking,phishing,cve
tech|criptografia|cryptography,encryption|encriptação,cifra,encrypted
tech|privacidade|privacy|dados pessoais,rgpd,gdpr,tracking,rastreamento
tech|open source|open source,open-source|código aberto,open-source,licença mit,mit license,apache license,contributors,free software
tech|biblioteca|library,software library|libraries,bibliotecas,lib,package,pacote
tech|framework|framework,frameworks|frameworks
tech|cli|cli,command-line tool|command-line,linha de comandos
tech|vs code|vs code,visual studio code|vscode,=VS Code
tech|inteligência artificial|artificial intelligence,ai|=AI,=IA,inteligência artificial,ia generativa,generative ai,ai-powered
tech|machine learning|machine learning,ml|aprendizagem automática,aprendizado de máquina,model training,treino,training data
tech|deep learning|deep learning|aprendizagem profunda,deep neural
tech|redes neuronais|neural networks,neural network|rede neuronal,redes neurais,neurons,neurónios,layers,perceptron
tech|llm|llm,large language model|llms,language model,language models,modelo de linguagem,gpt,chatgpt,claude,gemini,prompt
tech|nlp|nlp,natural language processing|processamento de linguagem natural,linguagem natural,text processing,tokenization
tech|tradução automática|machine translation|translation,tradução,translate
tech|visão computacional|computer vision|image recognition,reconhecimento de imagem,object detection
tech|transformers|transformer,transformers|attention mechanism,self-attention,attention,encoder-decoder
tech|ciência de dados|data science,data analysis|análise de dados,dataset,datasets,big data,data scientist
tech|estatística|statistics|estatísticas,statistical,probabilidade,probability
tech|blockchain|blockchain|web3,smart contract,ethereum
tech|criptomoedas|cryptocurrency,crypto|bitcoin,criptomoeda,cripto,ethereum,nft
tech|hardware|hardware|processador,processor,cpu,ssd
tech|portátil|laptop,notebook|portáteis,laptops,macbook,ultrabook,computador portátil
tech|smartphone|smartphone,phone|telemóvel,telemóveis,iphone,pixel,galaxy
tech|tablet|tablet|ipad,tablets
tech|mac|mac|=Mac,macbook,imac,mac mini,mac studio,macbook air,macbook pro
tech|gpu|gpu,graphics card|placa gráfica,nvidia,cuda,=GPU
tech|robótica|robotics|robot,robots,robô,robôs
tech|iot|iot,internet of things|internet das coisas,smart home,casa inteligente
tech|redes|networking,computer networks|tcp,dns,ip address,router
tech|internet|internet,web|world wide web,online,~web
tech|browser|browser,web browser|navegador,=Chrome,=Firefox,=Safari
tech|performance|performance,web performance|desempenho,velocidade,speed,optimization,otimização,core web vitals
tech|seo|seo,search engine optimization|ranking,google search,serp
tech|analytics|analytics,web analytics|google analytics,métricas,metrics,tracking
tech|svg|svg,vector graphics|=SVG,vetorial,vector
tech|webgl|webgl,canvas,three.js|three.js,threejs,shaders,shader,glsl,webgpu
tech|desenvolvimento de jogos|game development,gamedev|unity,unreal engine,godot,game engine
tech|realidade virtual|virtual reality,vr|=VR,realidade aumentada,augmented reality,=AR,vision pro,quest
tech|impressão 3d|3d printing|3d printer,impressora 3d,filament
tech|eletrónica|electronics|arduino,raspberry pi,circuit,circuito,pcb,soldering
tech|self-hosting|self-hosting,self-hosted|self-hosted,homelab,home server,servidor caseiro,nas
tech|automação|automation|automações,workflow automation,zapier,scripts
tech|no-code|no-code,low-code|nocode,lowcode,sem código
tech|software|software|programa,programas,application software,~app
tech|saas|saas,software as a service|subscription software,b2b software
tech|produtividade|productivity|produtivo,workflow,to-do,notes,notas
tech|markdown|markdown|=Markdown,md
tech|algoritmos|algorithms,algorithm|algoritmo,estruturas de dados,data structures,complexity
tech|sistemas operativos|operating systems|sistema operativo,kernel
tech|extensão de browser|browser extension|chrome extension,extensões,add-on,addon,web extension
tech|tecnologia|technology,tech|tecnológico,tecnológica,tecnologias,technologies,gadgets
design|fotografia de produto|product photography|packshot
tema|ciência|science|científico,científica,cientistas,scientists,scientific,research,study,estudo
tema|investigação|research,study|investigação,investigadores,researchers,estudo,study,findings,descobriram,published in,journal
tema|física|physics|físico,quantum,quântica,particle,partículas,relatividade
tema|química|chemistry|químico,químicos,molecules,moléculas,reação química
tema|biologia|biology|biológico,células,cells,evolução,evolution,dna,genes
tema|genética|genetics|genético,genome,genoma,dna,gene
tema|astronomia|astronomy|nasa,esa,planeta,planet,galáxia,galaxy,telescópio
tema|matemática|mathematics,math,maths|matemático,mathematical,equations,equações,calculus,cálculo,álgebra,linear algebra,geometry
tema|medicina|medicine,medical|médico,médicos,clínico,clinical,doctors,tratamento,treatment,therapy,terapia
tema|saúde|health,healthcare|saudável,healthy,doença,doenças,disease,pacientes,patients,cuidados de saúde
tema|medicamentos|drugs,medication,pharmaceuticals|medicamento,fármacos,fármaco,medicação,pharma,drug
tema|diabetes|diabetes|diabético,diabéticos,insulina,insulin
tema|obesidade|obesity|obeso,obesos,overweight,excesso de peso,perda de peso,weight loss
tema|nutrição|nutrition,diet|dieta,nutricional,calorias,calories,proteína,protein,alimentação saudável
tema|fitness|fitness,exercise,workout|exercício,treino,ginásio,gym,musculação
tema|psicologia|psychology|psicológico,psychologists,psicólogos,behaviour,behavior,comportamento,cognitive,cognitivo
tema|saúde mental|mental health|ansiedade,anxiety,depressão,depression,stress,burnout,terapia
tema|neurociência|neuroscience|cérebro,brain,neurónios,neurons,neural
tema|sono|sleep|dormir,insónia,insomnia
tema|ambiente|environment|ambiental,environmental,ecologia,ecology,poluição,pollution,biodiversidade
tema|alterações climáticas|climate change,climate crisis|aquecimento global,global warming,clima,emissões,emissions,carbono,co2
tema|energia|energy|energia solar,solar,eólica,wind power,renováveis,renewables,baterias,nuclear
tema|sustentabilidade|sustainability|sustentável,sustainable,reciclagem,recycling
tema|natureza|nature|natural,paisagem,landscape,floresta,forest,montanha,mountains
tema|animais|animals,wildlife|animal,vida selvagem,espécies,species
tema|plantas|plants,gardening|jardinagem,jardim,garden,flores,flowers
tema|cartografia|cartography,maps|cartográfico,geografia,geography,gis,map data,openstreetmap,mapping
tema|geografia|geography|geográfico,regiões,regions
tema|história||histórico,historical,século,century,antiga,ancient,medieval,~history
tema|arqueologia|archaeology|arqueólogos,arqueológico,escavação
tema|filosofia|philosophy|filósofo,philosopher,ética,ethics
tema|religião|religion|religioso,religious,igreja,church,mosteiro,monastery,convento
tema|política|politics|político,políticos,governo,government,parlamento,parliament,eleições,elections,partido
tema|eleições|elections|eleição,election,votos,votes,presidenciais,sondagens,polls
tema|economia|economy,economics|económico,economic,inflação,inflation,pib,gdp,mercado,market
tema|finanças|finance,financial|financeiro,financeira,fintech,dinheiro,money,banking,banca,banco,bank
tema|investimento|investing,investment|investimentos,ações,stocks,bolsa,stock market,etf,portfólio de investimento
tema|pagamentos|payments,payment processing|pagamento,payment,cartões,cards,cartão de crédito,credit card,checkout,faturação,billing,invoices
tema|negócios|business|empresa,empresas,companies,company,negócio,enterprise,b2b,startup
tema|startups|startups,startup|startup,founders,fundadores,venture capital,funding,y combinator
tema|marketing|marketing|publicidade,advertising,ads,campanha,campaign,growth
tema|vendas|sales|vender,sell,selling,descontos,discounts,promoção,deals
tema|e-commerce|e-commerce,ecommerce,online shopping|comércio eletrónico,online store,loja online,shopify
tema|emprego|jobs,careers|carreira,career,trabalho,work,salário,salary,remote work,teletrabalho
tema|educação|education|ensino,escola,school,alunos,students,professores,teachers,aprendizagem
tema|universidade|university|universidades,academic,académico,faculdade,college,phd,doutoramento
tema|direito|law,legal|lei,leis,tribunal,court,justiça,justice,advogados,lawyers
tema|guerra|war,conflict|guerra,conflito,militar,military,defesa,defense,exército
tema|sociedade|society|sociedade,cidadãos
tema|comunicação|communication,conversation|conversa,conversas,conversation,conversations,diálogo,dialogue,linguagem,discurso,speech
tema|linguística|linguistics|idioma,idiomas,língua,gramática,grammar,vocabulário,~language,~languages
tema|cultura|culture|cultural,património,heritage
tema|arte|art|artista,artist,artists,pintura,painting,museu,museum,exposição,exhibition
tema|música|music|músico,musician,álbum,album,canção,song,songs,concerto,concert,spotify
tema|cinema|cinema,film,movies|filme,filmes,film,movie,realizador,director,trailer
tema|séries|tv series,tv shows|série,séries,tv,televisão,netflix,streaming
tema|literatura|literature,books|livros,books,romance,novel,poesia,poetry,escritor,writer
tema|videojogos|video games,gaming|jogos,games,gaming,playstation,xbox,nintendo,steam
tema|desporto|sports|desportos,sport,atleta,athletes,campeonato,championship
tema|futebol|football,soccer|futebolista,golo,goal,liga,league,benfica,porto,sporting
tema|ciclismo|cycling|bicicleta,bicicletas,bike,bikes,cyclist
tema|corrida|running|maratona,marathon,runners,corredores
tema|viagens|travel|viagem,viajar,trip,trips,turismo,tourism,destinations,destinos
tema|turismo|tourism|turistas,tourists,hotel,hotéis,hotels,alojamento
tema|gastronomia|gastronomy,food|comida,food,restaurante,restaurant,restaurantes,cuisine,cozinha
tema|culinária|cooking,cuisine|cozinhar,cook,baking,bake,assar,forno,oven,cozinha
tema|sobremesa|dessert,desserts|sobremesas,doce,dessert,sweet,sweets
tema|pastelaria|pastry,pastries,bakery|pastéis,pastel,padaria,tarte,tart,tarts,bolos
tema|doces|sweets,confectionery|doce,açúcar,sugar,sweet
tema|bolachas|cookies,biscuits|bolacha,biscoitos,cookie,biscuit
tema|bolo|cake,cakes|bolos,cupcakes,cheesecake
tema|pão|bread|pães,padaria,sourdough,massa-mãe,baguette
tema|chocolate|chocolate|cacau,cocoa
tema|café|coffee|espresso,cafés,barista,cafetaria
tema|vinho|wine|vinhos,wines,vinha,vineyard,adega
tema|cerveja|beer|cervejas,beers,brewery,cervejaria
tema|vegetariano|vegetarian,vegan|vegan,vegano,vegana,plant-based
tema|carne|meat|carnes,beef,frango,chicken,porco,pork,bife,steak
tema|peixe|fish,seafood|peixes,marisco,bacalhau,sardinha,salmão,salmon
tema|cozinha portuguesa|portuguese cuisine,portuguese food|comida portuguesa,cozinha tradicional portuguesa
tema|casa|home,house|lar,casas,houses,home decor
tema|decoração|home decor,decoration|decorar,decor,decorativo,interiores
tema|mobiliário|furniture|móveis,móvel,furnishing,sofá,sofa,cadeira,chair,mesa,table,estante,armário,cabinet,bed,cama
tema|estante|bookcase,bookshelf,shelving|estantes,bookcases,bookshelves,shelves,prateleiras,shelf
tema|iluminação|lighting,lamps|candeeiro,candeeiros,lamp,lâmpada,luzes
tema|bricolage|diy,home improvement|faça você mesmo,do it yourself,ferramentas,tools
tema|imobiliário|real estate|imóveis,apartamento,apartment,casas à venda,arrendamento,rent
tema|automóveis|cars,automotive|carro,carros,car,automóvel,veículo,vehicle,tesla
tema|carros elétricos|electric vehicles,ev|veículos elétricos,electric car,carregamento,charging
tema|transportes|transportation,transport|transporte,mobilidade,mobility,metro,autocarro,bus
tema|aviação|aviation|avião,aviões,airplane,aircraft,aeroporto,airport,voos,flights
tema|comboios|trains,railways|comboio,train,ferrovia,railway,cp
tema|moda|fashion|roupa,clothes,clothing,vestuário,estilo,style
tema|beleza|beauty|maquilhagem,makeup,skincare,cosmética,cosmetics
tema|família||famílias,pais,parents,filhos,children,~family
tema|crianças|children,kids|criança,kids,infantil,bebé,baby
tema|animais de estimação|pets|cão,cães,dog,dogs,gato,gatos,cat,cats,pet
tema|humor|humor,comedy|piada,piadas,jokes,funny,engraçado,meme,memes
tema|segurança|safety,security|seguro,emergência,emergency
tema|agricultura|agriculture,farming|agrícola,quinta,farm,colheita,harvest
tema|oceanos|oceans,marine|oceano,ocean,mar,sea,marinho
tema|espaço|space exploration|nasa,spacex,rocket,foguetão,satélite,satellite,mars,marte
lugar|portugal|portugal,portuguese|português,portuguesa,portugueses,portuguese,pt
lugar|lisboa|lisbon|lisboa,lisbon,belém,belem,alfama,baixa,chiado,tejo
lugar|porto|porto,oporto|=Porto,invicta,douro
lugar|coimbra|coimbra|=Coimbra
lugar|braga|braga|=Braga
lugar|algarve|algarve|faro,lagos,albufeira
lugar|madeira|madeira|funchal,=Madeira
lugar|açores|azores|açores,azores,são miguel,ponta delgada
lugar|sintra|sintra|=Sintra
lugar|espanha|spain|espanhol,spanish,madrid,barcelona
lugar|frança|france|francês,french,paris
lugar|reino unido|united kingdom,uk,britain|britânico,british,londres,london,england,inglaterra
lugar|alemanha|germany|alemão,german,berlim,berlin
lugar|itália|italy|italiano,italian,roma,rome
lugar|estados unidos|united states,usa,us|americano,american,eua,new york,nova iorque,california,washington
lugar|brasil|brazil|brasileiro,brazilian,são paulo,rio de janeiro
lugar|japão|japan|japonês,japanese,tóquio,tokyo
lugar|china|china|chinês,chinese,pequim,beijing
lugar|índia|india|indiano,indian
lugar|europa|europe|europeu,european,união europeia,european union,ue,eu
lugar|ucrânia|ukraine|ucraniano,ukrainian,kyiv,kiev
lugar|rússia|russia|russo,russian,moscovo,moscow
lugar|áfrica|africa|africano,african
lugar|cidade|city,urban|cidades,cities,urbano,urbanismo,urban planning,ruas,streets,bairro,neighbourhood
plataforma|youtube|youtube|=YouTube,youtube.com,youtuber
plataforma|x|x,twitter|twitter,tweet,tweets,x.com
plataforma|instagram|instagram|=Instagram,reels
plataforma|facebook|facebook|=Facebook
plataforma|tiktok|tiktok|=TikTok
plataforma|linkedin|linkedin|=LinkedIn
plataforma|reddit|reddit|=Reddit,subreddit
plataforma|hacker news|hacker news|=HN,ycombinator,news.ycombinator
plataforma|wikipedia|wikipedia|wikipédia,=Wikipedia,from wikipedia
plataforma|stack overflow|stack overflow|stackoverflow
plataforma|medium|medium|=Medium
plataforma|substack|substack|=Substack
plataforma|notion|notion|=Notion
plataforma|google|google|=Google
plataforma|google fonts|google fonts|fonts.google
plataforma|apple|apple|=Apple,apple intelligence,apple store
plataforma|microsoft|microsoft|=Microsoft
plataforma|amazon|amazon|=Amazon
plataforma|meta|meta|=Meta,facebook
plataforma|nvidia|nvidia|=NVIDIA,=Nvidia
plataforma|openai|openai|=OpenAI,chatgpt
plataforma|anthropic|anthropic|=Anthropic,claude
plataforma|mozilla|mozilla|=Mozilla,firefox
plataforma|openstreetmap|openstreetmap,osm|=OSM
plataforma|spotify|spotify|=Spotify
plataforma|netflix|netflix|=Netflix
plataforma|arxiv|arxiv|arxiv.org
`;

// Parent tags: a strong child implies its parent (scored at a fraction of the child's score).
export const TOPIC_PARENTS_RAW = `
receita>culinária
cozinha portuguesa>culinária,portugal
pastelaria>doces
bolachas>doces
bolo>doces
chocolate>doces
sobremesa>doces
deep learning>machine learning,inteligência artificial
machine learning>inteligência artificial
redes neuronais>inteligência artificial
llm>inteligência artificial
nlp>inteligência artificial
visão computacional>inteligência artificial
transformers>inteligência artificial
tradução automática>inteligência artificial
openai>inteligência artificial
anthropic>inteligência artificial
react>javascript
vue>javascript
angular>javascript
svelte>javascript
next.js>react
node.js>javascript
deno>javascript
bun>javascript
typescript>javascript
npm>javascript
tailwind css>css
flexbox>css
css grid>css
sass>css
bootstrap>css
repositório>código
github>git
gitlab>git
design system>ui design
componentes ui>ui design
ui kit>ui design
dribbble>design,inspiração
behance>design,inspiração
awwwards>web design,inspiração
web design>design
ui design>design
tipo de letra>tipografia
sans-serif>tipo de letra
serif>tipo de letra
monospace>tipo de letra
google fonts>tipo de letra
lisboa>portugal
porto>portugal
coimbra>portugal
braga>portugal
algarve>portugal
madeira>portugal
açores>portugal
sintra>portugal
diabetes>saúde
obesidade>saúde
saúde mental>saúde
medicamentos>medicina
medicina>saúde
psicologia>ciência
física>ciência
química>ciência
biologia>ciência
astronomia>ciência
neurociência>ciência
genética>ciência
pagamentos>finanças
investimento>finanças
criptomoedas>finanças
startups>negócios
portátil>hardware
smartphone>hardware
tablet>hardware
mac>apple,hardware
futebol>desporto
ciclismo>desporto
corrida>desporto
estante>mobiliário
mobiliário>casa
decoração>casa
carros elétricos>automóveis
wikipedia>enciclopédia
youtube>vídeo
`;
