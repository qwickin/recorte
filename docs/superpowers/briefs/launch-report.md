# Recorte: open-source launch material (report)

Branch `feat/zero-config`. Nothing was pushed.

## Commits

| Commit | What |
|---|---|
| `eb5eaa6` | chore: MIT `LICENSE` and `"license": "MIT"` in all 7 package.json files; rename `qwickin/screenshotextension` → `qwickin/recorte` |
| `1ea78ad` | feat(site): landing page in `site/` and `.github/workflows/pages.yml` |
| `5a9a8d9` | docs: English README; crop-mark logo `assets/logo.svg` replaces the old indigo "S" `assets/icon.svg` (only the README used it) |
| `3fc57f7` | fix(site): stack the links card below 960 px |

**How the shared files were staged.** For the package.json files and `apps/server/src/links/safe-fetch.ts`, the staged content was built from `HEAD:<path>` plus my single edit (`git hash-object` + `update-index`). No hunks from the i18n agent's work could slip into my commits. The same edit was applied to the working files. Commit `dde7260` (gallery i18n) in between is the other agent's.

## 1. License
- `LICENSE`: MIT, © 2026 qwickin.
- `"license": "MIT"` added to:
  - root;
  - e2e;
  - apps/extension, apps/gallery, apps/server;
  - packages/ai, packages/shared.

## 2. Rename
- Changed:
  - `docker/compose.yml` (default image);
  - `docker/.env.example` (`RECORTE_IMAGE`);
  - the `docker/Dockerfile` header comment;
  - the `safe-fetch.ts` user agent (that line only);
  - the spec. Its repository line (5) changed, and so did line 512, which also named the old image. Line 512 was changed as well to keep the spec consistent.
- `.github/workflows/ci.yml`: no hard-coded name. The image is `ghcr.io/${GITHUB_REPOSITORY,,}`, so it follows the rename automatically.
- `prototype/` and `docs/superpowers/briefs/` were left alone.

## 3. README (English)
Sections:
- hero, logo and links;
- product screenshot near the top, plus a 2×2 table of the other shots;
- features;
- how it works (ASCII diagram and flow);
- requirements;
- quick start;
- compose;
- install the extension (Chromium Load unpacked; Firefox temporary add-on and Dev Edition/Nightly);
- keyboard shortcuts;
- HTTPS/Caddy (incl. Compose ≥ 2.24 and the reverse-proxy/SSE notes);
- PWA;
- configuration: app env vars, plus compose-only vars;
- external Meilisearch;
- reset password;
- backup;
- update, including:
  - **a new note that the image moved and GHCR does not redirect**;
  - the two-service upgrade notes;
- privacy;
- languages;
- development;
- versioning and CI (mentions pages.yml);
- known limitations;
- license (MIT + OFL note for Albert Sans);
- footer links (site, GitHub, X).

Facts checked against the code:
- **Ports and commands:** port 8080 and the `docker run`/compose commands match `docker/`.
- **Env vars:** they match `apps/server/src/config.ts` and `compose*.yml`. Internal ones (PORT, MEILI_BIN, GALLERY_DIR…) are left out on purpose, because the image sets them.
- **Shortcuts:** from `apps/extension/lib/shortcuts.ts` (`SUGGESTED_KEYS`):

  | Action | macOS | Others |
  |---|---|---|
  | Area | ⌃⇧S (MacCtrl+Shift) | Alt+Shift+S |
  | Visible part | ⌃⇧V | Alt+Shift+V |
  | Full page | ⌃⇧F | Alt+Shift+F |
- **Context menu:** it has image / link / page actions, and the README lists all three.
- **Other claims:**
  - the 12,000 px full-page cap (`stitch.ts`);
  - the 30-day trash (`purge.ts`);
  - Meilisearch `--no-analytics` (`embedded.ts`);
  - the IndexedDB offline queue (`queue.ts`);
  - argon2id (spec).
- **UI labels** follow the in-progress English dictionary (`apps/gallery/src/i18n/messages/en.ts`): Settings → Server, Settings → Export, Settings → Rebuild index.
- **Not quoted:** the startup log line. It is still pt-PT and the i18n agent may change it. The README just says `docker logs recorte` prints the setup link.
- **Docs:** the spec link is noted as Portuguese.

## 4. Landing page (`site/`)
Plain HTML, CSS and ~20 lines of JS. No build step, no trackers, no external requests. About 500 KB in total.
- **Style:**
  - Albert Sans 200/300/400, copied from the gallery with `OFL.txt`;
  - true black, white type, hairlines and soft white glows.
