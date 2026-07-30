const assert = require('assert');
const { WORD_PAIRS, createRound, selectWordPair, buildSpeakingOrder, tallyVotes, hasMinPlayers, normalizeAnswer, isCorrectAnswer } = require('./logic.js');

assert.ok(WORD_PAIRS.length >= 15);
const round = createRound(['a', 'b', 'c', 'd'], () => 0);
assert.strictEqual(Object.keys(round.words).length, 4);
assert.strictEqual(Object.values(round.words).filter((word) => word === round.wolfWord).length, 1);
assert.strictEqual(Object.values(round.words).filter((word) => word === round.citizenWord).length, 3);
assert.throws(() => createRound(['a', 'b']), /3人/);
assert.deepStrictEqual(tallyVotes({ a: 'x', b: 'x', c: 'y' }), { counts: { x: 2, y: 1 }, selectedIds: ['x'], isTie: false });
assert.deepStrictEqual(tallyVotes({ a: 'x', b: 'y' }).isTie, true);
assert.strictEqual(hasMinPlayers([{},{},{}]), true);
assert.strictEqual(normalizeAnswer(' スシ '), 'すし');
assert.strictEqual(isCorrectAnswer('すし', '寿司'), true);
assert.strictEqual(isCorrectAnswer('スシ', '寿司'), true);
assert.strictEqual(isCorrectAnswer('やきにく', '寿司'), false);
assert.strictEqual(isCorrectAnswer('りょこう', '旅行'), true);
assert.strictEqual(isCorrectAnswer('ゆうがた', '夕方'), true);

// selectWordPair: usedにない組だけが候補になる
{
  const pairs = [['a', 'b'], ['c', 'd'], ['e', 'f']];
  const used = ['a|b'];
  for (const r of [0, 0.4, 0.9]) {
    const result = selectWordPair(() => r, pairs, used);
    assert.ok(['c|d', 'e|f'].includes(result.pair[0] + '|' + result.pair[1]));
    assert.deepStrictEqual(result.used, used.concat([result.pair[0] + '|' + result.pair[1]]));
  }
}

// selectWordPair: プールが尽きたら履歴がリセットされて1件になる
{
  const pairs = [['a', 'b'], ['c', 'd']];
  const used = ['a|b', 'c|d'];
  const result = selectWordPair(() => 0.5, pairs, used);
  assert.strictEqual(result.used.length, 1);
}

// selectWordPair: 返り値のusedの長さは呼ぶたびに1ずつ増える
{
  let used = [];
  for (let i = 0; i < WORD_PAIRS.length; i++) {
    const result = selectWordPair(Math.random, WORD_PAIRS, used);
    assert.strictEqual(result.used.length, i + 1);
    used = result.used;
  }
}

// createRound: 第4引数usedを渡すと、返り値usedPairsに反映される
{
  const round = createRound(['a', 'b', 'c'], () => 0, WORD_PAIRS, []);
  assert.strictEqual(round.usedPairs.length, 1);
  const round2 = createRound(['a', 'b', 'c'], () => 0, WORD_PAIRS, round.usedPairs);
  assert.strictEqual(round2.usedPairs.length, 2);
}

// buildSpeakingOrder: 全員分揃う・重複なし
const players = ['a', 'b', 'c', 'd', 'e'];
const order = buildSpeakingOrder(players, () => 0.5);
assert.strictEqual(order.length, players.length);
assert.deepStrictEqual([...order].sort(), [...players].sort());
assert.strictEqual(new Set(order).size, players.length);

// buildSpeakingOrder: 非破壊(元の配列を変更しない)
const originalPlayers = ['a', 'b', 'c', 'd'];
const snapshot = originalPlayers.slice();
buildSpeakingOrder(originalPlayers);
assert.deepStrictEqual(originalPlayers, snapshot);

// buildSpeakingOrder: 複数回呼ぶと異なる並びが統計的に出る
const seenOrders = new Set();
for (let i = 0; i < 30; i++) seenOrders.add(buildSpeakingOrder(['a', 'b', 'c', 'd', 'e']).join(','));
assert.ok(seenOrders.size > 1, '複数回シャッフルしても並びが常に同じです');

// buildSpeakingOrder: 境界値(0〜2人)
assert.deepStrictEqual(buildSpeakingOrder([]), []);
assert.deepStrictEqual(buildSpeakingOrder(['a']), ['a']);
assert.deepStrictEqual(buildSpeakingOrder(['a', 'b']).slice().sort(), ['a', 'b']);

console.log('All tests passed');
