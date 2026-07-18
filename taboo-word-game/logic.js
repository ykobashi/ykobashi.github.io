// logic.js - NGワードゲーム(タブー形式) 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 2;
const ROUND_WORD_COUNT = 10;

// お題バンク。word を、banned に含まれる3つの単語を使わずに説明する。
const TABOO_BANK = [
  { word: '寿司', banned: ['魚', 'ネタ', '回転'] },
  { word: '花火', banned: ['夏', '打ち上げ', '音'] },
  { word: '傘', banned: ['雨', '骨', '折りたたみ'] },
  { word: '冷蔵庫', banned: ['冷やす', 'キッチン', '電気'] },
  { word: '図書館', banned: ['本', '静か', '借りる'] },
  { word: '温泉', banned: ['お湯', '露天', '旅館'] },
  { word: '新幹線', banned: ['電車', '速い', '駅'] },
  { word: '桜', banned: ['花見', 'ピンク', '春'] },
  { word: '富士山', banned: ['山', '日本一', '登る'] },
  { word: 'カレー', banned: ['辛い', 'ルー', 'ご飯'] },
  { word: '猫', banned: ['動物', 'ニャー', 'ペット'] },
  { word: '犬', banned: ['動物', 'ワン', '散歩'] },
  { word: '洗濯機', banned: ['洗う', '服', '回る'] },
  { word: '消しゴム', banned: ['消す', '鉛筆', '白い'] },
  { word: '信号機', banned: ['赤', '青', '交差点'] },
  { word: '折り紙', banned: ['紙', '折る', '鶴'] },
  { word: '眼鏡', banned: ['目', 'レンズ', 'かける'] },
  { word: '財布', banned: ['お金', '入れる', 'カード'] },
  { word: '時計', banned: ['時間', '針', '秒'] },
  { word: '布団', banned: ['寝る', '毛布', 'ふかふか'] },
  { word: '台所', banned: ['料理', 'キッチン', '包丁'] },
  { word: '教室', banned: ['学校', '机', '黒板'] },
  { word: '病院', banned: ['医者', '注射', '薬'] },
  { word: '郵便局', banned: ['手紙', '切手', '配達'] },
  { word: '公園', banned: ['遊具', 'ブランコ', '散歩'] },
  { word: '動物園', banned: ['檻', '象', '入場料'] },
  { word: '水族館', banned: ['魚', 'イルカ', '水槽'] },
  { word: '花屋', banned: ['花束', '店員', '香り'] },
  { word: '美容院', banned: ['髪', 'カット', '鏡'] },
  { word: 'コンビニ', banned: ['24時間', 'レジ', 'おにぎり'] },
];

// Fisher-Yates シャッフル。rng は 0以上1未満の乱数を返す関数(テスト時に差し替え可能)
function shuffle(array, rng = Math.random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

// お題バンクから count 個(重複なし)をランダムに抜き出す
function pickRoundWords(rng = Math.random, bank = TABOO_BANK, count = ROUND_WORD_COUNT) {
  const shuffled = shuffle(bank, rng);
  return shuffled.slice(0, Math.min(count, bank.length));
}

// 挑戦記録({describerName, elapsedMs})の配列を、タイムの昇順(速い順)に並べ替える
function sortLeaderboard(entries) {
  return entries.slice().sort((a, b) => a.elapsedMs - b.elapsedMs);
}

// ================= ロビー名簿(純粋関数) =================

function addPlayer(roster, player) {
  if (roster.some((p) => p.id === player.id)) return roster;
  return roster.concat([player]);
}

function removePlayer(roster, id) {
  return roster.filter((p) => p.id !== id);
}

function hasMinPlayers(roster, min = MIN_PLAYERS) {
  return roster.length >= min;
}

const TabooWordLogicExports = {
  MIN_PLAYERS,
  ROUND_WORD_COUNT,
  TABOO_BANK,
  shuffle,
  pickRoundWords,
  sortLeaderboard,
  addPlayer,
  removePlayer,
  hasMinPlayers,
};

if (typeof module !== 'undefined') {
  module.exports = TabooWordLogicExports;
}
if (typeof window !== 'undefined') {
  window.TabooWordLogic = TabooWordLogicExports;
}
