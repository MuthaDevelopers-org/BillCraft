/**
 * QR codes for UPI payments, made on the device with no library and no network.
 *
 * A standard QR Code encoder (ISO/IEC 18004): byte mode, error correction
 * level M, versions 1 to 40, all eight masks scored with the standard penalty
 * rules. The result is an SVG data URL, so the code stays sharp in print and PDF.
 * The structure follows Project Nayuki's reference encoder (MIT licence).
 */

// Level M error correction, by version (index 0 is unused)
const ECC_CODEWORDS_PER_BLOCK = [-1,
  10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
  26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const ERROR_CORRECTION_BLOCKS = [-1,
  1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
  17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
const ECC_FORMAT_BITS_M = 0;

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

const getBit = (value, index) => ((value >>> index) & 1) !== 0;

/** Modules available for data and error correction in a version, after the fixed patterns */
function rawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignments = Math.floor(version / 7) + 2;
    result -= (25 * alignments - 10) * alignments - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Data codewords (bytes) that fit in a version at level M */
export function dataCodewords(version) {
  return Math.floor(rawDataModules(version) / 8) - ECC_CODEWORDS_PER_BLOCK[version] * ERROR_CORRECTION_BLOCKS[version];
}

// --- Reed-Solomon over GF(2^8) with the QR polynomial 0x11D ---

function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function reedSolomonDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** The error correction codewords for one block of data */
export function reedSolomonRemainder(data, degree) {
  const divisor = reedSolomonDivisor(degree);
  const result = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    divisor.forEach((coefficient, i) => {
      result[i] ^= gfMultiply(coefficient, factor);
    });
  }
  return result;
}

/** Splits the data into blocks, adds error correction to each, and interleaves them */
function addErrorCorrection(data, version) {
  const blockCount = ERROR_CORRECTION_BLOCKS[version];
  const eccLength = ECC_CODEWORDS_PER_BLOCK[version];
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blockCount - (rawCodewords % blockCount);
  const shortBlockLength = Math.floor(rawCodewords / blockCount);

  const blocks = [];
  for (let i = 0, k = 0; i < blockCount; i++) {
    const block = data.slice(k, k + shortBlockLength - eccLength + (i < shortBlocks ? 0 : 1));
    k += block.length;
    const ecc = reedSolomonRemainder(block, eccLength);
    if (i < shortBlocks) block.push(0); // a gap, so every block lines up for interleaving
    blocks.push(block.concat(ecc));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLength - eccLength || j >= shortBlocks) result.push(block[i]);
    });
  }
  return result;
}

/** The 15 format bits for level M and a mask: 5 data bits, 10 BCH bits, then the fixed XOR mask */
export function formatBits(mask) {
  const data = (ECC_FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** The 18 version bits, used from version 7 */
export function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function alignmentPositions(version, size) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
];

class Matrix {
  constructor(version) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
  }

  setFunction(x, y, dark) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  drawFunctionPatterns() {
    const { size } = this;
    for (let i = 0; i < size; i++) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }

    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);

    const positions = alignmentPositions(this.version, size);
    const last = positions.length - 1;
    positions.forEach((y, i) => {
      positions.forEach((x, j) => {
        // Not over the three finder patterns
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        this.drawAlignment(x, y);
      });
    });

    this.drawFormatBits(0); // reserves the area; redrawn with the chosen mask
    this.drawVersionBits();
  }

  drawFinder(x, y) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunction(xx, yy, distance !== 2 && distance !== 4);
        }
      }
    }
  }

  drawAlignment(x, y) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  drawFormatBits(mask) {
    const bits = formatBits(mask);
    const { size } = this;
    // Around the top-left finder
    for (let i = 0; i <= 5; i++) this.setFunction(8, i, getBit(bits, i));
    this.setFunction(8, 7, getBit(bits, 6));
    this.setFunction(8, 8, getBit(bits, 7));
    this.setFunction(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, getBit(bits, i));
    // Split between the other two finders
    for (let i = 0; i < 8; i++) this.setFunction(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunction(8, size - 15 + i, getBit(bits, i));
    this.setFunction(8, size - 8, true); // the module that is always dark
  }

  drawVersionBits() {
    if (this.version < 7) return;
    const bits = versionBits(this.version);
    for (let i = 0; i < 18; i++) {
      const dark = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, dark);
      this.setFunction(b, a, dark);
    }
  }

  /** Places the codewords in the two-column zigzag, from the bottom-right corner */
  drawCodewords(codewords) {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip the vertical timing pattern
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < codewords.length * 8) {
            this.modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
            i++;
          }
          // Any remainder bits stay light, as initialised
        }
      }
    }
  }

  /** XORs a mask over the data area. Applying the same mask twice undoes it. */
  applyMask(mask) {
    const test = MASKS[mask];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isFunction[y][x] && test(x, y)) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  /** The standard penalty score: lower means easier to scan */
  penaltyScore() {
    const { size, modules } = this;
    let result = 0;

    const addHistory = (runLength, history) => {
      if (history[0] === 0) runLength += size; // light border before the first run
      history.pop();
      history.unshift(runLength);
    };
    const countFinderLike = history => {
      const n = history[1];
      const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
      return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0)
        + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
    };
    const terminate = (runDark, runLength, history) => {
      if (runDark) {
        addHistory(runLength, history);
        runLength = 0;
      }
      runLength += size; // light border after the last run
      addHistory(runLength, history);
      return countFinderLike(history);
    };

    const scanLines = get => {
      for (let a = 0; a < size; a++) {
        let runDark = false;
        let runLength = 0;
        const history = [0, 0, 0, 0, 0, 0, 0];
        for (let b = 0; b < size; b++) {
          if (get(a, b) === runDark) {
            runLength++;
            if (runLength === 5) result += PENALTY_N1;
            else if (runLength > 5) result++;
          } else {
            addHistory(runLength, history);
            if (!runDark) result += countFinderLike(history) * PENALTY_N3;
            runDark = get(a, b);
            runLength = 1;
          }
        }
        result += terminate(runDark, runLength, history) * PENALTY_N3;
      }
    };
    scanLines((y, x) => modules[y][x]); // rows
    scanLines((x, y) => modules[y][x]); // columns

    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const dark = modules[y][x];
        if (dark === modules[y][x + 1] && dark === modules[y + 1][x] && dark === modules[y + 1][x + 1]) {
          result += PENALTY_N2;
        }
      }
    }

    const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }
}

