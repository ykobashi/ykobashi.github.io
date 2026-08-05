const assert = require('assert');
const L = require('./logic.js');
const rng = (values) => { let i = 0; return () => values[i++ % values.length]; };
assert.ok(L.TOPIC_BANK.length >= 40); assert.strictEqual(new Set(L.TOPIC_BANK).size, L.TOPIC_BANK.length);
const topics = L.selectRoundTopic(rng([0]), ['a','b'], ['a']); assert.deepStrictEqual(topics, { topic:'b', usedTopics:['a','b'] });
assert.deepStrictEqual(L.selectRoundTopic(rng([0]), ['a','b'], ['a','b']), { topic:'a', usedTopics:['a'] });
const order = L.buildTurnOrder(['a','b','c'], rng([0.4])); assert.deepStrictEqual(order.slice().sort(), ['a','b','c']); assert.strictEqual(L.totalTurns(order), 9);
assert.deepStrictEqual(L.currentTurnInfo(['a','b'], 3, 3), { playerId:'b', round:2, turnInRound:2, isLastTurn:false }); assert.strictEqual(L.currentTurnInfo([], 0), null); assert.strictEqual(L.currentTurnInfo(['a'], 3, 3), null);
assert.strictEqual(L.normalizeAnswer('  リン ゴー '), 'りんご'); assert.ok(L.isCorrectGuess('リンゴ', 'りんご')); assert.ok(!L.isCorrectGuess('', 'りんご'));
// 漢字のお題でも、ひらがな/カタカナ読みの回答をANSWER_ALIASES経由で正解にできる
assert.ok(L.isCorrectGuess('いぬ', '犬')); assert.ok(L.isCorrectGuess('イヌ', '犬')); assert.ok(!L.isCorrectGuess('ねこ', '犬'));
assert.ok(L.isCorrectGuess('じてんしゃ', '自転車')); assert.ok(L.isCorrectGuess('ふじさん', '富士山'));
L.TOPIC_BANK.filter((t) => /[一-龯]/.test(t)).forEach((t) => { assert.ok(L.ANSWER_ALIASES[t], '漢字を含むお題「' + t + '」にひらがな読みのエイリアスが必要'); });
const segments = [{strokeId:1},{strokeId:1},{strokeId:2},{strokeId:2}]; assert.deepStrictEqual(L.undoLastStroke(segments), [{strokeId:1},{strokeId:1}]); assert.strictEqual(segments.length, 4);
assert.deepStrictEqual(L.applyScoreDeltas({a:1,b:0}, {a:1,c:2}), {a:2,b:0,c:2});
const board = L.buildScoreboard({a:2,b:2,c:0}, [{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}]); assert.deepStrictEqual(board.map((x) => x.rank), [1,1,3]); assert.deepStrictEqual(L.getWinners(board).map((x) => x.id).sort(), ['a','b']);
let roster = L.addPlayer([], {id:'a',name:'A'}); roster = L.addPlayer(roster, {id:'a',name:'AA'}); assert.strictEqual(roster.length, 1); roster = L.addPlayer(roster,{id:'b',name:'B'}); assert.ok(L.hasMinPlayers(roster)); assert.deepStrictEqual(L.removePlayer(roster,'a').map((x) => x.id), ['b']);
console.log('All tests passed');
