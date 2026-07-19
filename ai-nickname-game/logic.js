// AIあだ名当てゲーム 純粋ロジック
const MIN_PLAYERS = 2;
const REAL_AUTHOR = 'REAL';
const ROUND_TOTAL = 8;
const CORRECT_GUESS_POINTS = 1000;
const VOTE_FOOLED_POINTS = 500;
const NICKNAME_MAX_LENGTH = 14;

function shuffle(array, rng = Math.random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pickCharacterEntry(rng = Math.random, bank) {
  if (!Array.isArray(bank) || bank.length === 0) return null;
  return bank[Math.min(bank.length - 1, Math.floor(rng() * bank.length))];
}

function pickNickname(nicknames, rng = Math.random) {
  if (!Array.isArray(nicknames) || nicknames.length === 0) return '';
  return nicknames[Math.min(nicknames.length - 1, Math.floor(rng() * nicknames.length))];
}

function buildEntryList(realNickname, fakeNicknames, rng = Math.random) {
  return shuffle([{ id: 'entry-0', text: realNickname, authorId: REAL_AUTHOR }].concat(
    fakeNicknames.map((f, i) => ({ id: 'entry-' + (i + 1), text: f.text, authorId: f.authorId }))
  ), rng);
}

function tallyNicknameVotes(votes, entries) {
  const real = entries.find((e) => e.authorId === REAL_AUTHOR);
  const realEntryId = real ? real.id : null;
  const correctVoterIds = Object.keys(votes).filter((id) => votes[id] === realEntryId);
  const voteCounts = {};
  entries.forEach((e) => { voteCounts[e.id] = 0; });
  Object.keys(votes).forEach((id) => {
    const entryId = votes[id];
    voteCounts[entryId] = (voteCounts[entryId] || 0) + 1;
  });
  let mostDeceptiveAuthorId = null;
  let best = 0;
  entries.forEach((e) => {
    const count = voteCounts[e.id] || 0;
    if (e.authorId !== REAL_AUTHOR && count > best) {
      best = count;
      mostDeceptiveAuthorId = e.authorId;
    }
  });
  return { realEntryId, correctVoterIds, voteCounts, mostDeceptiveAuthorId };
}

function isSelfVote(entries, votedEntryId, voterId) {
  const entry = entries.find((e) => e.id === votedEntryId);
  return !!entry && entry.authorId === voterId;
}

function computeRoundScoreDeltas(tally, entries) {
  const deltas = {};
  tally.correctVoterIds.forEach((id) => { deltas[id] = (deltas[id] || 0) + CORRECT_GUESS_POINTS; });
  entries.forEach((entry) => {
    if (entry.authorId === REAL_AUTHOR) return;
    const count = tally.voteCounts[entry.id] || 0;
    if (count) deltas[entry.authorId] = (deltas[entry.authorId] || 0) + count * VOTE_FOOLED_POINTS;
  });
  return deltas;
}

function applyScoreDeltas(scores, deltas) {
  const result = Object.assign({}, scores);
  Object.keys(deltas).forEach((id) => { result[id] = (result[id] || 0) + deltas[id]; });
  return result;
}

function buildScoreboard(scores, roster) {
  return roster.map((p) => ({ id: p.id, name: p.name, score: scores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);
}

function normalizeNickname(text) { return String(text || '').trim().slice(0, NICKNAME_MAX_LENGTH); }
function addPlayer(roster, player) { return roster.some((p) => p.id === player.id) ? roster : roster.concat(player); }
function removePlayer(roster, id) { return roster.filter((p) => p.id !== id); }
function hasMinPlayers(roster, min = MIN_PLAYERS) { return roster.length >= min; }

const AiNicknameGameLogicExports = { MIN_PLAYERS, REAL_AUTHOR, ROUND_TOTAL, CORRECT_GUESS_POINTS,
  VOTE_FOOLED_POINTS, NICKNAME_MAX_LENGTH, shuffle, pickCharacterEntry, pickNickname, buildEntryList,
  tallyNicknameVotes, isSelfVote, computeRoundScoreDeltas, applyScoreDeltas, buildScoreboard,
  normalizeNickname, addPlayer, removePlayer, hasMinPlayers };
if (typeof module !== 'undefined') module.exports = AiNicknameGameLogicExports;
if (typeof window !== 'undefined') window.AiNicknameGameLogic = AiNicknameGameLogicExports;
