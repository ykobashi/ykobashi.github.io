const assert = require('node:assert'); const L = require('./logic');
assert.equal(L.normalizeClue(' リンゴー '), 'りんご'); assert.equal(L.isCorrectGuess('ﾘﾝｺﾞ', 'りんご'), true); const result = L.filterValidClues([{authorId:'a',text:'りんご'},{authorId:'b',text:'リンゴ'},{authorId:'c',text:'ねこ'},{authorId:'d',text:''}]); assert.deepEqual(result, [{authorId:'c',text:'ねこ'}]);

// selectRoundWord: used に無い語だけが候補になる
const bank3 = ['a', 'b', 'c'];
const sel1 = L.selectRoundWord(() => 0, bank3, ['a', 'b']);
assert.equal(sel1.word, 'c');
assert.deepEqual(sel1.used, ['a', 'b', 'c']);

// プールが尽きたら used がリセットされて1件になる
const sel2 = L.selectRoundWord(() => 0, bank3, ['a', 'b', 'c']);
assert.equal(bank3.includes(sel2.word), true);
assert.deepEqual(sel2.used, [sel2.word]);

// 返り値 used の長さが呼ぶたびに1ずつ増える
let usedWords = [];
for (let i = 0; i < bank3.length; i++) {
  const sel = L.selectRoundWord(Math.random, bank3, usedWords);
  assert.equal(sel.used.length, usedWords.length + 1);
  usedWords = sel.used;
}

console.log('All tests passed');
