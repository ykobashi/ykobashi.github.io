// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  BLACK,
  WHITE,
  EMPTY,
  createEmptyBoard,
  canPlaceStone,
  placeStone,
  checkWin,
  isBoardFull,
  otherPlayer,
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

// canPlaceStone
{
  const board = createEmptyBoard(13);
  assert.strictEqual(canPlaceStone(board, 0, 0), true);
  assert.strictEqual(canPlaceStone(board, -1, 0), false);
  assert.strictEqual(canPlaceStone(board, 0, 13), false);
  board[5][5] = BLACK;
  assert.strictEqual(canPlaceStone(board, 5, 5), false);
}

// placeStone は元の盤面を変更せず新しい盤面を返す
{
  const board = createEmptyBoard(13);
  const newBoard = placeStone(board, 3, 3, BLACK);
  assert.strictEqual(board[3][3], EMPTY, '元の盤面は変更されない');
  assert.strictEqual(newBoard[3][3], BLACK);
  assert.throws(() => placeStone(newBoard, 3, 3, WHITE), /石を置けません/);
}

// 横方向の勝利判定
{
  const board = makeBoard(13, [
    [5, 3, BLACK],
    [5, 4, BLACK],
    [5, 5, BLACK],
    [5, 6, BLACK],
    [5, 7, BLACK],
  ]);
  assert.strictEqual(checkWin(board, 5, 5, 5), true, '横5連は勝利');
}

// 縦方向の勝利判定
{
  const board = makeBoard(13, [
    [2, 4, WHITE],
    [3, 4, WHITE],
    [4, 4, WHITE],
    [5, 4, WHITE],
    [6, 4, WHITE],
  ]);
  assert.strictEqual(checkWin(board, 4, 4, 5), true, '縦5連は勝利');
}

// 斜め(左上→右下)の勝利判定
{
  const board = makeBoard(13, [
    [1, 1, BLACK],
    [2, 2, BLACK],
    [3, 3, BLACK],
    [4, 4, BLACK],
    [5, 5, BLACK],
  ]);
  assert.strictEqual(checkWin(board, 3, 3, 5), true, '斜め(\\)5連は勝利');
}

// 斜め(右上→左下)の勝利判定
{
  const board = makeBoard(13, [
    [1, 5, WHITE],
    [2, 4, WHITE],
    [3, 3, WHITE],
    [4, 2, WHITE],
    [5, 1, WHITE],
  ]);
  assert.strictEqual(checkWin(board, 3, 3, 5), true, '斜め(/)5連は勝利');
}

// 4つだけ並んでいる場合は勝利ではない
{
  const board = makeBoard(13, [
    [5, 3, BLACK],
    [5, 4, BLACK],
    [5, 5, BLACK],
    [5, 6, BLACK],
  ]);
  assert.strictEqual(checkWin(board, 5, 5, 5), false, '4連は勝利ではない');
}

// 盤の端での勝利判定(境界チェック)
{
  const board = makeBoard(13, [
    [0, 0, BLACK],
    [0, 1, BLACK],
    [0, 2, BLACK],
    [0, 3, BLACK],
    [0, 4, BLACK],
  ]);
  assert.strictEqual(checkWin(board, 0, 0, 5), true, '端でも勝利判定できる');
}

// 6連(オーバーライン)も勝利扱い
{
  const board = makeBoard(13, [
    [7, 1, WHITE],
    [7, 2, WHITE],
    [7, 3, WHITE],
    [7, 4, WHITE],
    [7, 5, WHITE],
    [7, 6, WHITE],
  ]);
  assert.strictEqual(checkWin(board, 7, 3, 5), true, '6連も勝利扱い');
}

// 異なる色が混在している場合は勝利にならない
{
  const board = makeBoard(13, [
    [5, 3, BLACK],
    [5, 4, BLACK],
    [5, 5, WHITE],
    [5, 6, BLACK],
    [5, 7, BLACK],
  ]);
  assert.strictEqual(checkWin(board, 5, 4, 5), false, '色が混在すると勝利にならない');
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

// otherPlayer
{
  assert.strictEqual(otherPlayer(BLACK), WHITE);
  assert.strictEqual(otherPlayer(WHITE), BLACK);
}

console.log('All tests passed');
