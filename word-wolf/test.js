const assert = require('assert');
const { WORD_PAIRS, createRound, tallyVotes, hasMinPlayers, normalizeAnswer, isCorrectAnswer } = require('./logic.js');

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
console.log('All tests passed');
