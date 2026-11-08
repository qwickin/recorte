// Held-out pages: captured and labelled AFTER the tagger was frozen (commit 203ff9f); never used for tuning.
export const PAGES = [
  { id: "h-radix-dialog", url: "https://www.radix-ui.com/primitives/docs/components/dialog", kind: "visible", scheme: "dark" },
  { id: "h-headless-combobox", url: "https://headlessui.com/react/combobox", kind: "visible" },
  { id: "h-mui-select", url: "https://mui.com/material-ui/react-select/", kind: "visible" },
  { id: "h-recipe-pt", url: "https://www.pingodoce.pt/receitas/", follow: "a[href*='/receitas/'][href$='/']:not([href$='/receitas/'])", kind: "visible" },
  { id: "h-news-pt", url: "https://observador.pt/seccao/politica/", follow: "a[href*='observador.pt/2026/']", kind: "visible" },
  { id: "h-gh-ripgrep", url: "https://github.com/BurntSushi/ripgrep", kind: "area", selector: "article.markdown-body", maxH: 1100 },
  { id: "h-blog-jvns", url: "https://jvns.ca/", follow: "a[href*='/blog/20']", kind: "visible" },
  { id: "h-wiki-belem", url: "https://pt.wikipedia.org/wiki/Torre_de_Bel%C3%A9m", kind: "visible" },
  { id: "h-commons-photo", url: "https://commons.wikimedia.org/wiki/Main_Page", kind: "image", selector: "#mainpage-potd img", maxH: 1400 },
  { id: "h-three-demo", url: "https://threejs.org/examples/#webgl_animation_keyframes", kind: "visible", wait: 4000 },
  { id: "h-linear-landing", url: "https://linear.app/", kind: "visible" },
  { id: "h-python-docs", url: "https://docs.python.org/3/tutorial/introduction.html", kind: "visible" },
];
