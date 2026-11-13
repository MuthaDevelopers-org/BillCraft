/**
 * Voice typing and read-aloud, built on the browser's own speech APIs.
 * BillCraft does not send audio anywhere itself; the browser's speech service
 * does the recognition, and it may be cloud-based (see README).
 */

// Zero code points of the Arabic-Indic, Extended Arabic-Indic, Devanagari,
// Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada and Malayalam digit sets.
const DIGIT_ZEROS = [
  0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6,
  0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66
];

function digitValue(code) {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  for (const zero of DIGIT_ZEROS) {
    if (code >= zero && code <= zero + 9) return code - zero;
  }
  return null;
}

/**
 * Keeps only the digits (in any supported script, written as Latin 0-9) and
 * one decimal point. Everything else is dropped, so "₹ १,५०० " becomes "1500".
 */
export function normalizeSpokenNumber(text) {
  let result = '';
  for (const char of String(text)) {
    const digit = digitValue(char.codePointAt(0));
    if (digit !== null) {
      result += digit;
    } else if (char === '.' && !result.includes('.')) {
      result += '.';
    }
  }
  return result;
}

function recognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function canListen() {
  return Boolean(recognitionConstructor());
}

export function canSpeak() {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Listens for one spoken phrase. Returns the recognizer, or null when the
 * browser has no speech recognition.
 */
export function listenOnce(speechTag, { onText, onError, onEnd }) {
  const Recognition = recognitionConstructor();
  if (!Recognition) return null;

  const recognizer = new Recognition();
  recognizer.lang = speechTag;
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;
  recognizer.onresult = event => onText(event.results[0][0].transcript);
  recognizer.onerror = event => onError(event.error);
  recognizer.onend = () => onEnd();
  recognizer.start();
  return recognizer;
}

/** Reads text aloud, using a voice for the language when the device has one. */
export function speak(text, speechTag) {
  if (!canSpeak()) return false;

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechTag;
  const prefix = speechTag.slice(0, 2).toLowerCase();
  const voice = synth.getVoices().find(v => v.lang.toLowerCase().startsWith(prefix));
  if (voice) utterance.voice = voice;

  synth.speak(utterance);
  return true;
}
