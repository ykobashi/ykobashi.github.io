const assert = require('node:assert');
const L = require('./logic.js');
const VIDEO_BANK = require('./data.js');

// ---- data.js の形状検証 ----
assert.ok(VIDEO_BANK.length >= 4, 'バンクは最低4件必要: ' + VIDEO_BANK.length);
VIDEO_BANK.forEach((entry) => {
  assert.ok(typeof entry.videoId === 'string' && entry.videoId.length > 0, 'videoIdが必要: ' + JSON.stringify(entry));
  assert.ok(typeof entry.title === 'string' && entry.title.length > 0, 'titleが必要: ' + JSON.stringify(entry));
  assert.ok(L.GENRES.includes(entry.genre), 'genreが不正: ' + JSON.stringify(entry));
  assert.ok(L.DECADES.includes(entry.decade), 'decadeが不正: ' + JSON.stringify(entry));
});
assert.strictEqual(new Set(VIDEO_BANK.map((e) => e.videoId)).size, VIDEO_BANK.length, 'videoIdが重複している');

// ---- embedUrl ----
assert.strictEqual(
  L.embedUrl('abc123'),
  'https://www.youtube.com/embed/abc123?start=0&end=7&autoplay=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3'
);
assert.strictEqual(
  L.embedUrl('abc123', 10),
  'https://www.youtube.com/embed/abc123?start=0&end=10&autoplay=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3'
);

// ---- filterPool ----
{
  const bank = [
    { videoId: '1', title: 'A', genre: 'vocaloid', decade: '2010s' },
    { videoId: '2', title: 'B', genre: 'anime', decade: '2010s' },
    { videoId: '3', title: 'C', genre: 'vocaloid', decade: '1990s' },
    { videoId: '4', title: 'D', genre: 'jpop', decade: '2020s' },
  ];
  assert.strictEqual(L.filterPool(bank, 'mix', 'all').length, 4);
  assert.deepStrictEqual(L.filterPool(bank, 'vocaloid', 'all').map((e) => e.videoId), ['1', '3']);
  assert.deepStrictEqual(L.filterPool(bank, 'mix', '2010s').map((e) => e.videoId), ['1', '2']);
  assert.deepStrictEqual(L.filterPool(bank, 'vocaloid', '2010s').map((e) => e.videoId), ['1']);
  assert.deepStrictEqual(L.filterPool(bank, 'jpop', '1990s'), []);
}

// ---- shuffle ----
assert.deepStrictEqual(L.shuffle([1, 2, 3], () => 0), [2, 3, 1]);

// ---- selectRoundVideo(重複防止) ----
{
  const pool = [
    { videoId: 'A', title: 'A' },
    { videoId: 'B', title: 'B' },
    { videoId: 'C', title: 'C' },
  ];
  const first = L.selectRoundVideo(() => 0, pool, []);
  assert.strictEqual(first.entry.videoId, 'A');
  assert.deepStrictEqual(first.usedIds, ['A']);

  const second = L.selectRoundVideo(() => 0, pool, first.usedIds);
  assert.strictEqual(second.entry.videoId, 'B');
  assert.deepStrictEqual(second.usedIds, ['A', 'B']);

  const third = L.selectRoundVideo(() => 0, pool, second.usedIds);
  assert.strictEqual(third.entry.videoId, 'C');
  assert.deepStrictEqual(third.usedIds, ['A', 'B', 'C']);

  // 全て出題済み -> 履歴をリセットしてプール全体から選び直す
  const fourth = L.selectRoundVideo(() => 0, pool, third.usedIds);
  assert.strictEqual(fourth.entry.videoId, 'A');
  assert.deepStrictEqual(fourth.usedIds, ['A']);
}

// ---- buildChoices ----
{
  const pool = [
    { videoId: '1', title: '曲1' },
    { videoId: '2', title: '曲2' },
    { videoId: '3', title: '曲3' },
    { videoId: '4', title: '曲4' },
  ];
  const correct = pool[0];
  const choices = L.buildChoices(correct, pool, () => 0.99);
  assert.strictEqual(choices.length, L.CHOICE_COUNT);
  assert.strictEqual(new Set(choices).size, L.CHOICE_COUNT, '選択肢が重複している');
  assert.ok(choices.includes(correct.title), '正解の曲名が選択肢に含まれていない');
}

// ---- judgeAnswer ----
assert.strictEqual(L.judgeAnswer('千本桜', '千本桜'), true);
assert.strictEqual(L.judgeAnswer('Lemon', '千本桜'), false);
assert.strictEqual(L.judgeAnswer(null, '千本桜'), false);
assert.strictEqual(L.judgeAnswer(undefined, '千本桜'), false);

// ---- computeSpeedPoints(速さ→得点の新規メカニクス) ----
assert.strictEqual(L.computeSpeedPoints(0, true), 1000, '最速なら満点');
assert.strictEqual(L.computeSpeedPoints(10000, true), 300, '減衰ウィンドウちょうどで床');
assert.strictEqual(L.computeSpeedPoints(999999, true), 300, '床を下回らない');
assert.strictEqual(L.computeSpeedPoints(-500, true), 1000, '負値は0にクランプされ満点を超えない');
assert.strictEqual(L.computeSpeedPoints(5000, true), 650, '中間値の線形減衰');
assert.strictEqual(L.computeSpeedPoints(0, false), 0, '不正解は速さに関係なく0点');
assert.strictEqual(L.computeSpeedPoints(5000, false), 0, '不正解は速さに関係なく0点');

// ---- tallyRoundAnswers / computeRoundScoreDeltas / applyScoreDeltas ----
{
  const answers = {
    a: { title: '千本桜', elapsedMs: 0 },
    b: { title: 'Lemon', elapsedMs: 2000 },
    c: { title: '千本桜', elapsedMs: 10000 },
  };
  const tally = L.tallyRoundAnswers(answers, '千本桜');
  assert.deepStrictEqual(tally.correctIds.sort(), ['a', 'c']);

  const deltas = L.computeRoundScoreDeltas(answers, '千本桜');
  assert.deepStrictEqual(deltas, { a: 1000, b: 0, c: 300 });

  const scores = L.applyScoreDeltas({ a: 1000, b: 500 }, deltas);
  assert.deepStrictEqual(scores, { a: 2000, b: 500, c: 300 });
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
assert.strictEqual(L.CLIP_LENGTH_SEC, 7);
assert.strictEqual(L.MAX_POINTS, 1000);
assert.strictEqual(L.MIN_POINTS, 300);
assert.strictEqual(L.DECAY_WINDOW_MS, 10000);
assert.deepStrictEqual(L.GENRES, ['vocaloid', 'anime', 'jpop']);
assert.deepStrictEqual(L.DECADES, ['1990s', '2000s', '2010s', '2020s']);

console.log('All tests passed');
