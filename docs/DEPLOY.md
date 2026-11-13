# Deploying BillCraft

BillCraft is a set of static files. Any static host that serves HTTPS can run it: GitHub Pages, Netlify, Cloudflare Pages, or a plain web server. It has no server code and no database. Each person's data stays in their own browser.

## Netlify Drop: the quickest way onto your phones
No command line and no Git; your GitHub repository stays private.

1. Run `npm run package`. This creates the `site` folder: only the app's files, plus a `_headers` file with the security headers.
2. Open https://app.netlify.com/drop and sign in. A free account is enough.
3. Drag the `site` folder onto the page. After a few seconds Netlify shows the address, for example `https://melodic-tarsier-1a2b3c.netlify.app`.
4. Optional, but do it now: under **Site configuration → Change site name**, pick a name such as `ashacandles-bills`. The address becomes `https://ashacandles-bills.netlify.app`. Bills are stored per address, so choose the name before people start using the app.
5. On the phone, open that address:
   - **Android (Chrome):** tap **Install app** in Settings → App, or **⋮ → Install app** in Chrome.
   - **iPhone (Safari):** tap **Share**, then **Add to Home Screen**.

The app now opens from the home screen and works without internet.

**To update:** run `npm run stamp` and `npm run package` again. Then, in Netlify, open the site's **Deploys** page and drag the new `site` folder onto it. Phones show "A new version of BillCraft is ready", and **Update now** loads it.

**Quick test on the same Wi-Fi, without uploading:** run `npm run serve -- --lan` and open the printed address on the phone, for example `http://192.168.1.16:8089`. Bills work, but installing, offline use, the share sheet and voice need HTTPS, so they are off this way.

## Netlify from GitHub: published on every push
When the Netlify site is linked to the GitHub repository, `netlify.toml` tells Netlify what to do: run `npm run package` and publish the `site` folder, with its `_headers`. Every push to the production branch (`main`) then goes live within a minute or two.

- **Check the link** in Netlify under **Site configuration → Build & deploy**: the repository should be BillCraft and the production branch `main`. The build command and the publish folder come from `netlify.toml`, so leave those fields empty there.
- **A deploy fails on purpose** when `sw.js` was not stamped after a change. Run `npm run stamp`, commit and push again.
- **Pull requests get a deploy preview** at their own address. Use it to try a change; bills made there stay at that address.
- **Update by pushing,** not by dragging a folder: the next push replaces anything uploaded by hand.

## What to publish
`npm run package` puts exactly these into `site/`; on another host, publish the same files:
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
4. Commit and tag (for example `v1.1.0`). If Netlify builds from GitHub, merge into `main` and push; otherwise run `npm run package` and upload `site/`.

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
`npm run serve -- --lan` opens the dev server to devices on your network, and prints the addresses to use. It is plain HTTP, so offline use, installing, the share sheet and voice are off; test those on the HTTPS deployment. Use `--lan` only on a network you trust.
