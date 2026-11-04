# Security

## Reporting a problem
Report a security problem privately: use **Report a vulnerability** on the repository's **Security** tab on GitHub. Please do not open a public issue for it. Say what you found, how to reproduce it, and which version (Settings → App) and browser you used.

## How BillCraft protects people's data
- **No server and no account.** Bills, products and settings are stored only in the person's browser (`localStorage`). The app sends no data anywhere.
- **Nothing loads from other websites.** The scripts, the font and the export libraries are served with the app, and the Content Security Policy in `index.html` allows only the app's own site. The page sends no referrer.
- **Everything shown is escaped.** Every value placed into the page goes through one escaping function (`js/safe.js`). Images must be inline pictures or the app's own QR code. Tests render every bill design with hostile data.
- **Backups are checked before restoring.** A restore checks and rebuilds every value first (`js/backup.js`), asks before replacing anything, and can be undone.
- **Spreadsheet exports cannot run formulas.** A cell starting with `=`, `+`, `-` or `@` is disarmed.
- **Payment QR codes** are made only from a well-formed UPI ID and only for bills in rupees. Version 1.0 cleared the made-up UPI ID that earlier versions saved by default.
- **Voice typing** uses the browser's or phone's own speech service, which may process audio on its servers. The app asks for consent before first use and never records audio itself.

## Limits to know about
- Anyone who can unlock the phone, or use the browser profile, can open the app and see the bills. BillCraft has no passcode of its own.
- Browser storage can be cleared by the person or, rarely, by the browser. Backups are the only copy outside the browser.
- GitHub Pages cannot send the `frame-ancestors` header (see `docs/DEPLOY.md`).
