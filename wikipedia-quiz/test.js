const assert = require('node:assert');
const L = require('./logic.js');

// --- 記事タイトルリスト ---
assert.ok(L.ARTICLE_LIST.length >= 80, 'ARTICLE_LIST should have at least 80 entries');
assert.strictEqual(new Set(L.ARTICLE_LIST).size, L.ARTICLE_LIST.length, 'ARTICLE_LIST should have no duplicates');
L.ARTICLE_LIST.forEach((t) => { assert.ok(typeof t === 'string' && t.trim().length > 0, 'title should be non-empty string: ' + t); });

// --- shuffle ---
assert.deepStrictEqual(L.shuffle([1, 2, 3], () => 0), [2, 3, 1]);
assert.deepStrictEqual(L.shuffle([1, 2, 3]).sort(), [1, 2, 3]);

// --- pickArticleCandidates ---
{
  const bank = ['A', 'B', 'C', 'D', 'E'];
  const candidates = L.pickArticleCandidates(['A', 'B'], () => 0.4, bank, 3);
  assert.strictEqual(candidates.length, 3);
  candidates.forEach((c) => assert.ok(!['A', 'B'].includes(c)));
  assert.strictEqual(new Set(candidates).size, candidates.length);

  // 全件出題済みの場合はリスト全体を使い回す
  const exhausted = L.pickArticleCandidates(bank, () => 0.1, bank, 2);
  assert.strictEqual(exhausted.length, 2);
  exhausted.forEach((c) => assert.ok(bank.includes(c)));
}

// --- buildChoices ---
{
  const bank = ['正解', 'B', 'C', 'D', 'E', 'F'];
  const choices = L.buildChoices('正解', () => 0.5, bank);
  assert.strictEqual(choices.length, L.CHOICE_COUNT);
  assert.ok(choices.includes('正解'));
  assert.strictEqual(new Set(choices).size, choices.length);
  choices.forEach((c) => assert.ok(bank.includes(c)));
}

// --- redactExtract ---
{
  const extract = '東京タワー（とうきょうタワー）は、東京都港区にある電波塔である。東京タワーは1958年に完成した。';
  const redacted = L.redactExtract(extract, '東京タワー');
  assert.ok(!redacted.includes('東京タワー'), 'title should be fully redacted');
  assert.ok(!redacted.includes('とうきょうタワー'), 'reading in parentheses should be redacted too');
  assert.ok(redacted.includes(L.MASK));
  assert.strictEqual(L.redactExtract('', '東京タワー'), '');
  assert.strictEqual(L.redactExtract('内容', ''), '内容');
}

// --- limitSentences ---
{
  assert.strictEqual(L.limitSentences('A。B。C。D。', 3), 'A。B。C。');
  assert.strictEqual(L.limitSentences('A。B。', 3), 'A。B。');
  assert.strictEqual(L.limitSentences('', 3), '');
}

// --- truncateExtract ---
{
  assert.strictEqual(L.truncateExtract('short', 200), 'short');
  const long = 'あ'.repeat(300);
  const truncated = L.truncateExtract(long, 200);
  assert.strictEqual(truncated.length, 201); // 200文字 + '…'
  assert.ok(truncated.endsWith('…'));
}

// --- prepareExcerpt ---
{
  const extract = '東京タワー（とうきょうタワー）は、東京都港区にある電波塔である。1958年に完成した。周辺には多くの観光客が訪れる。さらに詳細な情報がここに続く。';
  const excerpt = L.prepareExcerpt(extract, '東京タワー');
  assert.ok(!excerpt.includes('東京タワー'));
  assert.ok(excerpt.length <= L.EXCERPT_MAX_LENGTH + 1);
}

// --- isCorrectAnswer / computeRoundScoreDeltas ---
{
  assert.strictEqual(L.isCorrectAnswer('東京タワー', '東京タワー'), true);
  assert.strictEqual(L.isCorrectAnswer('パリ', '東京タワー'), false);
  assert.strictEqual(L.isCorrectAnswer(null, '東京タワー'), false);

  const deltas = L.computeRoundScoreDeltas({ a: '東京タワー', b: 'パリ', c: '東京タワー' }, '東京タワー');
  assert.deepStrictEqual(deltas, { a: L.CORRECT_POINTS, c: L.CORRECT_POINTS });
}

// --- applyScoreDeltas / buildScoreboard ---
{
  assert.deepStrictEqual(L.applyScoreDeltas({ a: 500 }, { a: 1000, b: 1000 }), { a: 1500, b: 1000 });
  const roster = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const board = L.buildScoreboard({ a: 1000, b: 2000 }, roster);
  assert.deepStrictEqual(board.map((r) => r.id), ['b', 'a']);
  assert.deepStrictEqual(board.map((r) => r.rank), [1, 2]);

  // 同点は同順位になる(標準競技順位方式)
  const tiedRoster = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const tiedBoard = L.buildScoreboard({ a: 1000, b: 1000, c: 500 }, tiedRoster);
  assert.deepStrictEqual(tiedBoard.map((r) => r.rank), [1, 1, 3]);
  assert.deepStrictEqual(L.getWinners(tiedBoard).map((r) => r.id).sort(), ['a', 'b']);
}

// --- wikipediaSourceUrl ---
assert.strictEqual(L.wikipediaSourceUrl('東京タワー'), 'https://ja.wikipedia.org/wiki/' + encodeURIComponent('東京タワー'));

// --- lobby helpers ---
{
  let roster = [];
  roster = L.addPlayer(roster, { id: 'a', name: 'A' });
  roster = L.addPlayer(roster, { id: 'a', name: 'A' });
  assert.strictEqual(roster.length, 1);
  assert.strictEqual(L.hasMinPlayers(roster), false);
  roster = L.addPlayer(roster, { id: 'b', name: 'B' });
  assert.strictEqual(L.hasMinPlayers(roster), true);
  assert.deepStrictEqual(L.removePlayer(roster, 'a'), [{ id: 'b', name: 'B' }]);
}

console.log('All tests passed');
