# Project state

**Version 1.0.0.** Complete, and waiting for testing on real phones and a native Hindi review.

Branches, local and not pushed:
- `feature/mobile-first-i18n`: phone-first layout, languages, voice, and the print fix.
- `feature/fast-bill`, built on the branch above: the fast bill journey and motion.
- `feature/production-ready`, built on `feature/fast-bill`: everything for 1.0 below.

## Status
- **Making a bill.**
  - On phones: Items, then Send. Product tiles, most used first; a quantity sheet for items sold by weight or length; "+ Other item"; recent customers and suggestions from every past customer.
  - Paid / Due / Draft, with a "Pay by" date for Due bills.
  - On computers, the editor sits beside a live preview.
- **Payment QR code.**
  - A standard QR encoder (`js/qrHelper.js`): byte mode, level M, versions 1 to 40, interleaved error correction, the best of 8 masks, and a 4-module border, drawn as SVG.
  - Made only for a well-formed UPI ID and only on rupee bills. 112 px on the bills, 120 px on the receipt.
- **Bills.**
  - Four designs. Each lays out by its own width (container queries), so it fits a phone, the preview column and paper.
  - Dates are in the bill language. Badges are green for Paid, red for Due and grey for Draft.
  - The discount column shows only when an item has a discount. There is no "Total quantity" across different units.
  - Amounts are rounded to paise per line, so the lines add up to the totals.
- **Sending and files.**
  - **WhatsApp** opens straight to the customer's number.
  - **PDF and image** are drawn on a fixed A4 sheet, or an 80 mm receipt for the receipt design, so they match the screen and look the same from any device.
  - **On phones** they open the share sheet; elsewhere they download.
  - **PDFs** are about 200 KB a page. Long bills are cut between rows, with 10 mm margins.
  - **Print** shows only the bill.
- **History.**
  - Paid today, paid this month, and what is still due.
  - Mark paid (with Undo), and Remind, a WhatsApp reminder in the bill language.
  - Search, a status filter, and an Excel (CSV) download.
- **First run.** The language, then the shop (name, phone, UPI ID), all skippable. No sample products or bills. A reminder on the Send step when the shop has no name.
- **Saved data.**
  - Everything is in `localStorage`, and every write is checked. A full storage is reported, and a bill that failed to save never looks saved.
  - Bill numbers have a prefix setting and a counter that only goes up; a duplicate number is refused.
  - Backups and restores:
    - A backup goes through the share sheet on phones.
    - A restore checks and rebuilds every value first (`js/backup.js`), asks first, and offers Undo.
    - History reminds you to back up; Settings shows the last backup date.
    - Persistent storage is requested once.
  - Schema 2 clears the made-up shop that versions before 1.0 saved, including the UPI ID `craftisan@upi`.
- **Offline and installing.**
  - The service worker keeps all 34 app files on the device. A new version is fetched as one set and applied on "Update now".
  - `npm run stamp` writes the file list and content hash into `sw.js`, and a test enforces it.
  - Settings → App offers Install, or Add to Home Screen on iPhone, and shows the version and the privacy note.
- **Accessibility.**
  - Dialogs move focus in and back out, keep Tab inside, close with Escape, and make the app behind them inert. In-app questions replace the browser's `confirm()`.
  - Labelled fields, a polite status message after each change to the bill, and a skip link.
  - WCAG AA contrast, checked by `tests/contrast.test.js`.
- **Languages.** English and Hindi; the Hindi is a draft. Every visible text has a key, which the tests enforce.
- **Security and privacy.**
  - No request leaves the site: the font and the export libraries are vendored and checked against their npm and cdnjs hashes, under a Content Security Policy.
  - Every value is escaped, uploaded images are checked, spreadsheet formulas are disarmed, and nothing is sent anywhere.
- **Errors.** A short notice for unexpected errors, at most every 10 seconds. If the app cannot start, a message in English and Hindi says so; another covers browsers with scripts turned off.

## Verification (2026-11-04, macOS, Node 26.12.0, Google Chrome headless)
- **`npm test`: 95 of 95 pass.** The tests cover:
  - QR codes
  - bill maths
  - backups and the CSV export
  - storage and migration
  - exports and the WhatsApp texts
  - escaping in every bill design
  - colour contrast
  - the service-worker file list and version
  - translations and markup
  - print
  - quick-bill logic and voice digits