- **Signature moment:** crop marks fly in and "select" the hero headline, like an area capture. This is the only page-load motion, and the headline is visible without JS. A small tag marquee in the AI card echoes the gallery's marquee. Both are disabled under `prefers-reduced-motion`.
- **Sections:**
  - hero, with the "Quick start" and "View on GitHub" CTAs;
  - full-width product shot;
  - problem/solution ("You screenshot things to remember them. Then you never find them again.");
  - a 9-card bento: search, shortcuts (keycaps), local AI (marquee), detail, phone/PWA, filter Dock, data on disk (file tree), links/X (link tile), languages;
  - 3 steps;
  - a copyable `docker run`;
  - footer (GitHub, X @qwickin, MIT).
- **Meta and icons:** OG/Twitter meta (`summary_large_image`, absolute `https://qwickin.github.io/recorte/assets/og.jpg`, 1200×630 JPEG rendered from the page's own type and screenshot). The favicon is the crop mark on a black rounded square, and there is an apple-touch-icon.
- **Paths:** all relative, so it works under `/recorte/` (tested served from a parent dir).
- **Images:** `site/assets/` holds gallery, search, detail, filters and phone (WebP, 20–100 KB each), chosen from the round2-C shots. The README reuses them.

## 5. `.github/workflows/pages.yml`
- **Triggers:** push to `main` touching `site/**` or the workflow itself, plus `workflow_dispatch`.
- **Permissions:**
  - top level: `contents: read`;
  - the job adds `pages: write` and `id-token: write`.
- **Run settings:** environment `github-pages`, concurrency `pages` (no cancel).
- **Pinned actions:** SHAs were looked up with `gh api …/releases/latest` and `…/commits/<tag>`, and cross-checked with `git ls-remote`:
  - configure-pages v6.0.0 `45bfe01…`;
  - upload-pages-artifact v5.0.0 `fc324d3…`;
  - deploy-pages v5.0.1 `368f825…`.
- **Checkout:** reuses ci.yml's pinned checkout v5.1.0, for consistency with Dependabot, and sets `persist-credentials: false`.

## 6. Verification
- **Method:** Chromium 1248 via playwright-core, with the site served at `http://127.0.0.1:8765/recorte/`.
- **Viewports:** 1440×900, 820×1180, 390×844 (2×) and 360×780, plus 1440 with reduced motion.
- **Results:**
  - no console errors and no failed or 4xx requests;
  - fonts loaded;
  - `scrollWidth == innerWidth` everywhere;
  - no element extends past the viewport at 360 px.
- **Fixed during review:**
  - the headline orphan ("saw.") at desktop;
  - the empty phone card;
  - the bare links card (now has a link tile);
  - the mobile code block scrolling sideways (the command is now wrapped over 4 lines);
  - "2 GB" breaking across lines;
  - the cramped links card on tablet;
  - the OG headline touching its crop mark.
- **Screenshots** in `/private/tmp/claude-501/-Users-kali--t3-projects-screenshotextension/d3c8a733-043b-454f-a611-a92428db1d30/scratchpad/site/`:
  - `desktop-1440-top.png`, `desktop-1440-full.png`;
  - `phone-390-top.png`, `phone-390-full.png`;
  - `phone-360-*`, `tablet-820-*`, `desktop-reduced-*`;
  - clips: `bento-1440.png`, `problem-360.png`, `install-360.png`, `links-820.png`.

## Concerns and owner TODOs
1. **Screenshots are pt-PT.** Labels like "Pesquisar", "modo escuro" and "há 2 minutos" show in every product shot and in `og.jpg`. Retake them after i18n lands; the same files serve both the site and the README.
   - Files to replace in `site/assets/`: `gallery.webp` (1440×900), `search.webp`, `detail.webp`, `filters.webp` (crops of the palette, detail modal and Dock), `phone.webp` (600 px wide).
   - Re-render `og.jpg` from `scratchpad/pages-root/og.html`.
   - Then remove the README note "The screenshots show the earlier Portuguese interface…".
2. **The README and site describe i18n as done.** That covers five languages, the language selector, and AI tags as language-neutral IDs searchable in all five languages. Confirm all of this ships before launch. The i18n brief said the README was out of scope for that agent, so nobody else will update it.
3. **GitHub Pages must be enabled:** Settings → Pages → Source: **GitHub Actions**. Otherwise the first deploy fails.
4. **After the rename, the first CI run on `main` publishes `ghcr.io/qwickin/recorte`.** Make that package public in its settings. Consider leaving the old `screenshotextension` package for existing users. The README already tells them to switch.
5. **Leftover pt-PT on the server and extension side**, which the i18n agent should handle:
   - `safe-fetch.ts` still sends `accept-language: pt-PT…`;
   - the extension manifest description is still pt-PT.
