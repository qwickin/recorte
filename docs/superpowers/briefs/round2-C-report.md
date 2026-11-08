# Round 2, part C (gallery UI): report

Branch `feat/zero-config`. Base `7cfe7ec`. Nothing pushed or merged. No new dependencies.

## Commits

| SHA | Subject |
|---|---|
| `51c363e` | feat(gallery): pan/zoom math and grid keyboard movement, as pure tested modules |
| `24d1a39` | feat(gallery): round 2 UI (Dock with morph, zoomable detail, image-grid palette, slower marquee, empty hero, phones) |
| `5d3661a` | feat(gallery,server): installable PWA (manifest, crop-mark icons, app-shell service worker) |
| `71b6642` | test(e2e): ⌘K results are a grid of image cards with arrow-key movement |
| `4b1082f` | fix(gallery): hero keeps its height while tags load; empty copy waits for the library total |
| `fda277f` | fix(gallery): text-card tiles keep their title visible |
| `33cbc47` | docs: round 2 part C report (gallery UI) |
| `212a9fb` | fix(gallery): 44 px touch targets on phones (detail, tags, Dock, top bar); ⌘K from every page |

C1–C8 are in a single UI commit because they share `styles.css`. The commit message has a section for each item.

## Per item

**C1 Layout shift**
- `html { scrollbar-gutter: stable }`. React Aria 3.53's scroll lock detects `scrollbarGutter` and sets it instead of adding padding, so opening a modal doesn't double the shift.
- The top bar is identical on every page:
  - The search pill is now on every page. Away from the gallery, both the pill and ⌘K/Ctrl+K navigate to `/` and open the palette, via `lib/palette.ts`. Verified from `/definicoes`.
  - "Selecionar" left the top bar.
  - The bar is always one row, 72 px.
- Measured in Chromium 1440×900 with real scrollbars (launched with `--hide-scrollbars` removed). The search pill sits at x=1224 on every page and state:
  - `/` (scrolls), `/extensao` and `/definicoes` (scroll): `clientWidth` reads 1425.
  - `/lixo` (no scrollbar): `clientWidth` reads 1440, but the pill is still at x=1224, so the gutter is reserved and nothing moves. Chrome simply reports the full width for a root element that isn't scrolling.
  - With the detail modal open (`overflow: hidden`, `padding-right: 0`): the pill is at x=1224, so there is no shift and no double padding.
- The nav links also stay at the same x on all four pages (`995, 1044, 1124`).
- Fonts: the latin 200 and 300 woff2 files are preloaded from `index.html`, and `font-display` changed from `swap` to `block`. The fonts are same-origin and the CSP is unchanged.
- The hero reserves its count line while tags load (fix commit `4b1082f`).
- The `Private` route wrapper was already not remounting between paths.

**C2 Detail actions**
- "Copiar texto" and "Apagar" are `isIconOnly` HeroUI Buttons. Each is the direct child of a HeroUI v3 `<Tooltip>` with `Tooltip.Content`, which avoids `Tooltip.Trigger` and its nested `div role=button`.
- Each button has an `aria-label` that matches its tooltip ("Copiar texto" / "Texto copiado", "Apagar (vai para o lixo)").
- Apagar uses `danger-soft` with a red treatment that turns solid red on hover.
- "Abrir página/link" stays the primary text button.
- `tooltip.css` is now imported in `styles.css`.

**C3 Zoom** (`components/ZoomImage.tsx`, math in `lib/zoom.ts`)
- Wheel zooms around the pointer. It is a native non-passive listener, so the page doesn't scroll. Lines and pages are normalised, and a trackpad pinch (`ctrlKey`) is handled more finely.
- Drag pans, clamped so the image never leaves an empty margin. Double-click resets, or zooms 2.5× at the point when already reset. Keys `+`, `-` and `0` work when the image has focus.
- Touch: two-finger pinch plus pan around the midpoint, and one-finger pan. Verified in a real browser: a two-finger spread sent through CDP `Input.dispatchTouchEvent` took the scale from 0.244 to 1.056 (`detail-zoom-phone.png`).
- Rendering is a single `translate3d(...) scale()` on one element, written from a rAF loop with easing, so React doesn't re-render per frame. `will-change` is set only while moving, so Chrome re-rasterises sharply when idle.
- The hint "Usa a roda do rato para fazer zoom" ("Junta dois dedos para fazer zoom" on touch) fades after the first use. That is remembered in `localStorage`, wrapped in try/catch.
- Zoom state resets per item (keyed by id).
- The x.com embed and text-card links are not zoomable.
- Decision on tall captures: the pane used to scroll so full-page captures could be read. Now a capture much taller than the pane opens at full width at the top, and you drag to pan down. You can zoom out to see the whole page.

