// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  createEmptyBoard,
  toggleCell,
  isCleared,
  randomMoveSequence,
  generateSolvableBoard,
} = require('./logic.js');

function makeSeededRng(seq) {
  let i = 0;
  return () => seq[i++ % seq.length];
}

// createEmptyBoard: 全て消灯
{
  const board = createEmptyBoard(5);
  assert.strictEqual(board.length, 5);
  assert.strictEqual(board[0].length, 5);
  assert.ok(isCleared(board));
}

// toggleCell: 中央のセルは自身+上下左右の5マスが反転する
{
  const board = createEmptyBoard(5);
  const toggled = toggleCell(board, 2, 2);
  assert.strictEqual(toggled[2][2], true);
  assert.strictEqual(toggled[1][2], true);
  assert.strictEqual(toggled[3][2], true);
  assert.strictEqual(toggled[2][1], true);
  assert.strictEqual(toggled[2][3], true);
  // それ以外は変化しない
  assert.strictEqual(toggled[0][0], false);
  assert.strictEqual(toggled[4][4], false);
  // 元の盤面は変更されない
  assert.strictEqual(board[2][2], false);
}

// toggleCell: 角のセルは自身+盤内の隣接2マスのみ反転(盤外は無視)
{
  const board = createEmptyBoard(5);
  const toggled = toggleCell(board, 0, 0);
  assert.strictEqual(toggled[0][0], true);
  assert.strictEqual(toggled[1][0], true);
  assert.strictEqual(toggled[0][1], true);
  let litCount = 0;
  toggled.forEach((row) => row.forEach((cell) => { if (cell) litCount++; }));
  assert.strictEqual(litCount, 3, '角では3マスのみ反転する');
}

// toggleCell は自己逆操作(同じ場所を2回トグルすると元に戻る)
{
  const board = createEmptyBoard(5);
  const once = toggleCell(board, 3, 1);
  const twice = toggleCell(once, 3, 1);
  assert.ok(isCleared(twice), '同じセルを2回トグルすると元に戻る');
}

// isCleared: 1マスでも点灯していればfalse
{
  const board = createEmptyBoard(5);
  board[0][0] = true;
  assert.strictEqual(isCleared(board), false);
}

// randomMoveSequence: 指定した回数分のシード列を返す(決定論的)
{
  const rng = makeSeededRng([0.1, 0.9, 0.4, 0.5, 0.99]);
  const moves = randomMoveSequence(5, 3, rng);
  assert.strictEqual(moves.length, 3);
  moves.forEach(([r, c]) => {
    assert.ok(r >= 0 && r < 5);
    assert.ok(c >= 0 && c < 5);
  });
}

// generateSolvableBoard: 生成した盤面は「同じトグル操作をもう一度たどる」ことで必ず全消灯に戻せる(=解ける)
{
  const rng = makeSeededRng([0.05, 0.83, 0.42, 0.17, 0.65, 0.31, 0.99, 0.02, 0.58, 0.71]);
  const size = 5;
  const count = 12;

  // 生成に使われる操作列を別途同じ乱数列から再現する
  const rngForMoves = makeSeededRng([0.05, 0.83, 0.42, 0.17, 0.65, 0.31, 0.99, 0.02, 0.58, 0.71]);
  const expectedMoves = randomMoveSequence(size, count, rngForMoves);

  const board = generateSolvableBoard(size, count, rng);

  // 生成に使ったのと同じ操作列をもう一度適用すると必ず全消灯に戻る
  let replayed = board;
  expectedMoves.forEach(([r, c]) => {
    replayed = toggleCell(replayed, r, c);
  });
  assert.ok(isCleared(replayed), '同じ操作列を再度適用すれば解ける(全消灯に戻る)');
}

// generateSolvableBoard: countが0なら初期状態のまま(既にクリア状態)
{
  const board = generateSolvableBoard(5, 0, () => 0);
  assert.ok(isCleared(board));
}

console.log('All tests passed');
