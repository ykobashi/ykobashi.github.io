// 簡易性格タイプ診断ロジック(純粋関数のみ、DOM操作禁止)

/**
 * 文字列を決定的な符号なし32bit整数にハッシュ化する(FNV-1aベース)
 * 本ツールでは補助的な用途(結果の並び替え等)にのみ使用する
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

// 質問一覧(10問)。axis1: 行動軸(外向的〜内省的)、axis2: 思考軸(直感的〜堅実的)
// 各質問の options[0] を選ぶとそのaxisのスコアが+1される
const QUESTIONS = [
  {
    axis: "axis1",
    text: "初対面の人が多い場では?",
    options: ["自分からどんどん話しかける", "様子を見てから少しずつ話す"],
  },
  {
    axis: "axis2",
    text: "新しいことを判断するとき重視するのは?",
    options: ["ふと浮かんだ直感やひらめき", "過去の経験やデータ"],
  },
  {
    axis: "axis1",
    text: "週末の予定は?",
    options: ["友人を誘って出かけたい", "家でひとりの時間を楽しみたい"],
  },
  {
    axis: "axis2",
    text: "旅行の計画を立てるとき?",
    options: ["行き当たりばったりを楽しむ", "事前にしっかり計画を立てる"],
  },
  {
    axis: "axis1",
    text: "会議やグループワークでは?",
    options: ["積極的に意見を発信する", "他の人の話をじっくり聞く"],
  },
  {
    axis: "axis2",
    text: "問題が起きたときの対処法は?",
    options: ["新しい発想で突破口を探す", "実績のあるやり方を選ぶ"],
  },
  {
    axis: "axis1",
    text: "疲れたときに元気が出るのは?",
    options: ["誰かと話してリフレッシュ", "一人で静かに過ごす"],
  },
  {
    axis: "axis2",
    text: "将来の夢や目標について?",
    options: ["壮大な理想をよく思い描く", "現実的な計画を大事にする"],
  },
  {
    axis: "axis1",
    text: "パーティーやイベントでは?",
    options: ["中心になって場を盛り上げる", "少人数で落ち着いて話したい"],
  },
  {
    axis: "axis2",
    text: "物事を説明するとき?",
    options: ["たとえ話やイメージで語る", "具体的な事実や手順で語る"],
  },
];

// 4x4=16パターンのタイプ名(オリジナル名称)
// 添字 = bucket1(行動軸 0〜3) * 4 + bucket2(思考軸 0〜3)
const TYPE_RESULTS = [
  { name: "石工タイプ", description: "静かな場所でこつこつと実績を積み上げる、堅実な職人肌。" },
  { name: "図書館タイプ", description: "知識を蓄えることが好きで、確かな情報をもとに動く。" },
  { name: "夜想曲タイプ", description: "一人の時間にこそ豊かな発想が生まれる、内なる芸術家。" },
  { name: "隠者タイプ", description: "壮大な思索を巡らせる、独自の世界観を持つ哲学者肌。" },
  { name: "庭師タイプ", description: "周囲をよく観察し、着実に物事を育てていくのが得意。" },
  { name: "書記官タイプ", description: "事実を丁寧に整理し、正確な判断を下すのが得意。" },
  { name: "発明家タイプ", description: "静かに観察しながらも、独創的なアイデアを生み出す。" },
  { name: "旅人タイプ", description: "自分のペースを保ちながら新しい景色や発想を求める。" },
  { name: "職人棟梁タイプ", description: "行動力があり、経験に裏打ちされたものづくりを進める。" },
  { name: "指揮官タイプ", description: "実務に強く、周囲を巻き込みながら着実に成果を出す。" },
  { name: "冒険者タイプ", description: "好奇心のままに動き、閃きを行動に変えていく挑戦者。" },
  { name: "革命家タイプ", description: "大きな理想を掲げ、周囲を巻き込みながら突き進む。" },
  { name: "統率者タイプ", description: "経験に基づいた着実な行動で周囲を引っ張るリーダー。" },
  { name: "経営者タイプ", description: "実務能力と行動力を兼ね備え、物事を前に進める。" },
  { name: "扇動者タイプ", description: "ひらめきと行動力で周囲を巻き込み、場を動かす。" },
  { name: "開拓者タイプ", description: "理想を掲げて自ら動き、新しい道を切り拓いていく。" },
];

const AXIS_LABELS = {
  axis1: { name: "行動軸", positive: "先導者度", negative: "静観者度" },
  axis2: { name: "思考軸", positive: "閃き度", negative: "堅実度" },
};

/**
 * 回答配列から各軸のスコアを集計する
 * @param {number[]} answers 各質問について選んだ選択肢のインデックス(0または1)。長さはQUESTIONSと同じ
 * @returns {{axis1: number, axis2: number, axis1Max: number, axis2Max: number}}
 */
function calculateScores(answers) {
  let axis1 = 0;
  let axis2 = 0;
  let axis1Max = 0;
  let axis2Max = 0;

  QUESTIONS.forEach((q, i) => {
    const answer = answers[i];
    if (q.axis === "axis1") {
      axis1Max++;
      if (answer === 0) axis1++;
    } else {
      axis2Max++;
      if (answer === 0) axis2++;
    }
  });

  return { axis1, axis2, axis1Max, axis2Max };
}

/**
 * 軸スコア(0〜5)を4段階のバケット(0〜3)に分類する
 * @param {number} score 0〜5のスコア
 * @returns {number} 0〜3のバケット番号
 */
function classifyBucket(score) {
  if (score <= 1) return 0;
  if (score === 2) return 1;
  if (score === 3) return 2;
  return 3;
}

/**
 * 2軸のスコアから性格タイプを判定する
 * @param {number} axis1Score 行動軸スコア(0〜5)
 * @param {number} axis2Score 思考軸スコア(0〜5)
 * @returns {{index: number, name: string, description: string, bucket1: number, bucket2: number}}
 */
function determineType(axis1Score, axis2Score) {
  const bucket1 = classifyBucket(axis1Score);
  const bucket2 = classifyBucket(axis2Score);
  const index = bucket1 * 4 + bucket2;
  return { index, bucket1, bucket2, ...TYPE_RESULTS[index] };
}

/**
 * 回答配列からタイプ判定までを一括で行う
 * @param {number[]} answers 各質問について選んだ選択肢のインデックス(0または1)
 * @returns {{index:number, name:string, description:string, axis1:number, axis2:number}}
 */
function diagnosePersonality(answers) {
  const scores = calculateScores(answers);
  const type = determineType(scores.axis1, scores.axis2);
  return { ...type, axis1: scores.axis1, axis2: scores.axis2 };
}

if (typeof module !== "undefined") {
  module.exports = {
    hashString,
    QUESTIONS,
    TYPE_RESULTS,
    AXIS_LABELS,
    calculateScores,
    classifyBucket,
    determineType,
    diagnosePersonality,
  };
}
