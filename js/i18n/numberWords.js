/**
 * Amount in words for Indian-style grouping (thousand, lakh, crore).
 *
 * The spelling logic is shared; each locale supplies its own vocabulary
 * through `words` (see locales/en.js and locales/hi.js).
 */

/**
 * @param {number} amount
 * @param {object} words  locale vocabulary: zero, suffix, units[0..99],
 *                        hundred, hundredJoin, thousand, lakh, crore
 */
export function spellAmount(amount, words) {
  const n = Math.floor(Math.abs(Number(amount) || 0));
  if (n === 0) return `${words.zero} ${words.suffix}`;
  return `${spell(n, words)} ${words.suffix}`;
}

function spell(n, w) {
  if (n < 100) return w.units[n];

  if (n < 1000) {
    const rest = n % 100;
    return `${w.units[Math.floor(n / 100)]} ${w.hundred}${rest ? w.hundredJoin + spell(rest, w) : ''}`;
  }

  if (n < 100000) {
    const rest = n % 1000;
    return `${spell(Math.floor(n / 1000), w)} ${w.thousand}${rest ? ' ' + spell(rest, w) : ''}`;
  }

  if (n < 10000000) {
    const rest = n % 100000;
    return `${spell(Math.floor(n / 100000), w)} ${w.lakh}${rest ? ' ' + spell(rest, w) : ''}`;
  }

  const rest = n % 10000000;
  return `${spell(Math.floor(n / 10000000), w)} ${w.crore}${rest ? ' ' + spell(rest, w) : ''}`;
}
