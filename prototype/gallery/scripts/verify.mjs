// Drives the single-file build (dist-embed/index.html) over file:// and checks the main interactions.
// Usage: node scripts/verify.mjs <outDir>
import { chromium } from "playwright-core";
const OUT = process.argv[2] ?? ".";
const FILE = new URL("../dist-embed/index.html", import.meta.url).href;
const errors = [];
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 760, height: 960 }, deviceScaleFactor: 2 });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(FILE);
await page.waitForSelector(".tile", { timeout: 15000 });
await page.waitForTimeout(1500);
const imgs = await page.$$eval(".tile img", (els) => els.map((e) => e.complete && e.naturalWidth > 0));
log("tiles:", imgs.length, "loaded:", imgs.filter(Boolean).length);
log("tags in marquee:", await page.$$eval('.tag[tabindex="0"]', (e) => e.length));
await page.screenshot({ path: `${OUT}/1-initial.png` });

// Infinite scroll inside the embed root
const root = page.locator(".embed-root");
for (let i = 0; i < 4; i++) {
  await root.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(1100);
}
log("tiles after scroll:", await page.$$eval(".tile", (e) => e.length), "| end msg:", await page.getByText("Chegaste à primeira captura").isVisible());
await page.screenshot({ path: `${OUT}/2-scrolled.png` });
await root.evaluate((el) => el.scrollTo(0, 0));
await page.waitForTimeout(400);

// Tag filter
// Pick a big tag that is currently on screen (the rows are moving).
const box = await page.$$eval('.tag[tabindex="0"]', (els) => {
  const el = els.map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.left > 120 && r.right < 640 && r.top > 0).sort((a, b) => b.r.height - a.r.height)[0];
  return el && { x: el.r.left + el.r.width / 2, y: el.r.top + el.r.height / 2, name: el.e.firstChild.textContent.trim() };
});
const tagName = box.name;
await page.mouse.move(box.x, box.y);
await page.waitForTimeout(300);
const box2 = await page.$$eval('.tag[tabindex="0"]', (els, n) => { const r = els.find((e) => e.firstChild.textContent.trim() === n).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, tagName);
await page.mouse.click(box2.x, box2.y);
await page.waitForTimeout(1200);
log(`filter '${tagName}':`, await page.$$eval(".tile", (e) => e.length), "tiles | status:", await page.locator("main [aria-live]").innerText());
log("filter chip in top bar:", await page.getByRole("button", { name: `Remover filtro ${tagName}` }).isVisible());
await page.screenshot({ path: `${OUT}/3-filtered.png` });
await page.getByRole("button", { name: `Remover filtro ${tagName}` }).click();
await page.waitForTimeout(900);

// Command palette
await page.locator("body").click({ position: { x: 5, y: 5 } });
await page.keyboard.press("Meta+k");
await page.waitForTimeout(500);
log("palette open:", await page.getByRole("dialog", { name: "Pesquisar capturas" }).isVisible());
const input = page.getByRole("combobox");
for (const q of ["página escura com código", "banda desenhada sobre ciência", "artigo científico sobre IA", "doce português", "tabela de compatibilidade de browsers", "xyzzy"]) {
  await input.fill(q);
  await page.waitForTimeout(800);
  const r = await page.$$eval('[role="listbox"] [role="option"]', (els) => els.map((e) => e.querySelector("p")?.textContent));
  log(`q="${q}" ->`, r.slice(0, 3), r.length);
}
await input.fill("mapa de lisboa");
await page.waitForTimeout(800);
log("results:", (await page.$$eval('[role="listbox"] [role="option"]', (els) => els.map((e) => e.querySelector("p")?.textContent))).slice(0, 4));
await page.screenshot({ path: `${OUT}/4-palette.png` });
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
await page.waitForTimeout(900);
log("detail open:", await page.locator('[data-slot="modal-dialog"], [role="dialog"]').last().getAttribute("aria-label"));
await page.screenshot({ path: `${OUT}/5-detail.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
log("dialogs after esc:", await page.locator('[role="dialog"]').count());
log("console errors:", errors.length ? errors : "none");
await browser.close();
