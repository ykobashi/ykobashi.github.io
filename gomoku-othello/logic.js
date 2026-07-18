// logic.js - 五目オセロ 純粋関数ロジック(DOM操作なし)
//
// ルール:
// 1. 設置: 盤面の空いているマスには、オセロのような制限なくどこにでも自由に石を置ける。
// 2. 反転: 石を置いた瞬間、その石を起点に8方向を調べ、相手の石が連続して並んだ先に
//    自分の石があれば、間に挟まれた相手の石を全てオセロと同じルールで自分の色に反転する。
// 3. 勝敗: 反転によって増えた石も含め、縦・横・斜めのいずれかで自分の色の石が5つ連続で
//    並んだ瞬間に勝利。盤面が全て埋まっても5連が成立しなければ引き分け。

const BOARD_SIZE = 13;
const EMPTY = null;
const BLACK = 'black';
const WHITE = 'white';

const FLIP_DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

const WIN_DIRECTIONS = [
  [0, 1], // 横
  [1, 0], // 縦
  [1, 1], // 斜め(左上→右下)
  [1, -1], // 斜め(右上→左下)
];

// 空の盤面を生成する
function createEmptyBoard(size = BOARD_SIZE) {
  const board = [];
  for (let r = 0; r < size; r++) {
    board.push(new Array(size).fill(EMPTY));
  }
  return board;
}

// 石を置けるかどうか(盤内かつ空きマスか)。挟めるかどうかは問わない。
function canPlaceStone(board, row, col) {
  if (row < 0 || row >= board.length) return false;
  if (col < 0 || col >= board[0].length) return false;
  return board[row][col] === EMPTY;
}

// 相手の色を返す
function otherPlayer(player) {
  return player === BLACK ? WHITE : BLACK;
}

// (row, col) に player を置いたと仮定した場合、オセロと同じルールで反転する
// 相手石の座標一覧を返す(盤面は変更しない)
function getFlipCells(board, row, col, player) {
  if (!canPlaceStone(board, row, col)) return [];
  const opponent = otherPlayer(player);
  const size = board.length;
  const width = board[0].length;
  const flips = [];

  for (const [dr, dc] of FLIP_DIRECTIONS) {
    const line = [];
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < size && c >= 0 && c < width && board[r][c] === opponent) {
      line.push({ row: r, col: c });
      r += dr;
      c += dc;
    }
    const terminatesOnOwnStone = r >= 0 && r < size && c >= 0 && c < width && board[r][c] === player;
    if (line.length > 0 && terminatesOnOwnStone) {
      flips.push(...line);
    }
  }
  return flips;
}

// (row, col) に player の石を置き、反転処理も適用した新しい盤面を返す(元の盤面は変更しない)
function applyMove(board, row, col, player) {
  if (!canPlaceStone(board, row, col)) {
    throw new Error('そのマスには石を置けません');
  }
  const flipped = getFlipCells(board, row, col, player);
  const newBoard = board.map((rowArr) => rowArr.slice());
  newBoard[row][col] = player;
  for (const { row: r, col: c } of flipped) {
    newBoard[r][c] = player;
  }
  return { board: newBoard, flipped };
}

// 指定座標の石の色を基準に、指定方向(dr, dc)に連続する同色の数を数える(指定座標自体は含めない)
function countDirection(board, row, col, dr, dc, player) {
  let count = 0;
  let r = row + dr;
  let c = col + dc;
  const size = board.length;
  const width = board[0].length;
  while (r >= 0 && r < size && c >= 0 && c < width && board[r][c] === player) {
    count++;
    r += dr;
    c += dc;
  }
  return count;
}

// (row, col) の石を基点に、縦・横・斜めのいずれかで5つ以上並んでいるか判定
function checkWinAt(board, row, col, requiredLength = 5) {
  const player = board[row][col];
  if (player === EMPTY || player === undefined) return false;

  for (const [dr, dc] of WIN_DIRECTIONS) {
    const forward = countDirection(board, row, col, dr, dc, player);
    const backward = countDirection(board, row, col, -dr, -dc, player);
    const total = forward + backward + 1; // 自分自身を含む
    if (total >= requiredLength) {
      return true;
    }
  }
  return false;
}

