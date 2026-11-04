/**
 * Standard units, with an icon and a name in each language, and suggestions from a
 * product's name. A unit picked from the list is stored as its code ('kg', 'pcs',
 * 'bottle'…) and shown in the reader's language (unit.<code> in the locales); a
 * unit typed by hand is stored and shown as typed. Pure, no DOM (tests/units.test.js).
 */

/**
 * In the order the unit picker shows them, the most used first. code: what is stored.
 * icon: shown on screens only. measured: sold by weight, volume, length or time, so
 * tapping the product asks how much. presets: one-tap amounts. aliases: other ways
 * people write it, in lower case without a final full stop, so old data matches too.
 */
export const UNITS = [
  { code: 'pcs', icon: '🔢', aliases: ['pc', 'piece', 'pieces', 'no', 'nos', 'unit', 'units', 'नग', 'पीस'] },
  { code: 'kg', icon: '⚖️', measured: true, aliases: ['kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'किलो', 'किग्रा'] },
  { code: 'g', icon: '⚖️', measured: true, aliases: ['gm', 'gms', 'gram', 'grams', 'ग्राम'], presets: [50, 100, 200, 250, 500, 750] },
  { code: 'ltr', icon: '🥛', measured: true, aliases: ['l', 'lt', 'litre', 'litres', 'liter', 'liters', 'लीटर'] },
  { code: 'ml', icon: '💧', measured: true, aliases: ['millilitre', 'milliliter', 'मिली', 'मि.ली'], presets: [100, 200, 250, 500, 750, 1000] },
  { code: 'pack', icon: '📦', aliases: ['packs', 'packet', 'packets', 'pkt', 'पैक', 'पैकेट'] },
  { code: 'box', icon: '🗃️', aliases: ['boxes', 'carton', 'डिब्बा', 'बॉक्स'] },
  { code: 'bottle', icon: '🧴', aliases: ['bottles', 'btl', 'बोतल'] },
  { code: 'jar', icon: '🍯', aliases: ['jars', 'जार'] },
  { code: 'bag', icon: '🛍️', aliases: ['bags', 'sack', 'थैला', 'बोरी'] },
  { code: 'dozen', icon: '🥚', aliases: ['dz', 'doz', 'दर्जन'], presets: [0.5, 1, 2, 3, 5, 10] },
  { code: 'pair', icon: '🧦', aliases: ['pairs', 'जोड़ी'] },
  { code: 'set', icon: '🧰', aliases: ['sets', 'सेट'] },
  { code: 'm', icon: '📏', measured: true, aliases: ['mtr', 'metre', 'metres', 'meter', 'meters', 'मीटर'] },
  { code: 'cm', icon: '📐', measured: true, aliases: ['centimetre', 'centimeter', 'सेमी', 'से.मी'], presets: [10, 25, 50, 100, 150, 200] },
  { code: 'plate', icon: '🍽️', aliases: ['plates', 'प्लेट'] },
  { code: 'cup', icon: '☕', aliases: ['cups', 'कप'] },
  { code: 'hr', icon: '⏱️', measured: true, aliases: ['hrs', 'hour', 'hours', 'घंटा', 'घंटे'], presets: [0.5, 1, 1.5, 2, 3, 4] }
];

const MEASURED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 5];
const COUNT_PRESETS = [1, 2, 3, 5, 10, 12];
// Measured units people type that are not in the list above
const OTHER_MEASURED = new Set(['ft', 'feet', 'foot', 'inch', 'inches', 'yard', 'yards', 'sq ft', 'sqft']);

const clean = unit => String(unit || '').trim().toLowerCase().replace(/\.$/, '');

/** The standard unit a stored or typed unit means ('KG', 'Litre', 'किलो' → kg), or null */
export function unitInfo(unit) {
  const text = clean(unit);
  if (!text) return null;
  return UNITS.find(entry => entry.code === text || entry.aliases.includes(text)) || null;
}

/** A unit for people to read: a standard one in the given language, anything else as typed */
export function unitLabel(unit, t) {
  const info = unitInfo(unit);
  return info ? t(`unit.${info.code}`) : String(unit || '');
}

/** Units sold by weight, volume, length or time: tapping such a product asks how much */
export function isMeasuredUnit(unit) {
  const info = unitInfo(unit);
  return info ? Boolean(info.measured) : OTHER_MEASURED.has(clean(unit));
}

/** One-tap amounts for the quantity sheet: grams in 50s, kilograms in quarters, pieces in ones */
export function presetsFor(unit) {
  const info = unitInfo(unit);
  if (info?.presets) return info.presets;
  return isMeasuredUnit(unit) ? MEASURED_PRESETS : COUNT_PRESETS;
}

/**
 * Words in a product's name, and the unit and picture they suggest (English, Hinglish
 * and Hindi). The first rule that matches wins, so specific words come first.
 */
export const SUGGESTIONS = [
  { unit: 'ltr', icon: '🥛', words: ['milk', 'doodh', 'dudh', 'दूध'] },
  { unit: 'ltr', icon: '🧈', words: ['ghee', 'घी', 'butter', 'makhan', 'मक्खन'] },
  { unit: 'ltr', icon: '🛢️', words: ['oil', 'tel', 'तेल'] },
  { unit: 'kg', icon: '🥣', words: ['curd', 'dahi', 'दही', 'yogurt', 'yoghurt'] },
  { unit: 'kg', icon: '🧀', words: ['paneer', 'पनीर', 'cheese'] },
  { unit: 'dozen', icon: '🥚', words: ['egg', 'eggs', 'anda', 'ande', 'अंडा', 'अंडे'] },
  { unit: 'dozen', icon: '🍌', words: ['banana', 'bananas', 'kela', 'केला', 'केले'] },
  { unit: 'kg', icon: '🍚', words: ['rice', 'chawal', 'chaawal', 'चावल', 'basmati', 'बासमती'] },
  { unit: 'kg', icon: '🌾', words: ['dal', 'daal', 'dhal', 'दाल', 'lentil', 'lentils', 'toor', 'tur', 'moong', 'masoor', 'chana', 'चना', 'rajma', 'atta', 'आटा', 'flour', 'maida', 'मैदा', 'besan', 'बेसन', 'wheat', 'gehun', 'गेहूँ', 'gehu'] },
  { unit: 'kg', icon: '🍬', words: ['sugar', 'cheeni', 'chini', 'चीनी', 'shakkar', 'शक्कर', 'gur', 'jaggery', 'गुड़', 'sweets', 'sweet', 'mithai', 'मिठाई', 'laddu', 'ladoo', 'लड्डू', 'barfi', 'बर्फी'] },
  { unit: 'kg', icon: '🧂', words: ['salt', 'namak', 'नमक'] },
  { unit: 'kg', icon: '🧅', words: ['onion', 'onions', 'pyaz', 'pyaaz', 'प्याज', 'प्याज़'] },
  { unit: 'kg', icon: '🥔', words: ['potato', 'potatoes', 'aloo', 'alu', 'आलू'] },
  { unit: 'kg', icon: '🍅', words: ['tomato', 'tomatoes', 'tamatar', 'टमाटर'] },
  { unit: 'kg', icon: '🥭', words: ['mango', 'mangoes', 'aam', 'आम'] },
  { unit: 'kg', icon: '🍎', words: ['apple', 'apples', 'seb', 'सेब', 'fruit', 'fruits', 'phal', 'फल'] },
  { unit: 'kg', icon: '🥦', words: ['vegetable', 'vegetables', 'sabzi', 'sabji', 'सब्ज़ी', 'सब्जी', 'bhaji'] },
  { unit: 'jar', icon: '🍯', words: ['honey', 'shahad', 'शहद', 'jam', 'pickle', 'pickles', 'achar', 'achaar', 'अचार'] },
  { unit: 'bottle', icon: '🧃', words: ['juice', 'जूस', 'sharbat', 'शरबत'] },
  { unit: 'bottle', icon: '💧', words: ['water', 'pani', 'paani', 'पानी'] },
  { unit: 'bottle', icon: '🧴', words: ['shampoo', 'lotion', 'sanitizer', 'handwash'] },
  { unit: 'pack', icon: '🍵', words: ['tea', 'chai', 'chay', 'चाय', 'chaipatti', 'चायपत्ती'] },
  { unit: 'pack', icon: '☕', words: ['coffee', 'कॉफ़ी', 'कॉफी'] },
  { unit: 'pack', icon: '🍪', words: ['biscuit', 'biscuits', 'cookie', 'cookies', 'बिस्कुट', 'namkeen', 'नमकीन', 'chips'] },
  { unit: 'pack', icon: '💊', words: ['medicine', 'tablet', 'tablets', 'dawa', 'dawai', 'दवा', 'दवाई'] },
  { unit: 'pcs', icon: '🍞', words: ['bread', 'pav', 'pao', 'ब्रेड', 'bun'] },
  { unit: 'pcs', icon: '🎂', words: ['cake', 'केक', 'pastry'] },
  { unit: 'pcs', icon: '🧼', words: ['soap', 'sabun', 'साबुन', 'detergent'] },
  { unit: 'pcs', icon: '🕯️', words: ['candle', 'candles', 'mombatti', 'मोमबत्ती', 'diya', 'diyas', 'दीया', 'दीये'] },
  { unit: 'pcs', icon: '💐', words: ['flower', 'flowers', 'phool', 'फूल', 'bouquet', 'garland', 'mala', 'माला', 'gajra'] },
  { unit: 'pcs', icon: '🥻', words: ['saree', 'sari', 'साड़ी', 'dupatta', 'दुपट्टा'] },
  { unit: 'pcs', icon: '👕', words: ['shirt', 'tshirt', 't-shirt', 'kurta', 'कुर्ता', 'kurti', 'कुर्ती', 'top'] },
  { unit: 'm', icon: '🧵', words: ['cloth', 'fabric', 'kapda', 'कपड़ा', 'thread', 'dhaga', 'धागा', 'ribbon', 'lace'] },
  { unit: 'pair', icon: '👟', words: ['shoe', 'shoes', 'chappal', 'चप्पल', 'sandal', 'sandals', 'joote', 'जूते'] },
  { unit: 'pair', icon: '🧦', words: ['socks', 'sock', 'मोजे', 'earrings', 'jhumka', 'झुमके'] },
  { unit: 'set', icon: '💍', words: ['bangle', 'bangles', 'chudi', 'chudiyan', 'चूड़ी', 'चूड़ियाँ', 'jewellery', 'jewelry', 'ring'] },
  { unit: 'pcs', icon: '👜', words: ['bag', 'purse', 'thaila', 'थैला', 'tote', 'jhola'] },
  { unit: 'pcs', icon: '🎁', words: ['gift', 'gifts', 'hamper', 'tohfa', 'तोहफ़ा'] },
  { unit: 'plate', icon: '🥟', words: ['samosa', 'समोसा', 'kachori', 'कचौरी', 'momos', 'momo', 'pakora', 'पकौड़ा', 'chaat', 'चाट'] },
  { unit: 'plate', icon: '🍽️', words: ['thali', 'थाली', 'meal', 'meals', 'khana', 'खाना', 'tiffin', 'टिफ़िन'] },
  { unit: 'cup', icon: '☕', words: ['kulhad', 'कुल्हड़'] },
  { unit: 'hr', icon: '📚', words: ['tuition', 'ट्यूशन', 'class', 'classes', 'lesson', 'lessons', 'coaching'] },
  { unit: 'pcs', icon: '✂️', words: ['stitching', 'silai', 'सिलाई', 'tailoring', 'alteration', 'haircut'] },
  { unit: 'pcs', icon: '🔧', words: ['repair', 'service', 'servicing', 'मरम्मत'] },
  { unit: 'pcs', icon: '📓', words: ['notebook', 'copy', 'कॉपी', 'register'] },
  { unit: 'pcs', icon: '🖊️', words: ['pen', 'pens', 'pencil', 'pencils', 'पेन'] }
];

/**
 * A unit and a picture suggested by a product's name, e.g. "Basmati Rice 5kg" →
 * { unit: 'kg', icon: '🍚' }; null when no word is known. Latin words match whole
 * words; Hindi words match anywhere in the name.
 */
export function suggestForProduct(name) {
  const text = String(name || '').toLowerCase();
  if (!text.trim()) return null;
  const latinWords = new Set(text.match(/[a-z]+(?:-[a-z]+)?/g) || []);
  for (const rule of SUGGESTIONS) {
    const hit = rule.words.some(word => (/^[a-z-]+$/.test(word) ? latinWords.has(word) : text.includes(word)));
    if (hit) return { unit: rule.unit, icon: rule.icon };
  }
  return null;
}
