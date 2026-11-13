# BillCraft: bills for small businesses

A phone-first bill maker for home businesses, artisans and local shops. It runs in the browser, works without internet once opened, and can be installed like an app. There is no account and no server: every bill stays on your own phone or computer. English and Hindi, so someone who reads little English can still make a bill.

## What it does
- **A bill in a few taps.** On a phone there are two steps: Items, then Send.
  - Tap product tiles to add them; the ones you use most come first.
  - For many at once, use a product's number button, or hold the product, and type the amount on a large number pad.
  - Items sold by weight or length ask how much, with one-tap amounts.
  - Pick a recent customer with one tap, or leave it as Walk-in.
  - Delivery and discount in one tap: ₹30, ₹50, ₹100 for delivery; 5% to 20%, or ₹20 to ₹100, off.
  - 🧹 Clear starts the bill again, with Undo.
- **Units with icons.** Pick pcs, kg, litre, pack, bottle, dozen and more, or type your own. A product's name suggests its unit and picture ("Toor dal" → kg, 🌾).
- **Bill numbers that say something.** `AC-2611-042` is your 42nd bill of November 2026. Daily and financial-year formats are in Settings.
- **Payment by UPI QR code.** Every rupee bill carries a QR code for your UPI ID with the exact amount, so customers scan and pay. For a Due or Draft bill, **📲 Show payment QR** puts a large code on the screen, and **Payment received** marks the bill paid.
- **Send it anywhere.**
  - WhatsApp straight to the customer's number.
  - On a phone, the PDF or image goes through the share sheet: WhatsApp, Drive and more.
  - Printing gives a clean bill on A4 or a receipt printer.
- **Four bill designs:** Modern, Classic, Boutique and a compact receipt.
- **Due bills.**
  - Mark a bill Due, with a date to pay by.
  - History shows what is still due, and Remind sends a polite WhatsApp reminder.
  - Mark paid when the money arrives.
- **A sales summary:** paid today, paid this month, and what is due. Download bills as a spreadsheet (CSV) for Excel or your accountant.
- **Two languages.** The app and the bill can be in different languages, for example the app in Hindi and the bill in English. Dates and amounts in words follow the language.
- **Voice.** Tap the microphone beside a name, number or price to speak it, or the speaker to hear the total. These show only where the browser supports speech.
- **Works offline and installs as an app** (on HTTPS), on Android and iPhone. Updates arrive when you tap "Update now".
- **Pictures and emoji on the screens** make products and actions easy to spot. The bills themselves stay formal.

## Your data and privacy
- **Everything stays in this browser on this device.** Your products, bills and settings are never uploaded, and there is no account.
- **The app contacts no other website.** Its fonts and tools are part of the app.
- **Save a backup file regularly** from **Settings → Backup & Restore**. History reminds you when bills are not yet in a backup. Clearing the browser's site data, or losing the phone, removes the bills that are not in a backup. A backup file also moves your bills to another phone.
- **Voice typing** uses your browser's or phone maker's speech service (for example Google or Apple), which may process your voice on their servers. BillCraft does not record or store audio, and asks for your consent the first time you use a microphone.

## Running it
The app uses JavaScript modules, which browsers block when a page is opened from a file, so serve the folder instead. Node 22 or later:

```bash
npm run serve            # http://127.0.0.1:8089
npm run serve -- --lan   # also reachable from a phone on your network (plain HTTP)
```

Offline use and installing need HTTPS, or `localhost`. To try them locally, open http://127.0.0.1:8089/?sw=1.

## Putting it on your phones
`npm run package` makes a `site` folder. Drag it onto https://app.netlify.com/drop for a free HTTPS address, then open that address on the phone and install the app. The steps, updates and other hosts are in [docs/DEPLOY.md](docs/DEPLOY.md).

## Testing
```bash
npm test          # unit tests: QR codes, bill maths, bill numbers, units, pictures, backups, storage, exports, escaping, contrast, translations, offline file list
npm run check     # syntax check of every script
npm run e2e       # browser tests in headless Chrome (set CHROME_PATH if Chrome is not found)
npm run stamp     # after changing any file the app serves: updates the offline file list in sw.js
npm run package   # the site folder to upload (stops if the stamp is out of date)
```

There are no dependencies to install, and no build step.

## Languages
English, and Hindi. The Hindi text is a draft that still needs review by a native speaker. Ten more Indian languages are ready to be added; see [docs/I18N.md](docs/I18N.md).

## Project documents
- [CLAUDE.md](CLAUDE.md): working rules for this repository
- [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md): status, verification results, decisions and risks
- [docs/DEPLOY.md](docs/DEPLOY.md): hosting, headers and the release checklist
- [docs/I18N.md](docs/I18N.md): languages
- [CHANGELOG.md](CHANGELOG.md), [SECURITY.md](SECURITY.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
