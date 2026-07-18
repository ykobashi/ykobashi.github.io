// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  MIN_PLAYERS,
  NUMBER_RANGE,
  THEME_BANK,
  shuffle,
  pickTheme,
  assignNumbers,
  correctOrder,
  checkOrder,
  addPlayer,
  removePlayer,
  hasMinPlayers,
} = require('./logic.js');

// 決定論的な擬似乱数(テスト用)。常に同じシーケンスを返す
function makeSeededRng(seedSeq) {
  let i = 0;
  return () => seedSeq[i++ % seedSeq.length];
}

// THEME_BANK: 十分な件数があり、それぞれ title/low/high を持つ
assert.ok(THEME_BANK.length >= 10, 'THEME_BANK should have at least 10 entries');
THEME_BANK.forEach((entry) => {
  assert.strictEqual(typeof entry.title, 'string');
  assert.strictEqual(typeof entry.low, 'string');
  assert.strictEqual(typeof entry.high, 'string');
  assert.ok(entry.title.length > 0 && entry.low.length > 0 && entry.high.length > 0);
});

// shuffle: 同じ要素数・同じ要素集合を保つ
{
  const original = [1, 2, 3, 4, 5];
  const shuffled = shuffle(original, makeSeededRng([0.9, 0.1, 0.5, 0.3, 0.7]));
  assert.strictEqual(shuffled.length, original.length);
  assert.deepStrictEqual(shuffled.slice().sort((a, b) => a - b), original);
  // 元の配列を破壊しない
  assert.deepStrictEqual(original, [1, 2, 3, 4, 5]);
}

// pickTheme: 常にbank内のエントリを返す
{
  const bank = THEME_BANK;
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    const theme = pickTheme(() => r, bank);
    assert.ok(bank.includes(theme));
  }
}

// assignNumbers: 重複なし・範囲内・人数分だけ割り当てる
{
  const playerIds = ['a', 'b', 'c', 'd', 'e'];
  const numbers = assignNumbers(playerIds, Math.random);
  const values = Object.values(numbers);
  assert.strictEqual(Object.keys(numbers).length, playerIds.length);
  assert.strictEqual(new Set(values).size, values.length); // 重複なし
  values.forEach((n) => {
    assert.ok(n >= 1 && n <= NUMBER_RANGE);
  });
}

// assignNumbers: 決定論的rngでも重複なしであること
{
  const playerIds = ['x', 'y', 'z'];
  const rng = makeSeededRng([0.01, 0.99, 0.5, 0.2, 0.8, 0.33, 0.66]);
  const numbers = assignNumbers(playerIds, rng);
  const values = Object.values(numbers);
  assert.strictEqual(new Set(values).size, values.length);
}

// correctOrder: 数字の昇順にidを並べる
{
  const numberMap = { a: 42, b: 7, c: 99, d: 15 };
  assert.deepStrictEqual(correctOrder(numberMap), ['b', 'd', 'a', 'c']);
}

// checkOrder: 正しい順番はisCorrect=true
{
  const numberMap = { a: 42, b: 7, c: 99, d: 15 };
  const correct = correctOrder(numberMap);
  const result = checkOrder(correct, numberMap);
  assert.strictEqual(result.isCorrect, true);
  assert.deepStrictEqual(result.correctOrderIds, correct);
}

// checkOrder: 間違った順番はisCorrect=false(correctOrderIdsは常に返す)
{
  const numberMap = { a: 42, b: 7, c: 99, d: 15 };
  const wrong = ['a', 'b', 'c', 'd'];
  const result = checkOrder(wrong, numberMap);
  assert.strictEqual(result.isCorrect, false);
  assert.deepStrictEqual(result.correctOrderIds, ['b', 'd', 'a', 'c']);
}

// checkOrder: 長さが違う場合もisCorrect=false
{
  const numberMap = { a: 1, b: 2, c: 3 };
  const result = checkOrder(['a', 'b'], numberMap);
  assert.strictEqual(result.isCorrect, false);
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
