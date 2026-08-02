// Host-authoritative rules for Minesweeper Rush.  This module has no DOM dependency.
const DIFFICULTIES = {
  small: { label: '小（2〜3人向け）', rows: 12, cols: 16, mines: 20 },
  medium: { label: '中（3〜4人向け）', rows: 20, cols: 30, mines: 110 },
  large: { label: '大（4人向け）', rows: 24, cols: 36, mines: 170 },
};
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const FREEZE_MS = 5000;

function createEmptyBoard(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ mine: false, adjacent: 0, opened: false, owner: null })));
}
function getNeighbors(rows, cols, r, c) {
  const out = [];
  for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
    const nr = r + dr, nc = c + dc;
    if ((dr || dc) && nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push([nr, nc]);
  }
  return out;
}
function placeMines(board, mineCount, rng = Math.random, safeCells = []) {
  const rows = board.length, cols = rows ? board[0].length : 0;
  const safe = new Set(safeCells.map(([r, c]) => r + ':' + c));
  const choices = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) if (!safe.has(r + ':' + c)) choices.push([r, c]);
  if (!Number.isInteger(mineCount) || mineCount < 0 || mineCount > choices.length) throw new RangeError('Invalid mine count');
  for (let i = choices.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [choices[i], choices[j]] = [choices[j], choices[i]]; }
  choices.slice(0, mineCount).forEach(([r, c]) => { board[r][c].mine = true; });
  return board;
}
function computeAdjacentCounts(board) {
  const rows = board.length, cols = rows ? board[0].length : 0;
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) board[r][c].adjacent = board[r][c].mine ? 0 : getNeighbors(rows, cols, r, c).filter(([nr, nc]) => board[nr][nc].mine).length;
  return board;
}
function generateBoard(rows, cols, mineCount, safeSeed, rng = Math.random) {
  const board = createEmptyBoard(rows, cols);
  const [r, c] = safeSeed;
  placeMines(board, mineCount, rng, [[r, c], ...getNeighbors(rows, cols, r, c)]);
  return computeAdjacentCounts(board);
}
function floodOpen(board, r, c) {
  if (!board[r] || !board[r][c] || board[r][c].mine) return board;
  const rows = board.length, cols = board[0].length, queue = [[r, c]];
  for (let index = 0; index < queue.length; index += 1) {
    const [cr, cc] = queue[index], cell = board[cr][cc];
    if (cell.opened || cell.mine) continue;
    cell.opened = true;
    if (cell.adjacent === 0) getNeighbors(rows, cols, cr, cc).forEach(([nr, nc]) => {
      if (!board[nr][nc].opened && !board[nr][nc].mine) queue.push([nr, nc]);
    });
  }
  return board;
}
function claimCell(board, r, c, playerId) {
  if (!board[r] || !board[r][c] || board[r][c].opened) return { alreadyResolved: true, newlyOwned: [], hitMine: false };
  const cell = board[r][c];
  if (cell.mine) { cell.opened = true; cell.owner = 'mine'; return { alreadyResolved: false, newlyOwned: [], hitMine: true, mineCell: { r, c } }; }
  floodOpen(board, r, c);
  const newlyOwned = [];
  board.forEach((row, rr) => row.forEach((target, cc) => {
    if (target.opened && target.owner === null && !target.mine) { target.owner = playerId; newlyOwned.push({ r: rr, c: cc }); }
  }));
  return { alreadyResolved: false, newlyOwned, hitMine: false };
}
function isBoardCleared(board) { return board.flat().every((cell) => cell.mine || cell.opened); }
function addPlayer(roster, player) { return roster.some((p) => p.id === player.id || (player.token && p.token === player.token)) ? roster : roster.concat(player); }
function removePlayer(roster, id) { return roster.filter((p) => p.id !== id); }
function hasMinPlayers(roster, min = MIN_PLAYERS) { return roster.length >= min; }
function hasMaxPlayers(roster, max = MAX_PLAYERS) { return roster.length >= max; }
function buildScoreboard(scores, roster) {
  const sorted = roster.map((p) => ({ id: p.id, name: p.name, joinOrder: p.joinOrder, score: Number(scores[p.id]) || 0 }))
    .sort((a, b) => b.score - a.score || a.joinOrder - b.joinOrder);
  let lastScore = null, lastRank = 0;
  return sorted.map((player, index) => {
    if (player.score !== lastScore) { lastScore = player.score; lastRank = index + 1; }
    return { ...player, rank: lastRank };
  });
}
function getWinners(scoreboard) { return scoreboard.filter((p) => p.rank === 1); }

const MinesweeperRushLogic = { DIFFICULTIES, MIN_PLAYERS, MAX_PLAYERS, FREEZE_MS, createEmptyBoard, getNeighbors, placeMines, computeAdjacentCounts, generateBoard, floodOpen, claimCell, isBoardCleared, addPlayer, removePlayer, hasMinPlayers, hasMaxPlayers, buildScoreboard, getWinners };
if (typeof module !== 'undefined') module.exports = MinesweeperRushLogic;
if (typeof window !== 'undefined') window.MinesweeperRushLogic = MinesweeperRushLogic;