**C4 Marquee**
- The track animates only `translate3d`, with `will-change` and `contain: layout paint` on each row.
- Durations come from each run's measured width (`useLaneDurations`). Lanes move at a steady 12, 16 and 19 px/s, which is much slower than before.
- Animation is paused until measured, so there is no jump at the start. It re-measures after `document.fonts.ready`.
- Reduced motion keeps the existing static, wrapped layout.

**C5 Dock** (`components/Dock.tsx`, which replaces `FilterBar.tsx` and the old `BulkBar`)
- A floating bottom pill holds Site, Tipo, Cor, Data, Categoria, a separator and "Selecionar". It sits above `env(safe-area-inset-bottom)`.
- Filter panels open upwards, anchored to the Dock shell. Each is placed under its chip and kept inside the Dock's width; on phones it takes the full Dock width. They have enter and exit animations.
- "Selecionar" and "Cancelar" (and Esc) morph between the two Docks with a View Transition:
  - Both Docks share `view-transition-name: dock`, and the swap runs through `flushSync`.
  - The root crossfade is off.
  - `::view-transition-group(dock)` carries a solid rounded background. Without it, mid-way through the crossfade the grid showed through, because snapshots lose the backdrop blur.
  - Snapshots use `object-fit: none`, so text isn't stretched, and are clipped to the moving pill.
  - The swap is instant when View Transitions are unsupported or motion is reduced.
- No Framer Motion, so there is no bundle cost. JS gzip went from 145.50 to 145.61 KB.
- The selection Dock keeps the existing bulk actions: Todas, Juntar etiqueta, Categoria, Apagar, Cancelar.
- The "N capturas com …" count moved to a small line above the grid.
- `main` has `pb-28`, so the Dock never covers the last tiles.
- The Dock is hidden when the library is empty.

**C6 Empty hero**
- A ghost marquee of example words, rendered as gradient-clipped text with a slow light sweep.
- Below it: "Ainda não há etiquetas." and "Instala a extensão e guarda a primeira captura: as etiquetas aparecem aqui.", with "extensão" linking to `/extensao`.
- When captures exist but the AI hasn't tagged them yet, the copy reads "As etiquetas estão a caminho." instead.
- `tags` starts as `null`, so the empty state doesn't flash while tags load. The copy also waits for the library total.

**C7 ⌘K grid**
- Results are image cards: a large 16:10 thumbnail with the title, domain and age below. Links without an image get a text card, and link items get the "link" badge.
- The highlight snippet shows over the thumbnail of the active card.
- JS owns the column count (2, 3 or 4 by width, via a ResizeObserver), so the arrows always match the layout.
- Keyboard:
  - The active card is highlighted from the start, and Enter opens it.
  - ↓ moves from the text field into the grid; from then on ←↑→↓ move across cards, using `gridMove`.
  - ↑ from the first row, or typing, gives the arrows back to the text caret.
- The combobox, listbox and option semantics are kept.
- Suggestions (no query) stay a list. The dialog is wider: 920 px.

