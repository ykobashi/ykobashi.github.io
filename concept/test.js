const assert = require('node:assert'); const L = require('./logic'); assert.equal(L.isValidPinKey('color-0'), true); assert.equal(L.isValidPinKey('none-0'), false); assert.equal(L.isValidPinKey('color-999'), false); assert.equal(L.isValidPinKey('color'), false); assert.equal(L.nextCluegiverIndex(3,4),0); L.BOARD_CATEGORIES.forEach((c) => { assert.equal(new Set(c.icons).size, c.icons.length, c.id + ' has duplicate icons'); });

// selectRoundTopic: used に無い語だけが候補になる
const bank3 = ['a', 'b', 'c'];
const sel1 = L.selectRoundTopic(() => 0, bank3, ['a', 'b']);
assert.equal(sel1.topic, 'c');
assert.deepEqual(sel1.used, ['a', 'b', 'c']);

// プールが尽きたら used がリセットされて1件になる
const sel2 = L.selectRoundTopic(() => 0, bank3, ['a', 'b', 'c']);
assert.equal(bank3.includes(sel2.topic), true);
assert.deepEqual(sel2.used, [sel2.topic]);

// 返り値 used の長さが呼ぶたびに1ずつ増える
let usedTopics = [];
for (let i = 0; i < bank3.length; i++) {
  const sel = L.selectRoundTopic(Math.random, bank3, usedTopics);
  assert.equal(sel.used.length, usedTopics.length + 1);
  usedTopics = sel.used;
}

// buildScoreboard: 同点同順位(標準競技順位方式)
const roster = [{ id: 'a', name: 'Aさん' }, { id: 'b', name: 'Bさん' }, { id: 'c', name: 'Cさん' }];
const board = L.buildScoreboard({ a: 2, b: 2, c: 1 }, roster);
assert.deepEqual(board.map((r) => r.rank), [1, 1, 3]);
const winners = L.getWinners(board);
assert.equal(winners.length, 2);

console.log('All tests passed');
