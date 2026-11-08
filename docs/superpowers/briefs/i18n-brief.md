# Recorte: i18n (approved by the user). Branch feat/zero-config

**Goal:** the whole product is multilingual.
- Default and fallback: **English (en-US)**.
- Translations: **pt-BR, es, fr, it**.
- The current pt-PT copy goes away. Rewrite it as pt-BR (tela, senha, salvar, arquivo…), not pt-PT.

## User decisions
1. **Language selection:**
   - Detect from the browser (`navigator.languages`). Match `pt*` → pt-BR, `es*` → es, `fr*` → fr, `it*` → it, anything else → en-US.
   - Add a language selector that is remembered:
     - gallery: in Settings, and also reachable before login (Auth/Setup pages);
     - extension: in Options.
   - Gallery and extension each remember their own choice. They don't sync.
2. **AI tags follow the viewer's UI language:**
   - Store AI tags as language-neutral IDs.
   - Every viewer sees them in their own language.
   - Search finds them in any of the 5 languages.

## Part 1: i18n infrastructure + all UI strings
**No heavy library.** Write a small typed i18n in `packages/shared/src/i18n/`:
- The `en` dictionary is the source of truth.
- Other locales are typed as `Record<keyof typeof en, string>`, so a missing key is a type error.
- `{name}` interpolation.
- Plurals via `Intl.PluralRules`.
- Dates via `Intl.DateTimeFormat` / `RelativeTimeFormat` (replaces "há 2 minutos"), numbers via `Intl.NumberFormat`, lists via `Intl.ListFormat`.

Each app keeps its own message files (gallery, extension). Shared helpers handle locale detection and matching.

**Gallery:**
- A React provider + `useT()`.
- `<html lang>` updates live.
- Wrap HeroUI/React Aria in its `I18nProvider` with the locale.
- Every user-visible string goes through `t()`. That includes:
  - aria-labels, tooltips, placeholders, empty states, errors, toasts, the ⌘K hints;
  - the PWA manifest's name and description (localized `manifest`: keep `name` "Recorte" and put the description in English);
  - `<title>`.
- Keyboard hints keep the existing Mac/PC logic.

**Extension (WXT):**
- `_locales/<lang>/messages.json` holds what the browser itself shows: the manifest name/description and the command descriptions. These follow the browser language. Add `default_locale: "en"`.
- Everything else uses the shared runtime dictionary, so the Options override works:
  - popup, options, the pre-save dialog iframe, context-menu titles (rebuild them when the language changes), notifications, badges.

- Extension details:
  - Detect the language with `browser.i18n.getUILanguage()`, so it matches what `_locales` shows.
  - Store the override in `storage.local`. The background listens to `storage.onChanged` to rebuild the context menus.
- Existing tests that assert pt-PT copy: rewrite them to the English strings or to `t()` keys. Never put pt-PT text in the `en` dictionary to keep tests green.

**Server:**
- Any human-readable text the gallery or extension shows to the user must become an error code that the client translates.
- Logs stay English.
- Generated files (export ZIP names, etc.): English.

**Docs:** README stays as is (out of scope). Mention it in the report.

## Part 2: AI tags as language-neutral IDs
- **ID = an explicit, frozen `id` field per topic** (English, lowercase, unique, e.g. "ui components", "dark mode", "recipe", "documentation").
  - Never derive it from synonyms or labels. The English label is one of the 5 labels and starts out as the same text.
  - Add a committed snapshot test (the list of IDs) that fails if an ID disappears or changes. IDs are referenced by every meta.json, hiddenAiTags entry and item_tags row.
  - Keep the internal matching vocabulary (pt aliases are still useful evidence for Portuguese pages). Map to IDs where the tagger emits.
  - Add matching aliases for es/fr/it/pt-BR page text where cheap. That is optional; don't break the eval.
- **Label table:** a localized label for every topic in en, pt-BR, es, fr, it, in `packages/shared` so the gallery and extension can import it.
  - Quality matters: natural short tag labels, not literal translations. Proper nouns stay as they are ("React", "GitHub", "Lisboa" → "Lisbon" in en, "Lisboa" in pt/es/it, "Lisbonne" in fr).
  - A test checks that every ID has all 5 labels.
- **The SigLIP2 screenshot vocabulary** (`packages/ai/src/vocab.ts`, `labels.siglip2.json`, keyed by pt-PT label): keep its internal keys. Map its tipo/visual outputs to topic IDs at the boundary. Visual labels that aren't topics either get IDs and labels too, or are dropped from display. Decide, keep it consistent, and document it.
- **Storage:**
  - `ai.topics` holds IDs.
  - `hiddenAiTags` holds IDs.
  - The SQLite `item_tags`, tag counts (marquee) and filters use IDs for AI tags.
  - User tags stay as typed. When a user tag the user types exactly matches a topic label in any of the 5 languages (normalized), store the ID instead, so "modo escuro" and "dark mode" become one tag.
- **Display:** the gallery labels AI-tag IDs with the current locale everywhere tags appear: tiles, detail, marquee, Dock filters, chips, ⌘K, the extension's pre-save dialog suggestions/autocomplete. Unknown IDs (user tags) show verbatim.
- **Search:** keep two fields.
  - `tags` holds IDs and stays filterable.
  - A new searchable field holds the labels of the item's AI tags in all 5 languages, so searching "receta" or "dark mode" works.
  - Check whether `ensureIndex` updates the settings of an existing index or only sets them on create, and whether the embedder's document template uses tags (that means a re-embed).
  - Existing installs must get the new settings plus a reindex through the migration, not only fresh volumes.
- **Normalizing typed tags happens on the server, at every write:** upload (the extension's pre-save dialog), PATCH and bulk. Match only against the 5 labels, never against the matching aliases.
- **Migration:**
  - Bump `TAGGER_ID` (e.g. `topics-v2`). The existing startup retag (tag-only, no cloud) re-tags every item into IDs.
  - Migrate existing pt-PT `hiddenAiTags`, and user tags that match a label, to IDs.
    - This is a separate migration, because the pipeline never writes `user`. It writes meta.json through `svc.persist` so SQLite and Meilisearch follow.
    - It runs synchronously at startup, before `worker.start()` and before the retag jobs, and is idempotent and versioned like `taggerVersion`. Otherwise tags the user removed come back.
  - `ai.tipo`/`ai.visual` keep the raw internal pt-PT keys, so the E2E assertion `ai.tipo == ["mapa"]` stays valid. Don't convert them; map them only for display.
  - Items still showing the `tipo ∪ visual` fallback must show labeled IDs, not raw pt-PT strings.
- **Eval harness:** `prototype/ai-eval` must still run.
  - Ground truth is in pt-PT names: map through the ID table when scoring.
  - Re-run `lexical-visual` on dev + held-out and confirm the F1 is unchanged (72% / 46%). A pure ID mapping must not change quality.

## General
- Keep all tests green and add tests for the new logic: locale matching, plurals, missing-key typing, ID mapping, label completeness, migration, user-tag normalization, search doc labels.
- Run:
  - gallery typecheck + build + tests;
  - server tests;
  - extension typecheck + build + zip;
  - packages tests;
  - the E2E in /e2e. Update it for English default copy, and add one check that switching to pt-BR changes the UI and the tag labels.
- Verify with Chromium screenshots of the gallery in en and in one other language (es or pt-BR) at 1440x900 and 390x844, plus the extension options page. Save them to the scratchpad dir given in the task and look at them.
- Commit logically on feat/zero-config. End each message with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". Never push or merge. Never spawn subagents.
