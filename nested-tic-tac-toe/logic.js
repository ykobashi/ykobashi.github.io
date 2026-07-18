// logic.js - 入れ子○×ゲーム 純粋関数ロジック(DOM操作なし)
//
// ルール:
// 1. 盤面: 3×3の小盤が3×3に並んだ大盤(小盤9個・計81マス)に、黒白交互に石を置く。
// 2. 手番制限: 自分が置いたマスの「小盤内での位置(0〜8)」が、次に相手が打つべき小盤を指定する。
//    ただしその小盤がすでに決着済み(勝敗確定または満杯)なら、相手はどの小盤にでも自由に置ける。
// 3. 勝敗: 小盤で3つ並べるとその小盤を獲得(以後そのマスには置けない)。大盤上で獲得した
//    小盤が縦・横・斜めのいずれかに3つ並んだら勝利。全小盤が決着しても大盤に3つ並ばなければ引き分け。

const EMPTY = null;
const BLACK = 'black';
const WHITE = 'white';
const DRAW = 'draw';

// 3x3盤面(0〜8の1次元配列, 上段0-2/中段3-5/下段6-8)の8方向の並び
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

// 相手の色を返す
function otherPlayer(player) {
  return player === BLACK ? WHITE : BLACK;
}

// 初期状態を生成する。subBoards[i] は小盤iの9マス、bigBoard[i] は小盤iの決着状況
function createGame() {
  return {
    subBoards: Array.from({ length: 9 }, () => new Array(9).fill(EMPTY)),
    bigBoard: new Array(9).fill(EMPTY),
  };
}

// 3x3盤面(9マスの配列)に3つ並びがあれば、その色を返す(なければ null)
function findLineWinner(cells) {
  for (const [a, b, c] of LINES) {
    const v = cells[a];
    if ((v === BLACK || v === WHITE) && v === cells[b] && v === cells[c]) {
      return v;
    }
  }
  return null;
}

// 小盤が全て埋まっているか
function isSubBoardFull(subBoard) {
  return subBoard.every((cell) => cell !== EMPTY);
}

// 現在打てる小盤のインデックス一覧を返す
function legalSubBoards(state, forced) {
  if (forced !== null && state.bigBoard[forced] === EMPTY) {
    return [forced];
  }
  const list = [];
  for (let i = 0; i < 9; i++) {
    if (state.bigBoard[i] === EMPTY) list.push(i);
  }
  return list;
}

// (subIndex, cellIndex) に置けるかどうかを判定する
function canPlaceAt(state, forced, subIndex, cellIndex) {
  if (state.bigBoard[subIndex] !== EMPTY) return false; // その小盤は決着済み
  if (forced !== null && forced !== subIndex) return false; // 指定された小盤以外には置けない
  if (state.subBoards[subIndex][cellIndex] !== EMPTY) return false;
  return true;
}

// 小盤subIndexのマスcellIndexにplayerを置いた新しい状態と、次の手番の強制小盤を返す(元の状態は変更しない)
function playMove(state, forced, subIndex, cellIndex, player) {
  if (!canPlaceAt(state, forced, subIndex, cellIndex)) {
    throw new Error('そのマスには置けません');
  }

  const newSubBoards = state.subBoards.map((b, i) => (i === subIndex ? b.slice() : b));
  newSubBoards[subIndex][cellIndex] = player;

  const newBigBoard = state.bigBoard.slice();
  if (newBigBoard[subIndex] === EMPTY) {
    const winner = findLineWinner(newSubBoards[subIndex]);
    if (winner) {
      newBigBoard[subIndex] = winner;
    } else if (isSubBoardFull(newSubBoards[subIndex])) {
      newBigBoard[subIndex] = DRAW;
    }
  }

  // 置いたマスの小盤内位置が、次に相手が打つべき小盤を指定する。
  // その小盤がすでに決着済みなら制限なし(forced = null)。
  let nextForced = cellIndex;
  if (newBigBoard[nextForced] !== EMPTY) {
    nextForced = null;
  }

  return { state: { subBoards: newSubBoards, bigBoard: newBigBoard }, nextForced };
}

// 大盤上で3つの小盤を獲得して並んでいれば、その色を返す(なければ null)
function checkBigWinner(state) {
  return findLineWinner(state.bigBoard);
}

// 全ての小盤が決着している(勝敗 or 満杯)か。大盤に勝者がいなければ引き分け判定に使う
function isGameOver(state) {
  return state.bigBoard.every((cell) => cell !== EMPTY);
}

const NestedTicTacToeLogic = {
  EMPTY,
  BLACK,
  WHITE,
  DRAW,
  otherPlayer,
  createGame,
  findLineWinner,
  isSubBoardFull,
  legalSubBoards,
  canPlaceAt,
  playMove,
  checkBigWinner,
  isGameOver,
};

if (typeof module !== 'undefined') {
  module.exports = NestedTicTacToeLogic;
}
if (typeof window !== 'undefined') {
  window.NestedTicTacToeLogic = NestedTicTacToeLogic;
}
