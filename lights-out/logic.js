// logic.js - ライツアウト 純粋関数ロジック(DOM操作なし)

const BOARD_SIZE = 5;

// 全て消灯(false)の盤面を作る
function createEmptyBoard(size = BOARD_SIZE) {
  const board = [];
  for (let r = 0; r < size; r++) {
    board.push(new Array(size).fill(false));
  }
  return board;
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

// (row, col) とその上下左右のセルの点灯状態を反転した新しい盤面を返す
function toggleCell(board, row, col) {
  const size = board.length;
  const newBoard = cloneBoard(board);
  const targets = [
    [row, col],
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ];
  targets.forEach(([r, c]) => {
    if (r >= 0 && r < size && c >= 0 && c < board[0].length) {
      newBoard[r][c] = !newBoard[r][c];
    }
  });
  return newBoard;
}

// 全マス消灯していればクリア
function isCleared(board) {
  return board.every((row) => row.every((cell) => cell === false));
}

// size x size の盤面に対して count 回分のランダムなトグル座標列を作る。
// rng は 0以上1未満の乱数を返す関数(テスト時に差し替え可能)
function randomMoveSequence(size, count, rng = Math.random) {
  const moves = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(rng() * size);
    const c = Math.floor(rng() * size);
    moves.push([r, c]);
  }
  return moves;
}

// 全消灯の状態からランダムなトグル操作を複数回行い、必ず解ける初期配置を生成する。
// (トグルは自己逆操作かつ可換なので、生成に使った操作列をもう一度たどれば必ず全消灯に戻せる=解ける)
function generateSolvableBoard(size = BOARD_SIZE, count = 15, rng = Math.random) {
  let board = createEmptyBoard(size);
  const moves = randomMoveSequence(size, count, rng);
  moves.forEach(([r, c]) => {
    board = toggleCell(board, r, c);
  });
  return board;
}

const LightsOutLogic = {
  BOARD_SIZE,
  createEmptyBoard,
  cloneBoard,
  toggleCell,
  isCleared,
  randomMoveSequence,
  generateSolvableBoard,
};

if (typeof module !== 'undefined') {
  module.exports = LightsOutLogic;
}
if (typeof window !== 'undefined') {
  window.LightsOutLogic = LightsOutLogic;
}
