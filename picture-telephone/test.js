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

// canAcceptSubmit: submit検証の境界値。
const baseParams = {
  phase: 'playing', round: 1, currentRound: 1, senderId: 'p1',
  playerOrder: ['p1', 'p2', 'p3'], submittedIds: new Set(), assignment: { chainIndex: 0, type: 'write' },
};
assert.strictEqual(L.canAcceptSubmit(baseParams), true);
assert.strictEqual(L.canAcceptSubmit(Object.assign({}, baseParams, { phase: 'lobby' })), false);
assert.strictEqual(L.canAcceptSubmit(Object.assign({}, baseParams, { phase: 'reveal' })), false);
assert.strictEqual(L.canAcceptSubmit(Object.assign({}, baseParams, { round: 0 })), false);
assert.strictEqual(L.canAcceptSubmit(Object.assign({}, baseParams, { round: 2 })), false);
assert.strictEqual(L.canAcceptSubmit(Object.assign({}, baseParams, { senderId: 'stranger' })), false);
assert.strictEqual(L.canAcceptSubmit(Object.assign({}, baseParams, { submittedIds: new Set(['p1']) })), false);
assert.strictEqual(L.canAcceptSubmit(Object.assign({}, baseParams, { assignment: null })), false);
assert.strictEqual(L.canAcceptSubmit(null), false);

// missingPlayers: 未提出者の抽出(playerOrderの順序を保つ)。
assert.deepStrictEqual(L.missingPlayers(['p1', 'p2', 'p3'], new Set()), ['p1', 'p2', 'p3']);
assert.deepStrictEqual(L.missingPlayers(['p1', 'p2', 'p3'], new Set(['p2'])), ['p1', 'p3']);
assert.deepStrictEqual(L.missingPlayers(['p1', 'p2', 'p3'], new Set(['p1', 'p2', 'p3'])), []);

// MAX_SEGMENTS: 上限が実用的な値まで引き上げられていること(描き込みの多いユーザーが途中で描けなくなる不具合対策)。
assert.strictEqual(L.MAX_SEGMENTS >= 4000, true);

// undoLastStroke: 直近の1ストローク(pointerdown〜pointerupの一筆)だけを取り除く。非破壊であること。
const seg = (n) => ({ x0: n, y0: n, x1: n + 1, y1: n + 1 });
const strokesA = [seg(0), seg(1), seg(2), seg(3), seg(4)];
const boundariesA = [0, 3]; // 1本目: index0-2, 2本目: index3-4
const undone1 = L.undoLastStroke(strokesA, boundariesA);
assert.deepStrictEqual(undone1.strokes, [seg(0), seg(1), seg(2)]);
assert.deepStrictEqual(undone1.strokeBoundaries, [0]);
assert.deepStrictEqual(strokesA, [seg(0), seg(1), seg(2), seg(3), seg(4)]);
assert.deepStrictEqual(boundariesA, [0, 3]);
const undone2 = L.undoLastStroke(undone1.strokes, undone1.strokeBoundaries);
assert.deepStrictEqual(undone2.strokes, []);
assert.deepStrictEqual(undone2.strokeBoundaries, []);
const undone3 = L.undoLastStroke(undone2.strokes, undone2.strokeBoundaries);
assert.deepStrictEqual(undone3.strokes, []);
assert.deepStrictEqual(undone3.strokeBoundaries, []);
assert.deepStrictEqual(L.undoLastStroke([], []), { strokes: [], strokeBoundaries: [] });
assert.deepStrictEqual(L.undoLastStroke(null, null), { strokes: [], strokeBoundaries: [] });

console.log('All tests passed');
