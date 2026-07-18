// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  BLACK,
  WHITE,
  EMPTY,
  createEmptyBoard,
  canPlaceStone,
  otherPlayer,
  getFlipCells,
  applyMove,
  checkWinAt,
  hasWin,
  isBoardFull,
} = require('./logic.js');

function makeBoard(size, stones) {
  const board = createEmptyBoard(size);
  for (const [r, c, player] of stones) {
    board[r][c] = player;
  }
  return board;
}

// createEmptyBoard
{
  const board = createEmptyBoard(13);
  assert.strictEqual(board.length, 13);
  assert.strictEqual(board[0].length, 13);
  assert.ok(board.every((row) => row.every((cell) => cell === EMPTY)));
}

// canPlaceStone: 挟めるかどうかに関わらず空きマスなら置ける(ルール1)
{
  const board = createEmptyBoard(13);
  assert.strictEqual(canPlaceStone(board, 0, 0), true);
  assert.strictEqual(canPlaceStone(board, -1, 0), false);
  assert.strictEqual(canPlaceStone(board, 0, 13), false);
  board[5][5] = BLACK;
  assert.strictEqual(canPlaceStone(board, 5, 5), false);
}

// otherPlayer
{
  assert.strictEqual(otherPlayer(BLACK), WHITE);
  assert.strictEqual(otherPlayer(WHITE), BLACK);
}

// getFlipCells: 横方向に挟まれた相手の石を反転対象として返す
{
  const board = makeBoard(13, [
    [5, 3, WHITE],
    [5, 4, WHITE],
    [5, 5, WHITE],
    [5, 6, BLACK],
  ]);
  const flips = getFlipCells(board, 5, 2, BLACK);
  const coords = flips.map((f) => `${f.row},${f.col}`).sort();
  assert.deepStrictEqual(coords, ['5,3', '5,4', '5,5']);
}

// getFlipCells: 挟む相手側の石がなければ反転しない
{
  const board = makeBoard(13, [
    [5, 3, WHITE],
    [5, 4, WHITE],
  ]);
  const flips = getFlipCells(board, 5, 2, BLACK);
  assert.deepStrictEqual(flips, []);
}

// getFlipCells: 途中に空きマスがあると(挟みが途切れるため)反転しない
{
  const board = makeBoard(13, [
    [5, 3, WHITE],
    [5, 5, BLACK],
  ]);
  const flips = getFlipCells(board, 5, 2, BLACK);
  assert.deepStrictEqual(flips, [], '間に空きマスがあれば挟み不成立');
}

// getFlipCells: 複数方向で同時に反転する
{
  const board = makeBoard(13, [
    [5, 4, WHITE], // 左方向の間
    [5, 3, BLACK], // 左端の自分の石
    [4, 5, WHITE], // 上方向の間
    [3, 5, BLACK], // 上端の自分の石
  ]);
  const flips = getFlipCells(board, 5, 5, BLACK);
  const coords = flips.map((f) => `${f.row},${f.col}`).sort();
  assert.deepStrictEqual(coords, ['4,5', '5,4']);
}

// applyMove: 石を置いて反転も適用した新しい盤面を返す(元の盤面は変更しない)
{
  const board = makeBoard(13, [
    [5, 3, WHITE],
    [5, 4, WHITE],
    [5, 5, BLACK],
  ]);
  const { board: newBoard, flipped } = applyMove(board, 5, 2, BLACK);
  assert.strictEqual(board[5][2], EMPTY, '元の盤面は変更されない');
  assert.strictEqual(newBoard[5][2], BLACK);
  assert.strictEqual(newBoard[5][3], BLACK, '挟まれた石は反転する');
  assert.strictEqual(newBoard[5][4], BLACK, '挟まれた石は反転する');
  assert.strictEqual(flipped.length, 2);
  assert.throws(() => applyMove(newBoard, 5, 2, WHITE), /石を置けません/);
}

// checkWinAt: 横5連
{
  const board = makeBoard(13, [
    [5, 3, BLACK],
    [5, 4, BLACK],
    [5, 5, BLACK],
    [5, 6, BLACK],
    [5, 7, BLACK],
  ]);
  assert.strictEqual(checkWinAt(board, 5, 5), true, '横5連は勝利');
}

// checkWinAt: 4つだけでは勝利ではない
{
  const board = makeBoard(13, [
    [5, 3, BLACK],
    [5, 4, BLACK],
    [5, 5, BLACK],
    [5, 6, BLACK],
  ]);
  assert.strictEqual(checkWinAt(board, 5, 5), false, '4連は勝利ではない');
}

// hasWin: 置いた場所そのものでの5連を検出する
{
  const board = makeBoard(13, [
    [2, 4, WHITE],
    [3, 4, WHITE],
    [4, 4, WHITE],
    [5, 4, WHITE],
    [6, 4, WHITE],
  ]);
  assert.strictEqual(hasWin(board, [{ row: 4, col: 4 }]), true);
}

// ルール3のポイント: 反転によって、置いた場所とは離れた位置に5連ができるケース
// 縦に黒4連(0,4)-(3,4)がある状態で、白石(4,3)(4,4)を横から挟んで反転させると
// 列4の縦5連(0,4)-(4,4)が完成する。置いた場所(4,5)自体は5連にならない。
{
  const board = makeBoard(13, [
    [0, 4, BLACK],
    [1, 4, BLACK],
    [2, 4, BLACK],
    [3, 4, BLACK],
    [4, 4, WHITE],
    [4, 3, WHITE],
    [4, 2, BLACK],
  ]);
  const { board: afterBoard, flipped } = applyMove(board, 4, 5, BLACK);
  assert.strictEqual(afterBoard[4][4], BLACK, '反転で列4の石が黒になる');
  assert.strictEqual(afterBoard[4][3], BLACK, '反転で列4の石が黒になる');

  // 置いた場所(4,5)だけを見ると5連は成立していない
  assert.strictEqual(checkWinAt(afterBoard, 4, 5), false, '置いた場所自体は横4連(2〜5)で5連ではない');

  // 反転した石を含めてチェックすると、列4の縦5連が見つかる
  const cellsToCheck = [{ row: 4, col: 5 }, ...flipped];
  assert.strictEqual(hasWin(afterBoard, cellsToCheck), true, '反転によって成立した縦5連を検出できる');
}

// isBoardFull
{
  const small = createEmptyBoard(2);
  assert.strictEqual(isBoardFull(small), false);
  small[0][0] = BLACK;
  small[0][1] = WHITE;
  small[1][0] = BLACK;
  small[1][1] = WHITE;
  assert.strictEqual(isBoardFull(small), true);
}

console.log('All tests passed');
