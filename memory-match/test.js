// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  DEFAULT_SYMBOLS,
  shuffle,
  createDeck,
  dealCards,
  createInitialState,
  getFlippedIndices,
  canFlip,
  flipCard,
  evaluateFlippedPair,
  resolvePair,
  isGameClear,
} = require('./logic.js');

// 決定論的な擬似乱数(テスト用)。常に同じシーケンスを返す
function makeSeededRng(seedSeq) {
  let i = 0;
  return () => seedSeq[i++ % seedSeq.length];
}

// createDeck: 8種類のシンボルから16枚(各2枚)を作る
{
  const deck = createDeck(DEFAULT_SYMBOLS);
  assert.strictEqual(deck.length, 16);
  const counts = {};
  deck.forEach((s) => (counts[s] = (counts[s] || 0) + 1));
  Object.values(counts).forEach((c) => assert.strictEqual(c, 2));
}

// shuffle: 同じrng列なら同じ結果、要素集合は変わらない
{
  const arr = [1, 2, 3, 4, 5];
  const rng1 = makeSeededRng([0.1, 0.5, 0.9, 0.3, 0.7]);
  const rng2 = makeSeededRng([0.1, 0.5, 0.9, 0.3, 0.7]);
  const s1 = shuffle(arr, rng1);
  const s2 = shuffle(arr, rng2);
  assert.deepStrictEqual(s1, s2, '同じ乱数列なら同じシャッフル結果');
  assert.deepStrictEqual([...s1].sort(), [...arr].sort(), '要素の集合は変わらない');
  assert.deepStrictEqual(arr, [1, 2, 3, 4, 5], '元配列は変更されない');
}

// dealCards: シャッフル済みの16枚、ペア構成は保たれる
{
  const rng = makeSeededRng([0.2, 0.4, 0.6, 0.8, 0.1, 0.3, 0.5, 0.7, 0.9, 0.05]);
  const dealt = dealCards(DEFAULT_SYMBOLS, rng);
  assert.strictEqual(dealt.length, 16);
  const counts = {};
  dealt.forEach((s) => (counts[s] = (counts[s] || 0) + 1));
  assert.strictEqual(Object.keys(counts).length, 8);
}

// createInitialState: 初期状態の構造
{
  const rng = makeSeededRng([0.3]);
  const state = createInitialState(DEFAULT_SYMBOLS, rng);
  assert.strictEqual(state.cards.length, 16);
  assert.strictEqual(state.moves, 0);
  assert.strictEqual(state.matchedPairs, 0);
  assert.strictEqual(state.totalPairs, 8);
  assert.ok(state.cards.every((c) => c.flipped === false && c.matched === false));
}

// canFlip / flipCard: 通常のフリップ
{
  let state = createInitialState(DEFAULT_SYMBOLS, makeSeededRng([0.1]));
  assert.strictEqual(canFlip(state, 0), true);
  state = flipCard(state, 0);
  assert.strictEqual(state.cards[0].flipped, true);
  assert.deepStrictEqual(getFlippedIndices(state), [0]);
}

// 3枚目はめくれない(2枚が未確定の間)
{
  let state = createInitialState(DEFAULT_SYMBOLS, makeSeededRng([0.1]));
  state = flipCard(state, 0);
  state = flipCard(state, 1);
  assert.strictEqual(canFlip(state, 2), false, '2枚めくられている間は3枚目をめくれない');
  const before = state;
  const after = flipCard(state, 2);
  assert.strictEqual(after, before, 'めくれない場合は状態が変化しない');
}

// 既にめくられているカードは再度めくれない
{
  let state = createInitialState(DEFAULT_SYMBOLS, makeSeededRng([0.1]));
  state = flipCard(state, 0);
  assert.strictEqual(canFlip(state, 0), false);
}

// evaluateFlippedPair: 一致するケース
{
  let state = createInitialState(['🍎', '🍌'], makeSeededRng([0.5]));
  // 手動でシンボルを揃えて一致条件を作る
  state.cards[0].symbol = '🍎';
  state.cards[1].symbol = '🍎';
  state = flipCard(state, 0);
  state = flipCard(state, 1);
  const evalResult = evaluateFlippedPair(state);
  assert.ok(evalResult);
  assert.strictEqual(evalResult.isMatch, true);
  assert.deepStrictEqual(evalResult.indices, [0, 1]);
}

// evaluateFlippedPair: 不一致のケース、1枚だけでは null
{
  let state = createInitialState(['🍎', '🍌'], makeSeededRng([0.5]));
  state.cards[0].symbol = '🍎';
  state.cards[1].symbol = '🍌';
  assert.strictEqual(evaluateFlippedPair(flipCard(state, 0)), null, '1枚だけでは判定しない');
  state = flipCard(state, 0);
  state = flipCard(state, 1);
  const evalResult = evaluateFlippedPair(state);
  assert.strictEqual(evalResult.isMatch, false);
}

// resolvePair: 一致した場合 matched になり matchedPairs が増える
{
  let state = createInitialState(['🍎', '🍌'], makeSeededRng([0.5]));
  state.cards[0].symbol = '🍎';
  state.cards[1].symbol = '🍎';
  state = flipCard(state, 0);
  state = flipCard(state, 1);
  state = resolvePair(state, [0, 1], true);
  assert.strictEqual(state.cards[0].matched, true);
  assert.strictEqual(state.cards[1].matched, true);
  assert.strictEqual(state.matchedPairs, 1);
  assert.strictEqual(state.moves, 1);
}

// resolvePair: 不一致の場合は裏返り、matchedPairsは増えない
{
  let state = createInitialState(['🍎', '🍌'], makeSeededRng([0.5]));
  state.cards[0].symbol = '🍎';
  state.cards[1].symbol = '🍌';
  state = flipCard(state, 0);
  state = flipCard(state, 1);
  state = resolvePair(state, [0, 1], false);
  assert.strictEqual(state.cards[0].flipped, false);
  assert.strictEqual(state.cards[1].flipped, false);
  assert.strictEqual(state.matchedPairs, 0);
  assert.strictEqual(state.moves, 1);
}

// isGameClear
{
  let state = createInitialState(['🍎'], makeSeededRng([0.5]));
  assert.strictEqual(isGameClear(state), false);
  state.matchedPairs = 1;
  state.totalPairs = 1;
  assert.strictEqual(isGameClear(state), true);
}

console.log('All tests passed');
