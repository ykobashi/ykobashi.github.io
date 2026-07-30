// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  MIN_PLAYERS,
  WORD_POOL,
  shuffle,
  assignSecretWords,
  visibleListFor,
  acceptClaim,
  addPlayer,
  removePlayer,
  hasMinPlayers,
} = require('./logic.js');

// 決定論的な擬似乱数(テスト用)。常に同じシーケンスを返す
function makeSeededRng(seedSeq) {
  let i = 0;
  return () => seedSeq[i++ % seedSeq.length];
}

// WORD_POOL: 十分な件数があり、重複がない
{
  assert.ok(WORD_POOL.length >= 30, 'WORD_POOL should have at least 30 entries');
  assert.strictEqual(new Set(WORD_POOL).size, WORD_POOL.length, 'WORD_POOL should have no duplicate entries');
  WORD_POOL.forEach((word) => {
    assert.strictEqual(typeof word, 'string');
    assert.ok(word.length > 0);
  });
}

// shuffle: 同じ要素数・同じ要素集合を保つ
{
  const original = [1, 2, 3, 4, 5];
  const shuffled = shuffle(original, makeSeededRng([0.9, 0.1, 0.5, 0.3, 0.7]));
  assert.strictEqual(shuffled.length, original.length);
  assert.deepStrictEqual(shuffled.slice().sort((a, b) => a - b), original);
  // 元の配列を破壊しない
  assert.deepStrictEqual(original, [1, 2, 3, 4, 5]);
}

// assignSecretWords: 全員に重複しない単語を割り当てる(Math.randomでの実行)
{
  const playerIds = ['a', 'b', 'c', 'd', 'e'];
  const words = assignSecretWords(playerIds, Math.random);
  const values = Object.values(words);
  assert.strictEqual(Object.keys(words).length, playerIds.length);
  assert.strictEqual(new Set(values).size, values.length); // 重複なし
  values.forEach((w) => {
    assert.ok(WORD_POOL.includes(w));
  });
}

// assignSecretWords: 決定論的rngでも複数回の実行で重複なしであること
{
  const playerIds = ['x', 'y', 'z', 'w'];
  for (const seed of [
    [0.01, 0.99, 0.5, 0.2, 0.8, 0.33, 0.66],
    [0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77],
    [0.99, 0.01, 0.98, 0.02, 0.5, 0.5, 0.5],
  ]) {
    const rng = makeSeededRng(seed);
    const words = assignSecretWords(playerIds, rng);
    const values = Object.values(words);
    assert.strictEqual(new Set(values).size, values.length);
    assert.strictEqual(values.length, playerIds.length);
  }
}

// visibleListFor: 呼び出し元自身の行だけを除外し、他は元の順序・内容を保つ
{
  const fullList = [
    { id: 'a', name: 'Aさん', word: 'りんご' },
    { id: 'b', name: 'Bさん', word: 'ねこ' },
    { id: 'c', name: 'Cさん', word: 'つくえ' },
  ];
  const visibleForA = visibleListFor('a', fullList);
  assert.deepStrictEqual(visibleForA, [
    { id: 'b', name: 'Bさん', word: 'ねこ' },
    { id: 'c', name: 'Cさん', word: 'つくえ' },
  ]);

  const visibleForB = visibleListFor('b', fullList);
  assert.deepStrictEqual(visibleForB, [
    { id: 'a', name: 'Aさん', word: 'りんご' },
    { id: 'c', name: 'Cさん', word: 'つくえ' },
  ]);

  // 元の配列を破壊しない
  assert.strictEqual(fullList.length, 3);

  // 存在しないidを渡した場合は全件そのまま返る
  const visibleForUnknown = visibleListFor('z', fullList);
  assert.deepStrictEqual(visibleForUnknown, fullList);
}

// acceptClaim: 最初の1件だけが採用される(早い者勝ち)
{
  const first = { catcherId: 'a', targetId: 'b' };
  const second = { catcherId: 'c', targetId: 'd' };

  let currentClaim = null;
  currentClaim = acceptClaim(currentClaim, first);
  assert.deepStrictEqual(currentClaim, first);

  // 2回目以降は最初のクレームを維持する
  currentClaim = acceptClaim(currentClaim, second);
  assert.deepStrictEqual(currentClaim, first);

  // nullからスタートしてnullを渡してもnullのまま
  assert.strictEqual(acceptClaim(null, null), null);
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
