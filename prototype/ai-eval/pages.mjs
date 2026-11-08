// Evaluation pages. `kind` mirrors the extension's capture kinds; `area` captures locate an element (CSS selector or a
// JS expression returning an element) or use a fixed viewport clip. `follow` opens the first matching link first
// (news front pages -> one article). `link` items have no screenshot: the server's own fetchLink() supplies the data.
export const PAGES = [
  {
    id: "ff-surfaces",
    url: "https://www.fluidfunctionalism.com/docs/surfaces",
    kind: "area",
    scheme: "dark",
    locate: `[...document.querySelectorAll("div")].filter(d => d.className.toString().includes("min-h-[640px]") && d.textContent.includes("Select role"))[0]`,
  },
  { id: "gh-readability", url: "https://github.com/mozilla/readability", kind: "area", scheme: "dark", selector: "article.markdown-body", maxH: 1100 },
  { id: "mdn-flexbox", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox", kind: "visible" },
  { id: "tailwind-docs", url: "https://tailwindcss.com/docs/flex-direction", kind: "visible", scheme: "dark" },
  { id: "shadcn-combobox", url: "https://ui.shadcn.com/docs/components/combobox", kind: "visible", scheme: "dark" },
  { id: "motion-docs", url: "https://motion.dev/docs/react-animation", kind: "visible" },
  { id: "news-guardian", url: "https://www.theguardian.com/science", follow: "a[href*='/science/2026/'], a[href*='/science/20']", kind: "visible" },
  { id: "news-publico", url: "https://www.publico.pt/ciencia", follow: "a[href*='/2026/'] , a[href*='/noticia/']", kind: "visible" },
  { id: "recipe-allrecipes", url: "https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/", kind: "visible" },
  { id: "map-osm", url: "https://www.openstreetmap.org/#map=15/38.7110/-9.1366", kind: "area", wait: 4000, clip: { x: 520, y: 180, width: 720, height: 560 } },
  { id: "product-ikea", url: "https://www.ikea.com/us/en/p/billy-bookcase-white-00263850/", kind: "visible" },
  { id: "product-apple", url: "https://www.apple.com/macbook-air/", kind: "visible" },
  { id: "design-dribbble", url: "https://dribbble.com/shots/popular/web-design", kind: "visible" },
  { id: "video-youtube", url: "https://www.youtube.com/watch?v=aircAruvnKk", kind: "visible", wait: 3000 },
  { id: "x-post", url: "https://x.com/jack/status/20", kind: "link" },
  { id: "wiki-nata", url: "https://en.wikipedia.org/wiki/Pastel_de_nata", kind: "area", selector: ".infobox", maxH: 1300 },
  { id: "stripe-pricing", url: "https://stripe.com/pricing", kind: "visible" },
  { id: "arxiv-attention", url: "https://arxiv.org/abs/1706.03762", kind: "area", selector: "#abs", maxH: 900 },
  { id: "hn-front", url: "https://news.ycombinator.com/", kind: "full", maxH: 2600 },
  { id: "fonts-inter", url: "https://fonts.google.com/specimen/Inter", kind: "visible", wait: 2500 },
];
