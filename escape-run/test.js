const assert = require('assert');
const Logic = require('./logic.js');

// mulberry32 / generateCourse: 同じシードなら常に同じコースになる（決定的生成）
{
  const seed = 12345;
  const a = Logic.generateCourse(seed);
  const b = Logic.generateCourse(seed);
  assert.deepStrictEqual(a, b);
  assert.ok(a.length > 5, 'コースには十分な数の障害物がある');
  a.forEach((o) => assert.ok(o.type === 'jump' || o.type === 'duck'));
}

// generateCourse: 障害物は昇順・開始猶予とゴール手前マージンを守る
{
  const obstacles = Logic.generateCourse(999);
  for (let i = 1; i < obstacles.length; i += 1) assert.ok(obstacles[i].x > obstacles[i - 1].x);
  assert.ok(obstacles[0].x >= Logic.OBSTACLE_START_X);
  assert.ok(obstacles[obstacles.length - 1].x < Logic.DISTANCE_GOAL);
}

// 異なるシードなら別のコースになる（衝突しない前提の簡易チェック）
{
  const a = Logic.generateCourse(1);
  const b = Logic.generateCourse(2);
  assert.notDeepStrictEqual(a, b);
}

// worldX: 開始前は0、経過時間×速度で進み、ゴールでクランプされる
{
  assert.strictEqual(Logic.worldX(1000, 500), 0);
  assert.strictEqual(Logic.worldX(0, 1000), Logic.SCROLL_SPEED);
  assert.strictEqual(Logic.worldX(0, 10_000_000), Logic.DISTANCE_GOAL);
}

// progressRatio / leadDistance: 0〜1にクランプされ、進むほどleadDistanceは縮む
{
  assert.strictEqual(Logic.progressRatio(-100), 0);
  assert.strictEqual(Logic.progressRatio(Logic.DISTANCE_GOAL * 2), 1);
  assert.ok(Logic.leadDistance(0) > Logic.leadDistance(Logic.DISTANCE_GOAL));
}

// judgeObstacle: jumpはジャンプ中のみ成功、duckはしゃがみ中のみ成功
{
  assert.strictEqual(Logic.judgeObstacle('jumping', 'jump'), true);
  assert.strictEqual(Logic.judgeObstacle('running', 'jump'), false);
  assert.strictEqual(Logic.judgeObstacle('ducking', 'jump'), false);
  assert.strictEqual(Logic.judgeObstacle('ducking', 'duck'), true);
  assert.strictEqual(Logic.judgeObstacle('running', 'duck'), false);
  assert.strictEqual(Logic.judgeObstacle('jumping', 'duck'), false);
}

// obstaclesToJudge: fromIndex以降でx座標を通過済みのものだけを返す
{
  const obstacles = [{ x: 100, type: 'jump' }, { x: 200, type: 'duck' }, { x: 300, type: 'jump' }];
  assert.deepStrictEqual(Logic.obstaclesToJudge(obstacles, 0, 250), [0, 1]);
  assert.deepStrictEqual(Logic.obstaclesToJudge(obstacles, 2, 250), []);
  assert.deepStrictEqual(Logic.obstaclesToJudge(obstacles, 0, 50), []);
  assert.deepStrictEqual(Logic.obstaclesToJudge(obstacles, 0, 1000), [0, 1, 2]);
}

// applyHit: 被弾でライフが減り、気絶状態＆解除時刻が設定される。0で脱落
{
  const p = Logic.createPlayerState('a', 'あ', 1);
  assert.strictEqual(p.lives, Logic.LIVES_START);
  const hit1 = Logic.applyHit(p, 1000);
  assert.strictEqual(hit1.lives, Logic.LIVES_START - 1);
  assert.strictEqual(hit1.status, 'stunned');
  assert.strictEqual(hit1.stunUntil, 1000 + Logic.STUN_MS);
  assert.strictEqual(hit1.hits, 1);

  let p2 = hit1;
  for (let i = 1; i < Logic.LIVES_START; i += 1) p2 = Logic.applyHit(p2, 1000);
  assert.strictEqual(p2.lives, 0);
  assert.strictEqual(p2.status, 'eliminated');
  assert.strictEqual(Logic.isAlive(p2), false);
}

// recoverFromStun: 気絶時間を過ぎたらrunningに戻る。それ以外はそのまま
{
  const p = Logic.applyHit(Logic.createPlayerState('a', 'あ', 1), 1000);
  assert.strictEqual(Logic.recoverFromStun(p, 1500).status, 'stunned');
  assert.strictEqual(Logic.recoverFromStun(p, 1000 + Logic.STUN_MS).status, 'running');
  const eliminated = { ...p, status: 'eliminated' };
  assert.strictEqual(Logic.recoverFromStun(eliminated, 999999).status, 'eliminated');
}

// countAlive
{
  const players = [
    Logic.createPlayerState('a', 'あ', 1),
    { ...Logic.createPlayerState('b', 'い', 2), status: 'eliminated' },
    Logic.createPlayerState('c', 'う', 3),
  ];
  assert.strictEqual(Logic.countAlive(players), 2);
}

// colorClass: 範囲内はp<n>、範囲外はクランプ
{
  assert.strictEqual(Logic.colorClass(1), 'p1');
  assert.strictEqual(Logic.colorClass(6), 'p6');
  assert.strictEqual(Logic.colorClass(0), 'p1');
  assert.strictEqual(Logic.colorClass(99), 'p' + Logic.MAX_PLAYERS);
}

// addPlayer / removePlayer: id・tokenの重複を防ぎつつ追加・削除できる
{
  let roster = [];
  roster = Logic.addPlayer(roster, { id: 'host', name: 'ホスト', token: null, joinOrder: 1 });
  roster = Logic.addPlayer(roster, { id: 'g1', name: 'ゲスト1', token: 't1', joinOrder: 2 });
  assert.strictEqual(roster.length, 2);
  roster = Logic.addPlayer(roster, { id: 'g1-dup', name: 'ゲスト1', token: 't1', joinOrder: 2 });
  assert.strictEqual(roster.length, 2, '同じtokenは重複追加されない');
  roster = Logic.removePlayer(roster, 'g1');
  assert.strictEqual(roster.length, 1);
}

// hasMinPlayers / hasMaxPlayers
{
  const roster = Array.from({ length: Logic.MIN_PLAYERS }, (_, i) => ({ id: String(i), joinOrder: i + 1 }));
  assert.strictEqual(Logic.hasMinPlayers(roster), true);
  assert.strictEqual(Logic.hasMinPlayers(roster.slice(0, 1)), false);
  const full = Array.from({ length: Logic.MAX_PLAYERS }, (_, i) => ({ id: String(i), joinOrder: i + 1 }));
  assert.strictEqual(Logic.hasMaxPlayers(full), true);
}

// buildRunSummary: joinOrder順に整形される
{
  const players = [
    { id: 'b', name: 'い', joinOrder: 2, hits: 1, lives: 2, status: 'running' },
    { id: 'a', name: 'あ', joinOrder: 1, hits: 0, lives: 3, status: 'running' },
  ];
  const summary = Logic.buildRunSummary(players);
  assert.deepStrictEqual(summary.map((p) => p.id), ['a', 'b']);
  assert.strictEqual(summary[0].alive, true);
}

console.log('All tests passed');
