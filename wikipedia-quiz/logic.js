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

// 出題対象の記事タイトル一覧(人物・動物・場所/建造物・もの/概念など幅広いジャンル)。
// 無名すぎるスタブ記事を避けるため、有名・一般的なタイトルのみを厳選している。
// category(大分類)だけでなく group(小分類。例:動物の中の「爬虫類・恐竜」)でも分けているのは、
// 大分類だけでは「動物カテゴリだが哺乳類と昆虫が混ざっていて結局消去法で当てられる」状態を
// 防げないため。buildChoicesはまず同じ小分類、足りなければ同じ大分類、それでも足りなければ
// 全体、という順で誤答を埋める。
// groupは「同じ小分類の中だけなら4択が並んでも即座に消去法で当てられない」レベルまで
// 意図的に細かく切っている(例:「大阪城」の誤答に「ピラミッド」や「マチュ・ピチュ」のような
// 全く時代・地域の違う建造物が出ないよう、日本の城だけの小分類を作っている)。
// 各小分類は最低4件(=正解を除いても誤答3件をその小分類だけで賄える数)を目安に単語を補っている。
const ARTICLE_CATEGORIES = [
  {
    name: '人物',
    groups: [
      { name: '幕末の志士', titles: ['坂本龍馬', '西郷隆盛', '勝海舟', '高杉晋作'] },
      { name: '戦国武将', titles: ['徳川家康', '織田信長', '豊臣秀吉', '武田信玄', '上杉謙信'] },
      { name: '日本の近代文学者', titles: ['夏目漱石', '宮沢賢治', '芥川龍之介', '太宰治'] },
      { name: '日本のアニメ・映画', titles: ['手塚治虫', '黒澤明', '宮崎駿', '鳥山明'] },
      { name: '日本の美術家', titles: ['岡本太郎', '草間彌生', '横山大観', '葛飾北斎'] },
      { name: '海外の科学者', titles: ['アルベルト・アインシュタイン', 'アイザック・ニュートン', 'チャールズ・ダーウィン', 'ガリレオ・ガリレイ'] },
      { name: '海外の音楽家', titles: ['ヴォルフガング・アマデウス・モーツァルト', 'ルートヴィヒ・ヴァン・ベートーヴェン', 'ヨハン・ゼバスティアン・バッハ', 'フレデリック・ショパン'] },
      { name: '海外の画家・文学者', titles: ['レオナルド・ダ・ヴィンチ', 'ウィリアム・シェイクスピア', 'ミケランジェロ・ブオナローティ', 'フィンセント・ファン・ゴッホ'] },
      { name: '世界史の政治家・指導者', titles: ['ナポレオン・ボナパルト', 'エイブラハム・リンカーン', 'マハトマ・ガンディー', 'ウィンストン・チャーチル'] },
      { name: '現代の実業家', titles: ['スティーブ・ジョブズ', 'ビル・ゲイツ', 'イーロン・マスク', 'マーク・ザッカーバーグ'] },
    ],
  },
  {
    name: '動物',
    groups: [
      { name: '陸上の哺乳類', titles: ['ライオン', 'トラ', 'ゾウ', 'キリン', 'ジャイアントパンダ', 'コアラ', 'カンガルー'] },
      { name: '海洋の哺乳類', titles: ['イルカ', 'シャチ', 'ラッコ', 'セイウチ'] },
      { name: '鳥類', titles: ['ペンギン', 'フクロウ', 'クジャク', 'ハチドリ'] },
      { name: '爬虫類・恐竜', titles: ['ワニ', 'ウミガメ', '恐竜', 'ティラノサウルス', 'イグアナ', 'カメレオン'] },
      { name: '魚類・海洋生物', titles: ['サメ', 'タコ', 'クラゲ', 'マンボウ'] },
      { name: '昆虫', titles: ['カブトムシ', 'テントウムシ', 'クワガタムシ', 'モンシロチョウ'] },
    ],
  },
  {
    name: '場所・建造物',
    groups: [
      { name: '日本の城', titles: ['大阪城', '姫路城', '名古屋城', '熊本城'] },
      { name: '世界の古代遺跡', titles: ['ギザの大ピラミッド', 'マチュ・ピチュ', '万里の長城', 'ストーンヘンジ', 'コロッセオ'] },
      { name: '展望塔', titles: ['東京タワー', 'エッフェル塔', '東京スカイツリー', 'ピサの斜塔'] },
      { name: '山岳', titles: ['富士山', 'エベレスト', 'キリマンジャロ', 'アルプス山脈'] },
      { name: '滝・渓谷', titles: ['ナイアガラの滝', 'グランド・キャニオン', 'ヴィクトリアの滝', 'イグアスの滝'] },
      { name: '広大な自然地形', titles: ['サハラ砂漠', 'アマゾン川', '太平洋', '南極大陸'] },
      { name: '秘境・自然保護区', titles: ['ガラパゴス諸島', 'マダガスカル', '屋久島', 'グレートバリアリーフ'] },
      { name: '日本の都市', titles: ['京都市', '東京都', '大阪市', '札幌市'] },
      { name: '海外の都市', titles: ['ローマ', 'パリ', 'ニューヨーク', 'ロンドン'] },
      { name: '国', titles: ['オーストラリア', 'カナダ', 'ブラジル', 'エジプト'] },
    ],
  },
  {
    name: 'もの・概念',
    groups: [
      { name: '乗り物', titles: ['自転車', '飛行機', '新幹線', '自動車'] },
      { name: '情報技術', titles: ['インターネット', 'スマートフォン', 'パソコン', '人工知能'] },
      { name: '楽器', titles: ['ピアノ', 'ギター', 'ヴァイオリン', 'ドラムセット'] },
      { name: '和食', titles: ['寿司', 'ラーメン', '天ぷら', 'うどん'] },
      { name: '飲食嗜好品', titles: ['チョコレート', 'コーヒー', '紅茶', '緑茶'] },
      { name: '国際スポーツ大会', titles: ['オリンピック', 'FIFAワールドカップ', 'ツール・ド・フランス', 'ラグビーワールドカップ'] },
      { name: '世界的な賞', titles: ['ノーベル賞', 'アカデミー賞', 'ピューリッツァー賞', 'グラミー賞'] },
      { name: '科学理論・現象', titles: ['万有引力', '相対性理論', 'デオキシリボ核酸', '周期表', '光合成', 'ブラックホール'] },
    ],
  },
  {
    name: 'その他',
    groups: [
      { name: '日本の伝統文化', titles: ['桜', '花火', '忍者', '折り紙', '歌舞伎'] },
      { name: '宇宙', titles: ['国際宇宙ステーション', '月', '火星', '土星'] },
      { name: '自然現象', titles: ['台風', 'オーロラ', '地震', '虹'] },
    ],
  },
];

