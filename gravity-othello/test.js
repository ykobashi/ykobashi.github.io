// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  BLACK,
  WHITE,
  EMPTY,
  ROWS,
  COLS,
  createEmptyBoard,
  canDropInColumn,
  getDropRow,
  otherPlayer,
  getFlipCells,
  dropStone,
  checkWinAt,
  hasWin,
  isBoardFull,
  chooseAiMove,
} = require('./logic.js');

function makeBoard(stones) {
  const board = createEmptyBoard();
  for (const [r, c, player] of stones) {
    board[r][c] = player;
  }
  return board;
}

// createEmptyBoard
{
  const board = createEmptyBoard();
  assert.strictEqual(board.length, ROWS);
  assert.strictEqual(board[0].length, COLS);
  assert.ok(board.every((row) => row.every((cell) => cell === EMPTY)));
}

// canDropInColumn / getDropRow: 石は重力で一番下の空きマスに落ちる
{
  const board = createEmptyBoard();
  assert.strictEqual(canDropInColumn(board, 0), true);
  assert.strictEqual(getDropRow(board, 0), ROWS - 1, '空の列なら一番下に落ちる');

  board[ROWS - 1][0] = BLACK;
  assert.strictEqual(getDropRow(board, 0), ROWS - 2, '下が埋まっていればその上に落ちる');
}

// 列が満杯なら落とせない
{
  const board = createEmptyBoard();
  for (let r = 0; r < ROWS; r++) board[r][3] = BLACK;
  assert.strictEqual(canDropInColumn(board, 3), false);
  assert.strictEqual(getDropRow(board, 3), -1);
}

// otherPlayer
{
  assert.strictEqual(otherPlayer(BLACK), WHITE);
  assert.strictEqual(otherPlayer(WHITE), BLACK);
}

// getFlipCells: 横方向に挟まれた相手の石を反転対象として返す
{
  const board = makeBoard([
    [5, 1, WHITE],
    [5, 2, WHITE],
    [5, 0, BLACK],
  ]);
  const flips = getFlipCells(board, 5, 3, BLACK);
  const coords = flips.map((f) => `${f.row},${f.col}`).sort();
  assert.deepStrictEqual(coords, ['5,1', '5,2']);
}

// getFlipCells: 間に空きマスがあれば反転しない
{
  const board = makeBoard([
    [5, 1, WHITE],
    [5, 0, BLACK],
  ]);
  const flips = getFlipCells(board, 5, 3, BLACK);
  assert.deepStrictEqual(flips, []);
}

// dropStone: 石を落として反転も適用した新しい盤面を返す(元の盤面は変更しない)
{
  const board = makeBoard([
    [5, 1, WHITE],
    [5, 2, WHITE],
    [5, 0, BLACK],
  ]);
  const { board: newBoard, row, flipped } = dropStone(board, 3, BLACK);
  assert.strictEqual(row, ROWS - 1, '空の列なので一番下に着地する');
  assert.strictEqual(board[ROWS - 1][3], EMPTY, '元の盤面は変更されない');
  assert.strictEqual(newBoard[ROWS - 1][3], BLACK);
  assert.strictEqual(newBoard[5][1], BLACK, '挟まれた石は反転する');
  assert.strictEqual(newBoard[5][2], BLACK, '挟まれた石は反転する');
  assert.strictEqual(flipped.length, 2);
}

// dropStone: 満杯の列に落とそうとするとエラー
{
  const board = createEmptyBoard();
  for (let r = 0; r < ROWS; r++) board[r][4] = WHITE;
  assert.throws(() => dropStone(board, 4, BLACK), /石を落とせません/);
}

// checkWinAt: 横4連
{
  const board = makeBoard([
    [5, 1, BLACK],
    [5, 2, BLACK],
    [5, 3, BLACK],
    [5, 4, BLACK],
  ]);
  assert.strictEqual(checkWinAt(board, 5, 2), true, '横4連は勝利');
}

// checkWinAt: 3つだけでは勝利ではない
{
  const board = makeBoard([
    [5, 1, BLACK],
    [5, 2, BLACK],
    [5, 3, BLACK],
  ]);
  assert.strictEqual(checkWinAt(board, 5, 2), false, '3連は勝利ではない');
}

