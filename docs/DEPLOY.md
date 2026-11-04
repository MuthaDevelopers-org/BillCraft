# Deploying BillCraft

BillCraft is a set of static files. Any static host that serves HTTPS can run it: GitHub Pages, Netlify, Cloudflare Pages, or a plain web server. It has no server code and no database. Each person's data stays in their own browser.

## What to publish
Publish these files:
- `index.html`, `manifest.webmanifest`, `sw.js`
- the folders `css/`, `js/`, `vendor/`, `fonts/` and `icons/`
- `THIRD_PARTY_NOTICES.md`

`docs/`, `scripts/`, `tests/` and `.github/` are not needed by the app, but publishing them does no harm.

All paths are relative, so the app also works from a subfolder, such as `https://<user>.github.io/BillCraft/`.

## HTTPS is required
Browsers allow offline use, installing the app, and microphone access only on HTTPS (or `localhost`). On plain HTTP the app still makes bills, but it does not work offline and cannot be installed.

## Headers
`index.html` already carries a Content Security Policy as a `<meta>` tag. Where the host allows response headers (Netlify and Cloudflare Pages through a `_headers` file, or nginx and Apache configuration), also send these:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), geolocation=(), payment=(), usb=(), microphone=(self)
```

- `frame-ancestors 'none'` stops other sites from showing BillCraft inside a frame. It works only as a header; the `<meta>` tag cannot set it.
- `sw.js` and `index.html` should be sent with `Cache-Control: no-cache`, so browsers check for new versions. Other files can be cached normally, because the service worker downloads each version as one set.
- GitHub Pages cannot set headers. The `<meta>` policy still applies there; only the framing protection is missing.

## Release checklist
1. Update the version in `package.json` and `js/config.js`; a test checks that they match. Add a `CHANGELOG.md` entry.
2. Run `npm run stamp`, then `npm test`, `npm run check` and `npm run e2e`.
3. Manual checks on real phones:
   - Scan a bill's QR code with Google Pay, PhonePe or Paytm, and confirm the payee and amount. Paying ₹1 to your own UPI ID is the safest test.
   - Install the app on an Android phone and an iPhone, switch on airplane mode, and make and share a bill.
4. Commit, tag (for example `v1.0.0`) and publish the files.

## How updates reach people
- **An open app** notices the new version in the background. It shows "A new version of BillCraft is ready" with **Update now**, and the same offer appears in Settings → App.
- **If nobody taps Update**, the new version starts the next time the app is fully closed and opened.
- **The app checks for updates** when it comes back to the screen, at most once an hour.
- **To roll back**, publish the previous files again. Their content hash differs, so browsers treat them as a new version.

## Their data
- **Publishing a new version never touches anyone's bills or settings.**
- **Moving the app to a different web address leaves the data behind.** Browsers keep data per address. People must save a backup file on the old address and restore it on the new one.
- **Clearing the browser's site data deletes everything.** This is why the app reminds people to save backups.

## Testing on a phone during development
`npm run serve -- --lan` opens the dev server to devices on your network, and prints the addresses to use. It is plain HTTP, so offline use and installing are off. Test those on an HTTPS deployment. Use `--lan` only on a network you trust.
