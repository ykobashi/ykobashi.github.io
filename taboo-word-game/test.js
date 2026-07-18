// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  MIN_PLAYERS,
  ROUND_WORD_COUNT,
  TABOO_BANK,
  shuffle,
  pickRoundWords,
  sortLeaderboard,
  addPlayer,
  removePlayer,
  hasMinPlayers,
} = require('./logic.js');

// 決定論的な擬似乱数(テスト用)。常に同じシーケンスを返す
function makeSeededRng(seedSeq) {
  let i = 0;
  return () => seedSeq[i++ % seedSeq.length];
}

// TABOO_BANK: 十分な件数があり、それぞれ word/banned(3語)を持つ
assert.ok(TABOO_BANK.length >= 20, 'TABOO_BANK should have at least 20 entries');
TABOO_BANK.forEach((entry) => {
  assert.strictEqual(typeof entry.word, 'string');
  assert.ok(entry.word.length > 0);
  assert.ok(Array.isArray(entry.banned));
  assert.strictEqual(entry.banned.length, 3, `${entry.word} should have exactly 3 banned words`);
  entry.banned.forEach((b) => {
    assert.strictEqual(typeof b, 'string');
    assert.ok(b.length > 0);
    assert.notStrictEqual(b, entry.word, `banned word "${b}" should differ from the main word "${entry.word}"`);
  });
  // 禁止ワード同士が重複していないこと
  const uniqueBanned = new Set(entry.banned);
  assert.strictEqual(uniqueBanned.size, entry.banned.length, `${entry.word} has duplicate banned words`);
});

// お題の word 自体にも重複がないこと
{
  const words = TABOO_BANK.map((e) => e.word);
  assert.strictEqual(new Set(words).size, words.length, 'TABOO_BANK should not contain duplicate words');
}

// shuffle: 同じ要素数・同じ要素集合を保ち、元の配列を破壊しない
{
  const original = [1, 2, 3, 4, 5];
  const shuffled = shuffle(original, makeSeededRng([0.9, 0.1, 0.5, 0.3, 0.7]));
  assert.strictEqual(shuffled.length, original.length);
  assert.deepStrictEqual(shuffled.slice().sort((a, b) => a - b), original);
  assert.deepStrictEqual(original, [1, 2, 3, 4, 5]);
}

// pickRoundWords: 指定件数ぶん、重複なく返す(bank.lengthを超えない)
{
  for (const seed of [[0.1], [0.5, 0.9, 0.2], [0.99, 0.01, 0.33, 0.66]]) {
    const rng = makeSeededRng(seed);
    const picked = pickRoundWords(rng, TABOO_BANK, 10);
    assert.strictEqual(picked.length, 10);
    const words = picked.map((e) => e.word);
    assert.strictEqual(new Set(words).size, words.length, 'pickRoundWords should not repeat entries');
    words.forEach((w) => {
      assert.ok(TABOO_BANK.some((e) => e.word === w));
    });
  }
}

// pickRoundWords: bank.length を超える件数を要求しても、bank.length を超えない
{
  const smallBank = TABOO_BANK.slice(0, 5);
  const picked = pickRoundWords(Math.random, smallBank, 10);
  assert.ok(picked.length <= smallBank.length);
  const words = picked.map((e) => e.word);
  assert.strictEqual(new Set(words).size, words.length);
}

// pickRoundWords: デフォルト件数は ROUND_WORD_COUNT(10)
{
  assert.strictEqual(ROUND_WORD_COUNT, 10);
  const picked = pickRoundWords(Math.random, TABOO_BANK);
  assert.strictEqual(picked.length, ROUND_WORD_COUNT);
}

// sortLeaderboard: elapsedMs の昇順(速い順)に並べ、元の配列を破壊しない
{
  const entries = [
    { describerName: 'たろう', elapsedMs: 52000 },
    { describerName: 'はなこ', elapsedMs: 31000 },
    { describerName: 'じろう', elapsedMs: 47000 },
  ];
  const sorted = sortLeaderboard(entries);
  assert.deepStrictEqual(
    sorted.map((e) => e.describerName),
    ['はなこ', 'じろう', 'たろう']
  );
  // 元の配列を破壊しない
  assert.deepStrictEqual(entries.map((e) => e.describerName), ['たろう', 'はなこ', 'じろう']);
  assert.notStrictEqual(sorted, entries);
}

// sortLeaderboard: 空配列や1件でも壊れない
{
  assert.deepStrictEqual(sortLeaderboard([]), []);
  const single = [{ describerName: 'ソロ', elapsedMs: 1000 }];
  assert.deepStrictEqual(sortLeaderboard(single), single);
}

// ロビー名簿: addPlayer/removePlayer/hasMinPlayers
{
  let roster = [];
  roster = addPlayer(roster, { id: 'host', name: 'ホスト' });
  roster = addPlayer(roster, { id: 'p1', name: 'ゲスト1' });
  assert.strictEqual(roster.length, 2);

  // 同じidを重複追加しない
  roster = addPlayer(roster, { id: 'p1', name: '別名前' });
  assert.strictEqual(roster.length, 2);
  assert.strictEqual(roster.find((p) => p.id === 'p1').name, 'ゲスト1');

  assert.strictEqual(hasMinPlayers(roster, MIN_PLAYERS), true);
  assert.strictEqual(hasMinPlayers([roster[0]], MIN_PLAYERS), false);

  roster = removePlayer(roster, 'p1');
  assert.strictEqual(roster.length, 1);
  assert.strictEqual(roster[0].id, 'host');
}

console.log('All tests passed');
