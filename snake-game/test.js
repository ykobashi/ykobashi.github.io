// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  DIRECTIONS,
  getNextHead,
  isWallCollision,
  isSelfCollision,
  willGrow,
  isOppositeDirection,
  moveSnake,
  isGameOverMove,
  bodyForCollisionCheck,
  generateFoodPosition,
  createInitialSnake,
} = require('./logic.js');

function makeSeededRng(seq) {
  let i = 0;
  return () => seq[i++ % seq.length];
}

// getNextHead: 各方向への移動
{
  assert.deepStrictEqual(getNextHead({ x: 5, y: 5 }, DIRECTIONS.UP), { x: 5, y: 4 });
  assert.deepStrictEqual(getNextHead({ x: 5, y: 5 }, DIRECTIONS.DOWN), { x: 5, y: 6 });
  assert.deepStrictEqual(getNextHead({ x: 5, y: 5 }, DIRECTIONS.LEFT), { x: 4, y: 5 });
  assert.deepStrictEqual(getNextHead({ x: 5, y: 5 }, DIRECTIONS.RIGHT), { x: 6, y: 5 });
}

// isWallCollision: 盤外判定
{
  const size = 10;
  assert.strictEqual(isWallCollision({ x: -1, y: 0 }, size), true);
  assert.strictEqual(isWallCollision({ x: 0, y: -1 }, size), true);
  assert.strictEqual(isWallCollision({ x: 10, y: 0 }, size), true, 'サイズと同値は盤外');
  assert.strictEqual(isWallCollision({ x: 0, y: 10 }, size), true);
  assert.strictEqual(isWallCollision({ x: 9, y: 9 }, size), false, '右下端は盤内');
  assert.strictEqual(isWallCollision({ x: 0, y: 0 }, size), false, '左上端は盤内');
}

// isSelfCollision: 体の座標と一致すれば衝突
{
  const body = [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 3, y: 5 }];
  assert.strictEqual(isSelfCollision({ x: 3, y: 4 }, body), true);
  assert.strictEqual(isSelfCollision({ x: 9, y: 9 }, body), false);
}

// willGrow: 餌の位置と一致するか
{
  assert.strictEqual(willGrow({ x: 4, y: 4 }, { x: 4, y: 4 }), true);
  assert.strictEqual(willGrow({ x: 4, y: 4 }, { x: 5, y: 4 }), false);
}

// isOppositeDirection: 真逆の方向判定(反転禁止のため)
{
  assert.strictEqual(isOppositeDirection(DIRECTIONS.UP, DIRECTIONS.DOWN), true);
  assert.strictEqual(isOppositeDirection(DIRECTIONS.LEFT, DIRECTIONS.RIGHT), true);
  assert.strictEqual(isOppositeDirection(DIRECTIONS.UP, DIRECTIONS.LEFT), false);
  assert.strictEqual(isOppositeDirection(DIRECTIONS.UP, DIRECTIONS.UP), false);
}

// moveSnake: 成長しない場合、尻尾が1マス分削られる
{
  const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
  const nextHead = { x: 6, y: 5 };
  const moved = moveSnake(snake, nextHead, false);
  assert.deepStrictEqual(moved, [{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }]);
  assert.strictEqual(moved.length, snake.length, '成長しない場合は長さが変わらない');
}

// moveSnake: 成長する場合、尻尾を残したまま伸びる
{
  const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
  const nextHead = { x: 6, y: 5 };
  const moved = moveSnake(snake, nextHead, true);
  assert.deepStrictEqual(moved, [{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }]);
  assert.strictEqual(moved.length, snake.length + 1, '成長する場合は長さが1増える');
}

// bodyForCollisionCheck: 成長しない移動では尻尾(空くマス)を除外する
{
  const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
  const body = bodyForCollisionCheck(snake, false);
  assert.deepStrictEqual(body, [{ x: 5, y: 5 }, { x: 4, y: 5 }]);
}

// bodyForCollisionCheck: 成長する移動では全身を対象にする
{
  const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
  const body = bodyForCollisionCheck(snake, true);
  assert.deepStrictEqual(body, snake);
}

// isGameOverMove: 壁衝突
{
  assert.strictEqual(isGameOverMove({ x: -1, y: 5 }, 10, []), true);
}

// isGameOverMove: 自己衝突(尻尾が動いて空くマスに突っ込むのはセーフ)
{
  const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }, { x: 3, y: 6 }];
  // 頭が (3,6) の方向へ進むケース: 尻尾(3,6)は移動で空くのでbodyForCollisionCheckで除外されていればセーフ
  const nextHead = { x: 3, y: 6 };
  const bodyExcludingTail = bodyForCollisionCheck(snake, false);
  assert.strictEqual(isGameOverMove(nextHead, 10, bodyExcludingTail), false, '尻尾が空くマスへの移動は衝突ではない');
  // 自分の胴体(移動しても残る部分)にぶつかる場合は衝突
  const nextHead2 = { x: 4, y: 5 };
  assert.strictEqual(isGameOverMove(nextHead2, 10, bodyExcludingTail), true, '胴体への突入は衝突');
}

// createInitialSnake
{
  const snake = createInitialSnake(5, 5, 3);
  assert.deepStrictEqual(snake, [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }]);
}

// generateFoodPosition: スネークと重ならない位置を返す(決定論的)
{
  const snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  const rng = makeSeededRng([0]); // 空きマスの先頭を選ぶ
  const food = generateFoodPosition(snake, 3, rng); // 3x3=9マス中2マスは占有、7マス空き
  assert.ok(food, '食料位置が生成される');
  assert.ok(!snake.some((s) => s.x === food.x && s.y === food.y), 'スネークと重ならない');
  assert.ok(food.x >= 0 && food.x < 3 && food.y >= 0 && food.y < 3);
}

// generateFoodPosition: 盤面が満杯なら null を返す
{
  const fullSnake = [];
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      fullSnake.push({ x, y });
    }
  }
  const food = generateFoodPosition(fullSnake, 2, () => 0);
  assert.strictEqual(food, null);
}

console.log('All tests passed');