// 置いた石・反転した石のいずれかを起点に5連が成立していれば true を返す
// (反転によって、置いた場所とは離れた位置に5連ができるケースがあるため全てチェックする)
function hasWin(board, cells) {
  for (const { row, col } of cells) {
    if (checkWinAt(board, row, col)) return true;
  }
  return false;
}

// 盤面が全て埋まっているか(引き分け判定用)
function isBoardFull(board) {
  return board.every((rowArr) => rowArr.every((cell) => cell !== EMPTY));
}

// 連続数(count)と開いている端の数(openEnds: 0〜2)から、その並びの強さを点数化する
function scoreLine(count, openEnds) {
  if (count >= 5) return 100000;
  if (count === 4) return openEnds === 2 ? 10000 : openEnds === 1 ? 1000 : 0;
  if (count === 3) return openEnds === 2 ? 500 : openEnds === 1 ? 100 : 0;
  if (count === 2) return openEnds === 2 ? 50 : openEnds === 1 ? 10 : 0;
  return openEnds === 2 ? 5 : 1;
}

// (row, col) に player の石が既にある前提で、4方向それぞれの並びの強さの合計点を返す
function evaluatePlacement(board, row, col, player) {
  const size = board.length;
  const width = board[0].length;
  const inBounds = (r, c) => r >= 0 && r < size && c >= 0 && c < width;

  let total = 0;
  for (const [dr, dc] of WIN_DIRECTIONS) {
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
// 1. 置いて反転させた結果、自分の勝ちが確定する手があればそれを打つ
// 2. 相手(humanPlayer)が置いたら勝ちになる手があれば先取りして阻止する
// 3. それ以外は、攻め(反転後の自分の並び+反転数)と守り(このマスを相手に取られた場合の強さ)を
//    点数化して最良のマスを選ぶ
function chooseAiMove(board, aiPlayer, humanPlayer) {
  const FLIP_WEIGHT = 20;
  const DEFENSE_WEIGHT = 0.9;
  const size = board.length;
  const empties = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < board[0].length; c++) {
      if (board[r][c] === EMPTY) empties.push({ row: r, col: c });
    }
  }
  if (empties.length === 0) return null;

  for (const { row, col } of empties) {
    const { board: nb, flipped } = applyMove(board, row, col, aiPlayer);
    if (hasWin(nb, [{ row, col }, ...flipped])) return { row, col };
  }

  for (const { row, col } of empties) {
    const { board: nb, flipped } = applyMove(board, row, col, humanPlayer);
    if (hasWin(nb, [{ row, col }, ...flipped])) return { row, col };
  }

  const center = (size - 1) / 2;
  let best = null;
  let bestScore = -Infinity;
  for (const { row, col } of empties) {
    const { board: afterAi, flipped } = applyMove(board, row, col, aiPlayer);
    const offense = evaluatePlacement(afterAi, row, col, aiPlayer);
    const defense = evaluatePlacement(board, row, col, humanPlayer);
    const centerBonus = -(Math.abs(row - center) + Math.abs(col - center)) * 0.1;
    const score = offense + FLIP_WEIGHT * flipped.length + DEFENSE_WEIGHT * defense + centerBonus;
    if (score > bestScore) {
      bestScore = score;
      best = { row, col };
    }
  }
  return best;
}

const GomokuOthelloLogic = {
  BOARD_SIZE,
  EMPTY,
  BLACK,
  WHITE,
  createEmptyBoard,
  canPlaceStone,
  otherPlayer,
  getFlipCells,
  applyMove,
  checkWinAt,
  hasWin,
  isBoardFull,
  scoreLine,
  evaluatePlacement,
  chooseAiMove,
};

if (typeof module !== 'undefined') {
  module.exports = GomokuOthelloLogic;
}
if (typeof window !== 'undefined') {
  window.GomokuOthelloLogic = GomokuOthelloLogic;
}
