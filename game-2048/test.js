// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  createEmptyGrid,
  gridsEqual,
  slideRowLeft,
  moveLeft,
  moveRight,
  moveUp,
  moveDown,
  getEmptyCells,
  addRandomTile,
  canMove,
  hasWon,
} = require('./logic.js');

function makeSeededRng(seq) {
  let i = 0;
  return () => seq[i++ % seq.length];
}

// slideRowLeft: 単純なスライド(マージなし)
{
  const result = slideRowLeft([0, 2, 0, 4]);
  assert.deepStrictEqual(result.row, [2, 4, 0, 0]);
  assert.strictEqual(result.score, 0);
  assert.strictEqual(result.moved, true);
}

// slideRowLeft: マージあり
{
  const result = slideRowLeft([2, 2, 4, 4]);
  assert.deepStrictEqual(result.row, [4, 8, 0, 0]);
  assert.strictEqual(result.score, 12);
  assert.strictEqual(result.moved, true);
}

// slideRowLeft: 3つ以上の連続は左から2つずつマージ(4連続同値は2組にマージ)
{
  const result = slideRowLeft([2, 2, 2, 2]);
  assert.deepStrictEqual(result.row, [4, 4, 0, 0]);
  assert.strictEqual(result.score, 8);
}

// slideRowLeft: 既に詰まっていて変化なし(moved=false)
{
  const result = slideRowLeft([2, 4, 8, 16]);
  assert.deepStrictEqual(result.row, [2, 4, 8, 16]);
  assert.strictEqual(result.moved, false);
}

// moveLeft: グリッド全体
{
  const grid = [
    [2, 2, 0, 0],
    [0, 4, 4, 0],
    [2, 0, 2, 2],
    [0, 0, 0, 0],
  ];
  const result = moveLeft(grid);
  assert.deepStrictEqual(result.grid, [
    [4, 0, 0, 0],
    [8, 0, 0, 0],
    [4, 2, 0, 0],
    [0, 0, 0, 0],
  ]);
  assert.strictEqual(result.score, 4 + 8 + 4);
  assert.strictEqual(result.moved, true);
}

// moveRight: グリッド全体
{
  const grid = [
    [2, 2, 0, 0],
    [0, 4, 4, 0],
    [2, 0, 2, 2],
    [0, 0, 0, 0],
  ];
  const result = moveRight(grid);
  assert.deepStrictEqual(result.grid, [
    [0, 0, 0, 4],
    [0, 0, 0, 8],
    [0, 0, 2, 4],
    [0, 0, 0, 0],
  ]);
  assert.strictEqual(result.moved, true);
}

// moveUp: グリッド全体(列方向のマージ)
{
  const grid = [
    [2, 0, 2, 0],
    [2, 0, 0, 0],
    [4, 0, 0, 2],
    [0, 0, 2, 0],
  ];
  const result = moveUp(grid);
  assert.deepStrictEqual(result.grid, [
    [4, 0, 4, 2],
    [4, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  assert.strictEqual(result.score, 8);
  assert.strictEqual(result.moved, true);
}

// moveDown: グリッド全体
{
  const grid = [
    [2, 0, 2, 0],
    [2, 0, 0, 0],
    [4, 0, 0, 2],
    [0, 0, 2, 0],
  ];
  const result = moveDown(grid);
  assert.deepStrictEqual(result.grid, [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [4, 0, 0, 0],
    [4, 0, 4, 2],
  ]);
  assert.strictEqual(result.score, 8);
  assert.strictEqual(result.moved, true);
}

// 動かせない場合は moved=false でグリッドが変わらない
{
  const grid = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ];
  const result = moveLeft(grid);
  assert.strictEqual(result.moved, false);
  assert.ok(gridsEqual(result.grid, grid));
}

// getEmptyCells
{
  const grid = createEmptyGrid(2);
  grid[0][0] = 2;
  const empties = getEmptyCells(grid);
  assert.strictEqual(empties.length, 3);
  assert.ok(empties.some(([r, c]) => r === 0 && c === 1));
}

// addRandomTile: 空きマスに 2 or 4 を追加する(rngで決定論的に検証)
{
  const grid = createEmptyGrid(2); // 4マス全て空き
  // rng呼び出し順: 位置選択用の値、値選択用の値
  const rng = makeSeededRng([0, 0.5]); // idx=floor(0*4)=0番目の空きマス, 値選択0.5<0.9 -> 2
  const newGrid = addRandomTile(grid, rng);
  const empties = getEmptyCells(grid);
  const [r, c] = empties[0];
  assert.strictEqual(newGrid[r][c], 2);
  const totalFilled = newGrid.flat().filter((v) => v !== 0).length;
  assert.strictEqual(totalFilled, 1);
}

// addRandomTile: 10%の確率(rng>=0.9)で4になる
{
  const grid = createEmptyGrid(2);
  const rng = makeSeededRng([0, 0.95]);
  const newGrid = addRandomTile(grid, rng);
  const filledValue = newGrid.flat().find((v) => v !== 0);
  assert.strictEqual(filledValue, 4);
}

// addRandomTile: 空きマスが無ければ変化しない
{
  const grid = [
    [2, 4],
    [4, 2],
  ];
  const rng = makeSeededRng([0.1, 0.1]);
  const newGrid = addRandomTile(grid, rng);
  assert.ok(gridsEqual(newGrid, grid));
}

// canMove: 空きマスがあれば true
{
  const grid = [
    [2, 4],
    [4, 0],
  ];
  assert.strictEqual(canMove(grid), true);
}

// canMove: 空きマスは無いが隣接同値があれば true
{
  const grid = [
    [2, 2],
    [4, 8],
  ];
  assert.strictEqual(canMove(grid), true);
}

// canMove: 空きマスも隣接同値も無ければ false(ゲームオーバー)
{
  const grid = [
    [2, 4],
    [4, 2],
  ];
  assert.strictEqual(canMove(grid), false);
}

// hasWon
{
  const grid = createEmptyGrid(4);
  assert.strictEqual(hasWon(grid), false);
  grid[1][1] = 2048;
  assert.strictEqual(hasWon(grid), true);
  assert.strictEqual(hasWon(grid, 4096), false);
}

console.log('All tests passed');
