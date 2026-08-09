// 決定的シミュレーションによるSky Raid(協力縦シューティング)のルール。DOM依存なし。
// 敵・ボス・アイテムは共有seed、経過時間、ホスト台帳の死亡時刻だけから再現する。
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const ARENA_W = 360;
const ARENA_H = 640;
const SHIP_R = 14, SHIP_HIT_R = 5, ENEMY_R = 16, BOSS_R = 44, BULLET_R = 4, ENEMY_BULLET_R = 5;
const SHIP_LIVES = 3;
const INVULN_MS = 1200;
const PLAYER_FIRE_INTERVAL_MS = 220;
const PLAYER_BULLET_SPEED = 460;
const ENEMY_BULLET_SPEED = 180;
const WAVE_INTERVAL_MS = 4000;

const ENEMY_SPEED_BASE = 40, ENEMY_SPEED_PER_WAVE = 3;
// 敵の最大HPは人数に応じて増える(ボスのHPスケーリングと同じ考え方)。Bはすばやい代わりに脆い性格を保つため、
// 増加ペースをAより緩やかにしている。ENEMY_A_HP/ENEMY_B_HPは1人プレイ基準値(=ベース値)の別名として残す。
const ENEMY_A_BASE_HP = 3, ENEMY_A_HP_PER_PLAYER = 1;
const ENEMY_B_BASE_HP = 2, ENEMY_B_HP_PER_PLAYER = 0.5;
const ENEMY_A_HP = ENEMY_A_BASE_HP, ENEMY_B_HP = ENEMY_B_BASE_HP; // 旧APIとの互換用(1人プレイ基準値)
const ENEMY_HP = ENEMY_A_HP; // 旧APIとの互換用
const ENEMY_B_SPEED_BASE = 46, ENEMY_B_SPEED_PER_WAVE = 3;
const ENEMY_B_WEAVE_AMPLITUDE = 40, ENEMY_B_WEAVE_PERIOD_MS = 1400;
const ENEMY_FIRE_INTERVAL_MS = 2200;

const WAVES_PHASE1 = 4;
const MIDBOSS_CYCLE = WAVES_PHASE1 + 1;
const WAVES_PHASE2 = 4;
const BIGBOSS_CYCLE = MIDBOSS_CYCLE + WAVES_PHASE2 + 1;
const MIDBOSS_BASE_HP = 40, MIDBOSS_HP_PER_PLAYER = 14;
const BIGBOSS_BASE_HP = 90, BIGBOSS_HP_PER_PLAYER = 26;
const BOSS_MOVE_MARGIN = 50;
const BIGBOSS_R = 56;
const BOSS_ATTACK_INTERVAL_MS = 1400, BIGBOSS_ATTACK_INTERVAL_MS = 1100;
const BOSS_SPEED = 60, BIGBOSS_SPEED = 85;
const BOSS_Y = 90;

