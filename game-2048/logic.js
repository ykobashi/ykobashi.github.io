// logic.js - 2048 純粋関数ロジック(DOM操作なし)

const GRID_SIZE = 4;
const WIN_VALUE = 2048;

// 空のグリッドを作る(0 = 空きマス)
function createEmptyGrid(size = GRID_SIZE) {
  const grid = [];
  for (let r = 0; r < size; r++) {
    grid.push(new Array(size).fill(0));
  }
  return grid;
}

function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

function rowsEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function gridsEqual(a, b) {
  return a.every((row, r) => rowsEqual(row, b[r]));
}

// 1行を左にスライド&マージする。{row, score, moved} を返す
function slideRowLeft(row) {
  const size = row.length;
  const nonZero = row.filter((v) => v !== 0);
  const merged = [];
  let score = 0;
  let i = 0;
  while (i < nonZero.length) {
    if (i + 1 < nonZero.length && nonZero[i] === nonZero[i + 1]) {
      const mergedValue = nonZero[i] * 2;
      merged.push(mergedValue);
      score += mergedValue;
      i += 2;
    } else {
      merged.push(nonZero[i]);
      i += 1;
    }
  }
  while (merged.length < size) merged.push(0);
  const moved = !rowsEqual(row, merged);
  return { row: merged, score, moved };
}

// グリッドを転置する(行と列を入れ替える)
function transpose(grid) {
  const size = grid.length;
  const result = createEmptyGrid(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      result[c][r] = grid[r][c];
    }
  }
  return result;
}

// 各行を左右反転する
function reverseRows(grid) {
  return grid.map((row) => row.slice().reverse());
}

function applySlideToRows(grid) {
  let totalScore = 0;
  let moved = false;
  const newGrid = grid.map((row) => {
    const result = slideRowLeft(row);
    totalScore += result.score;
    if (result.moved) moved = true;
    return result.row;
  });
  return { grid: newGrid, score: totalScore, moved };
}

function moveLeft(grid) {
  return applySlideToRows(grid);
}

function moveRight(grid) {
  const reversed = reverseRows(grid);
  const result = applySlideToRows(reversed);
  return { grid: reverseRows(result.grid), score: result.score, moved: result.moved };
}

function moveUp(grid) {
  const transposed = transpose(grid);
  const result = applySlideToRows(transposed);
  return { grid: transpose(result.grid), score: result.score, moved: result.moved };
}

function moveDown(grid) {
  const transposed = transpose(grid);
  const reversed = reverseRows(transposed);
  const result = applySlideToRows(reversed);
  return { grid: transpose(reverseRows(result.grid)), score: result.score, moved: result.moved };
}

// 空きマスの座標一覧
function getEmptyCells(grid) {
  const cells = [];
  grid.forEach((row, r) => {
    row.forEach((value, c) => {
      if (value === 0) cells.push([r, c]);
    });
  });
  return cells;
}

// 空きマスにランダムな新タイル(90%=2, 10%=4)を追加した新しいグリッドを返す。
// rng は 0以上1未満の乱数を返す関数(テスト時に差し替え可能)。空きマスが無ければ元のグリッドをそのまま返す
function addRandomTile(grid, rng = Math.random) {
  const empties = getEmptyCells(grid);
  if (empties.length === 0) return cloneGrid(grid);
  const idx = Math.floor(rng() * empties.length);
  const [r, c] = empties[idx];
  const value = rng() < 0.9 ? 2 : 4;
  const newGrid = cloneGrid(grid);
  newGrid[r][c] = value;
  return newGrid;
}

// いずれかの方向に動かせるか(空きマスがある、または隣接する同値マスがある)
function canMove(grid) {
  const size = grid.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === 0) return true;
      if (c + 1 < size && grid[r][c] === grid[r][c + 1]) return true;
      if (r + 1 < size && grid[r][c] === grid[r + 1][c]) return true;
    }
  }
  return false;
}

// 勝利判定(いずれかのマスが目標値以上)
function hasWon(grid, target = WIN_VALUE) {
  return grid.some((row) => row.some((value) => value >= target));
}

const Game2048Logic = {
  GRID_SIZE,
  WIN_VALUE,
  createEmptyGrid,
  cloneGrid,
  gridsEqual,
  slideRowLeft,
  transpose,
  reverseRows,
  moveLeft,
  moveRight,
  moveUp,
  moveDown,
  getEmptyCells,
  addRandomTile,
  canMove,
  hasWon,
};

if (typeof module !== 'undefined') {
  module.exports = Game2048Logic;
}
if (typeof window !== 'undefined') {
  window.Game2048Logic = Game2048Logic;
}
