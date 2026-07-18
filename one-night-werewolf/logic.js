// logic.js - ワンナイト人狼(簡易版) 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;

// 人数ごとの役職構成(3〜8人)。合計は必ず人数と一致する。
const ROLE_COUNT_TABLE = {
  3: { wolf: 1, seer: 1, villager: 1 },
  4: { wolf: 1, seer: 1, villager: 2 },
  5: { wolf: 1, seer: 1, villager: 3 },
  6: { wolf: 2, seer: 1, villager: 3 },
  7: { wolf: 2, seer: 1, villager: 4 },
  8: { wolf: 2, seer: 1, villager: 5 },
};

// Fisher-Yates シャッフル。rng は 0以上1未満の乱数を返す関数(テスト時に差し替え可能)
function shuffle(array, rng = Math.random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

// 人数nに対する役職構成を返す。3〜8の範囲外は最も近い対応人数にクランプする。
function roleCountsForPlayerCount(n) {
  const clamped = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, n));
  const counts = ROLE_COUNT_TABLE[clamped];
  return { wolf: counts.wolf, seer: counts.seer, villager: counts.villager };
}

// playerIds それぞれに役職('wolf'|'seer'|'villager')を割り当てる
function assignRoles(playerIds, rng = Math.random) {
  const counts = roleCountsForPlayerCount(playerIds.length);
  const shuffled = shuffle(playerIds, rng);
  const roleMap = {};
  let idx = 0;
  for (let i = 0; i < counts.wolf; i++) {
    roleMap[shuffled[idx]] = 'wolf';
    idx++;
  }
  for (let i = 0; i < counts.seer; i++) {
    roleMap[shuffled[idx]] = 'seer';
    idx++;
  }
  for (let i = 0; i < counts.villager; i++) {
    roleMap[shuffled[idx]] = 'villager';
    idx++;
  }
  return roleMap;
}

// 占い師が targetId を占った結果(人狼かどうか)を返す
function checkSeerResult(roleMap, targetId) {
  return roleMap[targetId] === 'wolf';
}

// votes: {voterId: votedForId} から集計し、最多得票者(同数ならrngでランダムに決定)を返す
function tallyVotes(votes, rng = Math.random) {
  const counts = {};
  Object.keys(votes).forEach((voterId) => {
    const votedForId = votes[voterId];
    counts[votedForId] = (counts[votedForId] || 0) + 1;
  });

  const candidateIds = Object.keys(counts);
  let maxCount = -Infinity;
  candidateIds.forEach((id) => {
    if (counts[id] > maxCount) maxCount = counts[id];
  });
  const tied = candidateIds.filter((id) => counts[id] === maxCount);

  let eliminatedId;
  if (tied.length === 1) {
    eliminatedId = tied[0];
  } else {
    const pickIndex = Math.floor(rng() * tied.length);
    eliminatedId = tied[pickIndex];
  }

  return { counts, eliminatedId };
}

// 追放されたプレイヤーが人狼だったかどうかで勝敗を判定する
function determineWinner(roleMap, eliminatedId) {
  return roleMap[eliminatedId] === 'wolf' ? 'villagers' : 'wolves';
}

// ================= ロビー名簿(純粋関数) =================

function addPlayer(roster, player) {
  if (roster.some((p) => p.id === player.id)) return roster;
  return roster.concat([player]);
}

function removePlayer(roster, id) {
  return roster.filter((p) => p.id !== id);
}

function hasMinPlayers(roster, min = MIN_PLAYERS) {
  return roster.length >= min;
}

const WerewolfLogicExports = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  ROLE_COUNT_TABLE,
  shuffle,
  roleCountsForPlayerCount,
  assignRoles,
  checkSeerResult,
  tallyVotes,
  determineWinner,
  addPlayer,
  removePlayer,
  hasMinPlayers,
};

if (typeof module !== 'undefined') {
  module.exports = WerewolfLogicExports;
}
if (typeof window !== 'undefined') {
  window.WerewolfLogic = WerewolfLogicExports;
}
