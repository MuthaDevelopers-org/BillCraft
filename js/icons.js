/**
 * Pictures for products: emoji in groups for the picker. They show on screens only
 * (tiles, bill lines, the product list), never on bills. All are Emoji 12 or older,
 * so they show on phones from 2019 on (Android 10, iOS 13). Pure, no DOM
 * (tests/icons.test.js).
 */

import { suggestForProduct } from './units.js';

/** Stored for a product whose owner chose no picture, even if its name suggests one */
export const NO_ICON = 'none';

/** The picker's groups, in order; the names are iconGroup.<key> in the locales */
export const ICON_GROUPS = [
  { key: 'food', icons: ['🍛', '🥟', '🍲', '🍜', '🍞', '🥪', '🍕', '🍔', '🍩', '🍰', '🎂', '🍪', '🍫', '🍬', '🍿'] },
  { key: 'grocery', icons: ['🍚', '🌾', '🥔', '🧅', '🍅', '🥕', '🥦', '🍎', '🍌', '🥭', '🥚', '🥣', '🧀', '🧈', '🧂', '🛢️', '🍯'] },
  { key: 'drinks', icons: ['🥛', '☕', '🍵', '🧃', '🥤', '💧', '🍹', '🥥'] },
  { key: 'home', icons: ['🧼', '🕯️', '🪔', '🧹', '🧺', '🧽', '🧻', '💡', '🔌', '🛏️', '🪑', '🍽️', '🏺'] },
  { key: 'clothes', icons: ['👕', '👗', '🥻', '👖', '🧥', '🧣', '🧦', '👟', '👡', '👜', '🧵', '🧶'] },
  { key: 'beauty', icons: ['💄', '💅', '💇', '💆', '🧴', '🪒', '🌸', '💍', '📿', '👓'] },
  { key: 'gifts', icons: ['🎁', '🎀', '🎉', '🎈', '🧸', '💐', '🌹', '💌', '🎊', '🖼️'] },
  { key: 'services', icons: ['✂️', '🔧', '🛠️', '💻', '📱', '📚', '🎓', '🚚', '🛵', '📷', '🩺', '🧾', '📓', '🖊️', '💊', '📦'] }
];

const ALL_ICONS = new Set(ICON_GROUPS.flatMap(group => group.icons));

export function isProductIcon(icon) {
  return ALL_ICONS.has(icon);
}

/** What a product keeps: a picture from the list, NO_ICON, or '' to follow its name */
export function cleanIcon(icon) {
  return icon === NO_ICON || isProductIcon(icon) ? icon : '';
}

/**
 * The picture shown for a product or a typed item: the one chosen, else the one its
 * name suggests ("Toor dal" → 🌾), else none ('').
 */
export function pictureFor({ icon = '', name = '' } = {}) {
  if (icon === NO_ICON) return '';
  return isProductIcon(icon) ? icon : (suggestForProduct(name)?.icon || '');
}

/** The group a picture belongs to, so the picker opens there */
export function groupOf(icon) {
  return (ICON_GROUPS.find(group => group.icons.includes(icon)) || ICON_GROUPS[0]).key;
}
