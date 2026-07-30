const assert = require('node:assert');
const L = require('./logic.js');

// ---- PAIR_BANK ----
assert.strictEqual(L.PAIR_BANK.length, 30, 'バンクは30件必要: ' + L.PAIR_BANK.length);
assert.strictEqual(new Set(L.PAIR_BANK.map((e) => e.id)).size, L.PAIR_BANK.length, 'idが重複している');
L.PAIR_BANK.forEach((entry) => {
  assert.ok(typeof entry.realImage === 'string' && entry.realImage.length > 0, '実写画像パスが必要: ' + JSON.stringify(entry));
  assert.ok(typeof entry.fakeImage === 'string' && entry.fakeImage.length > 0, '偽物画像パスが必要: ' + JSON.stringify(entry));
  assert.ok(entry.realImage !== entry.fakeImage, '実写と偽物のパスが同一: ' + JSON.stringify(entry));
  assert.ok(entry.credit && typeof entry.credit.title === 'string' && entry.credit.title.length > 0, '出典titleが必要: ' + JSON.stringify(entry));
  assert.ok(entry.credit && typeof entry.credit.source === 'string' && entry.credit.source.length > 0, '出典sourceが必要: ' + JSON.stringify(entry));
});

// ---- shuffle ----
assert.deepStrictEqual(L.shuffle([1, 2, 3], () => 0), [2, 3, 1]);

// ---- selectRoundPair(重複防止) ----
{
  const bank = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const first = L.selectRoundPair(() => 0, bank, []);
  assert.strictEqual(first.entry.id, 'a');
  assert.deepStrictEqual(first.usedIds, ['a']);

  const second = L.selectRoundPair(() => 0, bank, first.usedIds);
  assert.strictEqual(second.entry.id, 'b');
  assert.deepStrictEqual(second.usedIds, ['a', 'b']);

  const third = L.selectRoundPair(() => 0, bank, second.usedIds);
  assert.strictEqual(third.entry.id, 'c');
  assert.deepStrictEqual(third.usedIds, ['a', 'b', 'c']);

  // 全て出題済み -> 履歴をリセットしてバンク全体から選び直す
  const fourth = L.selectRoundPair(() => 0, bank, third.usedIds);
  assert.strictEqual(fourth.entry.id, 'a');
  assert.deepStrictEqual(fourth.usedIds, ['a']);
}

// ---- buildRoundPayload ----
{
  const pair = { realImage: 'R.jpg', fakeImage: 'F.jpg' };
  const left = L.buildRoundPayload(pair, () => 0);
  assert.strictEqual(left.correctIndex, 0);
  assert.deepStrictEqual(left.images, ['R.jpg', 'F.jpg']);

  const right = L.buildRoundPayload(pair, () => 0.99);
  assert.strictEqual(right.correctIndex, 1);
  assert.deepStrictEqual(right.images, ['F.jpg', 'R.jpg']);
}

// ---- judgeAnswer ----
assert.strictEqual(L.judgeAnswer(0, 0), true);
assert.strictEqual(L.judgeAnswer(1, 0), false);
assert.strictEqual(L.judgeAnswer(null, 0), false);
assert.strictEqual(L.judgeAnswer(undefined, 0), false);

// ---- allImagePaths ----
{
  const paths = L.allImagePaths(L.PAIR_BANK);
  assert.strictEqual(paths.length, L.PAIR_BANK.length * 2);
  L.PAIR_BANK.forEach((entry) => {
    assert.ok(paths.includes(entry.realImage));
    assert.ok(paths.includes(entry.fakeImage));
  });
}

// ---- tallyRoundAnswers / computeRoundScoreDeltas / applyScoreDeltas ----
{
  const answers = { a: 0, b: 1, c: 0 };
  const tally = L.tallyRoundAnswers(answers, 0);
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
