// logic.js - NGワード対戦版 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 2;

const WORD_POOL = [
  'りんご', 'みかん', 'バナナ', 'ぶどう', 'いちご',
  'ねこ', 'いぬ', 'うさぎ', 'ぞう', 'きりん',
  'つくえ', 'いす', 'まくら', 'ふとん', 'かがみ',
  'とけい', 'かばん', 'めがね', 'かさ', 'くつ',
  'ぼうし', 'さかな', 'とり', 'はな', 'き',
  'やま', 'かわ', 'うみ', 'そら', 'くも',
  'あめ', 'ゆき', 'かぜ', 'ほし', 'つき',
  'でんしゃ', 'くるま', 'じてんしゃ', 'ひこうき', 'ふね',
  'えき', 'がっこう', 'びょういん', 'こうえん', 'としょかん',
  'れいぞうこ', 'せんぷうき', 'テレビ', 'パソコン', 'スマホ',
  'かぎ', 'さいふ', 'たまご', 'パン', 'コーヒー',
  'おちゃ', 'ラーメン', 'すし', 'ケーキ', 'チョコレート',
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

// playerIds それぞれに WORD_POOL から重複しない単語(NGワード)を割り当てる
function assignSecretWords(playerIds, rng = Math.random) {
  const shuffled = shuffle(WORD_POOL, rng);
  const words = {};
  playerIds.forEach((id, i) => {
    words[id] = shuffled[i];
  });
  return words;
}

// fullList([{id, name, word}, ...])から自分(myId)の行だけを取り除いた配列を返す
function visibleListFor(myId, fullList) {
  return fullList.filter((p) => p.id !== myId);
}

// 「早い者勝ち」のクレーム確定。currentClaimが既にあればそれを維持し、
// なければnewClaimを採用する(ネットワーク到達順に関わらず最初の1件だけが有効)
function acceptClaim(currentClaim, newClaim) {
  return currentClaim ? currentClaim : newClaim;
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

const NgWordBattleLogicExports = {
  MIN_PLAYERS,
  WORD_POOL,
  shuffle,
  assignSecretWords,
  visibleListFor,
  acceptClaim,
  addPlayer,
  removePlayer,
  hasMinPlayers,
};

if (typeof module !== 'undefined') {
  module.exports = NgWordBattleLogicExports;
}
if (typeof window !== 'undefined') {
  window.NgWordBattleLogic = NgWordBattleLogicExports;
}
