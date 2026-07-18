// logic.js - インサイダーゲーム 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 3;

const TOPIC_BANK = [
  '新幹線',
  '花火大会',
  '温泉',
  '観覧車',
  '寿司',
  'ラーメン',
  '富士山',
  '桜',
  'コンビニ',
  '図書館',
  '花見',
  '初詣',
  '盆踊り',
  '相撲',
  '書道',
  '折り紙',
  '茶道',
  '甲子園',
  '駅弁',
  '花火',
  '縁日',
  '銭湯',
  '運動会',
];

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

// お題バンクから1つランダムに選ぶ
function pickTopic(rng = Math.random, bank = TOPIC_BANK) {
  const index = Math.floor(rng() * bank.length);
  return bank[index];
}

// playerIds をシャッフルし、先頭を'master'、2番目を'insider'、残りを'commoner'とする
// 戻り値: { playerId: 'master' | 'insider' | 'commoner' }
function assignInsiderRoles(playerIds, rng = Math.random) {
  const shuffled = shuffle(playerIds, rng);
  const roles = {};
  shuffled.forEach((id, i) => {
    if (i === 0) {
      roles[id] = 'master';
    } else if (i === 1) {
      roles[id] = 'insider';
    } else {
      roles[id] = 'commoner';
    }
  });
  return roles;
}

// votes: { voterId: votedForId }, insiderId: 実際のインサイダーのid
// 戻り値: { counts: { votedForId: count }, correctVoterIds: string[] }
function tallyInsiderVotes(votes, insiderId) {
  const counts = {};
  const correctVoterIds = [];
  Object.keys(votes).forEach((voterId) => {
    const votedForId = votes[voterId];
    counts[votedForId] = (counts[votedForId] || 0) + 1;
    if (votedForId === insiderId) {
      correctVoterIds.push(voterId);
    }
  });
  return { counts, correctVoterIds };
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

const InsiderGameLogicExports = {
  MIN_PLAYERS,
  TOPIC_BANK,
  shuffle,
  pickTopic,
  assignInsiderRoles,
  tallyInsiderVotes,
  addPlayer,
  removePlayer,
  hasMinPlayers,
};

if (typeof module !== 'undefined') {
  module.exports = InsiderGameLogicExports;
}
if (typeof window !== 'undefined') {
  window.InsiderGameLogic = InsiderGameLogicExports;
}
