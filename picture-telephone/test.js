'use strict';
const assert = require('assert');
const L = require('./logic');

assert.deepStrictEqual([0, 1, 2, 3, 4].map(L.roundType), ['write', 'draw', 'write', 'draw', 'write']);
[2, 3, 4, 6].forEach((n) => {
  assert.strictEqual(L.totalRounds(n), n);
  for (let i = 0; i < n; i++) assert.strictEqual(L.chainIndexForPlayer(i, 0, n), i);
  for (let round = 0; round < n; round++) {
    const chains = Array.from({ length: n }, (_, i) => L.chainIndexForPlayer(i, round, n)).sort((a, b) => a - b);
    assert.deepStrictEqual(chains, Array.from({ length: n }, (_, i) => i));
  }
});
assert.strictEqual(L.validSegment({ x0: 0, y0: 320, x1: 160, y1: 1 }), true);
[-1, 321, NaN, Infinity].forEach((value) => assert.strictEqual(L.validSegment({ x0: value, y0: 0, x1: 1, y1: 1 }), false));
assert.strictEqual(L.validSegment({ x0: 0, y0: 0, x1: 1 }), false);
assert.strictEqual(L.validSegment(null), false);
assert.strictEqual(L.validSegment([]), false);
assert.strictEqual(L.validSegment('stroke'), false);
assert.strictEqual(L.validStrokes([]), true);
const segment = { x0: 0, y0: 0, x1: 1, y1: 1 };
assert.strictEqual(L.validStrokes([segment]), true);
assert.strictEqual(L.validStrokes(Array(L.MAX_SEGMENTS).fill(segment)), true);
assert.strictEqual(L.validStrokes(Array(L.MAX_SEGMENTS + 1).fill(segment)), false);
assert.strictEqual(L.validStrokes({}), false);
assert.strictEqual(L.normalizePhrase('  お題です  '), 'お題です');
assert.strictEqual(L.normalizePhrase('   '), '');
assert.strictEqual(L.normalizePhrase('あ'.repeat(30)), 'あ'.repeat(30));
assert.strictEqual(L.normalizePhrase('あ'.repeat(31)), 'あ'.repeat(30));
let roster = [];
roster = L.addPlayer(roster, { id: 'a', name: 'A' });
const same = L.addPlayer(roster, { id: 'a', name: '別名' });
assert.strictEqual(same, roster);
roster = L.addPlayer(roster, { id: 'b', name: 'B' });
assert.strictEqual(L.hasMinPlayers(roster), true);
roster = L.removePlayer(roster, 'a');
assert.deepStrictEqual(roster, [{ id: 'b', name: 'B' }]);
assert.strictEqual(L.hasMinPlayers(roster), false);
console.log('All tests passed');
