# Project state

Branch: `feature/mobile-first-i18n` (local, not pushed).

## Status
- **Mobile first.** Phones get a bottom navigation bar and a three-step bill: Customer, Items, Done. Fields that are not essential sit under "More options". Wider screens (1024px and up) get a sidebar and the editor beside a live preview.
- **Languages.** English and Hindi are offered. Hindi is a draft that needs native review. Ten more languages are registered and wait for a locale file (see `docs/I18N.md`).
- **App language and bill language are separate.** The bill language defaults to the app language. The bill's labels, amount in words, PDF, PNG, print and WhatsApp text all follow the bill language.
- **First-run picker.** Shown until a language is chosen. The globe button in the top bar reopens it.
- **Voice.** A microphone button sits beside customer name, phone, item name, rate and quantity. A speaker button reads the total aloud. Both are hidden where the browser lacks speech support. Consent is asked once.
- **Backup restore.** A valid backup applies, and the screens refresh without attaching duplicate listeners (the old code re-ran `init()`). A file that is valid JSON but not a BillCraft backup is now refused with a message.

## Verification (2026-11-01, macOS, Node 26.12.0, Google Chrome headless)
- `npm test`: **25 of 25 pass** (`node --test tests/*.test.js`). The tests cover the locale key parity, that every key used in the code and markup exists and that none is unused, that scripts only look up element IDs that exist, English amount-in-words unchanged from the original output, Hindi amounts, formatting, settings defaults, bill totals, and voice digit normalisation.
- `npm run check`: every file in `js/` parses.
- **Browser check** (a script driven through the DevTools protocol, kept outside the repo). It ran at 375×812 and 1280×800:
  - The picker opens on a first visit. Choosing Hindi switches the page title, step labels, navigation and placeholders.
  - Steps 1, 2 and 3 show the right panels. Back and Next appear only where they should.
  - The Hindi bill shows its title and amount in words ("चार सौ पचास मात्र"). With the bill language set to English, the bill comes out in English while the app stays in Hindi.
  - At 1280px the sidebar is sticky at 250px, the step bar and Back/Next are hidden, and both panels show with "More options" open.
  - Saving a bill adds it to history. Restoring a valid backup applies it; a non-backup file shows the error toast.
  - html2canvas renders the Hindi bill to PNG with the Devanagari text correct.
  - No horizontal overflow at either width. **No console errors.**
- **Not verified:** speech recognition and read-aloud (they need microphone and speaker permissions); the PDF download through jsPDF; Safari, Firefox, iOS and Android browsers; wording of the Hindi text by a native speaker.

## Decisions
- **Item cards replace the desktop item table at every width.** At 1280px the editor column is about 520px, and the table needs about 700px. Totals and remove buttons were scrolled out of view.
- **`formatCurrency` takes no locale parameter.** It always uses en-IN grouping with Latin digits, so a locale argument would change nothing.
- **`numberToWords` stays as the English wrapper.** Other languages use their own `words` block.
- **Voice number fields** accept digits in any Indic script. Spoken number words (for example "पाँच सौ") are not converted yet.
- **Bill design on phones** uses smaller table text and a wider item column. The desktop values return from 640px.

## Risks
- The Hindi translation is a draft.
- Chrome and Android speech recognition can send audio to Google's servers. Users are asked for consent first, and the README says so.
- Users who had saved settings before this change will see the language picker once, because their settings have no language yet.
- RTL layout has not been audited.
- The Python development server reset connections during browser checks, so verification used a separate Node static server. The `npm run serve` script is for local use only.

## Next steps
1. Native review of `js/i18n/locales/hi.js`, then remove the draft note from its header.
2. Choose the next languages and add their locale files (see `docs/I18N.md`).
3. Test voice input and read-aloud on an Android phone and an iPhone.
4. Test the PDF download and the printed bill in Chrome and Safari.
5. Review the branch diff and open a pull request when ready.
