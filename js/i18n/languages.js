/**
 * Language registry.
 *
 * Every language BillCraft can show is listed here. `loader` is set only when
 * a locale file exists in ./locales/, so the picker never offers a language
 * that would fall back to English. To add a language, see docs/I18N.md.
 */

export const DEFAULT_LANGUAGE = 'en';

export const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', speech: 'en-IN', loader: () => import('./locales/en.js') },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr', speech: 'hi-IN', loader: () => import('./locales/hi.js') },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', dir: 'ltr', speech: 'mr-IN', loader: null },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', dir: 'ltr', speech: 'gu-IN', loader: null },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', dir: 'ltr', speech: 'bn-IN', loader: null },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', dir: 'ltr', speech: 'ta-IN', loader: null },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', dir: 'ltr', speech: 'te-IN', loader: null },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', dir: 'ltr', speech: 'kn-IN', loader: null },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', dir: 'ltr', speech: 'ml-IN', loader: null },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', dir: 'ltr', speech: 'pa-IN', loader: null },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', dir: 'ltr', speech: 'or-IN', loader: null },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', dir: 'rtl', speech: 'ur-IN', loader: null }
];

export function getLanguage(code) {
  return LANGUAGES.find(language => language.code === code) || null;
}

/** Languages that have a locale file and can be shown in the picker. */
export function availableLanguages() {
  return LANGUAGES.filter(language => language.loader);
}
