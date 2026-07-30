// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  MIN_PLAYERS,
  ROUND_WORD_COUNT,
  TABOO_BANK,
  shuffle,
  pickRoundWords,
  selectRoundWords,
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
assert.ok(TABOO_BANK.length >= 100, 'TABOO_BANK should have at least 100 entries');
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

// selectRoundWords: usedWords に含まれる単語を避けて選ぶ
{
  const smallBank = TABOO_BANK.slice(0, 10);
  const usedWords = smallBank.slice(0, 5).map((e) => e.word);
  const { words, usedWords: nextUsedWords } = selectRoundWords(Math.random, smallBank, 3, usedWords);
  assert.strictEqual(words.length, 3);
  words.forEach((e) => {
    assert.ok(!usedWords.includes(e.word), `${e.word} should not repeat within the room`);
  });
  // 返り値の usedWords には今回選んだ単語も追加されている
  assert.strictEqual(nextUsedWords.length, usedWords.length + 3);
  words.forEach((e) => assert.ok(nextUsedWords.includes(e.word)));
  usedWords.forEach((w) => assert.ok(nextUsedWords.includes(w)));
}

// selectRoundWords: プールが要求件数に満たない(使い切りに近い)場合はリセットしてバンク全体から選び直す
{
  const smallBank = TABOO_BANK.slice(0, 5);
  const almostAllUsed = smallBank.slice(0, 4).map((e) => e.word); // 残り1件しかない状態でcount=3を要求
  const { words, usedWords: nextUsedWords } = selectRoundWords(Math.random, smallBank, 3, almostAllUsed);
  assert.strictEqual(words.length, 3);
  const wordNames = words.map((e) => e.word);
  assert.strictEqual(new Set(wordNames).size, wordNames.length, 'selected words should not repeat each other');
  // リセットされたので、usedWordsは今回選んだ分だけになる(直前の履歴は捨てられる)
  assert.strictEqual(nextUsedWords.length, words.length);
  assert.deepStrictEqual(nextUsedWords.slice().sort(), wordNames.slice().sort());
}

// selectRoundWords: バンク全体を使い切った(usedWordsがbankと同じサイズ)場合でもクラッシュせず、リセットして選び直す
{
  const smallBank = TABOO_BANK.slice(0, 5);
  const allUsed = smallBank.map((e) => e.word);
  const { words, usedWords: nextUsedWords } = selectRoundWords(Math.random, smallBank, 3, allUsed);
  assert.strictEqual(words.length, 3);
  assert.strictEqual(nextUsedWords.length, 3);
}

// selectRoundWords: 複数回連続で呼んでも(バンクを使い切って何周しても)例外にならず、常に指定件数を返す
{
  const smallBank = TABOO_BANK.slice(0, 6);
  let usedWords = [];
  for (let round = 0; round < 10; round++) {
    const result = selectRoundWords(Math.random, smallBank, 3, usedWords);
    assert.strictEqual(result.words.length, 3);
    usedWords = result.usedWords;
  }
}

// selectRoundWords: usedWordsが空なら通常通りbankから重複なく選ぶ
{
  const { words } = selectRoundWords(Math.random, TABOO_BANK, ROUND_WORD_COUNT, []);
  assert.strictEqual(words.length, ROUND_WORD_COUNT);
  const wordNames = words.map((e) => e.word);
  assert.strictEqual(new Set(wordNames).size, wordNames.length);
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
