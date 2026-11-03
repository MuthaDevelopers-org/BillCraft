# Third-party notices

BillCraft serves these files itself, so it works offline and never contacts another website. Each file is unchanged from its published release, and its licence sits beside it.

| What | Files | Version | Licence | Source |
|---|---|---|---|---|
| html2canvas (PNG and PDF export) | `vendor/html2canvas-1.4.1.min.js` | 1.4.1 | MIT, `vendor/LICENSE-html2canvas.txt` | npm `html2canvas@1.4.1`, `dist/html2canvas.min.js` |
| jsPDF (PDF export) | `vendor/jspdf-2.5.1.umd.min.js` | 2.5.1 | MIT, `vendor/LICENSE-jspdf.txt` | npm `jspdf@2.5.1`, `dist/jspdf.umd.min.js` |
| Plus Jakarta Sans (the app's font, Latin) | `fonts/plus-jakarta-sans-latin-wght-normal.woff2`, `fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2` | Fontsource 5.3.0 | SIL Open Font License 1.1, `fonts/OFL.txt` | npm `@fontsource-variable/plus-jakarta-sans@5.3.0`, `files/` |

The jsPDF file keeps the copyright notices of the code bundled inside it, for example its font metrics (Adobe Systems, 2008).

The QR code encoder in `js/qrHelper.js` is BillCraft's own code. It follows the structure of Project Nayuki's QR Code generator (MIT licence).

## Checking the files
Each tarball was downloaded with `npm pack <name>@<version> --ignore-scripts`. Its SHA-512 matched the npm registry's `dist.integrity`. The two scripts also match the SRI hashes that cdnjs publishes for the same versions:

| File | SHA-512 (base64) |
|---|---|
| `vendor/html2canvas-1.4.1.min.js` | `BNaRQnYJYiPSqHHDb58B0yaPfCu+Wgds8Gp/gU33kqBtgNS4tSPHuGibyoeqMV/TJlSKda6FXzoEyYGjTe+vXA==` |
| `vendor/jspdf-2.5.1.umd.min.js` | `qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==` |

To check a file again:

```bash
openssl dgst -sha512 -binary vendor/jspdf-2.5.1.umd.min.js | openssl base64 -A
```

To update a library, replace its file and licence, then update this page and `js/exporter.js`.
