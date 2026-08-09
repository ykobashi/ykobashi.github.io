const assert = require('node:assert');
const L = require('./logic.js');

// ---- ROUND_BANK ----
assert.strictEqual(L.ROUND_BANK.length, L.ROUND_TOTAL);
assert.strictEqual(new Set(L.ROUND_BANK.map((round) => round.id)).size, L.ROUND_TOTAL);
L.ROUND_BANK.forEach((round) => {
  assert.ok(round.image && round.imageAlt);
  assert.strictEqual(round.statements.length, 9);
  round.statements.forEach((statement) => {
    assert.strictEqual(typeof statement.text, 'string');
    assert.strictEqual(typeof statement.isTrue, 'boolean');
  });
});

// ---- shuffle / selectRounds ----
assert.deepStrictEqual(L.shuffle([1, 2, 3], () => 0), [2, 3, 1]);
{
  const bank = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const selected = L.selectRounds(() => 0, bank);
  assert.deepStrictEqual(selected.map((entry) => entry.id), ['b', 'c', 'a']);
  assert.deepStrictEqual(bank.map((entry) => entry.id), ['a', 'b', 'c']);
}

// ---- 3x3の8ライン ----
assert.deepStrictEqual(L.computeBingoLines(), [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]);

// ---- computeBingoScoreDelta ----
// ビンゴは「そのラインの3マスを実際の真偽どおりに正しく判定できたか」だけで決まる。
// 3マスの中身がtrue/falseどちらでも構わない(true/falseが混在したラインは
// 全部正しく判定できてもビンゴにはならない、という不自然さを解消したルール)。
{
  const statements = [true, true, true, false, false, false, false, false, false]
    .map((isTrue, index) => ({ text: String(index), isTrue }));

  // 何もマークしない場合、後半2行(index3-5、index6-8)はどちらもfalseだけの行なので
  // 「正しく全部無視できた」ことになり、2ラインぶんビンゴが成立する
  const noMarks = L.computeBingoScoreDelta(statements, Array(9).fill(false));
  assert.deepStrictEqual(noMarks, { points: 16, correctCount: 6, incorrectIndexes: [0, 1, 2], bingoLineCount: 2 });

  // 2行目(index3-5)のうち1マスだけ誤ってマークすると、そのラインのビンゴは崩れる
  const oneWrong = L.computeBingoScoreDelta(statements, [false, false, false, true, false, false, false, false, false]);
  assert.deepStrictEqual(oneWrong, { points: 10, correctCount: 5, incorrectIndexes: [0, 1, 2, 3], bingoLineCount: 1 });

  // 9マス全問正解なら、内容に関わらずどのラインを見ても3マスとも正しく判定できているので
  // 8ライン全部がビンゴ扱いになる
  const perfect = L.computeBingoScoreDelta(statements, [true, true, true, false, false, false, false, false, false]);
  assert.deepStrictEqual(perfect, { points: 49, correctCount: 9, incorrectIndexes: [], bingoLineCount: 8 });
}

// 各ラウンドとも、9マス全問正解なら内容に関わらず必ず8ライン分のボーナスが乗る(=49点)
L.ROUND_BANK.forEach((round) => {
  const marks = round.statements.map((statement) => statement.isTrue);
  const result = L.computeBingoScoreDelta(round.statements, marks);
  assert.deepStrictEqual(result, { points: 49, correctCount: 9, incorrectIndexes: [], bingoLineCount: 8 }, round.id);
});

assert.throws(
  () => L.computeBingoScoreDelta(L.ROUND_BANK[0].statements, Array(8).fill(false)),
  /boolean\[9\]/
);
assert.throws(
  () => L.computeBingoScoreDelta(L.ROUND_BANK[0].statements, Array(9).fill('false')),
  /boolean\[9\]/
);

// ---- tallyRoundMarks / applyScoreDeltas ----
{
  const statements = L.ROUND_BANK[2].statements;
  const falseStatementCount = statements.filter((statement) => !statement.isTrue).length;
  const allFalseLineCount = L.computeBingoLines().filter((line) =>
    line.every((index) => !statements[index].isTrue)
  ).length;
  const trueMarks = statements.map((statement) => statement.isTrue);
  const falseMarks = Array(9).fill(false);
  const tally = L.tallyRoundMarks({ alice: trueMarks, bob: falseMarks }, statements);
  assert.strictEqual(tally.alice.correctCount, 9);
  assert.strictEqual(tally.alice.bingoLineCount, 8);
  assert.strictEqual(tally.bob.correctCount, falseStatementCount);
  assert.strictEqual(tally.bob.bingoLineCount, allFalseLineCount);
  assert.strictEqual(tally.bob.points, falseStatementCount + allFalseLineCount * L.BINGO_BONUS);
  assert.deepStrictEqual(
    L.applyScoreDeltas({ alice: 2, bob: -1 }, { alice: tally.alice.points, bob: tally.bob.points }),
    { alice: 2 + tally.alice.points, bob: -1 + tally.bob.points }
  );
  assert.throws(() => L.applyScoreDeltas({}, { alice: { points: 1 } }), /finite numbers/);
}

// 何もマークしなければfalseの文の数だけ基本点が入り、もし「3マスとも実際にfalse」の
// ラインがあれば、そこは正しく全部無視できたことになりビンゴボーナスも乗る
L.ROUND_BANK.forEach((round) => {
  const falseStatementCount = round.statements.filter((statement) => !statement.isTrue).length;
  const allFalseLineCount = L.computeBingoLines().filter((line) =>
    line.every((index) => !round.statements[index].isTrue)
  ).length;
  const result = L.computeBingoScoreDelta(round.statements, Array(9).fill(false));
  assert.strictEqual(result.correctCount, falseStatementCount, round.id);
  assert.strictEqual(result.bingoLineCount, allFalseLineCount, round.id);
  assert.strictEqual(result.points, falseStatementCount + allFalseLineCount * L.BINGO_BONUS, round.id);
});

// ---- buildScoreboard / getWinners ----
{
  const roster = [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cara' }];
  const scoreboard = L.buildScoreboard({ a: 5, b: -2, c: 5 }, roster);
  assert.deepStrictEqual(scoreboard.map((row) => row.rank), [1, 1, 3]);
  assert.deepStrictEqual(L.getWinners(scoreboard).map((row) => row.id).sort(), ['a', 'c']);
}

// ---- ロビー名簿 ----
{
  let roster = [];
  roster = L.addPlayer(roster, { id: 'a', name: 'Alice' });
  roster = L.addPlayer(roster, { id: 'a', name: 'Alice' });
  assert.strictEqual(roster.length, 1);
  assert.strictEqual(L.hasMinPlayers(roster), false);
  roster = L.addPlayer(roster, { id: 'b', name: 'Bob' });
  assert.strictEqual(L.hasMinPlayers(roster), true);
  roster = L.removePlayer(roster, 'a');
  assert.strictEqual(roster.length, 1);
}

console.log('All tests passed');