const ITEM_R = 10, ITEM_FALL_SPEED = 90, ITEM_MAGNET_R = 56;
const ITEMS_PER_LEVEL = 10, MAX_POWER_LEVEL = 3;
const HIT_SCORE = 1, KILL_BONUS = 10, BOSS_HIT_SCORE = 1, BOSS_FINISH_BONUS = 100;
const MAX_ENEMY_BULLET_LIFETIME_MS = Math.ceil((ARENA_H / ENEMY_BULLET_SPEED) * 1000) + 300;
const MAX_BOSS_BULLET_LIFETIME_MS = 4000;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function generateSeed(rng = Math.random) { return Math.floor(rng() * 2 ** 31); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function hitTest(ax, ay, ar, bx, by, br) { return Math.hypot(ax - bx, ay - by) <= ar + br; }

// --- 決定的ワールド(敵・ボス・その弾・アイテム) ---
function waveEnemyCount(waveIndex) { return Math.min(5, 2 + Math.floor(waveIndex / 2)); }
function cycleKind(cycle) {
  if (cycle < 1 || cycle > BIGBOSS_CYCLE) return 'none';
  if (cycle === MIDBOSS_CYCLE) return 'midboss';
  if (cycle === BIGBOSS_CYCLE) return 'bigboss';
  return 'mob';
}
function cycleIsBoss(cycle) { return cycleKind(cycle) === 'midboss' || cycleKind(cycle) === 'bigboss'; }
function cycleStartMs(cycle) { return cycle * WAVE_INTERVAL_MS; }

function waveSpec(seed, waveIndex) {
  const rng = mulberry32((seed + waveIndex * 7919) >>> 0);
  const count = waveEnemyCount(waveIndex);
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push({
      slot: i,
      kind: rng() < 0.5 ? 'a' : 'b',
      x0: clamp(ARENA_W * ((i + 1) / (count + 1)) + (rng() - 0.5) * 20, ENEMY_R, ARENA_W - ENEMY_R),
      firePhaseMs: rng() * ENEMY_FIRE_INTERVAL_MS,
    });
  }
  return items;
}
function enemySpeed(kind, cycle) {
  return kind === 'b'
    ? ENEMY_B_SPEED_BASE + cycle * ENEMY_B_SPEED_PER_WAVE
    : ENEMY_SPEED_BASE + cycle * ENEMY_SPEED_PER_WAVE;
}
function enemyMaxHp(kind, playerCount = 1) {
  const count = Number.isFinite(playerCount) && playerCount > 0 ? playerCount : 1;
  const extra = Math.max(0, count - 1);
  return kind === 'b'
    ? ENEMY_B_BASE_HP + Math.floor(extra * ENEMY_B_HP_PER_PLAYER)
    : ENEMY_A_BASE_HP + Math.floor(extra * ENEMY_A_HP_PER_PLAYER);
}
function enemyPositionAt(item, cycle, tSinceSpawnMs) {
  const speed = enemySpeed(item.kind, cycle);
  const y = -ENEMY_R - item.slot * 26 + speed * (tSinceSpawnMs / 1000);
  const x = item.kind === 'b'
    ? clamp(item.x0 + ENEMY_B_WEAVE_AMPLITUDE * Math.sin((2 * Math.PI * tSinceSpawnMs) / ENEMY_B_WEAVE_PERIOD_MS), ENEMY_R, ARENA_W - ENEMY_R)
    : item.x0;
  return { x, y, speed };
}
function enemyMaxHpFromId(seed, enemyId, playerCount = 1) {
  if (typeof enemyId !== 'string') return null;
  const match = /^([1-9]\d*):(0|[1-9]\d*)$/.exec(enemyId);
  if (!match) return null;
  const cycle = Number(match[1]), slot = Number(match[2]);
  if (!Number.isSafeInteger(cycle) || !Number.isSafeInteger(slot)) return null;
  if (cycleKind(cycle) !== 'mob') return null;
  const item = waveSpec(seed, cycle)[slot];
  return item && item.slot === slot ? enemyMaxHp(item.kind, playerCount) : null;
}

function computeEnemies(seed, elapsedMs, deadEnemyIds, playerCount = 1) {
  const currentCycle = Math.floor(elapsedMs / WAVE_INTERVAL_MS);
  const enemies = [];
  for (let cycle = 1; cycle <= currentCycle; cycle += 1) {
    if (cycleKind(cycle) !== 'mob') continue;
    const spawnAt = cycleStartMs(cycle);
    waveSpec(seed, cycle).forEach((item) => {
      const id = cycle + ':' + item.slot;
      if (deadEnemyIds.has(id)) return;
      const pos = enemyPositionAt(item, cycle, elapsedMs - spawnAt);
      if (pos.y > ARENA_H + ENEMY_R * 2) return;
      enemies.push({ id, kind: item.kind, x: pos.x, y: pos.y, hp: enemyMaxHp(item.kind, playerCount), speed: pos.speed, spawnAt, firePhaseMs: item.firePhaseMs });
    });
  }
  return enemies;
}

function bossCycleFromId(id) {
  if (typeof id !== 'string') return null;
  const match = /^boss:([1-9]\d*)$/.exec(id);
  if (!match) return null;
  const cycle = Number(match[1]);
  return Number.isSafeInteger(cycle) ? cycle : null;
}
function bossMaxHp(cycle, playerCount) {
  const isBig = cycleKind(cycle) === 'bigboss';
  const base = isBig ? BIGBOSS_BASE_HP : MIDBOSS_BASE_HP;
  const perPlayer = isBig ? BIGBOSS_HP_PER_PLAYER : MIDBOSS_HP_PER_PLAYER;
  return base + perPlayer * Math.max(0, playerCount - 1);
}
function bossSpeedFor(cycle) { return cycleKind(cycle) === 'bigboss' ? BIGBOSS_SPEED : BOSS_SPEED; }
function bossAttackIntervalFor(cycle) { return cycleKind(cycle) === 'bigboss' ? BIGBOSS_ATTACK_INTERVAL_MS : BOSS_ATTACK_INTERVAL_MS; }
function bossRadiusFor(cycle) { return cycleKind(cycle) === 'bigboss' ? BIGBOSS_R : BOSS_R; }
function bossXAt(tSinceSpawnMs, speed) {
  const range = ARENA_W - 2 * BOSS_MOVE_MARGIN;
  const periodMs = (range / speed) * 2 * 1000;
  const phase = ((tSinceSpawnMs % periodMs) + periodMs) % periodMs;
  const half = periodMs / 2;
  const progress = phase <= half ? phase / half : 2 - phase / half;
  return BOSS_MOVE_MARGIN + progress * range;
}

