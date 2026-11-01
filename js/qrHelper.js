/**
 * QR Code Generator for Payments & Invoices (Pure Vanilla JS, 100% Offline)
 * Lightweight QR Code implementation (Model 2, Byte Mode)
 */

// Simple robust QR generator based on standard Galois field GF(256) and Reed-Solomon error correction
(function () {
  // We provide a clean generator module
})();

// Standard QR Code Generator implementation
class QRCodeGenerator {
  constructor(typeNumber = 4, errorCorrectionLevel = 'M') {
    this.typeNumber = typeNumber;
    this.errorCorrectionLevel = errorCorrectionLevel;
    this.modules = null;
    this.moduleCount = 0;
    this.dataCache = null;
    this.dataList = [];
  }

  addData(data) {
    this.dataList.push(data);
  }

  isDark(row, col) {
    if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
      throw new Error(row + ',' + col);
    }
    return this.modules[row][col];
  }

  getModuleCount() {
    return this.moduleCount;
  }

  make() {
    // Dynamically adjust typeNumber to fit data length
    const totalBytes = this.dataList.reduce((acc, str) => acc + str.length, 0);
    if (totalBytes > 80) this.typeNumber = 8;
    else if (totalBytes > 45) this.typeNumber = 6;
    else if (totalBytes > 25) this.typeNumber = 4;
    else this.typeNumber = 3;

    this.makeImpl(false, this.getBestMaskPattern());
  }

  makeImpl(test, maskPattern) {
    this.moduleCount = this.typeNumber * 4 + 17;
    this.modules = new Array(this.moduleCount);
    for (let row = 0; row < this.moduleCount; row++) {
      this.modules[row] = new Array(this.moduleCount);
      for (let col = 0; col < this.moduleCount; col++) {
        this.modules[row][col] = null;
      }
    }
    this.setupPositionProbePattern(0, 0);
    this.setupPositionProbePattern(this.moduleCount - 7, 0);
    this.setupPositionProbePattern(0, this.moduleCount - 7);
    this.setupPositionAdjustPattern();
    this.setupTimingPattern();
    this.setupTypeInfo(test, maskPattern);
    if (this.typeNumber >= 7) {
      this.setupTypeNumber(test);
    }
    if (this.dataCache == null) {
      this.dataCache = QRCodeGenerator.createData(this.typeNumber, this.errorCorrectionLevel, this.dataList);
    }
    this.mapData(this.dataCache, maskPattern);
  }

  setupPositionProbePattern(row, col) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) continue;
        if ((0 <= r && r <= 6 && (c === 0 || c === 6)) ||
            (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
            (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
          this.modules[row + r][col + c] = true;
        } else {
          this.modules[row + r][col + c] = false;
        }
      }
    }
  }

  getBestMaskPattern() {
    return 0; // standard default mask pattern
  }

  setupTimingPattern() {
    for (let r = 8; r < this.moduleCount - 8; r++) {
      if (this.modules[r][6] != null) continue;
      this.modules[r][6] = (r % 2 === 0);
    }
    for (let c = 8; c < this.moduleCount - 8; c++) {
      if (this.modules[6][c] != null) continue;
      this.modules[6][c] = (c % 2 === 0);
    }
  }

  setupPositionAdjustPattern() {
    const pos = QRCodeGenerator.PATTERN_POSITION_TABLE[this.typeNumber - 1];
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const row = pos[i];
        const col = pos[j];
        if (this.modules[row][col] != null) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
              this.modules[row + r][col + c] = true;
            } else {
              this.modules[row + r][col + c] = false;
            }
          }
        }
      }
    }
  }

  setupTypeNumber(test) {
    const bits = QRCodeGenerator.getBCHTypeNumber(this.typeNumber);
    for (let i = 0; i < 18; i++) {
      const mod = (!test && ((bits >> i) & 1) === 1);
      this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
      this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
    }
  }

  setupTypeInfo(test, maskPattern) {
    const data = (0x01 << 3) | maskPattern; // M level
    const bits = QRCodeGenerator.getBCHTypeInfo(data);
    for (let i = 0; i < 15; i++) {
      const mod = (!test && ((bits >> i) & 1) === 1);
      if (i < 6) {
        this.modules[i][8] = mod;
      } else if (i < 8) {
        this.modules[i + 1][8] = mod;
      } else {
        this.modules[this.moduleCount - 15 + i][8] = mod;
      }
      if (i < 8) {
        this.modules[8][this.moduleCount - i - 1] = mod;
      } else if (i < 9) {
        this.modules[8][15 - i - 1 + 1] = mod;
      } else {
        this.modules[8][15 - i - 1] = mod;
      }
    }
    this.modules[this.moduleCount - 8][8] = !test;
  }

  mapData(data, maskPattern) {
    let inc = -1;
    let row = this.moduleCount - 1;
    let bitIndex = 7;
    let byteIndex = 0;

    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (this.modules[row][col - c] == null) {
            let dark = false;
            if (byteIndex < data.length) {
              dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
            }
            const mask = ((row + (col - c)) % 2 === 0);
            if (mask) {
              dark = !dark;
            }
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }

  toDataURL(cellSize = 4, margin = 8) {
    const size = this.moduleCount * cellSize + margin * 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#0f172a';

    for (let r = 0; r < this.moduleCount; r++) {
      for (let c = 0; c < this.moduleCount; c++) {
        if (this.isDark(r, c)) {
          ctx.fillRect(c * cellSize + margin, r * cellSize + margin, cellSize, cellSize);
        }
      }
    }
    return canvas.toDataURL('image/png');
  }
}

