const assert = require('assert');
const Logic = require('./logic.js');

function makeRoster(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'p' + (i + 1), name: 'プレイヤー' + (i + 1), joinOrder: i + 1 }));
}

// 基本ユーティリティと縮小した自機当たり判定
{
  const a = Logic.mulberry32(42), b = Logic.mulberry32(42);
  assert.strictEqual(a(), b());
  assert.strictEqual(Logic.clamp(-5, 0, 10), 0);
  assert.strictEqual(Logic.hitTest(0, 0, 5, 8, 0, 5), true);
  assert.strictEqual(Logic.isShipHit([{ x: 110, y: 100 }], 100, 100), true, '弾半径5+自機hit半径5の内側');
  assert.strictEqual(Logic.isShipHit([{ x: 111, y: 100 }], 100, 100), false, '見た目半径ではなく小さいhit半径を使う');
}

// 固定時刻進行
{
  assert.strictEqual(Logic.cycleKind(1), 'mob');
  assert.strictEqual(Logic.cycleKind(4), 'mob');
  assert.strictEqual(Logic.cycleKind(Logic.MIDBOSS_CYCLE), 'midboss');
  assert.strictEqual(Logic.cycleKind(6), 'mob');
  assert.strictEqual(Logic.cycleKind(9), 'mob');
  assert.strictEqual(Logic.cycleKind(Logic.BIGBOSS_CYCLE), 'bigboss');
  assert.strictEqual(Logic.cycleKind(Logic.BIGBOSS_CYCLE + 1), 'none');
  assert.strictEqual(Logic.cycleIsBoss(Logic.MIDBOSS_CYCLE), true);
  assert.strictEqual(Logic.cycleIsBoss(Logic.BIGBOSS_CYCLE), true);
  assert.strictEqual(Logic.cycleStartMs(3), 3 * Logic.WAVE_INTERVAL_MS);
}

// 敵仕様は決定的で、敵Bはジグザグする
{
  const a = Logic.waveSpec(1, 1), b = Logic.waveSpec(1, 1), c = Logic.waveSpec(2, 1);
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, c);
  assert.ok(a.every((item) => item.kind === 'a' || item.kind === 'b'));
  const item = { slot: 0, kind: 'b', x0: 180 };
  const atStart = Logic.enemyPositionAt(item, 1, 0);
  const atQuarter = Logic.enemyPositionAt(item, 1, Logic.ENEMY_B_WEAVE_PERIOD_MS / 4);
  assert.notStrictEqual(atStart.x, atQuarter.x);
  assert.ok(atQuarter.x >= Logic.ENEMY_R && atQuarter.x <= Logic.ARENA_W - Logic.ENEMY_R);
  assert.strictEqual(Logic.enemyMaxHp('a'), Logic.ENEMY_A_HP);
  assert.strictEqual(Logic.enemyMaxHp('b'), Logic.ENEMY_B_HP);
}

// 敵の出現、種類別HP、IDからのHP復元
{
  const seed = 7;
  assert.strictEqual(Logic.computeEnemies(seed, Logic.WAVE_INTERVAL_MS - 1, new Map()).length, 0);
  const enemies = Logic.computeEnemies(seed, Logic.WAVE_INTERVAL_MS + 10, new Map());
  assert.strictEqual(enemies.length, Logic.waveEnemyCount(1));
  enemies.forEach((enemy) => assert.strictEqual(enemy.hp, Logic.enemyMaxHpFromId(seed, enemy.id)));
  assert.strictEqual(Logic.enemyMaxHpFromId(seed, 'bad'), null);
  assert.strictEqual(Logic.enemyMaxHpFromId(seed, '1:00'), null);
  assert.strictEqual(Logic.enemyMaxHpFromId(seed, '01:0'), null);
  assert.strictEqual(Logic.enemyMaxHpFromId(seed, '1:999'), null);
  assert.strictEqual(Logic.enemyMaxHpFromId(seed, Logic.MIDBOSS_CYCLE + ':0'), null);
  const dead = new Map([[enemies[0].id, Logic.WAVE_INTERVAL_MS + 10]]);
  assert.strictEqual(Logic.computeEnemies(seed, Logic.WAVE_INTERVAL_MS + 10, dead).length, enemies.length - 1);
  assert.strictEqual(Logic.computeEnemies(seed, Logic.cycleStartMs(Logic.MIDBOSS_CYCLE) + 10, new Map()).some((enemy) => enemy.id.startsWith(Logic.MIDBOSS_CYCLE + ':')), false);
}

