# Project state

Branches (local, not pushed):
- `feature/mobile-first-i18n`: phone-first layout, languages, voice and the print fix.
- `feature/fast-bill` (built on the branch above): the fast bill journey and motion.

## Status
- **Fast bill, items first.** Phones get two steps: **Items**, then **Send**. Wider screens (1024px and up) show a sidebar and the editor beside a live preview.
  - **Items.** Product tiles, most used first, each with a coloured initial. A tap adds one and a badge shows the count. Search filters the tiles (with a mic); Enter adds the first match. "In this bill" shows one line per item with − qty +, and "Edit" opens the rate, unit, discount and description.
  - **Weight and length.** Products sold in kg, g, litre, ml, metre or cm (and the Hindi units) open a quantity sheet: presets in one tap, or any amount typed or spoken, with a live line total. Tapping any line's quantity opens the same sheet.
  - **"+ Other item"** adds a line ready for typing; "Save to my products" turns it into a tile.
  - **Bottom bar.** The item count and running total with Next on Items; Back and a large "Send on WhatsApp" on Send.
  - **Send.** Customer chips (Walk-in, up to 8 recent customers from history, "+ New") and Paid / Due / Draft as one control. Bill number, date, address and note sit under "More options".
  - **Auto-save.** WhatsApp, Print, PDF, Image and Save put the bill into history first, updating the same entry. The notice offers "+ New Bill". New bills start empty. "+ New Bill" never asks, and offers Undo when the old bill had unsaved items. A draft that was already saved gives way to a fresh bill when the app opens.
  - **History.** Repeat copies a bill's items and customer into a new bill on the Send step.
- **Motion** (`js/motion.js`). Playful but short: 0.3 to 0.45 s, and 0.7 s for the burst after sending. It never delays a tap, and it is off when the device asks for reduced motion.
- **Speed.** The preview redraws only when it is visible, at most once per frame. The UPI QR code is regenerated only when the amount, bill number or UPI ID changes. html2canvas and jsPDF load on first export.
- **Languages.** English and Hindi. Hindi, including the new screens, is a draft that needs native review. Ten more languages are registered and wait for a locale file (see `docs/I18N.md`).
- **App language and bill language are separate.** The bill language defaults to the app language.
- **Voice.** Microphones beside the product search, the customer name and phone, the item name and rate (under Edit), and in the quantity sheet. A speaker reads the total aloud. Both are hidden where the browser lacks speech support; consent is asked once.
- **Printing.** Only the bill prints, whichever view is open.
- **Backup restore.** A valid backup applies; a file that is not a BillCraft backup is refused.

## Verification (2026-11-02, macOS, Node 26.12.0, Google Chrome headless)
- `npm test`: **34 of 34 pass** (`node --test tests/*.test.js`). New in `tests/quickBill.test.js`: weight units and presets, quantity steps and rounding, adding to an existing line, removing at zero, product order from history, and recent customers. The markup test confirms every translation key is defined and used.
- `npm run check`: every file in `js/` parses.
- **Browser checks** (scripts driven through the DevTools protocol, kept outside the repo; phones and tablets with touch emulation):
  - **Benchmark.** A repeat customer buying 2 products, one of them twice, sent on WhatsApp: **6 taps** and no typing (Candle, Candle, Honey, Next, Meera, Send). History holds the bill with those items and that customer, and WhatsApp opens `wa.me/919912345678` with the total ₹1,280.00. A walk-in bill takes **5 taps**, counting "+ New Bill".
  - **Speed.** With the CPU slowed 4×, each of 12 taps ran its handler in at most 10 ms and reached the next frame in at most 17 ms. Start-up loads no export library. PNG and PDF downloads still work, loading the libraries on first use. Typing on the Items step does not redraw the hidden preview.
  - **Weight.** A kg product opens the sheet without opening the keypad. The 0.5 preset adds 0.5 kg. Typing 2.5 shows "2.5 kg × ₹ 60.00 = ₹ 150.00".
  - **Motion.** A tile tap plays the flying "+1", the badge pop, the line slide and the count-up, each 450 ms or less. Four quick taps give a quantity of 4. A removed line collapses and is gone within 450 ms. Send shows a tick and 14 dots, which then clear. With reduced motion emulated, a tap starts no animation and the totals are final at once.
  - **Layouts.** No horizontal overflow at 375, 768 and 1280px. Hindi labels fit the chips and the status control. No console errors and no blocking dialogs.
  - **Print.** Only the bill is visible under print at 375 and 1280px: one page each for the Modern and Thermal designs.
- **Checked on 2026-11-01 and not re-run for this work:** the Hindi bill text and amount in words, an English bill with a Hindi app, backup restore, and the Hindi PNG export.
- **Not verified:** a person timing real bills on a phone (the target is 8 seconds or less); speech recognition and read-aloud; Safari, Firefox, iOS and Android browsers; the Hindi wording by a native speaker; RTL layout.

## Decisions
- **Items first, in two steps.** The product grid is the main path. The customer is optional and is chosen when sending.
- **Popularity and recent customers come from saved bills**, so the stored data did not change.
- **Weight and length are recognised from the unit name** (`js/quickBill.js`). Any line's quantity can be tapped as well, so a unit that is not on the list still works.
- **A tile tap adds one; the sheet sets a quantity.** For weight items, the tile opens the sheet with the current amount filled in.
- **Every way out saves.** WhatsApp, Print, PDF and Image save to history first. Save remains for saving without sending.
- **Undo instead of confirm.** "+ New Bill" never blocks. Deleting a product or a bill still asks.
- **Motion is decoration.** The state changes first; animations use only transform and opacity, through `js/motion.js`. The step pill, the Paid/Due/Draft pill and the tile press use CSS transitions.
- **On phones, WhatsApp lives in the bottom bar**, so the action row hides its copy. On desktop it leads the action row.
- **Printing always prints the bill** (see `css/invoice-templates.css`).
- **`formatCurrency`** always uses en-IN grouping with Latin digits.

## Risks
- The Hindi text, including the new screens, is a draft.
- People used to entering the customer first will now find the customer on the Send step.
- Speech recognition can send audio to Google's or Apple's servers. Consent is asked first, and the README says so.
- Print hides app elements by a list. A new bar, toolbar or modal that is not on the list will print (`tests/print.test.js` checks the current list).
- Motion was measured in headless Chrome with CPU throttling, not on a low-end phone.
- RTL layout has not been audited. The new styles use logical properties where it matters (badges and pills).
- The Python development server reset connections in earlier browser checks, so verification uses a Node static server. `npm run serve` is for local use only.

## Next steps
1. Time 3 real bills on a phone: a repeat customer, a walk-in, and a weight item. The target is 8 seconds or less.
2. Native review of `js/i18n/locales/hi.js`, including the new strings.
3. Test on an Android phone and an iPhone: the flow, motion, voice and printing.
4. Decide when to push the branches and open pull requests.
5. Choose the next languages (see `docs/I18N.md`).
