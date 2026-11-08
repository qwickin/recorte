# i18n Part 2 report: AI tags as language-neutral IDs (+ cloud language, English URLs, launch screenshots)

Branch `feat/zero-config`. Status: **DONE_WITH_CONCERNS** (see "Concerns"). Nothing was pushed or merged.

## Commits

| Commit | What |
| --- | --- |
| `ab721ba` | feat(ai,shared): frozen tag IDs, the five-language label table, `canonicalTag`, ID snapshot test; tagger emits IDs (`topics-v2`); eval scores IDs |
| `29d3298` | feat(server): startup tag migration, typed-tag normalisation at upload/PATCH/bulk, search `tagLabels` field |
| `12e8a8f` | feat(gallery,extension): tags shown in the viewer's language everywhere |
| `f3aa9fb` | feat(server): cloud AI writes in the language of the captured page |
| `2485849` | feat(gallery,server): English page URLs; old pt-PT slugs redirect |
| `316aee1` | test(e2e): tag IDs, pt-BR switch relabels the tag cloud, `/extensao` redirect |
| `6e5f230` | docs(site): English product screenshots, `og.jpg`, README note removed |
| `630ce7d` | fix(server): admin reindex converts meta.json files from before tag IDs |

## 1. ID scheme

- **Where the IDs live**
  - `packages/ai/src/topics-vocab.ts`: each vocabulary line has a new explicit `id` column (`group|id|pt-PT name|synonyms|aliases`).
  - The pt-PT name stays the tagger's internal key. Parents, URL rules, `opts.visual`, scoring and the eval ground truth all still use it. The matching vocabulary (pt aliases included) is unchanged.
  - I did not add any of the optional es/fr/it/pt-BR matching aliases, so the eval could not move.
- **The IDs themselves**
  - 382 IDs, written by hand, never derived from synonyms. Examples: `documentation`, `dark mode`, `recipe`, `ui components`, `lisbon`, `ai`, `cv`, `movies`, `shop`, `social media`, `encyclopedia`.
  - All are English, lowercase and unique. Where the first English synonym was empty or wrong (`história`, `família`, `documento`→pdf, `artigo`→blog post), the ID was chosen explicitly.
- **Frozen**: `packages/shared/test/tag-ids.json` is the committed ID list. The test fails if an ID disappears or changes. New IDs must be appended to the file, which keeps it append-only by intent.
- **Label table**: `packages/shared/src/tag-labels.ts`, one row per tag: `id|en-US|pt-BR|es|fr|it`.
  - The English label is the ID, with proper nouns capitalised.
  - Labels are short natural tags, not literal translations. Examples:
    - `spreadsheet`: planilha / hoja de cálculo / tableur / foglio di calcolo;
    - `laptop`: notebook / portátil / ordinateur portable / portatile;
    - `comic`: quadrinhos / cómic / bande dessinée / fumetti.
  - Proper nouns stay as they are (React, GitHub, macOS). Places use exonyms: Lisbon / Lisboa / Lisboa / Lisbonne / Lisboa, as the brief says (Italian kept "Lisboa" per the brief, although "Lisbona" is the usual Italian form).
  - Three label conflicts were resolved by hand:
    - fr `carte` is the map, so the card component is `card`;
    - fr `bibliothèque` and it `libreria` are the software library, so the bookcase is `étagère` and `scaffale`;
    - es `diseño` is design, so layout is `maquetación`.