// 敵の最大HPはプレイ人数が増えるほど上がる(ボスと同じ考え方)。Aはより急、Bはより緩やかに増える
{
  assert.strictEqual(Logic.enemyMaxHp('a', 1), Logic.ENEMY_A_BASE_HP);
  assert.ok(Logic.enemyMaxHp('a', 6) > Logic.enemyMaxHp('a', 1), '6人だと1人よりAのHPが高い');
  assert.ok(Logic.enemyMaxHp('a', 6) > Logic.enemyMaxHp('b', 6), '同じ人数ならAの方がBよりHPが高い');
  assert.strictEqual(Logic.enemyMaxHp('b', 2), Logic.enemyMaxHp('b', 1), 'Bは2人ではまだ増えない(2人ごとに+1のペース)');
  assert.ok(Logic.enemyMaxHp('b', 3) > Logic.enemyMaxHp('b', 1), 'Bも3人になれば増える');
  assert.strictEqual(Logic.enemyMaxHp('a'), Logic.ENEMY_A_HP, '省略時は1人プレイ基準値と一致する');

  const seed = 7;
  const elapsed = Logic.WAVE_INTERVAL_MS + 10;
  const soloEnemies = Logic.computeEnemies(seed, elapsed, new Map(), 1);
  const partyEnemies = Logic.computeEnemies(seed, elapsed, new Map(), 6);
  assert.deepStrictEqual(soloEnemies.map((e) => e.x), partyEnemies.map((e) => e.x), '出現位置・数はプレイ人数で変わらない');
  soloEnemies.forEach((solo, i) => assert.ok(partyEnemies[i].hp >= solo.hp, '大人数の方がHPが下がることはない'));
  assert.strictEqual(Logic.enemyMaxHpFromId(seed, soloEnemies[0].id, 6), partyEnemies[0].hp);
}

// ボスは中・大ボスだけが固定cycleに出現し、サイズとHPを使い分ける
{
  const seed = 9;
  const midAt = Logic.cycleStartMs(Logic.MIDBOSS_CYCLE);
  const bigAt = Logic.cycleStartMs(Logic.BIGBOSS_CYCLE);
  assert.strictEqual(Logic.computeBosses(seed, midAt - 1, new Map(), 2).length, 0);
  const mid = Logic.computeBosses(seed, midAt + 1, new Map(), 2)[0];
  assert.strictEqual(mid.kind, 'midboss');
  assert.strictEqual(mid.radius, Logic.BOSS_R);
  const bosses = Logic.computeBosses(seed, bigAt + 1, new Map(), 2);
  const big = bosses.find((boss) => boss.kind === 'bigboss');
  assert.ok(big);
  assert.strictEqual(big.radius, Logic.BIGBOSS_R);
  assert.ok(Logic.bossMaxHp(Logic.BIGBOSS_CYCLE, 2) > Logic.bossMaxHp(Logic.MIDBOSS_CYCLE, 2));
  assert.strictEqual(Logic.bossCycleFromId('boss:10'), 10);
  assert.strictEqual(Logic.bossCycleFromId('boss:010'), null);
  assert.strictEqual(Logic.bossCycleFromId('boss:10:bad'), null);
  assert.strictEqual(Logic.computeBosses(seed, bigAt + 1, new Map([[big.id, bigAt + 1]]), 2).some((boss) => boss.id === big.id), false);
}

// ボス移動と大ボス半径当たり判定
{
  const range = Logic.ARENA_W - 2 * Logic.BOSS_MOVE_MARGIN;
  const periodMs = (range / Logic.BIGBOSS_SPEED) * 2 * 1000;
  assert.strictEqual(Logic.bossXAt(0, Logic.BIGBOSS_SPEED), Logic.BOSS_MOVE_MARGIN);
  assert.ok(Math.abs(Logic.bossXAt(periodMs / 2, Logic.BIGBOSS_SPEED) - (Logic.ARENA_W - Logic.BOSS_MOVE_MARGIN)) < 1e-6);
  assert.deepStrictEqual(Logic.checkBulletsVsBosses([{ x: 154, y: 100 }], [{ id: 'boss:10', x: 100, y: 100, radius: Logic.BIGBOSS_R }]).hits, [{ bossId: 'boss:10' }]);
  assert.strictEqual(Logic.checkBulletsVsBosses([{ x: 150, y: 100 }], [{ id: 'boss:5', x: 100, y: 100, radius: Logic.BOSS_R }]).hits.length, 0);
}