ARTICLE_CATEGORIES.forEach((c) => { c.titles = c.groups.reduce((acc, g) => acc.concat(g.titles), []); });
const ARTICLE_LIST = ARTICLE_CATEGORIES.reduce((acc, c) => acc.concat(c.titles), []);

// タイトル→カテゴリ名/グループ名の逆引き。ARTICLE_LIST に含まれないタイトル(テスト用のダミーbankなど)は
// undefinedになり、buildChoices側では「不明=どれとも同分類扱いしない」として扱われる。
const TITLE_CATEGORY = {};
const TITLE_GROUP = {};
ARTICLE_CATEGORIES.forEach((c) => {
  c.groups.forEach((g) => {
    g.titles.forEach((t) => { TITLE_CATEGORY[t] = c.name; TITLE_GROUP[t] = c.name + ':' + g.name; });
  });
});

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

// 正解タイトル＋固定リストから選んだ他のタイトル(CHOICE_COUNT-1件)をシャッフルして4択を作る。
// 誤答は「消去法で一発で当てられない」ようにするため、
// 1. 同じ小分類(group。例:「動物:爬虫類・恐竜」) 2. 同じ大分類(category。例:「動物」) 3. それ以外
// の順で優先して埋める(前の階層だけで必要数に届かない場合のみ次の階層から補う)。
function buildChoices(correctTitle, rng = Math.random, bank = ARTICLE_LIST, titleGroup = TITLE_GROUP, titleCategory = TITLE_CATEGORY) {
  const pool = bank.filter((t) => t !== correctTitle);
  const correctGroup = titleGroup[correctTitle];
  const correctCategory = titleCategory[correctTitle];
  const tierGroup = correctGroup ? pool.filter((t) => titleGroup[t] === correctGroup) : [];
  const tierCategory = correctCategory
    ? pool.filter((t) => titleCategory[t] === correctCategory && !tierGroup.includes(t))
    : [];
  const tierRest = pool.filter((t) => !tierGroup.includes(t) && !tierCategory.includes(t));
  const needed = CHOICE_COUNT - 1;
  const distractors = [];
  [tierGroup, tierCategory, tierRest].forEach((tier) => {
    if (distractors.length >= needed) return;
    distractors.push(...shuffle(tier, rng).slice(0, needed - distractors.length));
  });
  return shuffle([correctTitle].concat(distractors), rng);
}