- **Helpers** (exported from `@recorte/shared` and from the gallery's runtime shim):
  - `tagLabel(tag, locale)`: the label of an ID; any other tag verbatim.
  - `tagLabelsAll(tag)`.
  - `canonicalTag` / `canonicalTags`: typed text that equals one of the five labels or the ID becomes the ID. Matching is normalised (trim, spaces, case) and accent-folded, never against aliases.
  - `SCREENSHOT_TAG_IDS`.
  - `aiTags()`, moved here from `tags.ts`. It now returns IDs.
- **Tests**
  - Every ID has all 5 labels, each ≤ 40 characters.
  - No normalised label or ID points to two IDs. This is what keeps the write path unambiguous and the migration idempotent.
  - The ai package checks that the vocabulary and the label table have the same ID set.
  - No old pt-PT name is the ID of a different topic.
- **SigLIP2 screenshot vocabulary (decision)**
  - `vocab.ts` and `labels.siglip2.json` keep their pt-PT keys.
  - `ai.tipo` and `ai.visual` stay raw, so the E2E's `ai.tipo == ["mapa"]` holds.
  - At display time, `SCREENSHOT_TAG_IDS` maps each label to a topic ID: all 34 tipo labels, with `wiki`→`encyclopedia`, `3d`, `tipografia` and `componentes ui` going to their topics, plus `modo escuro`→`dark mode`, `gradiente`→`gradient` and `minimalista`→`minimalism`.
  - Labels without a topic (`imagens`, `modo claro`, `texto denso`) are **dropped from display**. `tagItem` already never emitted them, so this is consistent. Items still on the `tipo ∪ visual` fallback now show labelled IDs.
- **Tagger**
  - `tagItem` maps to IDs at the boundary.
  - `TAGGER_ID` is now `topics-v2`, so the existing tag-only startup retag re-tags every live item into IDs.

## 2. Migration design (`apps/server/src/tag-migration.ts`)

- **When it runs**
  - `migrateTagIds(deps)` runs from `startRuntime` before `retagOutdated()` and before `worker.start()`.
  - It is fully synchronous: sync fs, SQLite and queue. `main.ts` calls `startRuntime` in the same tick as `serve()`, so no request or job can run in between.
- **Versioning**: `settings.tagIdsVersion = "1"`, the same pattern as `taggerVersion`. The version is written last.
- **What it changes, for every SQLite row, trashed items included** (`migrateItemTags`):
  - `ai.topics`: pt-PT names → IDs. Trashed items are not retagged, so this matters for a later restore.
  - `user.hiddenAiTags`: names as the old UI showed them (topic pt names, or screenshot labels such as `modo escuro`) → IDs. Anything else goes through `canonicalTag`.
  - `user.tags`: **labels only**, through the same `canonicalTag` as the write path. A typed pt-PT name that is not one of the five labels stays as typed. For example, `telemóvel` and `folha de cálculo` stay; `modo escuro` becomes `dark mode`.
  - Results are deduplicated after mapping. `ai.tipo` and `ai.visual` are untouched.
- **How it writes**
  - Changed items go through `svc.persist` (meta.json plus the SQLite mirror).
  - Unchanged items still get `repo.upsertFromMeta`, because an item on the screenshot fallback has raw `mapa` rows in `item_tags`.
  - Each live item gets an `index` job, so the search documents are re-sent with the new fields.
- **Idempotent**
  - An ID maps to itself, and no legacy name is another topic's ID (tested).
  - A second run is a no-op. A forced re-run after a "crash" changes nothing.
  - One unreadable meta.json is logged and skipped. It does not stop the server.
- **Why hidden tags stay hidden**: the retag jobs only rewrite `ai`. By the time they run, `hiddenAiTags` already holds the IDs they produce.
  - A test runs the real `startRuntime` on a topics-v1 item whose person had hidden `modo escuro`.
  - The test checks that the migration has already happened when `startRuntime` returns. After the retag job, `ai.topics` contains `dark mode` again, but the item's tags do not.
- **Also converted (`630ce7d`)**: `POST /api/admin/reindex` applies `migrateItemTags` to files it rebuilds from disk. Without that, an old backup restored after the migration would bring pt-PT names back.

## 3. Write path and search

- **Typed tags are normalised on the server at every write**
  - upload, through `canonicalTags(parsed.tags)`;
  - PATCH and bulk, through `svc.patch` (`user.tags` and `user.hiddenAiTags`).
  - The `/api/items` and `/api/search` tag filters accept labels too. For example, `?tags=modo%20oscuro,recette` filters by `dark mode` and `recipe`.
- **The gallery and the extension use the same function before sending**
  - In the gallery's detail view and selection Dock, typing "modo escuro" restores a hidden `dark mode` instead of adding a second tag.
  - The server stays authoritative.
- **Meilisearch has two tag fields**
  - `tags` holds the IDs. It is filterable, as before.
  - The new searchable `tagLabels` holds every label of every tag in all five languages, and typed tags verbatim. It replaces `tagWords` in `searchableAttributes`.
  - `tagWords` (English labels only) is kept for the embedder's `documentTemplate`. The template string is unchanged, so the byte budget still goes to the text.
- **Existing installs**
  - `ensureIndex()` already calls `updateSettings` on **every** start, not only when the index is created. An existing index therefore picks up the new searchable field the next time the server starts (comment added).
  - The template *string* did not change, so the settings change does not force a global re-embed.
  - Documents are re-sent by the migration's `index` jobs, and by the retag jobs, which also sync search. A document whose rendered template changed is re-embedded once, as its `tagWords` went from pt+synonyms to English labels.

### Real upgrade check (existing install → this branch)

Run on a throwaway volume and port; `recorte-app-1` was not touched.

1. Built `recorte:pre` from `65e48c0` (just before Part 2) and ran it.
2. Uploaded two captures:
   - the map, with user tags `modo escuro` and `viagem`;
   - the pastel de nata.
3. Waited for the `topics-v1` tags: `mapa, lisboa`, and `doces, pastelaria, receita`.
4. Hid the AI tag `lisboa`, and waited until search had indexed the documents.
   - At this point the old index had `searchableAttributes = [title, note, tagWords, …]`.
5. Replaced the container with `recorte:e2e` (this branch) on **the same volume**.

Results:
- **Logs**: `tag IDs v1: migrated 2 item(s), 2 changed`, then `tagger topics-v2: re-tagging 2 item(s)`.
- **Map item**:
  - `ai.topics` = `map, lisbon`;
  - `ai.tipo` = `["mapa"]` (raw);
  - `user.tags` = `["dark mode", "viagem"]`;
  - `hiddenAiTags` = `["lisbon"]`;
  - the item shows `dark mode, viagem, map`. After the retag, `lisbon` is back in `ai.topics` and still hidden.
- **`/api/tags`**: `dark mode, map, pastry, recipe, sweets, viagem`, with no pt-PT names.
- **Search**: "recette" (fr) and "receta" (es) find the pastel de nata.
- **Meilisearch itself**, checked through `docker exec`:
  - the existing index now has `searchableAttributes = [title, note, tagLabels, …]`;
  - `tags` is still filterable;
  - the documents carry `tagLabels`, e.g. `dark mode, modo escuro, modo oscuro, mode sombre, modalità scura, viagem…`, and the English `tagWords`.

The containers, the volume, the `recorte:pre` image and the worktree were removed afterwards.

## 4. Display

- **Gallery**: `useTagLabel()` reads the locale from the i18n provider. It labels:
  - the marquee (button text; lane widths are re-measured on a language switch);
  - the detail chips, their "Remove tag" aria-label and the "Removed from AI" list;
  - the filter chips, `describe()` and the "Remove tag" button;
  - the ⌘K tag chips;
  - the Dock's "tag added" message.
- **Empty hero**: its ghost tags are now tag IDs labelled per locale. The five `marquee.examples*` messages were removed.
- **Extension pre-save dialog**: chips and suggestions show labels in the extension's language (`t.locale`). Autocomplete matches the shown label, and typed tags go through `canonicalTags`.

## 5. Eval (prototype/ai-eval)

- `score.mts` now compares IDs. It maps the pt-PT ground truth, and results written before the change, through the vocabulary's ID column plus `SCREENSHOT_TAG_IDS`. Unknown names (`elevação`, `estudo`) pass through.
- `lexical-visual` was run before the change (results saved in the scratchpad) and after it:

  | | dev F1 | held-out F1 |
  |---|---|---|
  | before (topics-v1) | 72% (P 70 / R 74) | 46% (P 42 / R 51) |
  | after (topics-v2, IDs) | **72%** (P 70 / R 74) | **46%** (P 42 / R 51) |

- Per page, after mapping, the tags are **identical on 20/20 dev and 12/12 held-out pages** (`cmp.mjs` in the scratchpad).
- The older results files re-score the same as before (current 17%, lexical 72%…).
- `REPORT.md` has a short note on this.

## 6. A. Cloud AI language (`apps/server/src/cloud.ts`)

- **The prompt**: it is now in English. It asks for the title, the description **and the keywords** in the page's language.
- **How the language is chosen** (`answerLanguage`), in order:
  1. the page's `<html lang>`, which the extension now sends as the optional `text.meta.lang`; for a link the server fetches, it reads the fetched page's `<html lang>`;
  2. else stopword detection over title, headings and text (`detectLanguage`: en/pt/es/fr/it/de/nl, at least 3 hits and a 1.3× margin);
  3. else **English**.

  The model gets the English language name from `Intl.DisplayNames`, e.g. "Brazilian Portuguese" or "European Portuguese".
- **Backward compatible**: `text.meta.lang` is optional and cleaned by `cleanLangTag` (`pt_br` → `pt-BR`). A value that is not a language tag is dropped, never rejected, so old extensions and odd pages still upload.
- **Link fetches**: they no longer send `accept-language: pt-PT`. They now send `en-US,en;q=0.9,*;q=0.5`. This was a leftover flagged in the launch report.
- **Tests**:
  - `test/cloud.test.ts`: lang, detection in 4 languages, English fallback, tag cleaning, parsing a fetched link's `lang`.
  - The pipeline test asserts that "in English" and "in Brazilian Portuguese" reach the request.

## 7. B. URLs

- **Pages**: `/extensao` → `/extension`, `/definicoes` → `/settings`, `/lixo` → `/trash`. `/login` and `/setup` were already English.
- `PAGE` and `LEGACY_PAGES` live in `@recorte/shared`.
- **Old slugs keep working**
  - Server: a **301** for the old slugs, query string kept (`static.ts`). It is not a prefix match.
  - Client: `pagePath()` maps them, and `fixLegacyPath()` corrects the address bar at startup. This covers the offline PWA shell, which never reaches the server.
- **Links updated**: TopBar, the empty hero link, and the extension's update link (`${server}/extension`).
- **Tests**:
  - `static.test.ts`: 301 + Location + query, no prefix match.
  - `router.test.ts`.
  - E2E: `/extensao` lands on `/extension`.

## 8. C. Screenshots

- **Container**
  - Image `recorte:e2e` was built by the E2E from this checkout (after the URL commit) and re-tagged `recorte:shots`.
  - It ran as throwaway container `recorte-shots-1794166801` on free port 127.0.0.1:52705, with its own volume, and both were removed afterwards.
  - `recorte-app-1` was never touched.
- **Demo library**: 24 captures of public pages, plus a saved link to example.com. The pages are Tailwind, OpenStreetMap Lisbon, TasteAtlas pastel de nata, three.js, react.dev, Linear, Wikipedia Lisbon, Bun, Ciechanowski's Mechanical Watch, MDN grid, arXiv "Attention…", HeroUI, GitHub facebook/react, xkcd, Astro, caniuse, Hacker News.
  - Each has English page text. Generic account: `demo@recorte.test`.
  - User tags: `dessert`, `travel`, `inspiration`, `humor` (all IDs), and `to read` (typed).
  - Through the product, I hid three off-topic AI tags: "jobs" on the watch article, "geography" on MDN, and "architecture" on Tailwind. The detail shot shows "Removed from AI: architecture".
  - The Tailwind capture got the user title "Tailwind CSS", so the detail shot reaches "Related", as the site's alt text describes.
  - Seed and shoot scripts: `scratchpad/i18n2/seed.mjs` and `shoot.mjs`.
- **Replaced files**: same names, dimensions and format, so no markup changed. The previous files are kept in `scratchpad/i18n2/old-assets/`.

  | File | Size | Content |
  |---|---|---|
  | `site/assets/gallery.webp` | 1440×900 | top of the gallery, English tag cloud |
  | `site/assets/search.webp` | 922×674 | ⌘K "react", grid of image results |
  | `site/assets/detail.webp` | 1184×778 | the detail modal |
  | `site/assets/filters.webp` | 560×330 | Dock with the color panel |
  | `site/assets/phone.webp` | 600×1298 | from 390×844 @2× |
  | `site/assets/og.jpg` | 1200×630 JPEG | re-rendered from `scratchpad/pages-root/og.html`, whose `recorte/` is a symlink to `site/`, so it uses the new gallery shot |

  All were captured at 2× and resized down.
- **README**: the note "The screenshots show the earlier Portuguese interface…" was removed. Its i18n claims (five languages, AI tags as IDs searchable in all five) are now true.
- **Localized shots** (looked at all of them) are in `/private/tmp/claude-501/-Users-kali--t3-projects-screenshotextension/d3c8a733-043b-454f-a611-a92428db1d30/scratchpad/i18n2/`:
  - `{es,pt-BR,en-US}-1440-{gallery,detail,filtered,palette}.png`;
  - `{es,pt-BR,en-US}-390-{gallery,detail}.png`;
  - `ext-options-es.png`;
  - `ext-options-auto-ptBR.png`: "Automatic", which resolved to pt-BR because this Chrome's UI language is pt-BR even with `--lang=en-US`.

  I opened every file.

  The marquee read, in each language:
  - es: "modo oscuro, cómic, pastelería, artículo científico, componentes de UI, Lisboa, IA…";
  - pt-BR: "modo escuro, quadrinhos, confeitaria, Wikipédia…";
  - en: "dark mode, comic, pastry, Lisbon, AI…".

  The detail chips read "postre, pastelería, Portugal, dulces, Lisboa"; the filter chip, "modo escuro"; the ⌘K tag chips, "modo oscuro, diseño de UI…".

## 9. Tests and outputs

| Suite | Result |
| --- | --- |
| packages/shared | 45 passed (new: `tag-labels.test.ts`, 14) |
| packages/ai | 19 passed, 1 skipped (new: `topic-ids.test.ts`, 5) |
| gallery | 41 passed (new: `router.test.ts`) |
| extension | 56 passed |
| server | 194 passed, 1 skipped (new: `tag-migration.test.ts` 7, `cloud.test.ts` 5; plus a PATCH/bulk normalisation test, the 301 test and the cloud-language assertions) |
| `scripts/*.test.mjs` | 6 passed |
| Typecheck: shared, ai, gallery, extension, server, e2e | all Done |
| Gallery build | ✓. Main JS 545 KB → 567 KB (the label table, ~26 KB of source); Vite's >500 KB warning as before |
| Extension build + zip (Chrome MV3 + Firefox MV2) | ✓ |
| E2E (`pnpm --filter @recorte/e2e e2e`) | **12/12 pass**, run twice, the second on the final HEAD |
| Upgrade from `65e48c0` on the same volume (real Meilisearch) | all checks pass (§3) |

The E2E additions:
- `ai.topics` contains `map` and not `mapa`, while `ai.tipo` stays `["mapa"]`.
- The tag cloud reads `map` in English, and `mapa` with the same tag count after the pt-BR switch.
- `/extensao` lands on `/extension`.
- Settings is reached at `/settings`.

Each E2E run removed its own `recorte-e2e-*` container and volume.

## Concerns

1. **Typed user tags that were old pt-PT names are not merged.** Following the brief (labels only), user tags that equal an old pt-PT topic name but no current label stay separate tags after the migration. Examples: `portátil`, `telemóvel`, `folha de cálculo`, `banda desenhada`. Most pt-PT names are also the pt-BR label (receita, modo escuro, mapa…), so the common ones do merge.
2. **Search re-embedding cost.** Existing installs re-send every live document once. Documents whose English `tagWords` differ from the old pt+synonym words are re-embedded by Meilisearch once (CPU, minutes on a large library).
   - The `index` jobs retry 5 times over about a minute. If Meilisearch is down longer than that at the first start, some documents keep the old fields until the next edit or **Settings → Rebuild index**.
3. **Label quality.** The 382 × 4 translations are mine. They were checked for collisions and length, not by native speakers. Worth a skim, especially fr/it tech terms: "TAL" was avoided, "infobulle", "case à cocher", "menu a tendina".
4. **Language detection is heuristic.** It uses stopwords for 7 languages, and is used only when the page has no `<html lang>`. Pages in other languages without `lang` fall back to English.
5. **Old pt-PT search queries.** Searching an old pt-PT name that is no longer a label (e.g. "folha de cálculo") no longer hits `tagLabels`, though the hybrid embedder usually still finds it.
6. **Unreadable items keep their old tags.** An item whose meta.json was unreadable during the migration keeps pt-PT tags, which the gallery shows verbatim. The admin reindex now converts such files once they are readable.
7. **A stray local server was stopped.** While re-rendering `og.jpg`, a `python -m http.server 8765` left running by the earlier launch session was serving `pages-root`. My `pkill` pattern stopped it. It was a scratchpad preview server, not a user service.
8. **Small pt-BR copy issue from Part 1.** The hero line says "Clique numa tag para filtrar". "numa" reads pt-PT; pt-BR would say "em uma tag". The E2E asserts it, so I left it for whoever owns that copy.
