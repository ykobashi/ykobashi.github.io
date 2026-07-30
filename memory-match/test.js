// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  DEFAULT_SYMBOLS,
  shuffle,
  createDeck,
  dealCards,
  createStateFromDeck,
  createInitialState,
  getFlippedIndices,
  canFlip,
  flipCard,
  evaluateFlippedPair,
  resolvePair,
  isGameClear,
  getWinnerIndices,
  createAiMemory,
  rememberCard,
  findKnownPair,
  chooseAiFirstFlip,
  chooseAiSecondFlip,
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

// createStateFromDeck: 指定した並び順をそのまま使う(シャッフルしない)
{
  const deck = ['🍎', '🍌', '🍎', '🍌'];
  const state = createStateFromDeck(deck, 2);
  assert.deepStrictEqual(state.cards.map((c) => c.symbol), deck);
  assert.strictEqual(state.players, 2);
  assert.strictEqual(state.currentPlayer, 0);
  assert.deepStrictEqual(state.scores, [0, 0]);
  assert.strictEqual(state.totalPairs, 2);
}

// resolvePair(対戦モード): 一致したら得点が増え、手番は変わらない(もう一度手番)
{
  let state = createStateFromDeck(['🍎', '🍎', '🍌', '🍌'], 2);
  state = flipCard(state, 0);
  state = flipCard(state, 1);
  state = resolvePair(state, [0, 1], true);
  assert.deepStrictEqual(state.scores, [1, 0], '手番のプレイヤー(0)の得点が増える');
  assert.strictEqual(state.currentPlayer, 0, '一致した場合は手番が変わらない');
}

// resolvePair(対戦モード): 不一致なら次のプレイヤーに手番が移り、得点は増えない
{
  let state = createStateFromDeck(['🍎', '🍌', '🍎', '🍌'], 2);
  state = flipCard(state, 0);
  state = flipCard(state, 1);
  state = resolvePair(state, [0, 1], false);
  assert.deepStrictEqual(state.scores, [0, 0]);
  assert.strictEqual(state.currentPlayer, 1, '不一致の場合は次のプレイヤーに手番が移る');
}

// getWinnerIndices: 得点が最大のプレイヤーを返す(同点なら複数)
{
  let state = createStateFromDeck(['🍎', '🍎', '🍌', '🍌'], 2);
  state.scores = [3, 5];
  assert.deepStrictEqual(getWinnerIndices(state), [1]);
  state.scores = [4, 4];
  assert.deepStrictEqual(getWinnerIndices(state), [0, 1], '同点なら両方返す');
  const soloState = createInitialState(['🍎'], makeSeededRng([0.1]));
  assert.deepStrictEqual(getWinnerIndices(soloState), [], '1人プレイでは空配列');
}

// AI: findKnownPair は記憶の中から場に残っている同じ記号のペアを見つける
{
  const state = createStateFromDeck(['🍎', '🍌', '🍎', '🍇'], 2);
  let memory = createAiMemory();
  memory = rememberCard(memory, 0, '🍎');
  memory = rememberCard(memory, 2, '🍎');
  assert.deepStrictEqual(findKnownPair(memory, state), [0, 2]);
}

// AI: 既に一方がmatched済みなら既知ペアとして扱わない
{
  const state = createStateFromDeck(['🍎', '🍌', '🍎', '🍇'], 2);
  state.cards[0].matched = true;
  let memory = createAiMemory();
  memory = rememberCard(memory, 0, '🍎');
  memory = rememberCard(memory, 2, '🍎');
  assert.strictEqual(findKnownPair(memory, state), null);
}

// AI: chooseAiFirstFlip は recallChance=1 なら必ず既知ペアの一方を選ぶ
{
  const state = createStateFromDeck(['🍎', '🍌', '🍎', '🍇'], 2);
  let memory = createAiMemory();
  memory = rememberCard(memory, 0, '🍎');
  memory = rememberCard(memory, 2, '🍎');
  const rng = makeSeededRng([0.99]);
  const first = chooseAiFirstFlip(state, memory, rng, 1);
  assert.ok(first === 0 || first === 2, '既知ペアのどちらかを選ぶ');
}

// AI: chooseAiFirstFlip は recallChance=0 ならランダムに選ぶ(既知ペアを無視できる)
{
  const state = createStateFromDeck(['🍎', '🍌', '🍎', '🍇'], 2);
  let memory = createAiMemory();
  memory = rememberCard(memory, 0, '🍎');
  memory = rememberCard(memory, 2, '🍎');
  const rng = makeSeededRng([0.99, 0.99]); // 0.99 * 4 candidates -> index 3
  const first = chooseAiFirstFlip(state, memory, rng, 0);
  assert.strictEqual(first, 3, 'recallChance=0のときrngで選んだ候補になる');
}

// AI: chooseAiSecondFlip は既知の一致(recallChance=1)があれば必ずそれを選ぶ
{
  const state = createStateFromDeck(['🍎', '🍌', '🍎', '🍇'], 2);
  let memory = createAiMemory();
  memory = rememberCard(memory, 2, '🍎');
  const rng = makeSeededRng([0.99]);
  const second = chooseAiSecondFlip(state, memory, 0, '🍎', rng, 1);
  assert.strictEqual(second, 2, '記憶にある一致カードを選ぶ');
}

// AI: 場が全て埋まっている(選択肢なし)場合は null を返す
{
  const state = createStateFromDeck(['🍎', '🍎'], 2);
  state.cards[0].matched = true;
  state.cards[1].matched = true;
  const rng = makeSeededRng([0.5]);
  assert.strictEqual(chooseAiFirstFlip(state, createAiMemory(), rng, 0.5), null);
}

console.log('All tests passed');
