// Minesweeper game rules. This module deliberately has no DOM dependency.
const DIFFICULTIES = {
  beginner: { label: '初級', rows: 9, cols: 9, mines: 10 },
  intermediate: { label: '中級', rows: 16, cols: 16, mines: 40 },
  expert: { label: '上級', rows: 16, cols: 30, mines: 99 },
};

function createEmptyBoard(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ mine: false, adjacent: 0, opened: false, flagged: false })));
}

function cloneBoard(board) { return board.map((row) => row.map((cell) => ({ ...cell }))); }

function getNeighbors(rows, cols, r, c) {
  const result = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr || dc) { const nr = r + dr; const nc = c + dc; if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) result.push([nr, nc]); }
  }
  return result;
}

function placeMines(board, mineCount, rng = Math.random, safeCells = []) {
  const rows = board.length, cols = rows ? board[0].length : 0;
  const safe = new Set(safeCells.map(([r, c]) => r + ':' + c));
  const candidates = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!safe.has(r + ':' + c)) candidates.push([r, c]);
  if (!Number.isInteger(mineCount) || mineCount < 0 || mineCount > candidates.length) throw new RangeError('Invalid mine count');
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  candidates.slice(0, mineCount).forEach(([r, c]) => { board[r][c].mine = true; });
  return board;
}

function computeAdjacentCounts(board) {
  const rows = board.length, cols = rows ? board[0].length : 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) board[r][c].adjacent = board[r][c].mine ? 0 : getNeighbors(rows, cols, r, c).filter(([nr, nc]) => board[nr][nc].mine).length;
  return board;
}

function generateBoard(rows, cols, mineCount, firstClick, rng = Math.random) {
  const board = createEmptyBoard(rows, cols);
  const [r, c] = firstClick;
  const safe = [[r, c], ...getNeighbors(rows, cols, r, c)];
  placeMines(board, mineCount, rng, safe);
  return computeAdjacentCounts(board);
}

function floodOpen(board, r, c) {
  if (!board[r] || !board[r][c] || board[r][c].mine || board[r][c].flagged) return board;
  const rows = board.length, cols = board[0].length, queue = [[r, c]];
  while (queue.length) {
    const [cr, cc] = queue.shift(), cell = board[cr][cc];
    if (cell.opened || cell.flagged || cell.mine) continue;
    cell.opened = true;
    if (cell.adjacent === 0) getNeighbors(rows, cols, cr, cc).forEach(([nr, nc]) => { if (!board[nr][nc].opened && !board[nr][nc].mine && !board[nr][nc].flagged) queue.push([nr, nc]); });
  }
  return board;
}

function toggleFlag(board, r, c) { if (board[r] && board[r][c] && !board[r][c].opened) board[r][c].flagged = !board[r][c].flagged; return board; }
function countFlags(board) { return board.flat().filter((cell) => cell.flagged).length; }
function remainingMineCount(board, mineCount) { return mineCount - countFlags(board); }
function isWin(board) { return board.flat().every((cell) => cell.mine || cell.opened); }
function revealAllMines(board) { board.flat().forEach((cell) => { if (cell.mine) cell.opened = true; }); return board; }
function formatTime(seconds) { const safe = Math.max(0, Math.floor(Number(seconds) || 0)); return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0'); }

const MinesweeperLogic = { DIFFICULTIES, createEmptyBoard, cloneBoard, getNeighbors, placeMines, computeAdjacentCounts, generateBoard, floodOpen, toggleFlag, countFlags, remainingMineCount, isWin, revealAllMines, formatTime };
if (typeof module !== 'undefined') module.exports = MinesweeperLogic;
if (typeof window !== 'undefined') window.MinesweeperLogic = MinesweeperLogic;