// ルール3のポイント: 反転によって、落とした場所とは離れた位置に4連ができるケース
// 縦に黒3連(2,4)-(4,4)がある状態で、白石(5,4)を横から挟んで反転させると
// 列4の縦4連(2,4)-(5,4)が完成する。落とした場所(5,5)自体は横3連にしかならない。
{
  const board = makeBoard([
    [2, 4, BLACK],
    [3, 4, BLACK],
    [4, 4, BLACK],
    [5, 4, WHITE],
    [5, 3, BLACK],
  ]);
  const { board: afterBoard, flipped } = dropStone(board, 5, BLACK);
  assert.strictEqual(afterBoard[5][4], BLACK, '反転で(5,4)が黒になる');
  assert.strictEqual(checkWinAt(afterBoard, 5, 5), false, '落とした場所自体は横3連(3〜5)で4連ではない');

  const cellsToCheck = [{ row: 5, col: 5 }, ...flipped];
  assert.strictEqual(hasWin(afterBoard, cellsToCheck), true, '反転によって成立した縦4連を検出できる');
}

// isBoardFull
{
  const board = createEmptyBoard();
  assert.strictEqual(isBoardFull(board), false);
  for (let c = 0; c < COLS; c++) board[0][c] = BLACK;
  assert.strictEqual(isBoardFull(board), true, '最上段が埋まっていれば全マス埋まっている');
}

// chooseAiMove: 即勝ち(その列に落とすと4連になる)。盤端に寄せて脅威を1列だけにする
// (両端が開いていると2列とも勝ち手になり、どちらを選んでも正解になってしまうため)
{
  const board = makeBoard([
    [5, 0, WHITE],
    [5, 1, WHITE],
    [5, 2, WHITE],
  ]);
  const move = chooseAiMove(board, WHITE, BLACK);
  assert.deepStrictEqual(move, { col: 3 }, '即座に4連になる列を選ぶ');
}

// chooseAiMove: 即ブロック(人間が次に落とすと4連になる列を防ぐ)。同様に盤端に寄せて
// 脅威を1列だけにする(両端が開いていると片方をブロックしてももう片方で負けてしまう)
{
  const board = makeBoard([
    [5, 0, BLACK],
    [5, 1, BLACK],
    [5, 2, BLACK],
  ]);
  const move = chooseAiMove(board, WHITE, BLACK);
  assert.deepStrictEqual(move, { col: 3 }, '相手の4連を阻止する列を選ぶ');
}

// chooseAiMove: 反転によって(落とした場所とは別の位置に)4連ができる列を選ぶ。
// 列4はあらかじめ満杯にしておき、直接積んで縦4連を作る近道を塞ぐ
// (そうしないと列4に直接積むだけでも勝ててしまい、反転検出のテストにならない)。
{
  const board = makeBoard([
    [0, 4, BLACK],
    [1, 4, BLACK],
    [2, 4, WHITE],
    [3, 4, WHITE],
    [4, 4, WHITE],
    [5, 4, BLACK],
    [5, 3, WHITE],
  ]);
  assert.strictEqual(canDropInColumn(board, 4), false, '列4は満杯で直接積めない');
  const move = chooseAiMove(board, WHITE, BLACK);
  assert.deepStrictEqual(move, { col: 5 }, '反転で縦4連が成立する列を選ぶ');
}

// chooseAiMove: 返り値は常に合法手(canDropInColumnを満たす)
{
  const board = makeBoard([
    [5, 0, BLACK], [5, 1, WHITE], [5, 2, BLACK], [5, 3, WHITE], [5, 4, BLACK],
    [4, 0, WHITE], [4, 1, BLACK],
  ]);
  // 列6を満杯にして選べないようにする
  for (let r = 0; r < ROWS; r++) board[r][6] = (r % 2 === 0) ? BLACK : WHITE;
  const move = chooseAiMove(board, WHITE, BLACK);
  assert.ok(move, '合法手が存在すれば必ず手を返す');
  assert.strictEqual(canDropInColumn(board, move.col), true, '返り値の列は常に合法手');
  assert.notStrictEqual(move.col, 6, '満杯の列は選ばれない');
}

console.log('All tests passed');
