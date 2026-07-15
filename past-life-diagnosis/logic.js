// 前世診断ロジック(純粋関数のみ、DOM操作禁止)

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

// 前世キャラ一覧(職業・時代・性格フレーバー付き) 25種
const PAST_LIVES = [
  { job: "剣闘士", era: "古代ローマ", flavor: "闘技場で喝采を浴びた、負けず嫌いの魂を持つ" },
  { job: "宮廷画家", era: "ルネサンス期イタリア", flavor: "美しいものへの執着が人一倍強かった" },
  { job: "遊牧民の族長", era: "中央アジア草原地帯", flavor: "広い視野と統率力で仲間を導いていた" },
  { job: "海賊船の航海士", era: "大航海時代", flavor: "自由を何より愛し、地図にない海を目指した" },
  { job: "宮廷魔術師", era: "中世ヨーロッパ", flavor: "誰よりも知識を求め続けた探究者だった" },
  { job: "茶道の師範", era: "安土桃山時代の日本", flavor: "静けさの中に強い美意識を秘めていた" },
  { job: "隊商の商人", era: "シルクロード交易期", flavor: "損得より人とのご縁を大切にしていた" },
  { job: "革命家", era: "18世紀フランス", flavor: "不平等を許せない情熱家だった" },
  { job: "宮廷詩人", era: "唐代の中国", flavor: "言葉で人の心を動かす才に恵まれていた" },
  { job: "村の薬師", era: "江戸時代の日本", flavor: "困っている人を放っておけない性分だった" },
  { job: "エジプトの神官", era: "古代エジプト", flavor: "見えない力を信じ、儀式を司っていた" },
  { job: "騎士団の見習い", era: "十字軍の時代", flavor: "忠誠心と正義感の強さが際立っていた" },
  { job: "旅芸人", era: "中世の欧州", flavor: "人を笑わせることに何よりの喜びを感じていた" },
  { job: "天文学者", era: "大航海時代の宮廷", flavor: "夜空を見上げては真理を追い求めていた" },
  { job: "武家の姫", era: "戦国時代の日本", flavor: "気品と芯の強さを併せ持っていた" },
  { job: "北欧の鍛冶職人", era: "ヴァイキング時代", flavor: "手を動かして生み出すことに誇りを持っていた" },
  { job: "皇帝付きの通訳", era: "モンゴル帝国全盛期", flavor: "異なる文化をつなぐ橋渡し役だった" },
  { job: "修道院の写字生", era: "中世ヨーロッパ", flavor: "地道な作業をこつこつ積み重ねる質だった" },
  { job: "町娘の商店主", era: "明治時代の日本", flavor: "新しい時代の風をいち早く感じ取っていた" },
  { job: "南米の織物職人", era: "インカ帝国時代", flavor: "色と模様に込めた想いを大切にしていた" },
  { job: "宮廷楽団の演奏家", era: "バロック期のヨーロッパ", flavor: "音色ひとつで場の空気を変えられた" },
  { job: "砂漠の隊商警護", era: "オスマン帝国時代", flavor: "寡黙だが誰よりも仲間思いだった" },
  { job: "禅寺の修行僧", era: "鎌倉時代の日本", flavor: "心を整えることに人生を捧げていた" },
  { job: "探検家", era: "19世紀の未踏の大地", flavor: "誰も見たことのない景色を追い求めた" },
  { job: "宮廷お抱えの占星術師", era: "ルネサンス期の宮廷", flavor: "星の巡りに人の運命を重ねていた" },
];

/**
 * 名前と生年月日から前世診断結果を決定する
 * @param {string} name 名前
 * @param {string} birthdate 生年月日(YYYY-MM-DD等の文字列)
 * @returns {{job: string, era: string, flavor: string, index: number}} 前世キャラ情報
 */
function diagnosePastLife(name, birthdate) {
  const seedSource = `${String(name).trim()}::${String(birthdate).trim()}`;
  const seed = hashString(seedSource);
  const index = seed % PAST_LIVES.length;
  return { ...PAST_LIVES[index], index };
}

if (typeof module !== "undefined") {
  module.exports = {
    hashString,
    mulberry32,
    PAST_LIVES,
    diagnosePastLife,
  };
}
