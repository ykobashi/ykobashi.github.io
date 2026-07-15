// あだ名ジェネレーターロジック(純粋関数のみ、DOM操作禁止)

/**
 * 文字列を決定的な符号なし32bit整数にハッシュ化する(FNV-1aベース)
 * @param {string} str
 * @returns {number} 0以上の整数
 */
function hashString(str) {
  str = String(str);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * mulberry32による決定的な疑似乱数生成器を作る
 * @param {number} seed 符号なし32bit整数のシード
 * @returns {() => number} 0以上1未満の乱数を返す関数
 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 配列を決定的なFisher-Yatesアルゴリズムでシャッフルする(元配列は変更しない)
 * @param {Array} array
 * @param {() => number} rng mulberry32等の乱数生成関数
 * @returns {Array} シャッフルされた新しい配列
 */
function seededShuffle(array, rng) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 接尾語バンク(20種)
const SUFFIX_BANK = [
  "っち", "りん", "たん", "ちゃん", "くん", "氏", "先輩", "隊長",
  "博士", "マスター", "将軍", "大明神", "様", "P", "師匠", "王子",
  "姫", "丸", "先生", "ゴン",
];

// 接頭語バンク(15種)
const PREFIX_BANK = [
  "スーパー", "ミラクル", "リアル", "元祖", "究極の", "伝説の", "野生の",
  "覚醒", "秘密結社", "限界突破", "深夜の", "永遠の", "自称", "謎の", "電撃",
];

/**
 * 名前から候補となる部分文字列を抽出する
 * @param {string} name
 * @returns {string[]} 重複のない部分文字列の配列(最低1件)
 */
function extractNameParts(name) {
  const trimmed = String(name).trim();
  const parts = [];
  const add = (s) => {
    if (s && !parts.includes(s)) parts.push(s);
  };

  if (trimmed.length === 0) {
    return ["なぞ"];
  }

  add(trimmed[0]);
  if (trimmed.length >= 2) add(trimmed.slice(0, 2));
  add(trimmed[trimmed.length - 1]);
  if (trimmed.length <= 6) add(trimmed);

  return parts;
}

/**
 * 名前をシードにあだ名候補を生成する(同じ名前なら常に同じ候補セットになる)
 * @param {string} name
 * @param {number} [count=6] 生成する候補数
 * @returns {{parts: string[], nicknames: string[]}}
 */
function generateNicknames(name, count) {
  count = count || 6;
  const seed = hashString(String(name).trim());
  const rng = mulberry32(seed);
  const parts = extractNameParts(name);

  const shuffledSuffixes = seededShuffle(SUFFIX_BANK, rng);
  const shuffledPrefixes = seededShuffle(PREFIX_BANK, rng);

  const nicknames = [];
  const seen = new Set();

  let suffixCursor = 0;
  let prefixCursor = 0;
  let partCursor = 0;
  let useSuffix = true;

  while (nicknames.length < count && (suffixCursor < shuffledSuffixes.length || prefixCursor < shuffledPrefixes.length)) {
    const part = parts[partCursor % parts.length];
    let candidate = null;

    if (useSuffix && suffixCursor < shuffledSuffixes.length) {
      candidate = `${part}${shuffledSuffixes[suffixCursor]}`;
      suffixCursor++;
    } else if (prefixCursor < shuffledPrefixes.length) {
      candidate = `${shuffledPrefixes[prefixCursor]}${part}`;
      prefixCursor++;
    }

    useSuffix = !useSuffix;
    partCursor++;

    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      nicknames.push(candidate);
    }
  }

  return { parts, nicknames };
}

if (typeof module !== "undefined") {
  module.exports = {
    hashString,
    mulberry32,
    seededShuffle,
    SUFFIX_BANK,
    PREFIX_BANK,
    extractNameParts,
    generateNicknames,
  };
}
