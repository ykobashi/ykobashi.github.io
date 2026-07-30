const assert = require('node:assert');
const L = require('./logic.js');

// ---- 単語バンク ----
assert.ok(L.WORD_BANK.length >= 60, 'バンクは60語以上必要: ' + L.WORD_BANK.length);
L.WORD_BANK.forEach((entry) => {
  assert.ok(typeof entry.word === 'string' && entry.word.length > 0, '見出し語が必要: ' + JSON.stringify(entry));
  assert.ok(typeof entry.reading === 'string' && entry.reading.length > 0, '読み仮名が必要: ' + JSON.stringify(entry));
  assert.ok(typeof entry.meaning === 'string' && entry.meaning.length > 0, '意味説明が必要: ' + JSON.stringify(entry));
});
assert.strictEqual(new Set(L.WORD_BANK.map((e) => e.word)).size, L.WORD_BANK.length, '見出し語が重複している');

// ---- shuffle ----
assert.deepStrictEqual(L.shuffle([1, 2, 3], () => 0), [2, 3, 1]);

// ---- selectRoundWord(重複防止) ----
{
  const bank = [{ word: 'A' }, { word: 'B' }, { word: 'C' }];
  const first = L.selectRoundWord(() => 0, bank, []);
  assert.strictEqual(first.entry.word, 'A');
  assert.deepStrictEqual(first.usedWords, ['A']);

  const second = L.selectRoundWord(() => 0, bank, first.usedWords);
  assert.strictEqual(second.entry.word, 'B');
  assert.deepStrictEqual(second.usedWords, ['A', 'B']);

  const third = L.selectRoundWord(() => 0, bank, second.usedWords);
  assert.strictEqual(third.entry.word, 'C');
  assert.deepStrictEqual(third.usedWords, ['A', 'B', 'C']);

  // 全て出題済み -> 履歴をリセットしてバンク全体から選び直す
  const fourth = L.selectRoundWord(() => 0, bank, third.usedWords);
  assert.strictEqual(fourth.entry.word, 'A');
  assert.deepStrictEqual(fourth.usedWords, ['A']);
}

// ---- buildChoices ----
{
  const correct = L.WORD_BANK[0];
  const choices = L.buildChoices(correct, L.WORD_BANK, () => 0.99);
  assert.strictEqual(choices.length, L.CHOICE_COUNT);
  assert.strictEqual(new Set(choices).size, L.CHOICE_COUNT, '選択肢が重複している');
  assert.ok(choices.includes(correct.word), '正解の見出し語が選択肢に含まれていない');
}

// ---- judgeAnswer ----
assert.strictEqual(L.judgeAnswer('忌憚', '忌憚'), true);
assert.strictEqual(L.judgeAnswer('杞憂', '忌憚'), false);
assert.strictEqual(L.judgeAnswer(null, '忌憚'), false);
assert.strictEqual(L.judgeAnswer(undefined, '忌憚'), false);

// ---- tallyRoundAnswers / computeRoundScoreDeltas / applyScoreDeltas ----
{
  const answers = { a: '忌憚', b: '杞憂', c: '忌憚' };
  const tally = L.tallyRoundAnswers(answers, '忌憚');
  assert.deepStrictEqual(tally.correctIds.sort(), ['a', 'c']);

  const deltas = L.computeRoundScoreDeltas(tally);
  assert.deepStrictEqual(deltas, { a: L.CORRECT_POINTS, c: L.CORRECT_POINTS });

  const scores = L.applyScoreDeltas({ a: 1000, b: 500 }, deltas);
  assert.deepStrictEqual(scores, { a: 2000, b: 500, c: 1000 });
}

// ---- buildScoreboard(同点は同順位) ----
{
  const roster = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
    { id: 'd', name: 'D' },
  ];
  const scores = { a: 3000, b: 2000, c: 2000, d: 0 };
  const board = L.buildScoreboard(scores, roster);
  assert.deepStrictEqual(board.map((r) => r.id), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(board.map((r) => r.rank), [1, 2, 2, 4]);

  const winners = L.getWinners(board);
  assert.deepStrictEqual(winners.map((w) => w.id), ['a']);

  // 全員同点の場合は全員1位
  const tiedBoard = L.buildScoreboard({ a: 1000, b: 1000, c: 1000, d: 1000 }, roster);
  assert.deepStrictEqual(tiedBoard.map((r) => r.rank), [1, 1, 1, 1]);
  assert.strictEqual(L.getWinners(tiedBoard).length, 4);
}

// ---- ロビー名簿 ----
{
  let roster = [];
  roster = L.addPlayer(roster, { id: 'a', name: 'A' });
  roster = L.addPlayer(roster, { id: 'a', name: 'A' }); // 重複追加は無視
  assert.strictEqual(roster.length, 1);
  assert.strictEqual(L.hasMinPlayers(roster), false);

  roster = L.addPlayer(roster, { id: 'b', name: 'B' });
  assert.strictEqual(L.hasMinPlayers(roster), true);

  roster = L.removePlayer(roster, 'a');
  assert.deepStrictEqual(roster, [{ id: 'b', name: 'B' }]);
}

// ---- 定数 ----
assert.strictEqual(L.MIN_PLAYERS, 2);
assert.strictEqual(L.ROUND_TOTAL, 8);
assert.strictEqual(L.CHOICE_COUNT, 4);

console.log('All tests passed');
