// Captures real screenshots for the prototype's mock data (simulates what the extension uploads).
// Usage: node scripts/capture.mjs   -> scripts/.raw/<id>.png + scripts/.raw/index.json
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

const OUT = new URL("./.raw/", import.meta.url).pathname;
const SITES = [
  { id: "wiki-lisboa", url: "https://en.wikipedia.org/wiki/Lisbon", v: [{ kind: "visible" }, { kind: "area", selector: ".infobox", maxH: 1500 }] },
  { id: "mdn-grid", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout", scheme: "dark", v: [{ kind: "visible" }, { kind: "area", selector: "main pre", maxH: 700 }] },
  { id: "gh-react", url: "https://github.com/facebook/react", scheme: "dark", v: [{ kind: "visible" }, { kind: "area", selector: "article.markdown-body", maxH: 1100 }] },
  { id: "hn", url: "https://news.ycombinator.com/", v: [{ kind: "full", maxH: 2600 }] },
  { id: "tailwind", url: "https://tailwindcss.com/", scheme: "dark", v: [{ kind: "visible" }, { kind: "full", maxH: 5200 }] },
  { id: "threejs", url: "https://threejs.org/", v: [{ kind: "visible" }, { kind: "area", clip: { x: 0, y: 0, width: 760, height: 900 } }] },
  { id: "xkcd", url: "https://xkcd.com/", v: [{ kind: "area", selector: "#comic", maxH: 1400 }, { kind: "visible" }] },
  { id: "osm-lisboa", url: "https://www.openstreetmap.org/#map=15/38.7110/-9.1366", wait: 4000, v: [{ kind: "visible" }, { kind: "area", clip: { x: 520, y: 180, width: 720, height: 560 } }] },
  { id: "caniuse-grid", url: "https://caniuse.com/css-grid", v: [{ kind: "visible" }, { kind: "area", clip: { x: 0, y: 120, width: 1440, height: 560 } }] },
  { id: "linear", url: "https://linear.app/", v: [{ kind: "visible" }, { kind: "full", maxH: 4200 }] },
  { id: "stripe", url: "https://stripe.com/", v: [{ kind: "visible" }] },
  { id: "wttr-lisboa", url: "https://wttr.in/Lisbon", v: [{ kind: "area", selector: "pre", maxH: 1200 }] },
  { id: "arxiv-attention", url: "https://arxiv.org/abs/1706.03762", v: [{ kind: "visible" }, { kind: "area", selector: "#abs", maxH: 900 }] },
  { id: "apod", url: "https://apod.nasa.gov/apod/astropix.html", v: [{ kind: "area", selector: "center:first-of-type", maxH: 1600 }] },
  { id: "astro", url: "https://astro.build/", scheme: "dark", v: [{ kind: "visible" }] },
  { id: "watch", url: "https://ciechanow.ski/mechanical-watch/", wait: 4000, v: [{ kind: "visible" }, { kind: "area", clip: { x: 300, y: 300, width: 840, height: 600 } }] },
  { id: "react-dev", url: "https://react.dev/", scheme: "dark", v: [{ kind: "visible" }, { kind: "area", clip: { x: 160, y: 520, width: 1120, height: 380 } }] },
  { id: "heroui", url: "https://www.heroui.com/", scheme: "dark", v: [{ kind: "visible" }] },
  { id: "pastel-nata", url: "https://en.wikipedia.org/wiki/Pastel_de_nata", v: [{ kind: "area", selector: ".infobox", maxH: 1300 }] },
  { id: "bun", url: "https://bun.sh/", v: [{ kind: "visible" }] },
];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const index = [];
const only = process.argv.slice(2);

for (const site of SITES) {
  if (only.length && !only.includes(site.id)) continue;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, userAgent: UA, colorScheme: site.scheme ?? "light", locale: "en-US" });
  const page = await ctx.newPage();
  try {
    await page.goto(site.url, { waitUntil: "load", timeout: 35000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(site.wait ?? 1500);
    // Best-effort cookie banner dismissal.
    for (const re of [/^(accept|accept all|allow all|agree|got it|i agree|aceitar)$/i]) {
      const b = page.getByRole("button", { name: re }).first();
      if (await b.isVisible().catch(() => false)) await b.click({ timeout: 1500 }).catch(() => {});
    }
    const title = await page.title();
    let n = 0;
    for (const v of site.v) {
      const id = `${site.id}-${++n}`;
      const path = `${OUT}${id}.png`;
      try {
        if (v.kind === "visible") {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path });
        } else if (v.kind === "full") {
          // Scroll through to trigger lazy content, then clip to maxH.
          const h = await page.evaluate(async (maxH) => {
            for (let y = 0; y < Math.min(document.documentElement.scrollHeight, maxH); y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 180)); }
            window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 400));
            return Math.min(document.documentElement.scrollHeight, maxH);
          }, v.maxH ?? 4000);
          await page.screenshot({ path, fullPage: true, clip: { x: 0, y: 0, width: 1440, height: h } });
        } else if (v.selector) {
          const el = page.locator(v.selector).first();
          await el.scrollIntoViewIfNeeded({ timeout: 4000 });
          const box = await el.boundingBox();
          if (!box || box.width < 80 || box.height < 60) throw new Error("element too small/missing");
          const sy = await page.evaluate(() => window.scrollY);
          await page.screenshot({ path, fullPage: true, clip: { x: Math.max(0, box.x - 12), y: Math.max(0, box.y + sy - 12), width: Math.min(1440, box.width + 24), height: Math.min(v.maxH ?? 1200, box.height + 24) } });
        } else {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path, clip: v.clip });
        }
        index.push({ id, site: site.id, url: page.url(), pageTitle: title, kind: v.kind === "full" ? "full" : v.kind === "visible" ? "visible" : "area" });
        console.log("ok", id);
      } catch (e) { console.log("skip", id, String(e).slice(0, 120)); }
    }
  } catch (e) { console.log("fail", site.id, String(e).slice(0, 160)); }
  await ctx.close();
}
await browser.close();
const prev = only.length ? JSON.parse(await (await import("node:fs/promises")).readFile(`${OUT}index.json`, "utf8").catch(() => "[]")) : [];
const merged = [...prev.filter((p) => !index.some((i) => i.id === p.id)), ...index];
await writeFile(`${OUT}index.json`, JSON.stringify(merged, null, 2));
console.log("done", merged.length);
