# Changelog

## 1.1.0 (2026-11-04)
Ready for phones, quicker to fill in, and friendlier to look at.

### On your phones
- **A folder ready for Netlify Drop.** `npm run package` builds `site/` with only the app's files and its security headers. Drag it onto app.netlify.com/drop for an HTTPS address that installs on Android and iPhone ([docs/DEPLOY.md](docs/DEPLOY.md)).
- **A one-time tip to add BillCraft to the home screen** after the first saved bill: the install prompt on Android, the Share steps on iPhone.
- **Taps respond at once and never zoom the page,** and no field is small enough for iPhone to zoom into.

### Bill numbers that say something
- **New bills are numbered by shop, month and count:** `AC-2611-042` is Asha Candles' 42nd bill of November 2026. Settings also offers a daily format (`AC-261104-03`) and a financial-year format (`AC/26-27/0412`), and the shop code can be changed.
- **The number follows the bill date** until you type one yourself, and the Send step says what it means.
- **Older bills keep their numbers.** Counters are kept per period, never go back, and travel with backups.

### Quicker entry
- **A number button on every product,** or hold the product, opens the quantity sheet. It has a large number pad, so the phone keyboard never covers it.
- **Standard units with icons:** pcs, kg, g, ltr, ml, pack, box, bottle, jar, bag, dozen, pair, set, m, cm, plate, cup and hr, or type your own. A product's name picks its unit ("Toor dal" → kg) until you choose one. Bills print the units in the bill language (kg → किलो).
- **Delivery in one tap:** None, ₹30, ₹50, ₹100, or another amount.
- **Discounts as a percent or an amount:** 5%, 10%, 15%, 20%, or ₹20, ₹50, ₹100, or another value. Bills say "Discount (10%)".
- **🧹 Clear** empties the bill but keeps its number and date, with Undo.

### Getting paid
- **📲 A payment QR for Due and Draft bills,** above the bill and on Due bills in History. It shows a large QR code for the exact amount, with the shop name and UPI ID.
- **Payment received** marks the bill paid, with Undo.
- **Without a UPI ID** it shows your own QR picture, or explains how to add one.

### A friendlier look (screens only; bills stay formal)
- **Product pictures:** 101 emoji in eight groups. Choose one in the product form, or let the product's name pick it.
- **Emoji throughout:** the steps, statuses, customers, summary, notices and Settings.
- **Illustrated empty screens** for no products, an empty bill, no bills yet and the shop setup.

### Data
- **Backup files now carry the bill-number counters (format 3).** Version 1.0 refuses them as made by a newer version; 1.1 still reads every older backup.

## 1.0.0 (2026-11-04)
The first complete release: payments that work, data that is safe, and an app that works offline.

### Payments
- **The UPI payment QR code now scans.** It is made by a standard QR encoder and checked with two independent readers at every QR size. The old code could not be read by any scanner.
- **Payment QR codes are larger on the bills** (112 px; 120 px on the receipt).
- **A QR code appears only for bills in rupees** and only for a well-formed UPI ID.

### Your data
- **No made-up shop or sample data.** New installs start empty, with a short setup for the shop name, phone and UPI ID. The made-up UPI ID that earlier versions saved by default is cleared.
- **A full browser storage is reported.** A bill that could not be saved never looks saved.
- **Restores are checked and can be undone.** A backup is checked completely before it is restored, the app asks first, and Undo puts everything back.
- **Bill numbers never repeat.** They keep counting up after a deletion, a number already used is refused, and you can set your own prefix.
- **Backup reminder.** History reminds you when bills are not yet in a backup file, and Settings shows the date of the last backup.

### Works offline, installs as an app
- **Everything is kept on the device**, so the app opens and makes bills without internet.
- **Install it** from Settings, or on iPhone with Add to Home Screen.
- **Updates wait for "Update now".**

### Bills and sharing
- **Files look the same from any device.** PDF and image files use a fixed A4 sheet, or an 80 mm receipt for the receipt design, and match the screen.
- **Exports work offline.**
- **PDFs are small**, about 200 KB a page instead of several MB, and a long bill is split into pages between rows.
- **On phones, files go straight to the share sheet**, so a bill can be sent to WhatsApp as a PDF or image.
- **Readable dates** in your language, a "Pay by" date for Due bills, and badge colours for Paid, Due and Draft.
- **Bill layouts fit their space** on a phone, beside the editor on a computer, and on paper.

### History
- **A sales summary:** paid today, paid this month, and what is still due.
- **For Due bills:** Mark paid (with Undo), and Remind, which opens WhatsApp with a short reminder.
- **Excel (CSV) download** of the bills shown.

### Customers
- **Suggestions:** typing a name offers past customers and fills in their phone and address.

### Accessibility
- **Dialogs work with a keyboard and screen reader:** focus moves into them and back out, Escape works, and the rest of the app is out of reach while one is open.
- **Every bill-line field has a label,** screen readers hear what was added, and a skip link leads to the content.
- **Colours meet WCAG AA contrast.**

### Security and privacy
- **Nothing loads from other websites,** under a Content Security Policy. The font and export libraries are served with the app.
- **Everything shown is escaped,** including data from backup files.
- **Spreadsheet cells cannot run formulas.**

### Reliability
- **Errors are reported, not hidden.** Unexpected errors show a short notice, and a page that fails to start says so in English and Hindi.

### For developers
- **Browser tests:** `npm run e2e` runs the main journeys in headless Chrome.
- **Unit tests** for QR, backups, storage, exports, contrast and the offline file list.
- **CI** on GitHub Actions.
- **`npm run serve`** is a small Node server.

## 0.2.0
- **A bill in a few taps.** On phones there are two steps, Items then Send, with product tiles, a quantity sheet for items sold by weight, recent customers and auto-save.
- **Short, playful motion** that stops when the device asks for reduced motion.
- **English and Hindi,** with separate app and bill languages, voice typing and read-aloud.
- **Phone-first layout.**
- **Printing shows only the bill.**
