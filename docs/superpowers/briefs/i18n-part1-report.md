# i18n Part 1 report: infrastructure + all UI strings

Branch `feat/zero-config`. Status: **DONE_WITH_CONCERNS** (see "Concerns").

## Commits

| Commit | What |
| --- | --- |
| `6e0f671` | feat(shared): small typed i18n (locale matching, ICU-style plurals, Intl formatters) |
| `dde7260` | feat(gallery): English by default, pt-BR/es/fr/it, language selector |
| `5ab2bad` | feat(extension): English by default, pt-BR/es/fr/it, language in Options |
| `fc31771` | fix(server): English for the setup log line and the `setup_closed` message |
| `606d13d` | test(e2e): English default copy, French detection and the pt-BR switch (+ shorter Dock tag placeholder) |

Other commits showed up on the branch while I worked (`eb5eaa6`, `1ea78ad`, `5a9a8d9`, `3fc57f7`, `28a4443`: license, site, English README, launch report). They aren't mine and I didn't touch them. Each of my commits staged only its own paths. Nothing was pushed or merged.

## Architecture

### `packages/shared/src/i18n/` (no dependency, also in the gallery's runtime shim)
- **`locale.ts`**
  - `LOCALES = ["en-US","pt-BR","es","fr","it"]`, `DEFAULT_LOCALE`.
  - `LOCALE_NAMES`: each language in its own name.
  - `matchLocale(tag)`: `pt*`→pt-BR, `es*`→es, `fr*`→fr, `it*`→it, `en*`→en-US, anything else→null.
  - `pickLocale(navigator.languages)`: the first supported language in the list, else en-US. For example `["de","fr"]` gives fr.
- **`message.ts`**: a tiny ICU MessageFormat subset, parsed once and cached.
  - `{name}`.
  - `{n, plural, =0 {…} one {# x} other {# xs}}` using `Intl.PluralRules`. A category the message doesn't list falls back to `other`; fr/es/it/pt have `many` for 1 000 000.
  - `{x, select, …}`.
  - `#` and number arguments go through `Intl.NumberFormat`.
  - `formatParts` returns non-string values (React elements, DOM nodes) as their own parts, for rich text.
- **`translate.ts`**
  - `Messages<typeof en>` = `{ [K in keyof en]: string }`, so a missing or extra key is a type error.
  - `createTranslator(locale, dicts)` → `t(key, vars)`, `t.rich(key, vars)`, `t.locale`. At runtime it falls back to en, then to the key.
  - `dictionaryIssues` / `allDictionaryIssues` report missing, extra or empty keys, different `{argument}` sets, and syntax errors.
- **`format.ts`**: memoized `formatRelative` (replaces the hand-written "há 2 minutos"; under a minute → "now", "agora", "ahora"…), `formatDate`, `formatNumber`, `formatList`, `compareText` (a collator, for sorting names).

### Gallery (`apps/gallery/src/i18n/`)
- **Language state (`store.ts`)**
  - A small store outside React.
  - The saved choice lives in `localStorage["recorte:locale"]`; null means automatic, which uses `navigator.languages`.
  - It listens to `languagechange` and cross-tab `storage` events.
  - It sets `<html lang>` before the first render.
- **Provider (`index.tsx`)**
  - `I18nProvider` wraps HeroUI's re-exported React Aria `I18nProvider locale={locale}` and keeps `<html lang>` in sync.
  - Hooks: `useT()`, `useFormat()` (relative/date/number/list/compare in the locale) and `useLocale()` → `{ locale, preference, browser, setPreference }`. **Part 2 should read `locale` from `useLocale()` to label tag IDs.**
  - `t.node(key, vars)` renders messages whose arguments are elements (`<code>`, `<em>`, `<Link>`), with no sentence fragments.
  - `Msg = { key, vars, error }` keeps status messages in state as keys, so a live switch re-translates them.