function computeBosses(seed, elapsedMs, deadBossIds, playerCount) {
  const currentCycle = Math.floor(elapsedMs / WAVE_INTERVAL_MS);
  const bosses = [];
  for (let cycle = 1; cycle <= currentCycle; cycle += 1) {
    const kind = cycleKind(cycle);
    if (kind !== 'midboss' && kind !== 'bigboss') continue;
    const id = 'boss:' + cycle;
    if (deadBossIds.has(id)) continue;
    const spawnAt = cycleStartMs(cycle);
    bosses.push({
      id, kind,
      x: bossXAt(elapsedMs - spawnAt, bossSpeedFor(cycle)), y: BOSS_Y,
      radius: bossRadiusFor(cycle), maxHp: bossMaxHp(cycle, playerCount), spawnAt,
    });
  }
  return bosses;
}

function spreadPattern() {
  const out = [];
  for (let i = -3; i <= 3; i += 1) {
    const angle = Math.PI / 2 + i * 0.22;
    out.push({ vx: Math.cos(angle) * ENEMY_BULLET_SPEED, vy: Math.sin(angle) * ENEMY_BULLET_SPEED });
  }
  return out;
}
function sweepPattern() {
  const out = [];
  for (let i = -1; i <= 1; i += 1) out.push({ vx: i * 60, vy: ENEMY_BULLET_SPEED * 1.15 });
  return out;
}

// deadEnemyIds/deadBossIds は Map<id, deathElapsedMs>。死亡時刻をcutoffにして、死亡前の弾だけを再現する。
function computeEnemyBullets(seed, elapsedMs, deadEnemyIds) {
  const currentCycle = Math.floor(elapsedMs / WAVE_INTERVAL_MS);
  const bullets = [];
  const earliestRelevant = elapsedMs - MAX_ENEMY_BULLET_LIFETIME_MS;
  for (let cycle = 1; cycle <= currentCycle; cycle += 1) {
    if (cycleKind(cycle) !== 'mob') continue;
    const spawnAt = cycleStartMs(cycle);
    waveSpec(seed, cycle).forEach((item) => {
      const id = cycle + ':' + item.slot;
      const deathAt = deadEnemyIds.has(id) ? deadEnemyIds.get(id) : null;
      const cutoff = deathAt != null ? Math.min(deathAt, elapsedMs) : elapsedMs;
      let n = Math.max(0, Math.floor((earliestRelevant - spawnAt - item.firePhaseMs) / ENEMY_FIRE_INTERVAL_MS));
      for (;;) {
        const fireAt = spawnAt + item.firePhaseMs + n * ENEMY_FIRE_INTERVAL_MS;
        if (fireAt > cutoff) break;
        const firePos = enemyPositionAt(item, cycle, fireAt - spawnAt);
        if (firePos.y <= ARENA_H) {
          const y = firePos.y + ENEMY_BULLET_SPEED * ((elapsedMs - fireAt) / 1000);
          if (y <= ARENA_H + ENEMY_BULLET_R) bullets.push({ id: id + ':' + n, x: firePos.x, y });
        }
        n += 1;
      }
    });
  }
  return bullets;
}