- **`npm run check`:** every script parses.
- **`npm run e2e`: 37 of 37 checks pass,** in fresh browsers with no console errors and no CSP violations. Journeys:
  - the first bill from a new install, through to WhatsApp
  - a weighed item, and the QR code decoding to the exact UPI link
  - exports at A4 width from a phone and a computer, a small PDF, a 45-item bill in several pages, and print showing only the bill
  - dialog focus and Escape
  - the screen-reader message
  - the WhatsApp reminder and Mark paid
  - the CSV download
  - a backup round trip, and a hostile backup shown as text with no script run
  - offline opening and a PDF made offline
  - no horizontal overflow at 360, 768 and 1280 px in English and Hindi
- **QR codes, beyond the tests.**
  - 49 codes decode exactly with both Chrome's `BarcodeDetector` and macOS Core Image: every version from 1 to 40, all 8 masks, and UTF-8 text.
  - Three texts are module-for-module equal to Core Image's own generator, at versions 4, 6 and 9.
  - The QR on each of the four designs decodes on screen and in the exported image, with both readers.
- **Exports.**
  - Offline exports match online ones.
  - Text sits within 1 px of the screen; it had been 5 to 9 px low because of how html2canvas measured fonts in our layout.
  - A one-page PDF is 201 KB; it was 6.2 MB.
- **Scratch checks (outside the repo), all passing:**
  - first run and migration: 18
  - saved data: 20
  - accessibility with real key presses: 14
  - History and due dates: 12
  - CSV and suggestions: 10
  - exports: 12
  - offline and updates: 15
  - errors: 5
  - requests and CSP: 6
  - bill layouts at 375 px and in the 1280 px preview column: no overflow
- **Not verified:**
  - real phones (Android and iPhone): the share sheet, installing, offline use on iOS, and the UPI QR code scanned by Google Pay, PhonePe or Paytm
  - Safari and Firefox
  - speech recognition and read-aloud
  - actual screen readers (TalkBack, VoiceOver, NVDA); only the markup and focus behaviour were checked
  - a native review of the Hindi text
  - right-to-left layout

## Decisions
- **English and Hindi for 1.0** (decided 2026-11-03). The other ten languages stay registered and hidden until a translator provides them.
- **Non-GST bills** (bill of supply), as before. GST tax invoices are not part of 1.0.
- **Hosting is decided later.** CI runs only the unit tests and the syntax check; `docs/DEPLOY.md` covers any HTTPS static host.
- **New users get a quick setup and no sample products.** Old installs keep their data, minus the made-up shop values.
- **Exports use a fixed sheet** (A4, or an 80 mm receipt), not the screen width. PDF pages are JPEG.
- **Undo** for restore and Mark paid. Deleting a product or a bill asks first, in the app's own dialog.
- **The accent colours are a step darker** for contrast (emerald #047857, amber #b45309, rose #be123c).
- **The service worker registers on HTTPS, or with `?sw=1` locally,** so development never serves stale files.
- **html2canvas measures fonts in a hidden box on `<body>`.** `css/base.css` keeps that box at browser defaults, so exported text is not shifted.
- **Stored values stay in English:** statuses and the default category "General".

## Risks
- The Hindi text is a draft.
- Phones may differ from headless Chrome: the share sheet, the tap that sharing needs, installing, and iOS storage. Safari can clear the data of sites that are not installed and not used for 7 days; installing the app and the backup reminder reduce this.
- Browser storage holds about 5 MB. A bill takes 1 to 2 KB, so thousands fit, and the uploaded QR image is shrunk. A full storage is reported.
- The CSP allows inline styles, because the bill designs use them; scripts are limited to the app's own files.
- html2canvas 1.4.1 and jsPDF 2.5.1 are 2022 releases. Updating them means checking the files and exports again (`THIRD_PARTY_NOTICES.md`).
- GitHub Pages cannot send the `frame-ancestors` header (`docs/DEPLOY.md`).
- The repository has no LICENSE file. Choosing one is the owner's decision.

## Next steps
1. On real phones, scan a bill's QR code with a UPI app and check the payee and amount (pay ₹1 to your own UPI ID). Install the app on Android and iPhone, make bills in airplane mode, and send a PDF through the share sheet.
2. Native review of `js/i18n/locales/hi.js`.
3. Choose hosting, then push the branches and open a pull request (not done yet; needs your go-ahead).
4. Choose a licence.
5. Add the next languages (`docs/I18N.md`).