// 記事タイトルと、その記事本文の冒頭で実際に使われる語が異なるケースのエイリアス。
// (例:「コロッセオ」という記事タイトルだが、本文は「コロッセウムは、ローマ帝政期に…」のように
// 「コロッセウム」という語で始まる)。 汎用パターンでは吸収できない語のズレをここで個別に補う。
const REDACT_ALIASES = { 'コロッセオ': ['コロッセウム'] };

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 抜粋文中の記事タイトルを伏字にするための正規表現パターンを組み立てる。単純な文字列一致では
// 以下2パターンの表記ゆれで伏字化に失敗する(答えが丸見えになる)ため、パターンを緩めている。
// 1. 日本語の人物記事は本文冒頭で姓と名の間にスペースを入れる慣習がある
//    (例:タイトル「坂本龍馬」に対し本文は「坂本 龍馬」) → 文字と文字の間に任意のスペースを許容する。
// 2. 「・」区切りの外国人名は、本文側にミドルネームが挿入されることがある
//    (例:タイトル「チャールズ・ダーウィン」に対し本文は「チャールズ・ロバート・ダーウィン」)
//    → 各パーツの間・末尾に任意の「・追加パーツ」を許容する。
function buildTitlePattern(title) {
  if (title.includes('・')) {
    const parts = title.split('・').map(escapeRegExp);
    const middle = parts.slice(1).map((p) => '(?:・[^\\s、。]+)*?・' + p).join('');
    return parts[0] + middle + '(?:・[^\\s、。]+)*';
  }
  return title.split('').map(escapeRegExp).join('[ \\u3000]?');
}

// 抜粋文中の記事タイトル文字列と、それに続く読み仮名/英語表記などの括弧書きを伏字に置換する。
// 例:「東京タワー（とうきょうタワー）は、東京都港区にある電波塔である。」
//   → 「●●●は、東京都港区にある電波塔である。」
function redactExtract(extract, title) {
  if (!extract) return '';
  if (!title) return String(extract);
  const names = [title].concat(REDACT_ALIASES[title] || []);
  let text = String(extract);
  names.forEach((name) => {
    text = text.replace(new RegExp(buildTitlePattern(name), 'g'), MASK);
  });
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
  FETCH_CANDIDATE_COUNT, EXCERPT_MAX_LENGTH, EXCERPT_MAX_SENTENCES, MASK,
  ARTICLE_LIST, ARTICLE_CATEGORIES, TITLE_CATEGORY, TITLE_GROUP, REDACT_ALIASES,
  shuffle, pickArticleCandidates, buildChoices, buildTitlePattern, redactExtract, limitSentences, truncateExtract,
  prepareExcerpt, isCorrectAnswer, computeRoundScoreDeltas, applyScoreDeltas, buildScoreboard,
  getWinners, wikipediaSourceUrl, addPlayer, removePlayer, hasMinPlayers,
};
if (typeof module !== 'undefined') module.exports = WikipediaQuizLogicExports;
if (typeof window !== 'undefined') window.WikipediaQuizLogic = WikipediaQuizLogicExports;
