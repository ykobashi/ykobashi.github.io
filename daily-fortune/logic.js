// 今日の運勢おみくじロジック(純粋関数のみ、DOM操作禁止)

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
 * Date オブジェクトを YYYY-MM-DD 形式(ローカル日付)に整形する
 * @param {Date} date
 * @returns {string}
 */
function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 総合運(出現率に重み付けした配列。大吉・大凶はレア)
const OVERALL_WEIGHTED = [
  "大吉", "大吉",
  "中吉", "中吉", "中吉",
  "小吉", "小吉", "小吉",
  "吉", "吉", "吉", "吉",
  "凶", "凶",
  "大凶",
];

const OVERALL_COMMENTS = {
  "大吉": "何をやってもうまくいく最高の一日。思い切った行動が吉と出るでしょう。",
  "中吉": "運気は上向き。周囲との協力が良い結果を呼び込みます。",
  "小吉": "穏やかで安定した一日。小さな幸せに目を向けてみましょう。",
  "吉": "特別なことはなくても、着実に物事が進む一日です。",
  "凶": "少し慎重になった方がよさそう。無理はせず様子を見ましょう。",
  "大凶": "今日は守りの日。新しいことは避けて、体調管理を優先しましょう。",
};

// カテゴリ別の運勢レベル(5段階)
const CATEGORY_LEVELS = ["絶好調", "好調", "まずまず", "一息つこう", "要注意"];

const CATEGORY_COMMENTS = {
  love: [
    "気になる相手との距離がぐっと縮まる予感。素直な気持ちを伝えてみて。",
    "自然体でいることが魅力につながる日。無理に飾らなくて大丈夫。",
    "焦らずマイペースに。良いご縁はゆっくり育っていきます。",
    "すれ違いが起きやすいので、言葉選びは丁寧に。",
    "一人の時間を大切にすると気持ちが整理できそう。",
  ],
  work: [
    "アイデアが次々と湧いてくる好調な日。積極的に発言してみましょう。",
    "地道な努力がきちんと評価される流れです。",
    "普段通りにこなせば問題なし。無理に背伸びしなくて大丈夫。",
    "確認作業を怠るとミスが起きやすいので念入りに。",
    "無理なスケジュールは禁物。休息も仕事のうちです。",
  ],
  money: [
    "臨時収入やお得な情報が舞い込むかも。アンテナを張っておきましょう。",
    "計画的な使い方が金運アップのカギになります。",
    "収支のバランスは概ね良好。大きな変動はなさそうです。",
    "衝動買いには要注意。一晩考えてから決断を。",
    "不要な出費がかさみがち。財布の紐は締めておきましょう。",
  ],
  health: [
    "心身ともに絶好調。新しいことにチャレンジするのに良いタイミング。",
    "軽い運動を取り入れると、さらに調子が上がりそうです。",
    "普段通りの生活リズムを保てば安定して過ごせます。",
    "疲れが溜まりやすいので早めの休息を心がけて。",
    "無理は禁物。今日はしっかり体を休めましょう。",
  ],
};

const CATEGORY_LABELS = {
  love: "恋愛運",
  work: "仕事運",
  money: "金運",
  health: "健康運",
};

/**
 * 名前と日付から今日の運勢を診断する
 * @param {string} name 名前(空文字可)
 * @param {string} dateStr 日付文字列(YYYY-MM-DD)
 * @returns {{overall: string, overallComment: string, categories: Object}} 診断結果
 */
function getDailyFortune(name, dateStr) {
  const normalizedName = String(name || "ゲスト").trim() || "ゲスト";
  const seed = hashString(`${String(dateStr).trim()}::${normalizedName}`);
  const rng = mulberry32(seed);

  const overallIndex = Math.floor(rng() * OVERALL_WEIGHTED.length);
  const overall = OVERALL_WEIGHTED[overallIndex];

  const categories = {};
  for (const key of Object.keys(CATEGORY_LABELS)) {
    const levelIndex = Math.floor(rng() * CATEGORY_LEVELS.length);
    categories[key] = {
      label: CATEGORY_LABELS[key],
      level: CATEGORY_LEVELS[levelIndex],
      comment: CATEGORY_COMMENTS[key][levelIndex],
    };
  }

  return {
    name: normalizedName,
    date: dateStr,
    overall,
    overallComment: OVERALL_COMMENTS[overall],
    categories,
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    hashString,
    mulberry32,
    formatDateLocal,
    OVERALL_WEIGHTED,
    OVERALL_COMMENTS,
    CATEGORY_LEVELS,
    CATEGORY_COMMENTS,
    CATEGORY_LABELS,
    getDailyFortune,
  };
}