// 敵弾: 発射位置は敵Bの発射時点座標、死亡前の弾は残り死亡後の新規発射は止まる
{
  const seed = 3;
  const cycle = 1;
  const spawnAt = Logic.cycleStartMs(cycle);
  const item = Logic.waveSpec(seed, cycle).find((entry) => entry.kind === 'b') || Logic.waveSpec(seed, cycle)[0];
  const id = cycle + ':' + item.slot;
  const fireAt = spawnAt + item.firePhaseMs;
  const elapsed = fireAt + 500;
  const bullets = Logic.computeEnemyBullets(seed, elapsed, new Map());
  const bullet = bullets.find((entry) => entry.id === id + ':0');
  assert.ok(bullet);
  assert.ok(Math.abs(bullet.x - Logic.enemyPositionAt(item, cycle, item.firePhaseMs).x) < 1e-6);
  const deathMap = new Map([[id, elapsed]]);
  assert.deepStrictEqual(Logic.computeEnemyBullets(seed, elapsed, deathMap), bullets, '死亡時刻以前の弾は残る');
  const later = elapsed + Logic.ENEMY_FIRE_INTERVAL_MS * 3;
  assert.ok(Logic.computeEnemyBullets(seed, later, deathMap).length < Logic.computeEnemyBullets(seed, later, new Map()).length, '死亡後は新しい弾を撃たない');
}

// ボス弾: 中・大ボスとも死亡cutoffを守る
{
  [Logic.MIDBOSS_CYCLE, Logic.BIGBOSS_CYCLE].forEach((cycle) => {
    const spawnAt = Logic.cycleStartMs(cycle);
    const id = 'boss:' + cycle;
    const first = Logic.computeBossBullets(11, spawnAt + 10, new Map(), 2);
    assert.strictEqual(first.filter((bullet) => bullet.id.startsWith(id + ':0:')).length, 7);
    const dead = new Map([[id, spawnAt + 10]]);
    assert.deepStrictEqual(Logic.computeBossBullets(11, spawnAt + 10, dead, 2), first, '死亡前の弾は消えない');
    const later = spawnAt + Logic.bossAttackIntervalFor(cycle) + 10;
    assert.ok(Logic.computeBossBullets(11, later, dead, 2).length < Logic.computeBossBullets(11, later, new Map(), 2).length, '死亡後の次攻撃は発生しない');
  });
}

// アイテムは死亡座標から決定的に落下し、未来の死亡時刻・取得済み・画面外では表示しない
{
  const seed = 12;
  const enemy = Logic.computeEnemies(seed, Logic.cycleStartMs(1) + 1200, new Map())[0];
  const deathAt = Logic.cycleStartMs(1) + 1200;
  const deadEnemies = new Map([[enemy.id, deathAt]]);
  const atDeath = Logic.computeItems(seed, deathAt, deadEnemies, new Map(), new Set())[0];
  const deathPos = Logic.enemyDeathPosition(seed, enemy.id, deathAt);
  assert.ok(Math.abs(atDeath.x - deathPos.x) < 1e-6 && Math.abs(atDeath.y - deathPos.y) < 1e-6);
  const afterSecond = Logic.computeItems(seed, deathAt + 1000, deadEnemies, new Map(), new Set())[0];
  assert.ok(Math.abs(afterSecond.y - (deathPos.y + Logic.ITEM_FALL_SPEED)) < 1e-6);
  assert.strictEqual(Logic.computeItems(seed, deathAt + 1000, deadEnemies, new Map(), new Set([enemy.id])).length, 0);
  assert.strictEqual(Logic.computeItems(seed, deathAt - 1, deadEnemies, new Map(), new Set()).length, 0, '未来の死亡時刻のアイテムは出さない');
  assert.strictEqual(Logic.computeItems(seed, deathAt + 20000, deadEnemies, new Map(), new Set()).length, 0, '画面外へ落ちたアイテムは消える');
  const bossId = 'boss:' + Logic.MIDBOSS_CYCLE;
  const bossDeathAt = Logic.cycleStartMs(Logic.MIDBOSS_CYCLE) + 500;
  const bossItem = Logic.computeItems(seed, bossDeathAt, new Map(), new Map([[bossId, bossDeathAt]]), new Set())[0];
  const bossDeathPos = Logic.bossDeathPosition(bossDeathAt, bossId);
  assert.ok(Math.abs(bossItem.x - bossDeathPos.x) < 1e-6 && Math.abs(bossItem.y - bossDeathPos.y) < 1e-6);
  assert.strictEqual(Logic.findAbsorbableItem([{ id: 'item', x: 100, y: 100 }], 100 + Logic.ITEM_MAGNET_R + Logic.ITEM_R, 100).id, 'item');
  assert.strictEqual(Logic.findAbsorbableItem([{ id: 'item', x: 100, y: 100 }], 100 + Logic.ITEM_MAGNET_R + Logic.ITEM_R + 1, 100), null);
}

