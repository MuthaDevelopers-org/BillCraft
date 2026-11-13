/**
 * Translation runtime.
 *
 * Usage:
 *   const locale = await loadLocale('hi');
 *   const { t, words } = createTranslator(locale);
 *   t('toast.billSaved', { number: 'BILL-004' });   // "बिल #BILL-004 सेव हो गया!"
 *   words(1520);                                     // "एक हज़ार पाँच सौ बीस मात्र"
 *
 * Translations are plain text. Callers that put a result into innerHTML must
 * escape it first, the same as any other user data.
 */

import english from './locales/en.js';
import { DEFAULT_LANGUAGE, getLanguage } from './languages.js';
import { spellAmount } from './numberWords.js';

const cache = new Map();

async function importLocale(code) {
  const language = getLanguage(code);
  if (!language || !language.loader) return null;
  try {
    return (await language.loader()).default;
  } catch (error) {
    console.error(`Could not load the ${code} language file`, error);
    return null;
  }
}

/** Resolves a locale module, falling back to English if it is missing. */
export async function loadLocale(code) {
  if (!cache.has(code)) cache.set(code, importLocale(code));
  return (await cache.get(code)) || english;
}

/**
 * Builds `t(key, params)` and `words(amount)` for one locale, and keeps its
 * language code (for dates). A key missing from the locale falls back to
 * English, then to the key itself, so a half-finished translation never shows
 * a blank label.
 */
export function createTranslator(locale = english, language = DEFAULT_LANGUAGE) {
  const messages = locale.messages || {};
  const fallback = english.messages;

  const t = (key, params = {}) => {
    const text = messages[key] || fallback[key] || key;
    return text.replace(/\{(\w+)\}/g, (match, name) =>
      Object.hasOwn(params, name) ? String(params[name]) : match
    );
  };

  const words = (amount) => spellAmount(amount, locale.words || english.words);

  return { t, words, language };
}

/** Sets <html lang> and <html dir> for the chosen language. */
export function setDocumentLanguage(code, root = document.documentElement) {
  const language = getLanguage(code) || getLanguage(DEFAULT_LANGUAGE);
  root.lang = language.code;
  root.dir = language.dir;
}

/**
 * Fills every element marked with a data-i18n attribute. Only text, placeholder,
 * title and aria-label are touched, and always as plain text.
 */
export function applyTranslations(t, root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
}

// Bills store statuses in English ("Paid", "Due", "Draft") so old data and
// backups keep working. Only the display is translated.
const STATUS_KEYS = { paid: 'status.paid', due: 'status.due', draft: 'status.draft' };

export function statusLabel(t, status) {
  const key = STATUS_KEYS[String(status || '').toLowerCase()];
  return key ? t(key) : String(status || '');
}

/** A discount's `name` with its percent, "Discount (10%)", or the name alone for an amount */
export function discountLabel(name, invoice) {
  return invoice.discountType === 'percent' ? `${name} (${Number(invoice.discountValue.toFixed(2))}%)` : name;
}

/** The badge colour for a status: green for Paid, red for Due, grey for Draft */
export function statusBadgeClass(status) {
  return { paid: 'badge-paid', due: 'badge-due', draft: 'badge-draft' }[String(status || '').toLowerCase()] || 'badge-draft';
}