function computeBossBullets(seed, elapsedMs, deadBossIds, playerCount) {
  const currentCycle = Math.floor(elapsedMs / WAVE_INTERVAL_MS);
  const bullets = [];
  const earliestRelevant = elapsedMs - MAX_BOSS_BULLET_LIFETIME_MS;
  for (let cycle = 1; cycle <= currentCycle; cycle += 1) {
    const kind = cycleKind(cycle);
    if (kind !== 'midboss' && kind !== 'bigboss') continue;
    const id = 'boss:' + cycle;
    const spawnAt = cycleStartMs(cycle);
    const deathAt = deadBossIds.has(id) ? deadBossIds.get(id) : null;
    const cutoff = deathAt != null ? Math.min(deathAt, elapsedMs) : elapsedMs;
    const attackInterval = bossAttackIntervalFor(cycle);
    let n = Math.max(0, Math.floor((earliestRelevant - spawnAt) / attackInterval));
    for (;;) {
      const fireAt = spawnAt + n * attackInterval;
      if (fireAt > cutoff) break;
      const bx = bossXAt(fireAt - spawnAt, bossSpeedFor(cycle));
      const flightMs = elapsedMs - fireAt;
      const pattern = n % 2 === 0 ? spreadPattern() : sweepPattern();
      pattern.forEach((dir, i) => {
        const x = bx + dir.vx * (flightMs / 1000);
        const y = BOSS_Y + dir.vy * (flightMs / 1000);
        if (x > -20 && x < ARENA_W + 20 && y > -20 && y < ARENA_H + 20) bullets.push({ id: id + ':' + n + ':' + i, x, y });
      });
      n += 1;
    }
  }
  return bullets;
}

function enemyDeathPosition(seed, enemyId, deathElapsedMs) {
  if (typeof enemyId !== 'string') return null;
  const match = /^([1-9]\d*):(0|[1-9]\d*)$/.exec(enemyId);
  if (!match) return null;
  const cycle = Number(match[1]), slot = Number(match[2]);
  if (!Number.isSafeInteger(cycle) || !Number.isSafeInteger(slot)) return null;
  if (cycleKind(cycle) !== 'mob') return null;
  const item = waveSpec(seed, cycle)[slot];
  if (!item) return null;
  return enemyPositionAt(item, cycle, deathElapsedMs - cycleStartMs(cycle));
}
function bossDeathPosition(deathElapsedMs, bossId) {
  const cycle = bossCycleFromId(bossId);
  if (cycle == null || !cycleIsBoss(cycle)) return null;
  const spawnAt = cycleStartMs(cycle);
  return { x: bossXAt(deathElapsedMs - spawnAt, bossSpeedFor(cycle)), y: BOSS_Y };
}
function computeItems(seed, elapsedMs, deadEnemyIds, deadBossIds, collectedItemIds) {
  const items = [];
  deadEnemyIds.forEach((deathAt, enemyId) => {
    if (collectedItemIds.has(enemyId) || deathAt > elapsedMs) return;
    const pos = enemyDeathPosition(seed, enemyId, deathAt);
    if (!pos) return;
    const y = pos.y + ITEM_FALL_SPEED * ((elapsedMs - deathAt) / 1000);
    if (y <= ARENA_H + ITEM_R) items.push({ id: enemyId, x: pos.x, y });
  });
  deadBossIds.forEach((deathAt, bossId) => {
    if (collectedItemIds.has(bossId) || deathAt > elapsedMs) return;
    const pos = bossDeathPosition(deathAt, bossId);
    if (!pos) return;
    const y = pos.y + ITEM_FALL_SPEED * ((elapsedMs - deathAt) / 1000);
    if (y <= ARENA_H + ITEM_R) items.push({ id: bossId, x: pos.x, y });
  });
  return items;
}
function findAbsorbableItem(items, shipX, shipY) {
  return items.find((item) => hitTest(item.x, item.y, ITEM_R, shipX, shipY, ITEM_MAGNET_R)) || null;
}

function spawnPosition(joinOrder, rosterCount) {
  return { x: clamp(ARENA_W * (joinOrder / (rosterCount + 1)), SHIP_R, ARENA_W - SHIP_R), y: ARENA_H - 60 };
}

// --- 自機の弾(各自ローカルで管理する、他人と共有しない状態) ---
function createFireState() { return { cooldownMs: 0 }; }
function createPowerState() { return { itemCount: 0, level: 0 }; }
function advancePower(power) {
  const itemCount = power.itemCount + 1;
  return { itemCount, level: Math.min(MAX_POWER_LEVEL, Math.floor(itemCount / ITEMS_PER_LEVEL)) };
}
function firePattern(level) {
  if (level >= 3) return [-24, -12, 0, 12, 24];
  if (level === 2) return [-16, 0, 16];
  if (level === 1) return [-8, 8];
  return [0];
}
function advanceFire(fireState, dtMs, shipX, shipY, canFire, powerLevel) {
  fireState.cooldownMs -= dtMs;
  if (canFire && fireState.cooldownMs <= 0) {
    fireState.cooldownMs = PLAYER_FIRE_INTERVAL_MS;
    return firePattern(powerLevel).map((dx) => ({ x: shipX + dx, y: shipY - SHIP_R }));
  }
  return [];
}
function advanceBullets(bullets, dtMs) {
  bullets.forEach((b) => { b.y -= PLAYER_BULLET_SPEED * (dtMs / 1000); });
  return bullets.filter((b) => b.y > -BULLET_R);
}