// 共有強化と複数列射撃
{
  let power = Logic.createPowerState();
  for (let i = 0; i < Logic.ITEMS_PER_LEVEL; i += 1) power = Logic.advancePower(power);
  assert.strictEqual(power.level, 1);
  for (let i = 0; i < Logic.ITEMS_PER_LEVEL * 10; i += 1) power = Logic.advancePower(power);
  assert.strictEqual(power.level, Logic.MAX_POWER_LEVEL);
  assert.deepStrictEqual(Logic.firePattern(0), [0]);
  assert.strictEqual(Logic.firePattern(1).length, 2);
  assert.strictEqual(Logic.firePattern(2).length, 3);
  assert.strictEqual(Logic.firePattern(3).length, 5);
  const fireState = Logic.createFireState();
  assert.strictEqual(Logic.advanceFire(fireState, 0, 100, 100, true, 3).length, 5);
  assert.deepStrictEqual(Logic.advanceFire(fireState, 100, 100, 100, true, 3), []);
  assert.deepStrictEqual(Logic.advanceFire(Logic.createFireState(), 0, 100, 100, false, 0), []);
}

// 台帳: 敵HP、ボスHP、アイテム取得の一度きり処理
{
  const ledger = Logic.createLedger();
  let lastHit;
  for (let i = 0; i < Logic.ENEMY_B_HP; i += 1) lastHit = Logic.applyEnemyHit(ledger, '1:0', 'p1', Logic.ENEMY_B_HP, 1000);
  assert.strictEqual(lastHit.killed, true, 'HP分だけ命中させれば倒れる');
  assert.strictEqual(ledger.deadEnemies.get('1:0'), 1000);
  const claim = Logic.claimItem(ledger, '1:0');
  assert.strictEqual(claim.claimed, true);
  const duplicate = Logic.claimItem(ledger, '1:0');
  assert.strictEqual(duplicate.claimed, false);
  assert.deepStrictEqual(ledger.power, claim.power);
  const bossLedger = Logic.createLedger();
  for (let i = 0; i < 3; i += 1) Logic.applyBossHit(bossLedger, 'boss:5', 'p1', 3, 3000);
  assert.strictEqual(bossLedger.deadBosses.get('boss:5'), 3000);
}

// 勝敗、移動、スコアボード
{
  assert.strictEqual(Logic.checkOutcome({ p1: 3 }, ['p1'], true), 'clear');
  assert.strictEqual(Logic.checkOutcome({ p1: 3 }, ['p1'], false), null);
  assert.strictEqual(Logic.checkOutcome({ p1: 0, p2: 0 }, ['p1', 'p2'], false), 'fail');
  const p1 = Logic.spawnPosition(1, 3), p2 = Logic.spawnPosition(2, 3);
  assert.notStrictEqual(p1.x, p2.x);
  let bullets = Logic.advanceBullets([{ x: 100, y: 100 }], 100);
  assert.ok(bullets[0].y < 100);
  assert.strictEqual(Logic.advanceBullets(bullets, 100000).length, 0);
  const board = Logic.buildScoreboard({ p1: 10, p2: 20, p3: 20 }, makeRoster(3));
  assert.deepStrictEqual(board.map((player) => player.rank), [1, 1, 3]);
  assert.strictEqual(Logic.getWinners(board).length, 2);
}

console.log('All tests passed');
