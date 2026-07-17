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

// (row, col) に player を置いたら勝利するかどうかを判定する(盤面は変更しない)
function wouldWin(board, row, col, player) {
  if (!canPlaceStone(board, row, col)) return false;
  const next = placeStone(board, row, col, player);
  return checkWin(next, row, col);
}

// 連続数(count)と開いている端の数(openEnds: 0〜2)から、その並びの強さを点数化する
function scoreLine(count, openEnds) {
  if (count >= 5) return 100000;
  if (count === 4) return openEnds === 2 ? 10000 : openEnds === 1 ? 1000 : 0;
  if (count === 3) return openEnds === 2 ? 500 : openEnds === 1 ? 100 : 0;
  if (count === 2) return openEnds === 2 ? 50 : openEnds === 1 ? 10 : 0;
  return openEnds === 2 ? 5 : 1;
}

// (row, col) に player を置いたと仮定した場合の、4方向それぞれの並びの強さの合計点を返す(盤面は変更しない)
function evaluatePlacement(board, row, col, player) {
  const size = board.length;
  const inBounds = (r, c) => r >= 0 && r < size && c >= 0 && c < size;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  let total = 0;
  for (const [dr, dc] of directions) {
    let forward = 0;
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c) && board[r][c] === player) {
      forward++;
      r += dr;
      c += dc;
    }
    const forwardOpen = inBounds(r, c) && board[r][c] === EMPTY;

    let backward = 0;
    r = row - dr;
    c = col - dc;
    while (inBounds(r, c) && board[r][c] === player) {
      backward++;
      r -= dr;
      c -= dc;
    }
    const backwardOpen = inBounds(r, c) && board[r][c] === EMPTY;

    const count = forward + backward + 1;
    const openEnds = (forwardOpen ? 1 : 0) + (backwardOpen ? 1 : 0);
    total += scoreLine(count, openEnds);
  }
  return total;
}

// CPU(aiPlayer)が次に打つべき手を決める。
// 1. 自分の勝ちが確定する手があればそれを打つ
// 2. 相手(humanPlayer)の勝ちを阻止する手があればそれを打つ
// 3. それ以外は、攻め(自分の並び)と守り(相手の並び潰し)を点数化して最良のマスを選ぶ
function chooseAiMove(board, aiPlayer, humanPlayer) {
  const size = board.length;
  const emptyCells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === EMPTY) emptyCells.push({ row: r, col: c });
    }
  }
  if (emptyCells.length === 0) return null;

  for (const { row, col } of emptyCells) {
    if (wouldWin(board, row, col, aiPlayer)) return { row, col };
  }
  for (const { row, col } of emptyCells) {
    if (wouldWin(board, row, col, humanPlayer)) return { row, col };
  }

  const center = (size - 1) / 2;
  let best = null;
  let bestScore = -Infinity;
  for (const { row, col } of emptyCells) {
    const offense = evaluatePlacement(board, row, col, aiPlayer);
    const defense = evaluatePlacement(board, row, col, humanPlayer);
    const centerBonus = -(Math.abs(row - center) + Math.abs(col - center)) * 0.1;
    const score = offense + defense * 0.9 + centerBonus;
    if (score > bestScore) {
      bestScore = score;
      best = { row, col };
    }
  }
  return best;
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
  wouldWin,
  evaluatePlacement,
  chooseAiMove,
};

if (typeof module !== 'undefined') {
  module.exports = GomokuLogic;
}
if (typeof window !== 'undefined') {
  window.GomokuLogic = GomokuLogic;
}
