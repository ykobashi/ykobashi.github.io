// logic.js - 重力オセロ 純粋関数ロジック(DOM操作なし)
//
// ルール:
// 1. 設置: 7列×6段の盤に、黒白交互に石を落とす。列を選ぶと、その列の一番下の空きマスに積み上がる
//    (コネクト4と同じ重力落下方式。行を自由に選ぶことはできない)。
// 2. 反転: 石が着地した瞬間、その石を起点に8方向を調べ、相手の石が連続して並んだ先に自分の石が
//    あれば、間に挟まれた相手の石を全てオセロと同じルールで自分の色に反転する。
// 3. 勝敗: 反転によって増えた石も含め、縦・横・斜めのいずれかで自分の色の石が4つ連続で並んだ
//    瞬間に勝利。盤面が全て埋まっても4連が成立しなければ引き分け。

const ROWS = 6;
const COLS = 7;
const EMPTY = null;
const BLACK = 'black';
const WHITE = 'white';
const WIN_LENGTH = 4;

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

// 空の盤面を生成する(row 0 が最上段、row ROWS-1 が最下段)
function createEmptyBoard(rows = ROWS, cols = COLS) {
  const board = [];
  for (let r = 0; r < rows; r++) {
    board.push(new Array(cols).fill(EMPTY));
  }
  return board;
}

// 指定した列にまだ石を落とせるか(一番上のマスが空いているか)
function canDropInColumn(board, col) {
  if (col < 0 || col >= board[0].length) return false;
  return board[0][col] === EMPTY;
}

// 石を落とした際に着地する行を返す(落とせない場合は -1)
function getDropRow(board, col) {
  if (!canDropInColumn(board, col)) return -1;
  for (let r = board.length - 1; r >= 0; r--) {
    if (board[r][col] === EMPTY) return r;
  }
  return -1;
}

// 相手の色を返す
function otherPlayer(player) {
  return player === BLACK ? WHITE : BLACK;
}

// (row, col) に player を置いたと仮定した場合、オセロと同じルールで反転する
// 相手石の座標一覧を返す(盤面は変更しない)
function getFlipCells(board, row, col, player) {
  const opponent = otherPlayer(player);
  const rows = board.length;
  const cols = board[0].length;
  const flips = [];

  for (const [dr, dc] of FLIP_DIRECTIONS) {
    const line = [];
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < rows && c >= 0 && c < cols && board[r][c] === opponent) {
      line.push({ row: r, col: c });
      r += dr;
      c += dc;
    }
    const terminatesOnOwnStone = r >= 0 && r < rows && c >= 0 && c < cols && board[r][c] === player;
    if (line.length > 0 && terminatesOnOwnStone) {
      flips.push(...line);
    }
  }
  return flips;
}

// 指定列に player の石を落とし、反転処理も適用した新しい盤面を返す(元の盤面は変更しない)
function dropStone(board, col, player) {
  const row = getDropRow(board, col);
  if (row === -1) {
    throw new Error('その列にはもう石を落とせません');
  }
  const flipped = getFlipCells(board, row, col, player);
  const newBoard = board.map((rowArr) => rowArr.slice());
  newBoard[row][col] = player;
  for (const { row: r, col: c } of flipped) {
    newBoard[r][c] = player;
  }
  return { board: newBoard, row, flipped };
}

// 指定座標の石の色を基準に、指定方向(dr, dc)に連続する同色の数を数える(指定座標自体は含めない)
function countDirection(board, row, col, dr, dc, player) {
  let count = 0;
  let r = row + dr;
  let c = col + dc;
  const rows = board.length;
  const cols = board[0].length;
  while (r >= 0 && r < rows && c >= 0 && c < cols && board[r][c] === player) {
    count++;
    r += dr;
    c += dc;
  }
  return count;
}

// (row, col) の石を基点に、縦・横・斜めのいずれかで4つ以上並んでいるか判定
function checkWinAt(board, row, col, requiredLength = WIN_LENGTH) {
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

// 置いた石・反転した石のいずれかを起点に4連が成立していれば true を返す
// (反転によって、落とした場所とは離れた位置に4連ができるケースがあるため全てチェックする)
function hasWin(board, cells) {
  for (const { row, col } of cells) {
    if (checkWinAt(board, row, col)) return true;
  }
  return false;
}

// 盤面が全て埋まっているか(引き分け判定用。上段が全部埋まっていれば全マス埋まっている)
function isBoardFull(board) {
  return board[0].every((cell) => cell !== EMPTY);
}

const GravityOthelloLogic = {
  ROWS,
  COLS,
  EMPTY,
  BLACK,
  WHITE,
  WIN_LENGTH,
  createEmptyBoard,
  canDropInColumn,
  getDropRow,
  otherPlayer,
  getFlipCells,
  dropStone,
  checkWinAt,
  hasWin,
  isBoardFull,
};

if (typeof module !== 'undefined') {
  module.exports = GravityOthelloLogic;
}
if (typeof window !== 'undefined') {
  window.GravityOthelloLogic = GravityOthelloLogic;
}