// --- 当たり判定(自分の弾・自機についてのみ自己判定する) ---
function checkBulletsVsEnemies(bullets, enemies) {
  const hits = [];
  const survivors = bullets.filter((b) => {
    for (const enemy of enemies) {
      if (hitTest(b.x, b.y, BULLET_R, enemy.x, enemy.y, ENEMY_R)) { hits.push({ enemyId: enemy.id }); return false; }
    }
    return true;
  });
  return { survivors, hits };
}
function checkBulletsVsBosses(bullets, bosses) {
  const hits = [];
  const survivors = bullets.filter((b) => {
    for (const boss of bosses) {
      const cycle = bossCycleFromId(boss.id);
      const radius = Number.isFinite(boss.radius) ? boss.radius : bossRadiusFor(cycle);
      if (hitTest(b.x, b.y, BULLET_R, boss.x, boss.y, radius)) { hits.push({ bossId: boss.id }); return false; }
    }
    return true;
  });
  return { survivors, hits };
}
function isShipHit(enemyBullets, shipX, shipY) {
  return enemyBullets.some((bullet) => hitTest(bullet.x, bullet.y, ENEMY_BULLET_R, shipX, shipY, SHIP_HIT_R));
}

// --- 自機の被弾状態(各自がローカルで権威を持つ) ---
function createShipStatus() { return { lives: SHIP_LIVES, invulnUntil: 0, hits: 0 }; }
function applySelfHit(status, now) {
  if (now < status.invulnUntil || status.lives <= 0) return status;
  return { lives: Math.max(0, status.lives - 1), invulnUntil: now + INVULN_MS, hits: status.hits + 1 };
}

// --- ホスト権威の台帳(敵/ボスのHP・スコア・共有強化) ---
function createLedger() {
  return { enemyHp: {}, deadEnemies: new Map(), bossHp: {}, deadBosses: new Map(), scores: {}, collectedItems: new Set(), power: createPowerState() };
}
function claimItem(ledger, itemId) {
  if (ledger.collectedItems.has(itemId)) return { claimed: false };
  ledger.collectedItems.add(itemId);
  ledger.power = advancePower(ledger.power);
  return { claimed: true, power: ledger.power };
}
function applyEnemyHit(ledger, enemyId, byId, maxHp, nowElapsedMs) {
  if (ledger.deadEnemies.has(enemyId)) return { killed: false };
  const hp = (Object.prototype.hasOwnProperty.call(ledger.enemyHp, enemyId) ? ledger.enemyHp[enemyId] : maxHp) - 1;
  ledger.enemyHp[enemyId] = hp;
  ledger.scores[byId] = (ledger.scores[byId] || 0) + HIT_SCORE;
  if (hp <= 0) {
    ledger.deadEnemies.set(enemyId, nowElapsedMs);
    ledger.scores[byId] += KILL_BONUS;
    return { killed: true, deathElapsedMs: nowElapsedMs };
  }
  return { killed: false };
}
function applyBossHit(ledger, bossId, byId, maxHp, nowElapsedMs) {
  if (ledger.deadBosses.has(bossId)) return { killed: false, hp: 0 };
  const hp = (Object.prototype.hasOwnProperty.call(ledger.bossHp, bossId) ? ledger.bossHp[bossId] : maxHp) - 1;
  ledger.bossHp[bossId] = hp;
  ledger.scores[byId] = (ledger.scores[byId] || 0) + BOSS_HIT_SCORE;
  if (hp <= 0) {
    ledger.deadBosses.set(bossId, nowElapsedMs);
    ledger.scores[byId] += BOSS_FINISH_BONUS;
    return { killed: true, hp: 0, deathElapsedMs: nowElapsedMs };
  }
  return { killed: false, hp };
}
function checkOutcome(livesById, rosterIds, bigBossDefeated) {
  if (bigBossDefeated) return 'clear';
  if (rosterIds.length > 0 && rosterIds.every((id) => (Object.prototype.hasOwnProperty.call(livesById, id) ? livesById[id] : SHIP_LIVES) <= 0)) return 'fail';
  return null;
}

