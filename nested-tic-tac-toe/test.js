// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
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
} = require('./logic.js');

// otherPlayer
{
  assert.strictEqual(otherPlayer(BLACK), WHITE);
  assert.strictEqual(otherPlayer(WHITE), BLACK);
}

// createGame: 9個の小盤・大盤が全て空
{
  const game = createGame();
  assert.strictEqual(game.subBoards.length, 9);
  assert.ok(game.subBoards.every((b) => b.length === 9 && b.every((c) => c === EMPTY)));
  assert.ok(game.bigBoard.every((c) => c === EMPTY));
}

// findLineWinner: 横・縦・斜めの3並びを検出する
{
  assert.strictEqual(findLineWinner([BLACK, BLACK, BLACK, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY]), BLACK, '横並び');
  assert.strictEqual(findLineWinner([WHITE, EMPTY, EMPTY, WHITE, EMPTY, EMPTY, WHITE, EMPTY, EMPTY]), WHITE, '縦並び');
  assert.strictEqual(findLineWinner([BLACK, EMPTY, EMPTY, EMPTY, BLACK, EMPTY, EMPTY, EMPTY, BLACK]), BLACK, '斜め並び');
  assert.strictEqual(findLineWinner([BLACK, WHITE, BLACK, WHITE, BLACK, WHITE, WHITE, BLACK, WHITE]), null, '並びなし');
}

// findLineWinner: DRAWが3つ並んでも勝利扱いにしない(大盤で重要)
{
  const cells = [DRAW, DRAW, DRAW, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY];
  assert.strictEqual(findLineWinner(cells), null, '引き分けマスの並びは勝利ではない');
}

// isSubBoardFull
{
  const full = [BLACK, WHITE, BLACK, WHITE, BLACK, WHITE, BLACK, WHITE, BLACK];
  const notFull = [BLACK, WHITE, EMPTY, WHITE, BLACK, WHITE, BLACK, WHITE, BLACK];
  assert.strictEqual(isSubBoardFull(full), true);
  assert.strictEqual(isSubBoardFull(notFull), false);
}

// legalSubBoards: forcedが指定されていればその小盤のみ
{
  const game = createGame();
  assert.deepStrictEqual(legalSubBoards(game, 4), [4]);
}

// legalSubBoards: forcedの小盤が決着済みならどの小盤にも置ける
{
  const game = createGame();
  game.bigBoard[4] = BLACK;
  assert.deepStrictEqual(legalSubBoards(game, 4), [0, 1, 2, 3, 5, 6, 7, 8]);
}

// legalSubBoards: forced=nullなら未決着の小盤全て
{
  const game = createGame();
  game.bigBoard[0] = BLACK;
  game.bigBoard[8] = DRAW;
  assert.deepStrictEqual(legalSubBoards(game, null), [1, 2, 3, 4, 5, 6, 7]);
}

// canPlaceAt: forcedと一致しない小盤には置けない
{
  const game = createGame();
  assert.strictEqual(canPlaceAt(game, 4, 0, 4), false, 'forced=4のとき小盤0には置けない');
  assert.strictEqual(canPlaceAt(game, 0, 4, 0), false, 'forced=0のとき小盤4には置けない');
  assert.strictEqual(canPlaceAt(game, 4, 4, 0), true, 'forced=4のとき小盤4には置ける');
}

// canPlaceAt: 決着済みの小盤には置けない
{
  const game = createGame();
  game.bigBoard[2] = WHITE;
  assert.strictEqual(canPlaceAt(game, null, 2, 0), false);
}

// canPlaceAt: 既に石があるマスには置けない
{
  const game = createGame();
  game.subBoards[3][5] = BLACK;
  assert.strictEqual(canPlaceAt(game, 3, 3, 5), false);
}

// playMove: 石を置いた位置(cellIndex)が次の強制小盤になる
{
  const game = createGame();
  const { state, nextForced } = playMove(game, null, 0, 4, BLACK);
  assert.strictEqual(state.subBoards[0][4], BLACK);
  assert.strictEqual(nextForced, 4, '置いた位置(4)が次の小盤指定になる');
  // 元の状態は変更されない
  assert.strictEqual(game.subBoards[0][4], EMPTY);
}

// playMove: 指定先の小盤が既に決着していれば次はどこでも置ける(nextForced=null)
{
  let game = createGame();
  game.bigBoard[4] = WHITE; // 小盤4はすでに白が獲得済み
  const { nextForced } = playMove(game, 0, 0, 4, BLACK); // 小盤0のマス4に置く→小盤4を指定するが決着済み
  assert.strictEqual(nextForced, null, '指定先が決着済みなら制限なし');
}

// playMove: 小盤で3つ並べると小盤を獲得し、以後その小盤には置けない
{
  const game = createGame();
  game.subBoards[0][0] = BLACK;
  game.subBoards[0][1] = BLACK;
  // 上段(0,1,2)の最後のマスを黒が置いて小盤0を獲得する
  const { state } = playMove(game, 0, 0, 2, BLACK);
  assert.strictEqual(state.bigBoard[0], BLACK, '小盤0は黒が獲得');
  assert.strictEqual(canPlaceAt(state, null, 0, 3), false, '獲得済みの小盤には置けない');
}

// playMove: 小盤が全マス埋まって3並びがなければ引き分け(DRAW)扱いになる
{
  const game = createGame();
  // O X O / X X O / O O X のような3並びなしの配置(最後の1マスのみ空き)
  game.subBoards[1] = [BLACK, WHITE, BLACK, WHITE, WHITE, BLACK, EMPTY, BLACK, WHITE];
  const { state } = playMove(game, 1, 1, 6, BLACK);
  assert.strictEqual(state.bigBoard[1], DRAW, '3並びなしで満杯になった小盤は引き分け扱い');
}

// checkBigWinner: 大盤で3つの小盤を獲得して並べば勝利
{
  const game = createGame();
  game.bigBoard[0] = BLACK;
  game.bigBoard[4] = BLACK;
  game.bigBoard[8] = BLACK;
  assert.strictEqual(checkBigWinner(game), BLACK, '大盤の斜めを獲得すれば勝利');
}

// checkBigWinner: 引き分け小盤(DRAW)が並んでも大盤の勝利にはならない
{
  const game = createGame();
  game.bigBoard[0] = DRAW;
  game.bigBoard[1] = DRAW;
  game.bigBoard[2] = DRAW;
  assert.strictEqual(checkBigWinner(game), null);
}

// isGameOver: 全小盤が決着すればゲーム終了(勝者がいなければ引き分け)
{
  const game = createGame();
  assert.strictEqual(isGameOver(game), false);
  for (let i = 0; i < 9; i++) game.bigBoard[i] = i % 2 === 0 ? BLACK : DRAW;
  assert.strictEqual(isGameOver(game), true);
}

console.log('All tests passed');
