// Wikipediaクイズ 純粋ロジック(DOM非依存)
// 記事タイトルの静的リスト、出題選出、伏字置換、選択肢生成、正誤判定、得点計算、
// スコアボード生成、ロビー管理などを扱う。fetch(通信)は script.js 側の責務。

const MIN_PLAYERS = 2;
const ROUND_TOTAL = 8;
const CORRECT_POINTS = 1000;
const CHOICE_COUNT = 4;
const FETCH_CANDIDATE_COUNT = 6;
const EXCERPT_MAX_LENGTH = 200;
const EXCERPT_MAX_SENTENCES = 3;
const MASK = '●●●';

// 出題対象の記事タイトル一覧(人物・動物・場所/建造物・もの/概念など幅広いジャンル、93件)。
// 無名すぎるスタブ記事を避けるため、有名・一般的なタイトルのみを厳選している。
const ARTICLE_LIST = [
  // 人物
  '徳川家康', '織田信長', '豊臣秀吉', '坂本龍馬', '夏目漱石', '宮沢賢治', '手塚治虫', '黒澤明',
  '宮崎駿', '岡本太郎', 'アルベルト・アインシュタイン', 'アイザック・ニュートン', 'レオナルド・ダ・ヴィンチ',
  'ウィリアム・シェイクスピア', 'ヴォルフガング・アマデウス・モーツァルト', 'ルートヴィヒ・ヴァン・ベートーヴェン',
  'ナポレオン・ボナパルト', 'エイブラハム・リンカーン', 'マハトマ・ガンディー', 'スティーブ・ジョブズ',
  // 動物
  'ライオン', 'トラ', 'ゾウ', 'キリン', 'ジャイアントパンダ', 'コアラ', 'カンガルー', 'ペンギン',
  'イルカ', 'シャチ', 'サメ', 'ウミガメ', 'ワニ', 'フクロウ', 'クジャク', 'ハチドリ', 'カブトムシ',
  'テントウムシ', 'タコ', 'ラッコ',
  // 場所・建造物
  '富士山', '東京タワー', 'エッフェル塔', '万里の長城', 'ギザの大ピラミッド', 'ナイアガラの滝',
  'グランドキャニオン', 'サハラ砂漠', 'アマゾン川', '太平洋', 'エベレスト', '京都市', '大阪城',
  'ローマ', 'パリ', 'ニューヨーク', 'オーストラリア', '南極大陸', 'ガラパゴス諸島', 'マチュ・ピチュ',
  // もの・概念
  'インターネット', 'スマートフォン', '自転車', '飛行機', '新幹線', 'ピアノ', 'ギター', 'チョコレート',
  'コーヒー', '寿司', 'ラーメン', 'オリンピック', 'FIFAワールドカップ', 'ノーベル賞', '万有引力',
  '相対性理論', 'デオキシリボ核酸', '周期表', '光合成', 'ブラックホール',
  // その他
  '恐竜', 'ティラノサウルス', '桜', '花火', '忍者', '折り紙', '人工知能', '国際宇宙ステーション',
  '月', '火星', '台風', 'オーロラ', '歌舞伎',
];

