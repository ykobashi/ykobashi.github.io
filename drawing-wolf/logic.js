// logic.js - お絵描きウルフ 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 3;
const ROUNDS = 3;

const TOPIC_BANK = [
  'りんご', 'バナナ', '傘', '雪だるま', '自転車', '飛行機', 'ロケット',
  'ソフトクリーム', 'おにぎり', '金魚', 'ペンギン', 'サボテン', '扇風機',
  '花火', 'ハンバーガー', '恐竜', '幽霊', '宇宙人', 'くじら', '虹', '雷',
  'タコ', 'カニ', 'ロボット', '時計', '眼鏡', 'ギター', 'サンタクロース',
  'コアラ', 'パンダ', '忍者', 'かかし', '灯台', '観覧車', 'カタツムリ',
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

// お題バンクから1つランダムに選ぶ
function pickTopic(rng = Math.random, bank = TOPIC_BANK) {
  const index = Math.floor(rng() * bank.length);
  return bank[index];
}

// playerIds の中から人狼を1人だけランダムに選ぶ
function assignWolf(playerIds, rng = Math.random) {
  return shuffle(playerIds, rng)[0];
}

// 描く順番(全ラウンド共通で固定)をランダムに決める
function buildTurnOrder(playerIds, rng = Math.random) {
  return shuffle(playerIds, rng);
}

function totalTurns(turnOrder, rounds = ROUNDS) {
  return turnOrder.length * rounds;
}

// turnIndex(0始まり)から現在の描き手情報を求める。描画フェーズが終わっていればnullを返す
function currentTurnInfo(turnOrder, turnIndex, rounds = ROUNDS) {
  if (turnIndex < 0 || turnIndex >= totalTurns(turnOrder, rounds)) return null;
  const n = turnOrder.length;
  return {
    playerId: turnOrder[turnIndex % n],
    round: Math.floor(turnIndex / n) + 1,
    turnInRound: (turnIndex % n) + 1,
    isLastTurn: turnIndex === totalTurns(turnOrder, rounds) - 1,
  };
}

// 表記ゆれを吸収して文字列を正規化する(全角半角・カタカナひらがな・空白記号などの違いを無視する)
function normalizeAnswer(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s\-‐‑‒–—―ー・、】【「」『』（）()]/g, '');
}

// 人狼の回答(guess)が本当のお題(topic)と一致するか判定する
function isCorrectGuess(guess, topic) {
  return normalizeAnswer(guess) === normalizeAnswer(topic) && normalizeAnswer(guess).length > 0;
}

// votes: { voterId: votedForId }
function tallyVotes(votes) {
  const counts = {};
  Object.keys(votes).forEach((voterId) => {
    const target = votes[voterId];
    counts[target] = (counts[target] || 0) + 1;
  });
  let max = 0;
  Object.keys(counts).forEach((id) => { max = Math.max(max, counts[id]); });
  const selectedIds = Object.keys(counts).filter((id) => counts[id] === max);
  return { counts, selectedIds, isTie: selectedIds.length !== 1 };
}

// 投票結果(tally)から人狼が見破られたかどうかを判定する(同数トップの場合は見破れなかった扱い)
function determineWolfCaught(tally, wolfId) {
  return !tally.isTie && tally.selectedIds[0] === wolfId;
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

const DrawingWolfLogicExports = {
  MIN_PLAYERS,
  ROUNDS,
  TOPIC_BANK,
  shuffle,
  pickTopic,
  assignWolf,
  buildTurnOrder,
  totalTurns,
  currentTurnInfo,
  normalizeAnswer,
  isCorrectGuess,
  tallyVotes,
  determineWolfCaught,
  addPlayer,
  removePlayer,
  hasMinPlayers,
};

if (typeof module !== 'undefined') {
  module.exports = DrawingWolfLogicExports;
}
if (typeof window !== 'undefined') {
  window.DrawingWolfLogic = DrawingWolfLogicExports;
}
