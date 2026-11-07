// Builds dist-embed/inline.html: a ~6 KB page for T3's inline preview. The preview inlines local images but
// not scripts, so the app bundle travels inside an SVG and is unpacked synchronously in the browser.
import { readFile, writeFile } from "node:fs/promises";

const DIST = new URL("../dist-embed/", import.meta.url);
const SHOTS = new URL("../public/shots/", import.meta.url).pathname;
const html = await readFile(new URL("index.html", DIST), "utf8");
const css = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const js = html.match(/<script type="module"[^>]*>([\s\S]*)<\/script>/)[1];
if (/<\/script/i.test(js)) throw new Error("bundle contains </script>; escape it before inlining");
const importMap = html.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
const fonts = html.match(/<link href="https:\/\/fonts\.googleapis[^>]*>/)[0];
const data = JSON.parse(await readFile(new URL("../src/data/captures.json", import.meta.url), "utf8"));

const payload = Buffer.from(JSON.stringify({ css, js })).toString("base64");
await writeFile(new URL("bundle.svg", DIST), `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><desc id="p">${payload}</desc></svg>`);

// Parser-inserted module (document.write) => the page's load event waits for the app to boot.
const loader = String.raw`<script>
(() => {
  const uri = document.getElementById("bundle").getAttribute("src");
  const svg = atob(uri.slice(uri.indexOf(",") + 1));
  const b64 = svg.slice(svg.indexOf('<desc id="p">') + 13, svg.indexOf("<\/desc>"));
  const { css, js } = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  document.write("<style>" + css + "<\/style>");
  document.write('<script type="module">' + js + "<\/script>");
})();
</script>`;

const shots = data.map((c) => `<img hidden alt="" data-shot="${c.id}" src="${SHOTS}${c.id}-t.webp">`).join("\n");
const page = `<!doctype html>
<html lang="pt-PT" class="dark embed" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${fonts}
${importMap}
</head>
<body>
<div id="root"></div>
${shots}
<img hidden alt="" id="bundle" src="${new URL("bundle.svg", DIST).pathname}">
${loader}
</body>
</html>
`;
await writeFile(new URL("inline.html", DIST), page);
console.log("inline.html", page.length, "chars; bundle.svg", payload.length, "chars");
