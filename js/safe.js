/**
 * Values that go into the page. Text is escaped before it is placed in markup,
 * and images are shown only as inline data: an upload, or the app's own QR code.
 * Backups and old data can hold anything, so nothing stored is trusted.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for HTML content and quoted attributes. 0 stays "0"; null and undefined become "". */
export function escapeHTML(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, char => ESCAPES[char]);
}

// An uploaded picture: PNG, JPEG, WebP or GIF as base64
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
// The app's own QR code (js/qrHelper.js): a URL-encoded SVG
const QR_SVG_DATA_URL = /^data:image\/svg\+xml;charset=utf-8,%3Csvg[A-Za-z0-9%._~!*'()-]*$/;

/** About 2 MB of image data, as base64 */
export const MAX_IMAGE_CHARS = 2_800_000;

/** The image address when it is one of the kinds above, otherwise "" */
export function safeImageSrc(src) {
  const text = typeof src === 'string' ? src : '';
  if (!text || text.length > MAX_IMAGE_CHARS) return '';
  return IMAGE_DATA_URL.test(text) || QR_SVG_DATA_URL.test(text) ? text : '';
}
