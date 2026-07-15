// 厨二病風二つ名メーカーロジック(純粋関数のみ、DOM操作禁止)

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

// 形容詞ワードバンク(20種)
const ADJECTIVES = [
  "漆黒の", "紅蓮の", "深淵の", "黄昏の", "終焉の", "覚醒せし", "封印されし",
  "混沌の", "蒼穹の", "絶望の", "冥府の", "雷鳴の", "氷結の", "破滅の",
  "虚無の", "焦土の", "血染めの", "永遠なる", "堕落せし", "煉獄の",
];

// 名詞ワードバンク(20種)
const NOUNS = [
  "死神", "獅子王", "堕天使", "竜殺し", "破壊神", "審判者", "剣聖",
  "魔王", "守護者", "支配者", "反逆者", "狂王", "星屑の使者", "黒炎の魔導士",
  "終焉を見し者", "覇者", "幻影", "偽神", "戦乙女", "冥王",
];

// 二つ名に稀に付与する接尾フレーズ(10種)
const SUFFIX_BANK = [
  "を宿す者", "の継承者", "を統べし者", "の生まれ変わり", "の化身",
  "を喰らう者", "の眷属", "の申し子", "を継ぐ者", "の残滓",
];

/**
 * 名前をシードに厨二病風二つ名を複数生成する(同じ名前なら常に同じ結果になる)
 * @param {string} name
 * @param {number} [count=3] 生成する候補数
 * @returns {{adj: string, noun: string, suffix: string, full: string}[]}
 */
function generateChuuniNames(name, count) {
  count = count || 3;
  const seed = hashString(String(name).trim());
  const rng = mulberry32(seed);

  const shuffledAdj = seededShuffle(ADJECTIVES, rng);
  const shuffledNoun = seededShuffle(NOUNS, rng);
  const shuffledSuffix = seededShuffle(SUFFIX_BANK, rng);

  const results = [];
  for (let i = 0; i < count; i++) {
    const adj = shuffledAdj[i % shuffledAdj.length];
    const noun = shuffledNoun[i % shuffledNoun.length];
    const roll = rng();
    const suffix = roll < 0.35 ? shuffledSuffix[i % shuffledSuffix.length] : "";
    const full = suffix ? `${adj}${noun}${suffix}` : `${adj}${noun}`;
    results.push({ adj, noun, suffix, full });
  }
  return results;
}

if (typeof module !== "undefined") {
  module.exports = {
    hashString,
    mulberry32,
    seededShuffle,
    ADJECTIVES,
    NOUNS,
    SUFFIX_BANK,
    generateChuuniNames,
  };
}
