const assert = require('node:assert');
const L = require('./logic.js');

// ---- EXPRESSION_BANK ----
assert.strictEqual(L.EXPRESSION_BANK.length, 30, 'バンクは30件必要: ' + L.EXPRESSION_BANK.length);
assert.strictEqual(new Set(L.EXPRESSION_BANK.map((e) => e.id)).size, L.EXPRESSION_BANK.length, 'idが重複している');
L.EXPRESSION_BANK.forEach((entry) => {
  assert.ok(typeof entry.image === 'string' && entry.image.length > 0, '画像パスが必要: ' + JSON.stringify(entry));
  assert.ok(typeof entry.correctScenario === 'string' && entry.correctScenario.length > 0, '正解シナリオが必要: ' + JSON.stringify(entry));
  assert.strictEqual(entry.decoyScenarios.length, 3, '誤答はちょうど3件必要: ' + JSON.stringify(entry));
  entry.decoyScenarios.forEach((s) => {
    assert.ok(typeof s === 'string' && s.length > 0, '誤答シナリオが空: ' + JSON.stringify(entry));
  });
});
// 全パターンを通して正解+誤答の文字列がバンク全体で重複していない
{
  const allScenarios = [];
  L.EXPRESSION_BANK.forEach((entry) => {
    allScenarios.push(entry.correctScenario, ...entry.decoyScenarios);
  });
  assert.strictEqual(new Set(allScenarios).size, allScenarios.length, 'シナリオ文が重複している');
}

// ---- shuffle ----
assert.deepStrictEqual(L.shuffle([1, 2, 3], () => 0), [2, 3, 1]);

// ---- selectRoundEntry(重複防止) ----
{
  const bank = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const first = L.selectRoundEntry(() => 0, bank, []);
  assert.strictEqual(first.entry.id, 'a');
  assert.deepStrictEqual(first.usedIds, ['a']);

  const second = L.selectRoundEntry(() => 0, bank, first.usedIds);
  assert.strictEqual(second.entry.id, 'b');
  assert.deepStrictEqual(second.usedIds, ['a', 'b']);

  const third = L.selectRoundEntry(() => 0, bank, second.usedIds);
  assert.strictEqual(third.entry.id, 'c');
  assert.deepStrictEqual(third.usedIds, ['a', 'b', 'c']);

  // 全て出題済み -> 履歴をリセットしてバンク全体から選び直す
  const fourth = L.selectRoundEntry(() => 0, bank, third.usedIds);
  assert.strictEqual(fourth.entry.id, 'a');
  assert.deepStrictEqual(fourth.usedIds, ['a']);
}

// ---- buildChoices ----
{
  const entry = L.EXPRESSION_BANK[0];
  const choices = L.buildChoices(entry, () => 0.99);
  assert.strictEqual(choices.length, 4);
  assert.strictEqual(new Set(choices).size, 4, '選択肢が重複している');
  assert.ok(choices.includes(entry.correctScenario), '正解シナリオが選択肢に含まれていない');

  const deterministic1 = L.buildChoices(entry, () => 0.5);
  const deterministic2 = L.buildChoices(entry, () => 0.5);
  assert.deepStrictEqual(deterministic1, deterministic2, '同じrngで結果が変わる');
}

// ---- judgeAnswer ----
assert.strictEqual(L.judgeAnswer('虫が急に目の前に飛んできて驚いた', '虫が急に目の前に飛んできて驚いた'), true);
assert.strictEqual(L.judgeAnswer('宝くじの高額当選が判明して驚いた', '虫が急に目の前に飛んできて驚いた'), false);
assert.strictEqual(L.judgeAnswer(null, '虫が急に目の前に飛んできて驚いた'), false);
assert.strictEqual(L.judgeAnswer(undefined, '虫が急に目の前に飛んできて驚いた'), false);

// ---- allImagePaths ----
{
  const paths = L.allImagePaths(L.EXPRESSION_BANK);
  assert.strictEqual(paths.length, L.EXPRESSION_BANK.length);
  L.EXPRESSION_BANK.forEach((entry) => {
    assert.ok(paths.includes(entry.image));
  });
}

// ---- tallyRoundAnswers / computeRoundScoreDeltas / applyScoreDeltas ----
{
  const answers = { a: '正解', b: '誤答', c: '正解' };
  const tally = L.tallyRoundAnswers(answers, '正解');
  assert.deepStrictEqual(tally.correctIds.sort(), ['a', 'c']);

  const deltas = L.computeRoundScoreDeltas(tally);
  assert.deepStrictEqual(deltas, { a: L.CORRECT_POINTS, c: L.CORRECT_POINTS });

  const scores = L.applyScoreDeltas({ a: 1000 }, deltas);
  assert.deepStrictEqual(scores, { a: 2000, c: 1000 });
}

// ---- buildScoreboard / getWinners ----
{
  const roster = [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cara' }];
  const scores = { a: 2000, b: 1000, c: 2000 };
  const scoreboard = L.buildScoreboard(scores, roster);
  assert.deepStrictEqual(scoreboard.map((r) => r.rank), [1, 1, 3]);
  const winners = L.getWinners(scoreboard);
  assert.deepStrictEqual(winners.map((w) => w.id).sort(), ['a', 'c']);
}

// ---- ロビー名簿 ----
{
  let roster = [];
  roster = L.addPlayer(roster, { id: 'a', name: 'Alice' });
  roster = L.addPlayer(roster, { id: 'a', name: 'Alice' }); // 重複追加は無視
  assert.strictEqual(roster.length, 1);
  assert.strictEqual(L.hasMinPlayers(roster), false);
  roster = L.addPlayer(roster, { id: 'b', name: 'Bob' });
  assert.strictEqual(L.hasMinPlayers(roster), true);
  roster = L.removePlayer(roster, 'a');
  assert.strictEqual(roster.length, 1);
}

console.log('All tests passed');