**C8 Phones**
- The top bar is one row: logo, filter chips, a 44 px search button and a 44 px menu button. The menu opens the sections as a small sheet.
- The Dock uses 44 px targets and scrolls horizontally if a value makes it too wide. The selection Dock stacks in two rows.
- The detail is a full-screen sheet: the image at 46dvh on top, details scrolling below, with 44 px nav arrows and icon buttons.
- The palette is full-screen with a "Fechar" button.
- The masonry was already 2 columns under 520 px.
- No horizontal overflow on `/definicoes`, `/extensao` or `/lixo` at 390 px (measured `scrollWidth − clientWidth = 0`).
- Touch targets were audited at 390×844 (touch context) over every visible `button, a, input, select, textarea, [role=option]`, excluding the tag-cloud words, on the gallery, the detail sheet and the palette.
  - First pass found 18 controls under 44 px: Dock chips at 42, the icon-only Selecionar at 42 wide, tag chips and their × at 28, the add-tag input, the category select and "Abrir página" at 36, the site link at 20, and the modal close button at 24.
  - These are fixed with `@media (pointer: coarse)` and phone rules (plus `min-h-11` on the top-bar chips and "Limpar").
  - Second pass: 0 controls under 44 px on all three screens.

**C9 PWA**
- `public/manifest.webmanifest`: name Recorte, standalone, black theme and background.
- Icons in `public/icons/`, generated from the crop mark by `apps/gallery/scripts/icons.mjs` using the workspace's sharp; the PNGs are committed:
  - 192 and 512
  - maskable 512, full-bleed with the glyph inside the safe zone
  - apple-touch-icon 180
