// logic.js - YouTubeサムネイル当てクイズ 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 2;
const ROUND_TOTAL = 8;
const CHOICE_COUNT = 4;
const CORRECT_POINTS = 1000;
const GENRES = ['vocaloid', 'anime', 'jpop']; // UI上は 'mix' も選べるが、これは「絞らない」を表す特別値
const DECADES = ['1990s', '2000s', '2010s', '2020s']; // UI上は 'all' も選べるが、これは「絞らない」を表す特別値

const DEFAULT_BANK = (typeof window !== 'undefined' && window.YoutubeThumbnailQuizData) || [];

function thumbnailUrl(videoId) {
  return 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg';
}

// genre='mix' または decade='all' の場合はその軸を絞らない
function filterPool(bank, genre, decade) {
  return bank.filter((entry) =>
    (genre === 'mix' || entry.genre === genre) &&
    (decade === 'all' || entry.decade === decade)
  );
}

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

// プールから未出題(usedIds に含まれない)の1件を選ぶ。
// 候補が尽きた場合は出題履歴をリセットしてプール全体から選び直す。
// 返り値の usedIds を次回呼び出しに渡すことで、部屋内での重複出題を防ぐ。
function selectRoundVideo(rng = Math.random, pool, usedIds = []) {
  const usedSet = new Set(usedIds);
  const candidates = pool.filter((entry) => !usedSet.has(entry.videoId));

  if (candidates.length > 0) {
    const entry = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
    return { entry, usedIds: usedIds.concat([entry.videoId]) };
  }

  const entry = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return { entry, usedIds: [entry.videoId] };
}

// 正解の曲名 + プールから無作為に選んだ他の曲名(count-1個)をシャッフルして返す
function buildChoices(correctEntry, pool, rng = Math.random, count = CHOICE_COUNT) {
  const others = shuffle(pool.filter((entry) => entry.videoId !== correctEntry.videoId), rng).slice(0, count - 1);
  return shuffle([correctEntry.title].concat(others.map((entry) => entry.title)), rng);
}

function judgeAnswer(selectedTitle, correctTitle) {
  return !!selectedTitle && selectedTitle === correctTitle;
}

// 回答マップ({playerId: selectedTitle})から正解者のIDリストを求める
function tallyRoundAnswers(answers, correctTitle) {
  const correctIds = Object.keys(answers).filter((id) => judgeAnswer(answers[id], correctTitle));
  return { correctIds };
}

function computeRoundScoreDeltas(tally, points = CORRECT_POINTS) {
  const deltas = {};
  tally.correctIds.forEach((id) => { deltas[id] = points; });
  return deltas;
}

function applyScoreDeltas(scores, deltas) {
  const result = Object.assign({}, scores);
  Object.keys(deltas).forEach((id) => { result[id] = (result[id] || 0) + deltas[id]; });
  return result;
}

// スコア降順のスコアボードを作る。同点は同順位(1,1,3...)になる標準競技順位方式。
function buildScoreboard(scores, roster) {
  const rows = roster
    .map((p) => ({ id: p.id, name: p.name, score: scores[p.id] || 0 }))
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

// ================= ロビー名簿(純粋関数) =================

function addPlayer(roster, player) {
  return roster.some((p) => p.id === player.id) ? roster : roster.concat([player]);
}

function removePlayer(roster, id) {
  return roster.filter((p) => p.id !== id);
}

function hasMinPlayers(roster, min = MIN_PLAYERS) {
  return roster.length >= min;
}

const YoutubeThumbnailQuizLogicExports = {
  MIN_PLAYERS,
  ROUND_TOTAL,
  CHOICE_COUNT,
  CORRECT_POINTS,
  GENRES,
  DECADES,
  DEFAULT_BANK,
  thumbnailUrl,
  filterPool,
  shuffle,
  selectRoundVideo,
  buildChoices,
  judgeAnswer,
  tallyRoundAnswers,
  computeRoundScoreDeltas,
  applyScoreDeltas,
  buildScoreboard,
  getWinners,
  addPlayer,
  removePlayer,
  hasMinPlayers,
};

if (typeof module !== 'undefined') module.exports = YoutubeThumbnailQuizLogicExports;
if (typeof window !== 'undefined') window.YoutubeThumbnailQuizLogic = YoutubeThumbnailQuizLogicExports;
