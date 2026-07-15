// logic.js - 五目並べ 純粋関数ロジック(DOM操作なし)

const BOARD_SIZE = 13;
const EMPTY = null;
const BLACK = 'black';
const WHITE = 'white';

// 空の盤面を生成する
function createEmptyBoard(size = BOARD_SIZE) {
  const board = [];
  for (let r = 0; r < size; r++) {
    board.push(new Array(size).fill(EMPTY));
  }
  return board;
}

// 石を置けるかどうか(盤内かつ空きマスか)
function canPlaceStone(board, row, col) {
  if (row < 0 || row >= board.length) return false;
  if (col < 0 || col >= board[0].length) return false;
  return board[row][col] === EMPTY;
}

// 盤面に石を置いた新しい盤面を返す(元の盤面は変更しない)
function placeStone(board, row, col, player) {
  if (!canPlaceStone(board, row, col)) {
    throw new Error('そのマスには石を置けません');
  }
  const newBoard = board.map((rowArr) => rowArr.slice());
  newBoard[row][col] = player;
  return newBoard;
}

// 指定座標の石の色を基準に、指定方向(dr, dc)に連続する同色の数を数える(指定座標自体は含めない)
function countDirection(board, row, col, dr, dc, player) {
  let count = 0;
  let r = row + dr;
  let c = col + dc;
  const size = board.length;
  while (r >= 0 && r < size && c >= 0 && c < board[0].length && board[r][c] === player) {
    count++;
    r += dr;
    c += dc;
  }
  return count;
}

// 直前に (row, col) に player の石を置いた結果、5つ以上並んで勝利したかどうかを判定
function checkWin(board, row, col, requiredLength = 5) {
  const player = board[row][col];
  if (player === EMPTY || player === undefined) return false;

  const directions = [
    [0, 1], // 横
    [1, 0], // 縦
    [1, 1], // 斜め(左上→右下)
    [1, -1], // 斜め(右上→左下)
  ];

  for (const [dr, dc] of directions) {
    const forward = countDirection(board, row, col, dr, dc, player);
    const backward = countDirection(board, row, col, -dr, -dc, player);
    const total = forward + backward + 1; // 自分自身を含む
    if (total >= requiredLength) {
      return true;
    }
  }
  return false;
}

// 盤面が全て埋まっているか(引き分け判定用)
function isBoardFull(board) {
  return board.every((rowArr) => rowArr.every((cell) => cell !== EMPTY));
}

// 相手の色を返す
function otherPlayer(player) {
  return player === BLACK ? WHITE : BLACK;
}

const GomokuLogic = {
  BOARD_SIZE,
  EMPTY,
  BLACK,
  WHITE,
  createEmptyBoard,
  canPlaceStone,
  placeStone,
  checkWin,
  isBoardFull,
  otherPlayer,
};

if (typeof module !== 'undefined') {
  module.exports = GomokuLogic;
}
if (typeof window !== 'undefined') {
  window.GomokuLogic = GomokuLogic;
}