- Apple and Android meta tags, plus `theme-color` and `viewport-fit=cover`.
- `public/sw.js`:
  - Pages are network-first, with the cached shell as the offline fallback.
  - Only `/assets`, `/fonts` and `/icons` are cache-first, capped at 80 entries.
  - `/api`, `/auth` and `/downloads` are never intercepted, in any request mode (so ZIP downloads aren't answered with the shell).
  - Only GET requests are handled.
- The service worker is registered from `main.tsx` in production builds only.
- Server: `.webmanifest` is now served as `application/manifest+json`, which matters because of `nosniff`. The CSP needed no change: `worker-src` and `manifest-src` fall back to `default-src 'self'`, and `sw.js` is served `no-cache`.
- README: a note that installing requires HTTPS, except on localhost.
- Verified in a production build (`vite preview`):
  - The page is controlled after a reload.
  - The caches hold only `/`, the manifest, an icon, fonts and `/assets`, with no `/api` entries and no images.
  - Offline navigation to `/lixo` renders the shell.

## Tests

New test files: `apps/gallery/src/lib/zoom.test.ts` (10 tests) and `apps/gallery/src/lib/grid.test.ts` (6 tests). The zoom tests cover:
- contain / fit-width scales
- that the point under the cursor stays fixed when zooming in and out
- scale clamps
- re-centring at contain
- pan bounds
- wheel normalisation
- pinch

The grid tests cover reading order, short last rows, Home/End and edge cases. There is also a new server test for the PWA files.

| Check | Result |
|---|---|
| Gallery `tsc -b && vite build` | ok (JS 465.41 kB, gzip 145.61 kB) |
| Gallery `vitest run` | 4 files, 35 tests passed |
| Server `npx vitest run` | 9 files passed, 1 skipped; 179 passed, 1 skipped (`static.test.ts` now 9 tests, incl. PWA) |
| Extension `pnpm typecheck` | ok |
| e2e `tsc` | ok |
| E2E `node --import tsx --test stack.spec.ts` (Docker) | 12/12 passed (run twice; the second run on final code `212a9fb`) |

The E2E ⌘K test now asserts that:
- the "Pastel de nata" option contains an `img`
- the grid has at least 2 columns (checked unconditionally)
- the first two results sit side by side
- ↓ then → selects the second card

The last two checks need at least 2 results. In the final run they ran: the log says `palette: 2 result(s), 4 columns, arrow-key check ran`.

## Screenshots

All in `/private/tmp/claude-501/-Users-kali--t3-projects-screenshotextension/d3c8a733-043b-454f-a611-a92428db1d30/scratchpad/round2-C/`. Chromium 1440×900 for desktop, and 390×844 @3x with `isMobile` and `hasTouch` for phone.

Data: a throwaway container (`recorte:e2e`, port 18731, volume `recorte-c-shots`) seeded with 22 captures from `prototype/gallery/public/shots` plus one link. The container and volume were removed afterwards. The user's `recorte-app-1` was not touched.

- **Empty state:** `empty-desktop.png`, `empty-phone.png`
- **Gallery:** `gallery-desktop.png`, `gallery-phone.png`
- **Detail:** `detail-desktop.png` (with the zoom hint), `detail-zoom-desktop.png` (wheel-zoomed at the pointer), `detail-tooltip-desktop.png` (tooltip and the red Apagar)
- **Mobile detail sheet:** `detail-sheet-phone.png`, `detail-sheet-scrolled-phone.png`
- **⌘K grid:** `palette-grid-desktop.png` (after ↓ → ↓, the active card shows its snippet), `palette-grid-phone.png`
- **Dock:** `dock-filter-panel-desktop.png`, `dock-filter-panel-phone.png`, `dock-selection-desktop.png`, `dock-selection-phone.png`, `dock-back-desktop.png`
- **Dock morph:** `dock-morph-sequence-desktop.png` and `dock-morph-sequence-phone.png` (frames of the morph at 0.1× animation speed, top to bottom)
- **Detail with zoom on phone:** `detail-zoom-phone.png` (after a CDP pinch)
- **Other:** `topbar-menu-phone.png`, `page-definicoes-phone.png`, `page-extensao-phone.png`, `page-lixo-phone.png`, `settings-desktop.png`

I opened and checked every file listed. The two `empty-*` shots are from the first, empty container and predate a small change that makes the empty copy wait for the library total; the copy itself is unchanged. Problems the screenshots showed that I fixed:
- see-through crossfade in the morph (solid group background)
- a text-card tile clipping its title on phones
- a doubled caption on text cards

## Files changed

**Added:**
- `apps/gallery/src/components/Dock.tsx`, `apps/gallery/src/components/ZoomImage.tsx`
- `apps/gallery/src/hooks/useMedia.ts`
- `apps/gallery/src/lib/zoom.ts` (+ test), `apps/gallery/src/lib/grid.ts` (+ test), `apps/gallery/src/lib/palette.ts`
- `apps/gallery/public/manifest.webmanifest`, `apps/gallery/public/sw.js`, `apps/gallery/public/icons/*`
- `apps/gallery/scripts/icons.mjs`

**Changed:**
- `apps/gallery/index.html`, `apps/gallery/src/main.tsx`, `apps/gallery/src/styles.css`
- `apps/gallery/src/components/CommandPalette.tsx`, `apps/gallery/src/components/ItemModal.tsx`, `apps/gallery/src/components/TagMarquee.tsx`, `apps/gallery/src/components/TopBar.tsx`, `apps/gallery/src/components/icons.tsx`
- `apps/gallery/src/pages/Gallery.tsx`
- `apps/server/src/static.ts`, `apps/server/test/static.test.ts`
- `README.md`, `e2e/stack.spec.ts`

**Removed:** `apps/gallery/src/components/FilterBar.tsx`

## Deviations and concerns

- **Wheel vs. scrolling tall captures.** The wheel now always zooms, as the brief asks. A full-page capture opens at full width at the top and is read by dragging, where before the wheel scrolled it. Mouse users who expect to scroll down a long page will zoom out instead. If that feels wrong, the alternative is "wheel scrolls, ⌘/Ctrl+wheel zooms", but the hint text would then change.
- **Upscaling past 1:1 is soft.** The maximum zoom is 8× the contain scale (at least 2× natural size), so on 1× captures the deepest zoom is visibly blurry.
- **View Transitions** need Chromium 111+, Safari 18+ or a recent Firefox; elsewhere the Dock swap is instant. During the 440 ms morph the page ignores pointer input, which is inherent to View Transitions.
- **Selection Dock on phones:** the status message ("N capturas movidas…") is screen-reader-only to save room.
- **One UI commit** covers C1–C8, because the items share `styles.css`.
- **Throwaway image tag:** the screenshot container's image was built with a wrong `APP_VERSION` build arg ("0.0.55 0.0.18"). That only affected the throwaway; the E2E rebuilt the image itself. The local `recorte:e2e` image tag remains.
