// パスワード生成ロジック(純粋関数のみ、DOM操作禁止)
// crypto.getRandomValuesはブラウザ・Node.js(v19+)双方でグローバルに利用可能

const CHARSETS = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  numbers: "0123456789",
  symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
};

/**
 * 選択されたオプションから使用する文字プールを構築する
 * @param {{lowercase?:boolean, uppercase?:boolean, numbers?:boolean, symbols?:boolean}} options
 * @returns {string}
 */
function buildCharPool(options) {
  if (!options) return "";
  let pool = "";
  if (options.lowercase) pool += CHARSETS.lowercase;
  if (options.uppercase) pool += CHARSETS.uppercase;
  if (options.numbers) pool += CHARSETS.numbers;
  if (options.symbols) pool += CHARSETS.symbols;
  return pool;
}

/**
 * 選択されたオプションから文字種数(プールサイズ)を計算する
 * @param {object} options
 * @returns {number}
 */
function calcPoolSize(options) {
  return buildCharPool(options).length;
}

/**
 * パスワードのエントロピー(ビット)を計算する
 * エントロピー = log2(文字種数) × 長さ
 * @param {number} poolSize
 * @param {number} length
 * @returns {number}
 */
function calcEntropy(poolSize, length) {
  if (!Number.isFinite(poolSize) || !Number.isFinite(length) || poolSize <= 0 || length <= 0) {
    return 0;
  }
  return length * Math.log2(poolSize);
}

/**
 * エントロピー(ビット)からパスワード強度を判定する
 * @param {number} entropyBits
 * @returns {string} "弱い" | "普通" | "強い" | "非常に強い"
 */
function classifyStrength(entropyBits) {
  if (!Number.isFinite(entropyBits) || entropyBits <= 0) return "弱い";
  if (entropyBits < 28) return "弱い";
  if (entropyBits < 60) return "普通";
  if (entropyBits < 80) return "強い";
  return "非常に強い";
}

/**
 * 事前に用意された乱数整数配列から文字プールを使ってパスワード文字列を組み立てる
 * (乱数生成部分をテスト可能にするため、乱数配列を外から注入できる設計)
 * @param {string} charPool
 * @param {number[]|Uint32Array} randomInts
 * @returns {string}
 */
function generatePasswordFromRandomInts(charPool, randomInts) {
  if (!charPool || charPool.length === 0) return "";
  if (!randomInts || randomInts.length === 0) return "";
  let result = "";
  for (let i = 0; i < randomInts.length; i++) {
    const idx = randomInts[i] % charPool.length;
    result += charPool[idx];
  }
  return result;
}

/**
 * 安全な乱数(crypto.getRandomValues)を使ってパスワードを生成する
 * @param {number} length
 * @param {object} options 文字種オプション
 * @returns {string}
 */
function generatePassword(length, options) {
  const pool = buildCharPool(options);
  if (!Number.isInteger(length) || length <= 0 || pool.length === 0) return "";
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("crypto.getRandomValuesが利用できない環境です。");
  }
  const randomBuffer = new Uint32Array(length);
  crypto.getRandomValues(randomBuffer);
  return generatePasswordFromRandomInts(pool, randomBuffer);
}

if (typeof module !== "undefined") {
  module.exports = {
    CHARSETS,
    buildCharPool,
    calcPoolSize,
    calcEntropy,
    classifyStrength,
    generatePasswordFromRandomInts,
    generatePassword,
  };
}