function shuffle(array, rng = Math.random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// この部屋でまだ出題していないタイトルの中から、fetch用の候補キューを作る。
// 先頭から順にfetchを試し、失敗したら次の候補に進むフォールバックを script.js 側で行う。
function pickArticleCandidates(usedTitles, rng = Math.random, bank = ARTICLE_LIST, count = FETCH_CANDIDATE_COUNT) {
  const used = usedTitles || [];
  let available = bank.filter((t) => !used.includes(t));
  if (available.length === 0) available = bank.slice(); // 全件出題済みなら使い回す
  return shuffle(available, rng).slice(0, Math.min(count, available.length));
}

// 正解タイトル＋固定リストから無作為に選んだ他のタイトル(CHOICE_COUNT-1件)をシャッフルして4択を作る。
function buildChoices(correctTitle, rng = Math.random, bank = ARTICLE_LIST) {
  const pool = bank.filter((t) => t !== correctTitle);
  const distractors = shuffle(pool, rng).slice(0, CHOICE_COUNT - 1);
  return shuffle([correctTitle].concat(distractors), rng);
}

// 抜粋文中の記事タイトル文字列と、それに続く読み仮名/英語表記などの括弧書きを伏字に置換する。
// 例:「東京タワー（とうきょうタワー）は、東京都港区にある電波塔である。」
//   → 「●●●は、東京都港区にある電波塔である。」
function redactExtract(extract, title) {
  if (!extract) return '';
  if (!title) return String(extract);
  let text = String(extract).split(title).join(MASK);
  const parenPattern = new RegExp(MASK + '[（(][^）)]{0,80}[）)]', 'g');
  text = text.replace(parenPattern, MASK);
  return text;
}

// 先頭から maxSentences 文だけを残す(「。」区切り)。
function limitSentences(text, maxSentences = EXCERPT_MAX_SENTENCES) {
  if (!text) return '';
  const hasTrailingPeriod = text.endsWith('。');
  const segments = text.split('。');
  const usable = hasTrailingPeriod ? segments.slice(0, -1) : segments;
  if (usable.length <= maxSentences) return text;
  return usable.slice(0, maxSentences).join('。') + '。';
}

// 文字数の上限で切り詰める。
function truncateExtract(text, maxLength = EXCERPT_MAX_LENGTH) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '…';
}

// redact → 文数制限 → 文字数制限、をまとめて行う。配信前にホストが呼ぶ。
function prepareExcerpt(rawExtract, title) {
  const redacted = redactExtract(rawExtract, title);
  const limited = limitSentences(redacted, EXCERPT_MAX_SENTENCES);
  return truncateExtract(limited, EXCERPT_MAX_LENGTH);
}

function isCorrectAnswer(choice, correctTitle) {
  return !!choice && choice === correctTitle;
}

function computeRoundScoreDeltas(answers, correctTitle) {
  const deltas = {};
  Object.keys(answers || {}).forEach((id) => {
    if (isCorrectAnswer(answers[id], correctTitle)) deltas[id] = CORRECT_POINTS;
  });
  return deltas;
}

function applyScoreDeltas(scores, deltas) {
  const result = Object.assign({}, scores);
  Object.keys(deltas).forEach((id) => { result[id] = (result[id] || 0) + deltas[id]; });
  return result;
}

// スコア降順のスコアボードを作る。同点は同順位(1,1,3...)になる標準競技順位方式。
function buildScoreboard(scores, roster) {
  const rows = roster.map((p) => ({ id: p.id, name: p.name, score: scores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);
  let rank = 0;
  let prevScore = null;
  rows.forEach((row, i) => {
    if (row.score !== prevScore) {
      rank = i + 1;
      prevScore = row.score;
    }
    row.rank = rank;
  });
  return rows;
}

function getWinners(scoreboard) {
  return scoreboard.filter((row) => row.rank === 1);
}

function wikipediaSourceUrl(title) {
  return 'https://ja.wikipedia.org/wiki/' + encodeURIComponent(title);
}

function addPlayer(roster, player) { return roster.some((p) => p.id === player.id) ? roster : roster.concat(player); }
function removePlayer(roster, id) { return roster.filter((p) => p.id !== id); }
function hasMinPlayers(roster, min = MIN_PLAYERS) { return roster.length >= min; }

const WikipediaQuizLogicExports = {
  MIN_PLAYERS, ROUND_TOTAL, CORRECT_POINTS, CHOICE_COUNT,
  FETCH_CANDIDATE_COUNT, EXCERPT_MAX_LENGTH, EXCERPT_MAX_SENTENCES, MASK, ARTICLE_LIST,
  shuffle, pickArticleCandidates, buildChoices, redactExtract, limitSentences, truncateExtract,
  prepareExcerpt, isCorrectAnswer, computeRoundScoreDeltas, applyScoreDeltas, buildScoreboard,
  getWinners, wikipediaSourceUrl, addPlayer, removePlayer, hasMinPlayers,
};
if (typeof module !== 'undefined') module.exports = WikipediaQuizLogicExports;
if (typeof window !== 'undefined') window.WikipediaQuizLogic = WikipediaQuizLogicExports;
