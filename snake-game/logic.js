// logic.js - スネークゲーム 純粋関数ロジック(DOM操作なし)

const GRID_SIZE = 20;

const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

// 現在の頭の位置と進行方向から、次の頭の位置を計算する
function getNextHead(head, direction) {
  return { x: head.x + direction.x, y: head.y + direction.y };
}

// 壁(盤外)への衝突判定
function isWallCollision(pos, gridSize = GRID_SIZE) {
  return pos.x < 0 || pos.x >= gridSize || pos.y < 0 || pos.y >= gridSize;
}

// 自分の体への衝突判定(body配列内に同じ座標があるか)
function isSelfCollision(pos, body) {
  return body.some((seg) => seg.x === pos.x && seg.y === pos.y);
}

// 次の頭の位置が餌の位置と一致するか(成長するかどうか)
function willGrow(nextHead, food) {
  return nextHead.x === food.x && nextHead.y === food.y;
}

// 与えられた方向への移動が、現在の進行方向の真逆(即座の反転)かどうか
function isOppositeDirection(current, next) {
  return current.x === -next.x && current.y === -next.y;
}

// ヘビを1マス進める。grow が true なら尻尾を残したまま伸びる(成長)、false なら尻尾を1マス分削る
// snake は先頭が頭 (snake[0]) の座標配列
function moveSnake(snake, nextHead, grow) {
  const newSnake = [nextHead, ...snake];
  if (!grow) {
    newSnake.pop();
  }
  return newSnake;
}

// 次の頭の位置がゲームオーバー(壁または自己衝突)を引き起こすか判定する。
// selfBodyForCheck には、尻尾が移動して空くマスは含めない(通常は snake全体から末尾を除いたもの)ものを渡す想定
function isGameOverMove(nextHead, gridSize, bodyForSelfCheck) {
  return isWallCollision(nextHead, gridSize) || isSelfCollision(nextHead, bodyForSelfCheck);
}

// 自己衝突チェック用に、尻尾(移動で空くマス)を除いた本体配列を作る。
// grow(成長)する場合は尻尾が残るので全身を対象にする
function bodyForCollisionCheck(snake, grow) {
  return grow ? snake : snake.slice(0, -1);
}

// スネークと重ならない位置に餌を生成する。rng は 0以上1未満の乱数を返す関数(テスト時に差し替え可能)
function generateFoodPosition(snake, gridSize = GRID_SIZE, rng = Math.random) {
  const occupied = new Set(snake.map((seg) => seg.x + ',' + seg.y));
  const freeCells = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (!occupied.has(x + ',' + y)) {
        freeCells.push({ x, y });
      }
    }
  }
  if (freeCells.length === 0) return null; // 盤面が満杯(クリア相当)
  const idx = Math.floor(rng() * freeCells.length);
  return freeCells[idx];
}

function createInitialSnake(startX, startY, length = 3) {
  const snake = [];
  for (let i = 0; i < length; i++) {
    snake.push({ x: startX - i, y: startY });
  }
  return snake;
}

const SnakeLogic = {
  GRID_SIZE,
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
};

if (typeof module !== 'undefined') {
  module.exports = SnakeLogic;
}
if (typeof window !== 'undefined') {
  window.SnakeLogic = SnakeLogic;
}
