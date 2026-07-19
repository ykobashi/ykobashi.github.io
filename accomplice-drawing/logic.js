// logic.js - 共犯ドローイング 純粋関数ロジック（DOM操作なし）
const MIN_PLAYERS = 4;
const ROUNDS = 3;

const TOPIC_BANK = [
  'りんご', 'バナナ', '傘', '雪だるま', '自転車', '飛行機', 'ロケット',
  'ソフトクリーム', 'おにぎり', '金魚', 'ペンギン', 'サボテン', '扇風機',
  '花火', 'ハンバーガー', '恐竜', '幽霊', '宇宙人', 'くじら', '虹', '雷',
  'タコ', 'カニ', 'ロボット', '時計', '眼鏡', 'ギター', 'サンタクロース',
  'コアラ', 'パンダ', '忍者', 'かかし', '灯台', '観覧車', 'カタツムリ',
  '富士山', '消防車', 'ケーキ', 'ひまわり', 'フライパン',
];

function validIds(ids, min) {
  if (!Array.isArray(ids) || ids.length < min || ids.some((id) => typeof id !== 'string' || !id)) throw new Error('invalid player ids');
  if (new Set(ids).size !== ids.length) throw new Error('duplicate player ids');
}

function shuffle(items, rng = Math.random) {
  if (!Array.isArray(items) || typeof rng !== 'function') throw new Error('invalid shuffle input');
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('invalid random value');
    const j = Math.floor(value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function assignAccomplicePair(playerIds, rng = Math.random) {
  validIds(playerIds, 2);
  return shuffle(playerIds, rng).slice(0, 2);
}

function pairKey(idA, idB) {
  validIds([idA, idB], 2);
  return JSON.stringify([idA, idB].sort());
}

function parsePairKey(key) {
  if (typeof key !== 'string') throw new Error('invalid pair key');
  let pair;
  try { pair = JSON.parse(key); } catch (_) { throw new Error('invalid pair key'); }
  validIds(pair, 2);
  if (pair.length !== 2 || pair[0] > pair[1]) throw new Error('non-canonical pair key');
  return pair;
}

function distributeTopics(playerIds, accomplicePair, rng = Math.random, bank = TOPIC_BANK) {
  validIds(playerIds, 2); validIds(accomplicePair, 2);
  if (accomplicePair.length !== 2 || accomplicePair.some((id) => !playerIds.includes(id))) throw new Error('invalid accomplice pair');
  if (!Array.isArray(bank) || bank.some((topic) => typeof topic !== 'string' || !topic.trim()) || new Set(bank).size !== bank.length) throw new Error('invalid topic bank');
  const needed = playerIds.length - 1;
  if (bank.length < needed) throw new Error('not enough topics');
  const topics = shuffle(bank, rng).slice(0, needed);
  const result = Object.create(null);
  const shared = topics[0]; let next = 1;
  playerIds.forEach((id) => { result[id] = accomplicePair.includes(id) ? shared : topics[next++]; });
  return result;
}

function voteEntries(votes) {
  if (votes instanceof Map) return Array.from(votes.entries());
  if (!votes || typeof votes !== 'object' || Array.isArray(votes)) throw new Error('invalid votes');
  return Object.keys(votes).map((id) => [id, votes[id]]);
}

function tallyPairVotes(votes) {
  const counts = Object.create(null);
  voteEntries(votes).forEach((entry) => {
    const voterId = entry[0]; const target = entry[1];
    if (typeof voterId !== 'string' || !voterId || !Array.isArray(target) || target.length !== 2) throw new Error('invalid vote');
    const key = pairKey(target[0], target[1]);
    counts[key] = (counts[key] || 0) + 1;
  });
  const keys = Object.keys(counts);
  if (!keys.length) return { counts, selectedIds: [], isTie: true };
  const max = Math.max(...keys.map((key) => counts[key]));
  const selectedIds = keys.filter((key) => counts[key] === max);
  return { counts, selectedIds, isTie: selectedIds.length !== 1 };
}

function checkAllyFound(accomplicePair, votes) {
  const key = pairKey(accomplicePair[0], accomplicePair[1]);
  const entries = new Map(voteEntries(votes));
  return accomplicePair.every((id) => entries.has(id) && pairKey(entries.get(id)[0], entries.get(id)[1]) === key);
}

function checkCaught(tally, truePairKey) {
  parsePairKey(truePairKey);
  return !!tally && tally.isTie === false && Array.isArray(tally.selectedIds) && tally.selectedIds.length === 1 && tally.selectedIds[0] === truePairKey;
}

function determineWinner(result) { return result.allyFound && !result.caught ? 'accomplice' : 'citizens'; }
function addPlayer(roster, player) { return roster.some((item) => item.id === player.id) ? roster : roster.concat([player]); }
function removePlayer(roster, id) { return roster.filter((item) => item.id !== id); }
function hasMinPlayers(roster, min = MIN_PLAYERS) { return roster.length >= min; }

const AccompliceDrawingLogicExports = { MIN_PLAYERS, ROUNDS, TOPIC_BANK, shuffle, assignAccomplicePair, distributeTopics, pairKey, parsePairKey, tallyPairVotes, checkAllyFound, checkCaught, determineWinner, addPlayer, removePlayer, hasMinPlayers };
if (typeof module !== 'undefined') module.exports = AccompliceDrawingLogicExports;
if (typeof window !== 'undefined') window.AccompliceDrawingLogic = AccompliceDrawingLogicExports;