/**
 * Encodes text as a QR Code. Returns { version, size, mask, modules }, where
 * modules[y][x] is true for a dark module. `mask` (0 to 7) can be fixed for tests;
 * otherwise the mask with the lowest penalty is used.
 */
export function encodeQR(text, { mask: fixedMask = -1 } = {}) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));

  let version = 1;
  const usedBits = v => 4 + (v <= 9 ? 8 : 16) + bytes.length * 8;
  while (version <= 40 && usedBits(version) > dataCodewords(version) * 8) version++;
  if (version > 40) throw new RangeError('Text is too long for a QR Code');

  // Byte mode, the character count, then the data
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach(byte => push(byte, 8));

  const capacity = dataCodewords(version) * 8;
  push(0, Math.min(4, capacity - bits.length)); // terminator
  push(0, (8 - (bits.length % 8)) % 8); // to a whole byte
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  }

  const matrix = new Matrix(version);
  matrix.drawFunctionPatterns();
  matrix.drawCodewords(addErrorCorrection(data, version));

  let mask = fixedMask;
  if (mask < 0) {
    let best = Infinity;
    for (let candidate = 0; candidate < 8; candidate++) {
      matrix.applyMask(candidate);
      matrix.drawFormatBits(candidate);
      const score = matrix.penaltyScore();
      if (score < best) {
        best = score;
        mask = candidate;
      }
      matrix.applyMask(candidate); // undo
    }
  }
  matrix.applyMask(mask);
  matrix.drawFormatBits(mask);

  return { version, size: matrix.size, mask, modules: matrix.modules };
}

/**
 * An SVG of the code, with the 4-module light border the standard requires.
 * Width and height are set so every renderer (print, html2canvas) draws it square.
 */
export function qrToSVG({ size, modules }, border = 4) {
  const total = size + border * 2;
  let path = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules[y][x]) continue;
      let run = 1;
      while (x + run < size && modules[y][x + run]) run++;
      path += `M${x + border} ${y + border}h${run}v1h-${run}z`;
      x += run - 1;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total * 8}" height="${total * 8}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`
    + `<rect width="${total}" height="${total}" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
}

/** A data URL for an <img> showing `text` as a QR Code, or '' when there is nothing to encode */
export function generateQRCodeURL(text) {
  if (!text) return '';
  try {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrToSVG(encodeQR(text)))}`;
  } catch (error) {
    console.warn('Could not make the QR code', error);
    return '';
  }
}

// A UPI ID (VPA) is name@bank, for example asha.candles@okaxis or 9876543210@ybl
const UPI_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/i;

export function isValidUpiId(upiId) {
  return UPI_ID_PATTERN.test(String(upiId || '').trim());
}

/**
 * The UPI payment link inside the QR Code (NPCI UPI linking specification).
 * The amount is fixed when it is above zero; UPI is always in rupees.
 */
export function buildUPIString({ upiId, brandName, amount, invoiceNumber }) {
  const id = String(upiId || '').trim();
  if (!id) return '';
  const payee = String(brandName || '').trim() || id.split('@')[0];
  const note = `Bill ${String(invoiceNumber || '').trim()}`.trim().slice(0, 50);

  // The @ stays as written, as in the NPCI examples; some apps do not decode %40
  let uri = `upi://pay?pa=${encodeURIComponent(id).replace(/%40/g, '@')}&pn=${encodeURIComponent(payee)}`;
  if (Number(amount) > 0) uri += `&am=${Number(amount).toFixed(2)}`;
  uri += `&cu=INR&tn=${encodeURIComponent(note)}`;
  return uri;
}
