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

// ===== CPU対戦用: negamax + アルファベータ探索 =====

const WIN_SCORE = 1000000;
const SEARCH_DEPTH = 6;
const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6]; // 中央優先(枝刈り効率+中央価値)
const WINDOW_TABLE = { 1: 1, 2: 10, 3: 50, 4: 100000 }; // 窓内の自石数→点

// 合法列を中央優先順で返す
function orderedColumns(board) {
  return COLUMN_ORDER.filter((c) => canDropInColumn(board, c));
}

// 盤面を player 視点で評価する(player優勢ほど正の値になる反対称な評価関数)。
// 全ての長さ4の窓(横24/縦21/斜め12+12=69窓)を走査し、
//   窓に自石と相手石が混在 → 0(そのラインは死んでいる)
//   相手石のみ+空 → -WINDOW_TABLE[相手石数]
//   自石のみ+空 → +WINDOW_TABLE[自石数]
// さらに中央列(col=3)の自石に+3/相手石に-3のボーナスを加える。
function evaluateBoard(board, player) {
  const opp = otherPlayer(player);
  const rows = board.length;
  const cols = board[0].length;
  let score = 0;
  const directions = [
    [0, 1], // 横
    [1, 0], // 縦
    [1, 1], // 斜め(左上→右下)
    [1, -1], // 斜め(右上→左下)
  ];

  for (const [dr, dc] of directions) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const er = r + dr * 3;
        const ec = c + dc * 3;
        if (er < 0 || er >= rows || ec < 0 || ec >= cols) continue;
        let own = 0;
        let opponent = 0;
        for (let k = 0; k < 4; k++) {
          const cell = board[r + dr * k][c + dc * k];
          if (cell === player) own++;
          else if (cell === opp) opponent++;
        }
        if (own > 0 && opponent > 0) continue;
        if (own > 0) score += WINDOW_TABLE[own];
        else if (opponent > 0) score -= WINDOW_TABLE[opponent];
      }
    }
  }

  for (let r = 0; r < rows; r++) {
    const cell = board[r][3];
    if (cell === player) score += 3;
    else if (cell === opp) score -= 3;
  }

  return score;
}

// negamax探索(反対称評価なのでplayer視点で統一する)
function negamax(board, depth, alpha, beta, player) {
  const opp = otherPlayer(player);
  const cols = orderedColumns(board);
  if (depth === 0 || cols.length === 0) return evaluateBoard(board, player);

  let best = -Infinity;
  for (const col of cols) {
    const { board: nb, row, flipped } = dropStone(board, col, player);
    let val;
    if (hasWin(nb, [{ row, col }, ...flipped])) {
      val = WIN_SCORE - (SEARCH_DEPTH - depth); // 早い勝ちを優先
    } else if (isBoardFull(nb)) {
      val = 0;
    } else {
      val = -negamax(nb, depth - 1, -beta, -alpha, opp);
    }
    if (val > best) best = val;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // 枝刈り
  }
  return best;
}

// CPU(aiPlayer)が次に落とすべき列を決める。humanPlayer引数はシグネチャ統一のために
// 受け取るが、反対称評価により negamax 内では明示的に使用しない。
function chooseAiMove(board, aiPlayer, humanPlayer) {
  const cols = orderedColumns(board);
  if (cols.length === 0) return null;

  let bestCol = cols[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const col of cols) {
    const { board: nb, row, flipped } = dropStone(board, col, aiPlayer);
    let val;
    if (hasWin(nb, [{ row, col }, ...flipped])) {
      val = WIN_SCORE;
    } else if (isBoardFull(nb)) {
      val = 0;
    } else {
      val = -negamax(nb, SEARCH_DEPTH - 1, -beta, -alpha, humanPlayer);
    }
    if (val > bestScore) {
      bestScore = val;
      bestCol = col;
    }
    if (val > alpha) alpha = val;
  }
  return { col: bestCol };
}

const GravityOthelloLogic = {
  ROWS,
  COLS,
  EMPTY,
  BLACK,
  WHITE,
  WIN_LENGTH,
  WIN_SCORE,
  SEARCH_DEPTH,
  COLUMN_ORDER,
  WINDOW_TABLE,
  createEmptyBoard,
  canDropInColumn,
  getDropRow,
  otherPlayer,
  getFlipCells,
  dropStone,
  checkWinAt,
  hasWin,
  isBoardFull,
  orderedColumns,
  evaluateBoard,
  negamax,
  chooseAiMove,
};

if (typeof module !== 'undefined') {
  module.exports = GravityOthelloLogic;
}
if (typeof window !== 'undefined') {
  window.GravityOthelloLogic = GravityOthelloLogic;
}