// --- ロビー・スコアボード ---
function colorClass(joinOrder) { return 'p' + Math.min(MAX_PLAYERS, Math.max(1, joinOrder || 1)); }
function addPlayer(roster, player) { return roster.some((p) => p.id === player.id || (player.token && p.token === player.token)) ? roster : roster.concat(player); }
function removePlayer(roster, id) { return roster.filter((p) => p.id !== id); }
function hasMinPlayers(roster, min = MIN_PLAYERS) { return roster.length >= min; }
function hasMaxPlayers(roster, max = MAX_PLAYERS) { return roster.length >= max; }
function buildScoreboard(scores, roster) {
  const sorted = roster.map((p) => ({ id: p.id, name: p.name, joinOrder: p.joinOrder, score: Number(scores[p.id]) || 0 }))
    .sort((a, b) => b.score - a.score || a.joinOrder - b.joinOrder);
  let lastScore = null, lastRank = 0;
  return sorted.map((player, index) => {
    if (player.score !== lastScore) { lastScore = player.score; lastRank = index + 1; }
    return { ...player, rank: lastRank };
  });
}
function getWinners(scoreboard) { return scoreboard.filter((player) => player.rank === 1); }

const SkyRaidLogic = {
  MIN_PLAYERS, MAX_PLAYERS, ARENA_W, ARENA_H, SHIP_R, SHIP_HIT_R, ENEMY_R, BOSS_R, BIGBOSS_R, BULLET_R, ENEMY_BULLET_R,
  SHIP_LIVES, INVULN_MS, PLAYER_FIRE_INTERVAL_MS, PLAYER_BULLET_SPEED, ENEMY_BULLET_SPEED, WAVE_INTERVAL_MS,
  ENEMY_A_HP, ENEMY_B_HP, ENEMY_HP, ENEMY_A_BASE_HP, ENEMY_A_HP_PER_PLAYER, ENEMY_B_BASE_HP, ENEMY_B_HP_PER_PLAYER,
  ENEMY_SPEED_BASE, ENEMY_SPEED_PER_WAVE, ENEMY_B_SPEED_BASE, ENEMY_B_SPEED_PER_WAVE,
  ENEMY_B_WEAVE_AMPLITUDE, ENEMY_B_WEAVE_PERIOD_MS, ENEMY_FIRE_INTERVAL_MS,
  WAVES_PHASE1, MIDBOSS_CYCLE, WAVES_PHASE2, BIGBOSS_CYCLE, MIDBOSS_BASE_HP, MIDBOSS_HP_PER_PLAYER,
  BIGBOSS_BASE_HP, BIGBOSS_HP_PER_PLAYER, BOSS_MOVE_MARGIN, BOSS_ATTACK_INTERVAL_MS, BIGBOSS_ATTACK_INTERVAL_MS,
  BOSS_SPEED, BIGBOSS_SPEED, BOSS_Y, ITEM_R, ITEM_FALL_SPEED, ITEM_MAGNET_R, ITEMS_PER_LEVEL, MAX_POWER_LEVEL,
  HIT_SCORE, KILL_BONUS, BOSS_HIT_SCORE, BOSS_FINISH_BONUS, MAX_ENEMY_BULLET_LIFETIME_MS, MAX_BOSS_BULLET_LIFETIME_MS,
  mulberry32, generateSeed, clamp, hitTest,
  waveEnemyCount, cycleKind, cycleIsBoss, cycleStartMs, waveSpec, enemySpeed, enemyMaxHp, enemyMaxHpFromId, enemyPositionAt, computeEnemies,
  bossCycleFromId, bossMaxHp, bossSpeedFor, bossAttackIntervalFor, bossRadiusFor, bossXAt, computeBosses,
  spreadPattern, sweepPattern, computeEnemyBullets, computeBossBullets,
  enemyDeathPosition, bossDeathPosition, computeItems, findAbsorbableItem,
  spawnPosition, createFireState, createPowerState, advancePower, firePattern, advanceFire, advanceBullets,
  checkBulletsVsEnemies, checkBulletsVsBosses, isShipHit,
  createShipStatus, applySelfHit, createLedger, claimItem, applyEnemyHit, applyBossHit, checkOutcome,
  colorClass, addPlayer, removePlayer, hasMinPlayers, hasMaxPlayers, buildScoreboard, getWinners,
};
if (typeof module !== 'undefined') module.exports = SkyRaidLogic;
if (typeof window !== 'undefined') window.SkyRaidLogic = SkyRaidLogic;