// Position Table
QRCodeGenerator.PATTERN_POSITION_TABLE = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50]
];

QRCodeGenerator.G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
QRCodeGenerator.G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
QRCodeGenerator.G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

QRCodeGenerator.getBCHTypeInfo = function (data) {
  let d = data << 10;
  while (QRCodeGenerator.getBCHDigit(d) - QRCodeGenerator.getBCHDigit(QRCodeGenerator.G15) >= 0) {
    d ^= (QRCodeGenerator.G15 << (QRCodeGenerator.getBCHDigit(d) - QRCodeGenerator.getBCHDigit(QRCodeGenerator.G15)));
  }
  return ((data << 10) | d) ^ QRCodeGenerator.G15_MASK;
};

QRCodeGenerator.getBCHTypeNumber = function (data) {
  let d = data << 12;
  while (QRCodeGenerator.getBCHDigit(d) - QRCodeGenerator.getBCHDigit(QRCodeGenerator.G18) >= 0) {
    d ^= (QRCodeGenerator.G18 << (QRCodeGenerator.getBCHDigit(d) - QRCodeGenerator.getBCHDigit(QRCodeGenerator.G18)));
  }
  return (data << 12) | d;
};

QRCodeGenerator.getBCHDigit = function (data) {
  let digit = 0;
  while (data !== 0) {
    digit++;
    data >>>= 1;
  }
  return digit;
};

QRCodeGenerator.createData = function (typeNumber, errorCorrectionLevel, dataList) {
  const bytes = [];
  dataList.forEach(data => {
    // Mode indicator: 8-bit byte mode = 0100
    // Byte length + characters
    for (let i = 0; i < data.length; i++) {
      bytes.push(data.charCodeAt(i) & 0xff);
    }
  });

  // Calculate capacities for given type
  const totalCodewords = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346][typeNumber] || 100;
  const ecCount = [0, 10, 16, 26, 36, 48, 64, 72, 88, 110, 130][typeNumber] || 36;
  const dataCount = totalCodewords - ecCount;

  // Build bitstream: [Mode: 4 bits][Count: 8 bits][Data bytes]
  const bitStream = [];
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) {
      bitStream.push((val >>> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, 8); // Length
  bytes.forEach(b => pushBits(b, 8));

  // Terminator
  pushBits(0, Math.min(4, dataCount * 8 - bitStream.length));

  // Convert to bytes
  const dataBytes = [];
  for (let i = 0; i < bitStream.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | (bitStream[i + j] || 0);
    }
    dataBytes.push(b);
  }

  // Padding
  const pad = [0xec, 0x11];
  let p = 0;
  while (dataBytes.length < dataCount) {
    dataBytes.push(pad[p++ % 2]);
  }

  // Generate RS Error Correction
  const ecBytes = QRCodeGenerator.calcErrorCorrection(dataBytes, ecCount);
  return dataBytes.concat(ecBytes);
};

// Reed-Solomon polynomial math for standard QR
QRCodeGenerator.calcErrorCorrection = function (dataBytes, ecCount) {
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    EXP[i + 255] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }

  function mul(a, b) {
    return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
  }

  // Generator polynomial
  let gen = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= mul(gen[j], EXP[i]);
      next[j + 1] ^= gen[j];
    }
    gen = next;
  }

  const result = new Array(ecCount).fill(0);
  for (let i = 0; i < dataBytes.length; i++) {
    const factor = dataBytes[i] ^ result[0];
    result.shift();
    result.push(0);
    for (let j = 0; j < ecCount; j++) {
      result[j] ^= mul(gen[j], factor);
    }
  }

  return result;
};

/**
 * Public helper to generate QR Code Data URL
 */
export function generateQRCodeURL(text, cellSize = 4) {
  try {
    const qr = new QRCodeGenerator(4, 'M');
    qr.addData(text);
    qr.make();
    return qr.toDataURL(cellSize);
  } catch (err) {
    console.warn('QR Code generation fallback:', err);
    return null;
  }
}

/**
 * Build UPI Payment URI string
 */
export function buildUPIString({ upiId, brandName, amount, invoiceNumber }) {
  if (!upiId) return '';
  const cleanUpi = encodeURIComponent(upiId.trim());
  const cleanName = encodeURIComponent((brandName || 'Store').trim());
  const cleanAmount = Number(amount) > 0 ? Number(amount).toFixed(2) : '';
  const note = encodeURIComponent(`Bill ${invoiceNumber || ''}`.trim());

  let uri = `upi://pay?pa=${cleanUpi}&pn=${cleanName}`;
  if (cleanAmount) uri += `&am=${cleanAmount}`;
  uri += `&cu=INR&tn=${note}`;
  return uri;
}
