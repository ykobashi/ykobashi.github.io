// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  MIN_PLAYERS,
  TOPIC_BANK,
  shuffle,
  pickTopic,
  assignInsiderRoles,
  tallyInsiderVotes,
  addPlayer,
  removePlayer,
  hasMinPlayers,
} = require('./logic.js');

// 決定論的な擬似乱数(テスト用)。常に同じシーケンスを返す
function makeSeededRng(seedSeq) {
  let i = 0;
  return () => seedSeq[i++ % seedSeq.length];
}

// TOPIC_BANK: 十分な件数があり、すべて文字列でユニークであること
assert.ok(TOPIC_BANK.length >= 15, 'TOPIC_BANK should have at least 15 entries');
TOPIC_BANK.forEach((topic) => {
  assert.strictEqual(typeof topic, 'string');
  assert.ok(topic.length > 0);
});
assert.strictEqual(new Set(TOPIC_BANK).size, TOPIC_BANK.length, 'TOPIC_BANK entries should be unique');

// shuffle: 同じ要素数・同じ要素集合を保つ
{
  const original = [1, 2, 3, 4, 5];
  const shuffled = shuffle(original, makeSeededRng([0.9, 0.1, 0.5, 0.3, 0.7]));
  assert.strictEqual(shuffled.length, original.length);
  assert.deepStrictEqual(shuffled.slice().sort((a, b) => a - b), original);
  // 元の配列を破壊しない
  assert.deepStrictEqual(original, [1, 2, 3, 4, 5]);
}

// pickTopic: 常にbank内のエントリを返す
{
  const bank = TOPIC_BANK;
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    const topic = pickTopic(() => r, bank);
    assert.ok(bank.includes(topic));
  }
}

// assignInsiderRoles: 常にmaster1人・insider1人・残り全員commonerであること
function assertValidRoleAssignment(playerIds, roles) {
  const ids = Object.keys(roles);
  assert.strictEqual(ids.length, playerIds.length);
  playerIds.forEach((id) => {
    assert.ok(['master', 'insider', 'commoner'].includes(roles[id]));
  });
  const masters = ids.filter((id) => roles[id] === 'master');
  const insiders = ids.filter((id) => roles[id] === 'insider');
  const commoners = ids.filter((id) => roles[id] === 'commoner');
  assert.strictEqual(masters.length, 1, 'exactly one master');
  assert.strictEqual(insiders.length, 1, 'exactly one insider');
  assert.strictEqual(commoners.length, playerIds.length - 2, 'the rest are commoners');
  // マスターとインサイダーは別人であること
  assert.notStrictEqual(masters[0], insiders[0]);
}

[3, 4, 6, 8].forEach((count) => {
  const playerIds = [];
  for (let i = 0; i < count; i++) playerIds.push('p' + i);

  // Math.random での複数回試行
  for (let trial = 0; trial < 20; trial++) {
    const roles = assignInsiderRoles(playerIds, Math.random);
    assertValidRoleAssignment(playerIds, roles);
  }

  // 決定論的なシード付きrngでも成立すること
  const seededRoles = assignInsiderRoles(playerIds, makeSeededRng([0.05, 0.95, 0.4, 0.6, 0.15, 0.85, 0.33, 0.66]));
  assertValidRoleAssignment(playerIds, seededRoles);
});

// tallyInsiderVotes: 得票数を正しく集計し、正解者を正しく判定する
{
  const votes = {
    a: 'x',
    b: 'x',
    c: 'y',
    d: 'x',
  };
  const insiderId = 'x';
  const result = tallyInsiderVotes(votes, insiderId);
  assert.deepStrictEqual(result.counts, { x: 3, y: 1 });
  assert.deepStrictEqual(result.correctVoterIds.slice().sort(), ['a', 'b', 'd']);
}

// tallyInsiderVotes: 同数得票(タイ)でもcountsをそのまま返す
{
  const votes = {
    a: 'x',
    b: 'y',
    c: 'x',
    d: 'y',
  };
  const insiderId = 'y';
  const result = tallyInsiderVotes(votes, insiderId);
  assert.deepStrictEqual(result.counts, { x: 2, y: 2 });
  assert.deepStrictEqual(result.correctVoterIds.slice().sort(), ['b', 'd']);
}

// tallyInsiderVotes: 誰もインサイダーに投票しなかった場合、correctVoterIdsは空配列
{
  const votes = { a: 'x', b: 'x' };
  const insiderId = 'z';
  const result = tallyInsiderVotes(votes, insiderId);
  assert.deepStrictEqual(result.counts, { x: 2 });
  assert.deepStrictEqual(result.correctVoterIds, []);
}

// tallyInsiderVotes: 投票が空の場合
{
  const result = tallyInsiderVotes({}, 'x');
  assert.deepStrictEqual(result.counts, {});
  assert.deepStrictEqual(result.correctVoterIds, []);
}

// ロビー名簿: addPlayer/removePlayer/hasMinPlayers
{
  let roster = [];
  roster = addPlayer(roster, { id: 'host', name: 'ホスト' });
  roster = addPlayer(roster, { id: 'p1', name: 'ゲスト1' });
  assert.strictEqual(roster.length, 2);

  // 同じidを重複追加しない
  roster = addPlayer(roster, { id: 'p1', name: '別名前' });
  assert.strictEqual(roster.length, 2);
  assert.strictEqual(roster.find((p) => p.id === 'p1').name, 'ゲスト1');

  assert.strictEqual(hasMinPlayers(roster, MIN_PLAYERS), false); // 2人はMIN_PLAYERS(3)未満

  roster = addPlayer(roster, { id: 'p2', name: 'ゲスト2' });
  assert.strictEqual(hasMinPlayers(roster, MIN_PLAYERS), true);

  roster = removePlayer(roster, 'p1');
  assert.strictEqual(roster.length, 2);
  assert.strictEqual(hasMinPlayers(roster, MIN_PLAYERS), false);
}

console.log('All tests passed');
