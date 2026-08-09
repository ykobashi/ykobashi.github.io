// Host-authoritative rules for Escape Run (協力エスケープラン).  This module has no DOM dependency.
// コース(障害物配置)は共有シードから全端末が同じ手順で決定的に生成するため、
// worldX(=経過時間×速度)以外は通信同期が不要になる設計。
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const LIVES_START = 3;
const STUN_MS = 900;
const JUMP_MS = 480;
const SCROLL_SPEED = 220; // world units（=px相当）/ 秒
const DISTANCE_GOAL = 11000; // ゴールまでの距離。SCROLL_SPEEDで割ると約50秒
const OBSTACLE_START_X = 900; // 最初の障害物までの猶予
const OBSTACLE_END_MARGIN = 300; // ゴール直前は障害物を置かない
const OBSTACLE_MIN_GAP = 420;
const OBSTACLE_MAX_GAP = 760;
const LEAD_START = 480; // 開始直後の危険ラインの余裕距離
const LEAD_END = 160; // ゴール間際の危険ラインの余裕距離

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSeed(rng = Math.random) {
  return Math.floor(rng() * 2 ** 31);
}

function generateCourse(seed) {
  const rng = mulberry32(seed);
  const obstacles = [];
  let x = OBSTACLE_START_X;
  while (x < DISTANCE_GOAL - OBSTACLE_END_MARGIN) {
    const type = rng() < 0.5 ? 'jump' : 'duck';
    obstacles.push({ x: Math.round(x), type });
    x += OBSTACLE_MIN_GAP + rng() * (OBSTACLE_MAX_GAP - OBSTACLE_MIN_GAP);
  }
  return obstacles;
}

function worldX(startedAt, now) {
  return Math.min(DISTANCE_GOAL, Math.max(0, ((now - startedAt) / 1000) * SCROLL_SPEED));
}

function progressRatio(x) {
  return Math.min(1, Math.max(0, x / DISTANCE_GOAL));
}

function leadDistance(x) {
  return LEAD_START - (LEAD_START - LEAD_END) * progressRatio(x);
}

// 障害物を通過する瞬間のプレイヤーの状態(status)から成否を判定する。
function judgeObstacle(status, obstacleType) {
  if (obstacleType === 'jump') return status === 'jumping';
  if (obstacleType === 'duck') return status === 'ducking';
  return true;
}

// fromIndex以降で x に到達済み(x座標を通過済み)の障害物インデックスを列挙する。
function obstaclesToJudge(obstacles, fromIndex, x) {
  const indices = [];
  let i = fromIndex;
  while (i < obstacles.length && obstacles[i].x <= x) {
    indices.push(i);
    i += 1;
  }
  return indices;
}

function createPlayerState(id, name, joinOrder) {
  return { id, name, joinOrder, lives: LIVES_START, status: 'running', stunUntil: 0, hits: 0 };
}

function applyHit(player, now) {
  const lives = Math.max(0, player.lives - 1);
  return { ...player, lives, status: lives <= 0 ? 'eliminated' : 'stunned', stunUntil: now + STUN_MS, hits: player.hits + 1 };
}

function recoverFromStun(player, now) {
  if (player.status === 'stunned' && now >= player.stunUntil) return { ...player, status: 'running' };
  return player;
}

function isAlive(player) {
  return player.status !== 'eliminated';
}

function countAlive(players) {
  return players.filter(isAlive).length;
}

function colorClass(joinOrder) {
  return 'p' + Math.min(MAX_PLAYERS, Math.max(1, joinOrder || 1));
}

function addPlayer(roster, player) {
  return roster.some((p) => p.id === player.id || (player.token && p.token === player.token)) ? roster : roster.concat(player);
}

function removePlayer(roster, id) {
  return roster.filter((p) => p.id !== id);
}

function hasMinPlayers(roster, min = MIN_PLAYERS) {
  return roster.length >= min;
}

function hasMaxPlayers(roster, max = MAX_PLAYERS) {
  return roster.length >= max;
}

function buildRunSummary(players) {
  return players
    .slice()
    .sort((a, b) => a.joinOrder - b.joinOrder)
    .map((p) => ({ id: p.id, name: p.name, joinOrder: p.joinOrder, hits: p.hits, alive: isAlive(p) }));
}

const EscapeRunLogic = {
  MIN_PLAYERS, MAX_PLAYERS, LIVES_START, STUN_MS, JUMP_MS, SCROLL_SPEED, DISTANCE_GOAL, OBSTACLE_START_X,
  mulberry32, generateSeed, generateCourse, worldX, progressRatio, leadDistance, judgeObstacle, obstaclesToJudge,
  createPlayerState, applyHit, recoverFromStun, isAlive, countAlive, colorClass,
  addPlayer, removePlayer, hasMinPlayers, hasMaxPlayers, buildRunSummary,
};
if (typeof module !== 'undefined') module.exports = EscapeRunLogic;
if (typeof window !== 'undefined') window.EscapeRunLogic = EscapeRunLogic;