- **What was moved to `t()`**
  - Every user-visible string: labels, aria-labels, tooltips (including HeroUI `Kbd.Abbr` titles and `Modal.CloseTrigger`'s "Close"), placeholders, empty states, errors, confirms, Dock toasts, the ⌘K hints (Mac/PC logic unchanged), the zoom hints, and `<title>` per route.
  - The feed error is now a code (`"load_failed"`).
  - A CSS selector that matched the pt `aria-label` became a class (`.tag-add`).
- **Colour filter values** stay the server's pt names (`preto`, `azul`…), since the server filters on them. Only the labels are translated (`color.*` keys; chips, the Dock and `describe()`).
- **Language selector (`components/LanguageSelect.tsx`)**: a native `<select>` showing "Automatic (English)" plus the five native names.
  - It's in Settings, under a new first section "Language".
  - A compact version sits next to the brand on the sign-in and setup pages, so it's reachable before login.
- **`index.html`, PWA manifest and URLs**
  - `index.html` is `lang="en"` with an English meta description.
  - The PWA manifest keeps `name` "Recorte", has an English description and `"lang": "en"`.
- **URL slugs unchanged** (`/extensao`, `/definicoes`, `/lixo`). Installed extensions link to `/extensao`, so this is deliberate.

### Extension (`apps/extension`)
- **`public/_locales/{en,pt_BR,es,fr,it}/messages.json`**: `extName` ("Recorte" in all), `extDescription`, `cmdCaptureArea|Visible|Full`.
  - `wxt.config.ts` uses `__MSG_extName__`, `__MSG_extDescription__`, `__MSG_cmd…__` and `default_locale: "en"`.
  - These follow the browser language, as the brief asks.
- **`lib/i18n/{en,pt-BR,es,fr,it}.ts`**: the runtime dictionaries.
- **`lib/i18n/index.ts`** (pure, unit-tested): `DICTIONARIES`, `resolveLocale(preference, uiLanguage)`, `makeT`, `localizeDom(document, t)`, `CodedError` and `errorMessage(t, e)`.
  - `localizeDom` applies `data-i18n`, `data-i18n-placeholder|aria-label|title` and sets `lang`.
  - `CodedError` is for thrown errors shown to the user (`TabChangedError` is one now). They're translated where they're shown.
- **`lib/i18n/browser.ts`**: `LOCALE_KEY = "locale"` in `storage.local`, `getLocale()`, `getT()` and `onLocaleChange(cb)`. `getLocale()` uses the override, else `browser.i18n.getUILanguage()`. **Part 2 can call `getT()` / `getLocale()` in the dialog to label suggested tags.**
- **What uses it**
  - Popup and options: static HTML with `data-i18n`.
  - Options: a "Language" card (Automatic + the five languages). Changing it writes `storage.local.locale`, and the page re-localizes itself live.
  - Pre-save dialog iframe: `renderSaveDialog({ t })`.
  - Area overlay hint: the content script calls `getT()`.
  - Toasts: the background sends translated `text` and `action.label`.
  - Notifications, notification buttons, and errors passed to the dialog. API codes are translated there too: 401 → "Reconnect…", `name_taken` → "A category with that name already exists."
  - Shortcut list labels, plus a localized "Space" key name through a new `formatShortcut(…, keyNames)` argument.
  - Default device name: "Chrome on macOS".
- **Context menus** are built with `t` and rebuilt on `storage.onChanged` for the `locale` key only. `removeAll` and `create` run serialized through a promise chain, so quick changes can't produce duplicate ids.
- `COMMAND_LABELS` became `COMMANDS` (`{ manifest, ui }` keys). `wxt.config.ts` no longer imports runtime copy.
- `Settings` gained `locale: Locale | null`.

### Server
- The boot hint log is English: `Open http://<this-server-IP>:8080/setup within the next 15 minutes to set up Recorte.`
- The `setup_closed` response `message` is English. It's only for curl users; the gallery translates the code.
- Every other client-facing output was already a code (`error: "name_taken"`, `invalid_url` + `keys`, …).
- The export ZIP name was already English (`recorte-export-<stamp>.zip`).

## Where the dictionaries live and how to add a language

| What | File |
| --- | --- |
| Shared engine | `packages/shared/src/i18n/` |
| Gallery copy | `apps/gallery/src/i18n/messages/{en,pt-BR,es,fr,it}.ts` (en is the source of truth), registered in `apps/gallery/src/i18n/dictionaries.ts` |
| Extension copy | `apps/extension/lib/i18n/{en,pt-BR,es,fr,it}.ts`, registered in `apps/extension/lib/i18n/index.ts` |
| Browser-shown extension strings | `apps/extension/public/_locales/<chrome-locale>/messages.json` |

To add a language, for example `de`:
1. Add `"de"` to `LOCALES`, a native name to `LOCALE_NAMES`, and a `case "de"` to `matchLocale` (`packages/shared/src/i18n/locale.ts`).
2. `tsc` then fails until both `Dictionaries` objects have a `de` entry. Create `apps/gallery/src/i18n/messages/de.ts` and `apps/extension/lib/i18n/de.ts` as `Messages<typeof en>`, and register them.
3. Add `apps/extension/public/_locales/de/messages.json` with the five messages.
4. Run the tests. They check keys, arguments, plural syntax, unused keys, and the `_locales` folders (one per locale, same names, `extName` = "Recorte", description ≤ 132 characters, shortcut names equal to the runtime ones).

## Tests and outputs

New tests:
- **`packages/shared/test/i18n.test.ts`** (14 tests):
  - Locale matching and the preference list.
  - Interpolation, plus number formatting with fr narrow no-break spaces.
  - CLDR plurals: fr/pt treat 0 as `one`; fr 1 000 000 is `many` → `other`; it `many`.
  - Nested arguments, select, and syntax errors.
  - The translator, rich parts, and runtime fallback.
  - **Missing-key typing**: `@ts-expect-error` on a dictionary missing a key, an extra key, and an unknown key passed to `t()`. This is enforced by `pnpm --filter @recorte/shared typecheck`, which passes; an unused directive would fail it.
  - Dictionary-issue reporting.
  - Intl relative, number, list and collator.
- **`apps/gallery/src/i18n/i18n.test.ts`** (4 tests):
  - All locales are clean against en.
  - **Every key is used** in the source (an `import.meta.glob` raw scan).
  - pt-BR has no pt-PT forms (ecrã, palavra-passe, utilizador, ficheiro, guardar, apagar, definições, descarregar, lixo, registos, "Tenta", tu forms…).
  - Plurals in every locale.
- **`apps/extension/test/i18n.test.ts`** (8 tests):
  - Dictionaries clean, every key used, pt-BR not pt-PT.
  - `_locales` folders and names, ≤ 132 characters, manifest `__MSG_` and `default_locale`.
  - Shortcut names in `_locales` equal the runtime `command.*` copy.
  - `resolveLocale`, plurals, and the localized "Space".
- **`apps/extension/test/guard.test.ts`** asserts the error key and its en/pt-BR text instead of the pt-PT string.
- **`apps/server/test/auth.test.ts`** asserts the English boot hint and the setup-closed message.

Final run:

| Suite | Result |
| --- | --- |
| packages/shared | 31 passed |
| packages/ai | 14 passed, 1 skipped (unchanged) |
| gallery | 39 passed |
| extension | 56 passed |
| server | 180 passed, 1 skipped |
| `scripts/*.test.mjs` | 6 passed |
| Typecheck (shared, ai, gallery, extension, server, e2e) | all Done |
| Gallery build (`tsc -b && vite build`) | ✓ |
| Extension build + zip (Chrome MV3 + Firefox MV2) | ✓; `_locales` in both outputs; manifest shows `__MSG_extName__` and `default_locale: "en"` |
| E2E (`pnpm --filter @recorte/e2e e2e`) | **12/12 pass** |

E2E changes:
- The browser context is pinned to `locale: "en-US"`, because this Mac may report pt.
- It checks `<html lang="en-US">` and `<title>` "Sign in · Recorte", then the English labels, the button and the palette placeholder.
- The log regex is English.
- **pt-BR switch**: Settings → `Language` → pt-BR. It then checks:
  - the heading "Configurações", `html[lang]=pt-BR`, the title "Configurações · Recorte" and the nav "Lixeira";
  - that the choice survives a reload;
  - the gallery's "Pesquisar capturas" and the hero line "2 capturas e N tags. Clique numa tag para filtrar".
- **Detection**: a `fr-FR` browser context gets "Connexion" and "Mot de passe" without choosing anything.
- Tag-label assertions are left to Part 2.
- The first E2E run failed once because the hero line was read before the tag counts arrived (`isVisible` doesn't wait). It now uses `waitFor`, and the second run was green.
- The E2E created and removed its own `recorte-e2e-*` container. `recorte-app-1` wasn't touched.

## Screenshots

Everything is in `/private/tmp/claude-501/-Users-kali--t3-projects-screenshotextension/d3c8a733-043b-454f-a611-a92428db1d30/scratchpad/i18n/`. There are 110 PNGs.

Gallery:
- Coverage: **all five languages** at 1440×900 and 390×844 (phones emulated with touch at 2×).
- Pages per language and size: login, gallery, Dock filter panel, selection Dock, detail (plus detail scrolled on phones), ⌘K palette, settings / extension / trash (full page), and the phone nav menu.
- File names: `<locale>-<width>-<page>.png`, for example `fr-390-dock-selection.png`.

Extension, in all five languages:
- Options page: `ext-options-<locale>.png`.
- Popup: `ext-popup-<locale>.png`.

Overflow check:
- A script flagged text that was clipped or ellipsized, elements off-screen to the right, and any sideways page scroll, across 111 page states. The results are in `overflow-report.json`.
- After excluding `sr-only` false positives, nothing was flagged.
- I also looked at the fr/it/es/pt-BR phone shots myself. That turned up one real issue: the selection Dock's tag field placeholder ("Añadir etiqueta", "Ajouter un tag") was cut. It now uses a short `dock.addTagPlaceholder` ("+ etiqueta", "+ tag"), and the aria-label keeps the full text.
- The filter Dock's last chip ("Categoria") scrolls out of view on phones. It does the same in English: that row is a horizontal scroller by design.
- The detail `<dl>` label column became `minmax(88px, max-content)` so longer labels fit.

## Leftovers for Part 2
- **AI tag names are still shown raw** everywhere tags appear. Part 2 should label them with `useLocale().locale` (gallery) or `getT()` / `getLocale()` (extension dialog). The places are:
  - gallery: `TagMarquee` (button text + `aria-label`), `ItemModal` chips and the "Removed from AI" list, Gallery filter chips and `describe()` (`gallery.withTags`), `CommandPalette` "Filter by tag", the `SelectionDock` "tag added" toast;
  - extension: `lib/dialog.ts` suggestions/autocomplete.
- `marquee.examples1-3` (ghost tags on an empty library) are translated per language as plain copy. Part 2 may want to build them from topic IDs and labels instead.
- `palette.suggestion*` are translated example queries. They're fine as plain copy, but check they still find results with the new search field.
- The E2E pt-BR check covers UI strings only. Part 2 should add the tag-label assertion, for example the `mapa` capture's tag in English vs pt-BR.
- `ai.tipo` / `ai.visual` raw pt-PT values and the `aiTags()` fallback are untouched (`packages/shared/src/tags.ts`).

## Concerns
1. **Cloud AI language.** `apps/server/src/cloud.ts`'s prompt says "Responde em português de Portugal", so cloud-generated titles and descriptions are stored in pt-PT. They're per-item content, not UI copy, so I left them. Decide whether the prompt should answer in English or in the page's language.
2. **Browser labels in install steps.** Several labels are translated to what I believe each browser shows, but I couldn't check them against a localized browser here:
   - Chrome "Developer mode" / "Load unpacked": pt-BR "Modo do desenvolvedor" / "Carregar sem compactação", es "Modo de desarrollador" / "Cargar descomprimida", fr "Mode développeur" / "Charger l’extension non empaquetée", it "Modalità sviluppatore" / "Carica estensione non pacchettizzata".
   - Firefox "Load Temporary Add-on…", localized equivalents.
   - Firefox "Manage Extension Shortcuts", localized equivalents in the extension's Options hint.

   Worth a quick check by a native speaker or in a localized browser.
3. **Route slugs stay Portuguese** (`/extensao`, `/definicoes`, `/lixo`). Installed extensions link to `/extensao`. Renaming would need aliases or redirects, so I treated it as out of scope.
4. **Bundle size.** The five gallery dictionaries are ~83 KB of source in the main chunk (roughly 25 KB gzip). The gallery's main JS is 545 KB minified, and Vite prints its >500 KB warning. Lazy-loading non-English dictionaries is possible later.
5. **Small typography.** pt-BR "e-mail" can wrap at the hyphen ("seu e-/mail") on the 390 px login intro. It's cosmetic; I left it.
6. **Kept as-is**:
   - The server's colour names stay as pt filter values, with display only translated.
   - `apps/gallery/src/lib/text.ts` still has the unused pt+en `STOP` word list and `tokenize` (dead code, not UI).
   - Test fixtures still use pt data such as passwords ("palavra-passe") and search queries ("doce português"). These are data, not copy.
7. **README.** README was out of scope for me and I didn't touch it. Another commit on the branch (`5a9a8d9`) has since rewritten it in English. It may quote the old pt-PT boot log line; check it against the new English line.

## Leftover pt-PT grep
I ran `grep -rnE "Guardar|guardar|ecrã|palavra-passe|Apagar|apagar|etiqueta|captura|pt-PT|\"pt\"|Definições|Lixo |utilizador|ficheiro"` over the gallery `src`, `index.html` and manifest, plus the extension's entrypoints, lib, `wxt.config.ts` and `_locales`, with the dictionary folders excluded. It finds only:
- test fixture passwords in `client.test.ts`;
- correct pt-BR/es words in `_locales` ("capturas de tela", "etiquetas").

The pt-BR dictionaries themselves are guarded by the pt-PT-forms tests.
