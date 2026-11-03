# BillCraft: project instructions

Static HTML, CSS and JavaScript bill and invoice maker for small domestic businesses. No build step and no runtime dependencies. Phone layout comes first.

## Commands
- `npm run serve`: serves the app at http://127.0.0.1:8089 (`-- --lan` for a phone on your network). Add `?sw=1` to the address to test offline use locally.
- `npm test`: unit and markup tests (`node --test`, no dependencies)
- `npm run check`: syntax check of every script
- `npm run stamp`: writes the app's file list and content hash into `sw.js`. Run it after changing any served file; `tests/sw.test.js` fails until you do.

## Layout
- `index.html`: every screen and modal. Visible text uses `data-i18n*` attributes.
- `js/app.js`: the controller (`BillCraftApp`).
- `js/quickBill.js`: bill logic without the DOM (product order, recent customers, units and quantities). Unit-tested in `tests/quickBill.test.js`.
- `js/motion.js`: animation helpers for the bill journey.
- `js/templates.js`: the four bill designs. Each receives a translator for the bill language.
- `js/exporter.js`: PDF, PNG, print and WhatsApp.
- `js/models.js`, `js/storage.js`: data model and localStorage (backup and restore).
- `js/i18n/`: language registry, translator and amount in words. `locales/en.js` is the source of truth.
- `js/voice.js`: browser speech input and output.
- `js/safe.js`: `escapeHTML` and `safeImageSrc` for everything placed into markup.
- `js/backup.js`: backup files: `parseBackup` checks and rebuilds every value before a restore.
- `js/config.js`: the app version (equal to `package.json`).
- `sw.js`, `manifest.webmanifest`, `icons/`: offline use and installing. Icons are drawn from `icons/icon.svg` by `scripts/make-icons.mjs`.
- `vendor/`, `fonts/`: html2canvas, jsPDF and the font, served by the app (see `THIRD_PARTY_NOTICES.md`).
- `css/base.css` and `css/components.css`: phone defaults. `css/responsive.css`: wider layouts.

## Rules
- **Mobile first.** Write base styles for phones. Add wider layouts with `min-width` queries, and only in `css/responsive.css`.
- **No hard-coded UI strings.** Add a key to `js/i18n/locales/en.js`, add it to every other locale file, then use it through `data-i18n*` in markup or `this.t()` in scripts. `tests/markup.test.js` fails on missing or unused keys.
- **Escape before `innerHTML`.** Translations are plain text, and stored data may come from a backup file. Use `escape()` in `app.js` and `escapeHTML()` (from `js/safe.js`) elsewhere for every value placed in markup, ids included. Images go through `safeImageSrc()`.
- **Keep stored values in English.** Statuses (`Paid`, `Due`, `Draft`) stay English in storage so old bills and backups still work. Only the display is translated.
- **No new dependencies and no build step.** Nothing loads from another website: the Content Security Policy in `index.html` allows only this site.
- **Run `npm run stamp` after changing any served file**, so installed copies update as one set.
- **Motion is decoration.** Change the data and text first, then animate through `js/motion.js`: transform and opacity only, 0.45 s or less (0.7 s for the burst after sending), and never block a tap. Everything must still work, and show final values, under `prefers-reduced-motion: reduce`.
- **Printing.** The print rules are the `@media print` block in `css/invoice-templates.css`. Add any new bar, toolbar or modal to its hide list, or it prints. `tests/print.test.js` checks the list.
- **Voice typing can send audio to a cloud service** (the browser's or phone maker's speech service). Consent is asked once and stored in `settings.voiceConsent`. Keep the notice in `README.md` accurate.

## Docs
- `docs/PROJECT_STATE.md`: status, verification results, decisions and risks.
- `docs/I18N.md`: how to add or review a language.
