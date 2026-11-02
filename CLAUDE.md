# BillCraft: project instructions

Static HTML, CSS and JavaScript bill and invoice maker for small domestic businesses. No build step and no runtime dependencies. Phone layout comes first.

## Commands
- `npm run serve`: serves the app at http://127.0.0.1:8089
- `npm test`: unit and markup tests (`node --test`, no dependencies)
- `npm run check`: syntax check of every file in `js/`

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
- `css/base.css` and `css/components.css`: phone defaults. `css/responsive.css`: wider layouts.

## Rules
- **Mobile first.** Write base styles for phones. Add wider layouts with `min-width` queries, and only in `css/responsive.css`.
- **No hard-coded UI strings.** Add a key to `js/i18n/locales/en.js`, add it to every other locale file, then use it through `data-i18n*` in markup or `this.t()` in scripts. `tests/markup.test.js` fails on missing or unused keys.
- **Escape before `innerHTML`.** Translations are plain text. Use `escape()` in `app.js` and `escapeHTML()` in `templates.js` for any value placed in markup.
- **Keep stored values in English.** Statuses (`Paid`, `Due`, `Draft`) stay English in storage so old bills and backups still work. Only the display is translated.
- **No new dependencies and no build step.**
- **Motion is decoration.** Change the data and text first, then animate through `js/motion.js`: transform and opacity only, 0.45 s or less (0.7 s for the burst after sending), and never block a tap. Everything must still work, and show final values, under `prefers-reduced-motion: reduce`.
- **Printing.** The print rules are the `@media print` block in `css/invoice-templates.css`. Add any new bar, toolbar or modal to its hide list, or it prints. `tests/print.test.js` checks the list.
- **Voice typing can send audio to a cloud service** (the browser's or phone maker's speech service). Consent is asked once and stored in `settings.voiceConsent`. Keep the notice in `README.md` accurate.

## Docs
- `docs/PROJECT_STATE.md`: status, verification results, decisions and risks.
- `docs/I18N.md`: how to add or review a language.
