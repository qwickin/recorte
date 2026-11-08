// Captures the evaluation pages with Chrome (Playwright, channel "chrome"): a screenshot of the capture area plus the
// text payload produced by the extension's OWN extractor (apps/extension/lib/extract.ts, bundled with esbuild and
// injected), so the eval inputs match what the server receives in production.
// Usage: node capture.mjs [outDir] [id...]   -> <outDir>/<id>.png + <outDir>/raw.json (merged with previous runs)
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const { PAGES } = await import(process.env.PAGES ?? "./pages.mjs");

const HERE = fileURLToPath(new URL(".", import.meta.url));
const OUT = process.argv[2] ?? `${HERE}.raw/`;
const only = process.argv.slice(3);
await mkdir(OUT, { recursive: true });

const bundle = await build({
  entryPoints: [`${HERE}../../apps/extension/lib/extract.ts`],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "__recorteExtract",
  platform: "browser",
  target: "chrome120",
});
const EXTRACT = bundle.outputFiles[0].text;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const prev = JSON.parse(await readFile(`${OUT}raw.json`, "utf8").catch(() => "[]"));
const results = [];

for (const site of PAGES) {
  if (only.length && !only.includes(site.id)) continue;
  if (site.kind === "link") {
    results.push({ id: site.id, url: site.url, kind: "link" });
    console.log("link", site.id);
    continue;
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, userAgent: UA, colorScheme: site.scheme ?? "light", locale: "en-US", bypassCSP: true });
  const page = await ctx.newPage();
  try {
    await page.goto(site.url, { waitUntil: "load", timeout: 40000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    if (site.follow) {
      const href = await page.locator(site.follow).first().getAttribute("href");
      await page.goto(new URL(href, page.url()).href, { waitUntil: "load", timeout: 40000 });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    }
    await page.waitForTimeout(site.wait ?? 1500);
    // Best-effort consent dismissal (also inside consent iframes), as a person would before capturing.
    const CONSENT = /^(accept|accept all|allow all|agree|got it|i agree|ok|yes, i.m happy|aceitar|aceitar tudo|aceitar todos|consentir|accept all cookies|reject all|rejeitar tudo|sem rejeições|continue)$/i;
    for (let round = 0; round < 2; round++) {
      for (const frame of page.frames()) {
        let b = frame.getByRole("button", { name: CONSENT }).first();
        if (!(await b.isVisible().catch(() => false))) b = frame.locator('button:has-text("Reject all"), button:has-text("Rejeitar tudo")').first();
        if (await b.isVisible().catch(() => false)) {
          await b.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(1200);
        }
      }
    }
    await page.addScriptTag({ content: EXTRACT });
    const path = `${OUT}${site.id}.png`;
    let rect; // viewport coordinates at capture time
    if (site.kind === "visible") {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      await page.screenshot({ path });
      rect = { x: 0, y: 0, width: 1440, height: 900 };
    } else if (site.kind === "full") {
      const h = await page.evaluate(async (maxH) => {
        for (let y = 0; y < Math.min(document.documentElement.scrollHeight, maxH); y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
        window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 400));
        return Math.min(document.documentElement.scrollHeight, maxH);
      }, site.maxH ?? 4000);
      await page.screenshot({ path, fullPage: true, clip: { x: 0, y: 0, width: 1440, height: h } });
    } else if (site.clip) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path, clip: site.clip });
      rect = site.clip;
    } else {
      const el = site.locate ? await page.evaluateHandle(site.locate) : await page.locator(site.selector).first().elementHandle();
      if (!el || !el.asElement()) throw new Error("capture element not found");
      await el.scrollIntoViewIfNeeded({ timeout: 4000 });
      await page.waitForTimeout(500);
      const box = await el.boundingBox();
      const sy = await page.evaluate(() => window.scrollY);
      const h = Math.min(site.maxH ?? 1200, box.height);
      await page.screenshot({ path, fullPage: true, clip: { x: box.x, y: box.y + sy, width: box.width, height: h } });
      rect = { x: box.x, y: box.y, width: box.width, height: Math.min(h, 900 - Math.max(0, box.y)) };
    }
    // "image" captures send the element's alt + caption (figcaption) as the selection, like the extension.
    const image = site.kind === "image"
      ? await page.evaluate((sel) => { const im = document.querySelector(sel); return { alt: im?.getAttribute("alt") ?? "", caption: im?.closest("figure")?.querySelector("figcaption")?.textContent ?? "" }; }, site.selector)
      : undefined;
    const text = await page.evaluate(
      ({ kind, rect, image }) => window.__recorteExtract.extractText(document, { kind, rect, image }),
      { kind: site.kind, rect, image },
    );
    results.push({ id: site.id, url: page.url(), kind: site.kind, pageTitle: await page.title(), text });
    console.log("ok", site.id, `sel=${text.selection.length} page=${text.page?.text.length ?? 0} h=${text.headings.length}`);
  } catch (e) {
    console.log("FAIL", site.id, String(e).slice(0, 200));
  }
  await ctx.close();
}
await browser.close();
const merged = [...prev.filter((p) => !results.some((r) => r.id === p.id)), ...results];
await writeFile(`${OUT}raw.json`, JSON.stringify(merged, null, 1));
console.log("done", merged.length);
