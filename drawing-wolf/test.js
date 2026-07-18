// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  MIN_PLAYERS,
  ROUNDS,
  TOPIC_BANK,
  shuffle,
  pickTopic,
  assignWolf,
  buildTurnOrder,
  totalTurns,
  currentTurnInfo,
  normalizeAnswer,
  isCorrectGuess,
  tallyVotes,
  determineWolfCaught,
  addPlayer,
  removePlayer,
  hasMinPlayers,
} = require('./logic.js');

// 決定論的な擬似乱数(テスト用)。常に同じシーケンスを返す
function makeSeededRng(seedSeq) {
  let i = 0;
  return () => seedSeq[i++ % seedSeq.length];
}

// TOPIC_BANK: 十分な件数があり、いずれも空でない文字列
assert.ok(TOPIC_BANK.length >= 10, 'TOPIC_BANK should have at least 10 entries');
TOPIC_BANK.forEach((topic) => {
  assert.strictEqual(typeof topic, 'string');
  assert.ok(topic.length > 0);
});
assert.strictEqual(new Set(TOPIC_BANK).size, TOPIC_BANK.length, 'TOPIC_BANK should have no duplicates');

// shuffle: 同じ要素数・同じ要素集合を保つ、元の配列を破壊しない
{
  const original = [1, 2, 3, 4, 5];
  const shuffled = shuffle(original, makeSeededRng([0.9, 0.1, 0.5, 0.3, 0.7]));
  assert.strictEqual(shuffled.length, original.length);
  assert.deepStrictEqual(shuffled.slice().sort((a, b) => a - b), original);
  assert.deepStrictEqual(original, [1, 2, 3, 4, 5]);
}

// pickTopic: 常にbank内のエントリを返す
{
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    const topic = pickTopic(() => r, TOPIC_BANK);
    assert.ok(TOPIC_BANK.includes(topic));
  }
}

// assignWolf: 常にplayerIdsのいずれかを返す
{
  const playerIds = ['a', 'b', 'c', 'd'];
  for (const r of [0, 0.3, 0.6, 0.99]) {
    const wolfId = assignWolf(playerIds, () => r);
    assert.ok(playerIds.includes(wolfId));
  }
}

// buildTurnOrder: 全プレイヤーを含む並び替え
{
  const playerIds = ['a', 'b', 'c', 'd', 'e'];
  const order = buildTurnOrder(playerIds, Math.random);
  assert.strictEqual(order.length, playerIds.length);
  assert.deepStrictEqual(order.slice().sort(), playerIds.slice().sort());
}

// totalTurns: 人数 × ラウンド数
{
  assert.strictEqual(totalTurns(['a', 'b', 'c'], 3), 9);
  assert.strictEqual(totalTurns(['a', 'b', 'c', 'd'], ROUNDS), 12);
}

// currentTurnInfo: turnIndexから正しい描き手・ラウンド・最終ターン判定を返す
{
  const turnOrder = ['a', 'b', 'c'];
  assert.deepStrictEqual(currentTurnInfo(turnOrder, 0, 3), { playerId: 'a', round: 1, turnInRound: 1, isLastTurn: false });
  assert.deepStrictEqual(currentTurnInfo(turnOrder, 2, 3), { playerId: 'c', round: 1, turnInRound: 3, isLastTurn: false });
  assert.deepStrictEqual(currentTurnInfo(turnOrder, 3, 3), { playerId: 'a', round: 2, turnInRound: 1, isLastTurn: false });
  assert.deepStrictEqual(currentTurnInfo(turnOrder, 8, 3), { playerId: 'c', round: 3, turnInRound: 3, isLastTurn: true });
  assert.strictEqual(currentTurnInfo(turnOrder, 9, 3), null);
  assert.strictEqual(currentTurnInfo(turnOrder, -1, 3), null);
}

// normalizeAnswer / isCorrectGuess: 表記ゆれを無視して比較する
{
  assert.strictEqual(normalizeAnswer('  りんご  '), 'りんご');
  assert.strictEqual(normalizeAnswer('リンゴ'), 'りんご');
  assert.strictEqual(normalizeAnswer('雪だるま'), '雪だるま');

  assert.strictEqual(isCorrectGuess('りんご', 'りんご'), true);
  assert.strictEqual(isCorrectGuess('リンゴ', 'りんご'), true);
  assert.strictEqual(isCorrectGuess('  りんご  ', 'りんご'), true);
  assert.strictEqual(isCorrectGuess('バナナ', 'りんご'), false);
  assert.strictEqual(isCorrectGuess('', 'りんご'), false);
  assert.strictEqual(isCorrectGuess('   ', 'りんご'), false);
}

// tallyVotes: 得票数を集計し、最多得票者を返す
{
  const votes = { a: 'x', b: 'x', c: 'y' };
  const result = tallyVotes(votes);
  assert.deepStrictEqual(result.counts, { x: 2, y: 1 });
  assert.deepStrictEqual(result.selectedIds, ['x']);
  assert.strictEqual(result.isTie, false);
}

// tallyVotes: 同数トップはisTie=true
{
  const votes = { a: 'x', b: 'y' };
  const result = tallyVotes(votes);
  assert.deepStrictEqual(result.counts, { x: 1, y: 1 });
  assert.strictEqual(result.selectedIds.length, 2);
  assert.strictEqual(result.isTie, true);
}

// tallyVotes: 投票が空でもエラーにならない
{
  const result = tallyVotes({});
  assert.deepStrictEqual(result.counts, {});
  assert.deepStrictEqual(result.selectedIds, []);
  assert.strictEqual(result.isTie, true);
}

// determineWolfCaught: 人狼が最多得票なら見破られた判定
{
  const tally = { counts: { wolf: 3, other: 1 }, selectedIds: ['wolf'], isTie: false };
  assert.strictEqual(determineWolfCaught(tally, 'wolf'), true);
  assert.strictEqual(determineWolfCaught(tally, 'other'), false);
}

// determineWolfCaught: 同数トップの場合は見破られなかった判定
{
  const tally = { counts: { wolf: 2, other: 2 }, selectedIds: ['wolf', 'other'], isTie: true };
  assert.strictEqual(determineWolfCaught(tally, 'wolf'), false);
}

// ロビー名簿: addPlayer/removePlayer/hasMinPlayers
{
  let roster = [];
  roster = addPlayer(roster, { id: 'host', name: 'ホスト' });
  roster = addPlayer(roster, { id: 'p1', name: 'ゲスト1' });
  roster = addPlayer(roster, { id: 'p2', name: 'ゲスト2' });
  assert.strictEqual(roster.length, 3);

  // 同じidを重複追加しない
  roster = addPlayer(roster, { id: 'p1', name: '別名前' });
  assert.strictEqual(roster.length, 3);
  assert.strictEqual(roster.find((p) => p.id === 'p1').name, 'ゲスト1');

  assert.strictEqual(hasMinPlayers(roster, MIN_PLAYERS), true);
  assert.strictEqual(hasMinPlayers(roster.slice(0, 2), MIN_PLAYERS), false);

  roster = removePlayer(roster, 'p1');
  assert.strictEqual(roster.length, 2);
  assert.strictEqual(roster.some((p) => p.id === 'p1'), false);
}

console.log('All tests passed');
