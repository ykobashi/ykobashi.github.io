// Word Wolf のDOMに依存しないゲームロジック
const MIN_PLAYERS = 3;

const WORD_PAIRS = [
  ['コーヒー', '紅茶'], ['犬', '猫'], ['海', 'プール'], ['映画館', '水族館'],
  ['ラーメン', 'うどん'], ['カレー', 'シチュー'], ['春', '秋'], ['山', '海'],
  ['コンビニ', 'スーパー'], ['電車', 'バス'], ['チョコレート', 'クッキー'],
  ['寿司', '焼肉'], ['スマホ', 'パソコン'], ['雨', '雪'], ['ケーキ', 'アイスクリーム'],
  ['遊園地', '動物園'], ['サッカー', '野球'], ['図書館', '本屋'], ['昼', '夕方'], ['旅行', '遠足'],
];

const ANSWER_ALIASES = {
  '犬': ['いぬ'], '猫': ['ねこ'], '海': ['うみ'], '山': ['やま'],
  '寿司': ['すし'], '焼肉': ['やきにく'], '雨': ['あめ'], '雪': ['ゆき'],
  '春': ['はる'], '秋': ['あき'], '昼': ['ひる'], '夕方': ['ゆうがた'],
  '本屋': ['ほんや'], '図書館': ['としょかん'], '遊園地': ['ゆうえんち'],
  '動物園': ['どうぶつえん'], '映画館': ['えいがかん'], '水族館': ['すいぞくかん'],
  '旅行': ['りょこう'], '遠足': ['えんそく'], '野球': ['やきゅう'], '電車': ['でんしゃ'],
};

function normalizeAnswer(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s\-‐‑‒–—―ー・、】【「」『』（）()]/g, '');
}

function isCorrectAnswer(answer, citizenWord) {
  const normalized = normalizeAnswer(answer);
  return [citizenWord].concat(ANSWER_ALIASES[citizenWord] || [])
    .some((word) => normalizeAnswer(word) === normalized);
}

function shuffle(items, rng = Math.random) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pickWordPair(rng = Math.random, pairs = WORD_PAIRS) {
  return pairs[Math.floor(rng() * pairs.length)].slice();
}

function createRound(playerIds, rng = Math.random, pairs = WORD_PAIRS) {
  if (playerIds.length < MIN_PLAYERS) throw new Error('プレイヤーは3人以上必要です');
  const pair = pickWordPair(rng, pairs);
  const wolfId = shuffle(playerIds, rng)[0];
  const citizenWord = pair[0];
  const wolfWord = pair[1];
  const words = {};
  playerIds.forEach((id) => { words[id] = id === wolfId ? wolfWord : citizenWord; });
  return { wolfId, citizenWord, wolfWord, words };
}

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

function hasMinPlayers(roster, min = MIN_PLAYERS) { return roster.length >= min; }
function addPlayer(roster, player) { return roster.some((p) => p.id === player.id) ? roster : roster.concat([player]); }
function removePlayer(roster, id) { return roster.filter((p) => p.id !== id); }

const WordWolfLogicExports = { MIN_PLAYERS, WORD_PAIRS, ANSWER_ALIASES, normalizeAnswer, isCorrectAnswer, shuffle, pickWordPair, createRound, tallyVotes, hasMinPlayers, addPlayer, removePlayer };
if (typeof module !== 'undefined') module.exports = WordWolfLogicExports;
if (typeof window !== 'undefined') window.WordWolfLogic = WordWolfLogicExports;
