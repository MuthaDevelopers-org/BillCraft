# BillCraft: Domestic Business Bill & Invoice Maker

A simple, phone-first bill and invoice maker for domestic businesses, artisans, home sellers and local shops. It runs in the browser with no account and no server. It supports several Indian languages, so someone who reads little or no English can still make a bill.

## Features
- **Guided bill on phones.** Three steps: Customer, Items, Done. Only the essential fields show; the rest sit under "More options".
- **Languages.** English and Hindi today, with more to come. The app language and the bill language can differ, so a bill can print in English while the app is in Hindi.
- **Voice.** Tap the microphone beside a name or number to speak it. Tap the speaker to hear the total read aloud. Shown only where the browser supports speech.
- **Four bill designs:** Modern Minimal, Classic Executive, Artisan Boutique and Compact Thermal POS slip.
- **UPI QR code** for each bill, made from your UPI ID (or use your own QR image).
- **Export:** PDF, PNG image, print, or a WhatsApp message.
- **Product catalog**, bill history, and JSON backup and restore.
- **Wider screens:** a sidebar, with the bill editor beside a live preview.

## Running
The app uses JavaScript modules, which browsers block when a page is opened from a file. Serve the folder instead:

```bash
npm run serve
```

Then open http://127.0.0.1:8089.

## Testing
```bash
npm test       # unit and markup tests
npm run check  # syntax check of every JavaScript file
```

## Voice typing and privacy
Voice typing and read-aloud use the speech features built into your browser or phone. Recognition may be processed by the speech service of your browser or phone maker (for example Google or Apple), which can run on their servers. BillCraft does not record or store audio. The first time you use a microphone button, the app asks for your consent and saves the answer in your settings.

## Your data
Products, settings and bills are stored only in this browser (`localStorage`). Nothing is uploaded. Clearing the site's data erases them, so save a backup file regularly from **Settings → Backup & Restore**.

## Languages
English, and Hindi (the Hindi text is a draft that still needs review by a native speaker). See [docs/I18N.md](docs/I18N.md) to add a language.

## Project documents
- [CLAUDE.md](CLAUDE.md): working rules for this repository
- [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md): status, verification results and risks
- [docs/I18N.md](docs/I18N.md): languages
