// logic.js - 神経衰弱 純粋関数ロジック(DOM操作なし)

const DEFAULT_SYMBOLS = ['🍎', '🍌', '🍇', '🍉', '🍓', '🍒', '🍑', '🍋'];

// Fisher-Yates シャッフル。rng は 0以上1未満の乱数を返す関数(テスト時に差し替え可能)
function shuffle(array, rng = Math.random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

// symbols(8種類)からペア(16枚)のシンボル配列を作る(シャッフルなし)
function createDeck(symbols = DEFAULT_SYMBOLS) {
  return symbols.concat(symbols);
}

// シャッフル済みの16枚シンボル配列を作る
function dealCards(symbols = DEFAULT_SYMBOLS, rng = Math.random) {
  return shuffle(createDeck(symbols), rng);
}

// 初期状態を生成する
function createInitialState(symbols = DEFAULT_SYMBOLS, rng = Math.random) {
  const dealt = dealCards(symbols, rng);
  return {
    cards: dealt.map((symbol) => ({ symbol, flipped: false, matched: false })),
    moves: 0,
    matchedPairs: 0,
    totalPairs: symbols.length,
  };
}

// 現在めくられている(かつ未確定の)カードのインデックス一覧
function getFlippedIndices(state) {
  const indices = [];
  state.cards.forEach((card, i) => {
    if (card.flipped && !card.matched) indices.push(i);
  });
  return indices;
}

// index のカードをめくれるかどうか
function canFlip(state, index) {
  if (index < 0 || index >= state.cards.length) return false;
  const card = state.cards[index];
  if (card.matched || card.flipped) return false;
  return getFlippedIndices(state).length < 2;
}

// index のカードをめくった新しい状態を返す(不変更新)
function flipCard(state, index) {
  if (!canFlip(state, index)) return state;
  const newCards = state.cards.map((card, i) => (i === index ? { ...card, flipped: true } : card));
  return { ...state, cards: newCards };
}

// 現在めくられている2枚が揃っているか判定する。2枚めくられていない場合は null
function evaluateFlippedPair(state) {
  const indices = getFlippedIndices(state);
  if (indices.length !== 2) return null;
  const [i, j] = indices;
  const isMatch = state.cards[i].symbol === state.cards[j].symbol;
  return { isMatch, indices: [i, j] };
}

// めくられている2枚を確定させる(一致ならmatched化、不一致なら裏返す)。手数を1増やす
function resolvePair(state, indices, isMatch) {
  const [i, j] = indices;
  const newCards = state.cards.map((card, idx) => {
    if (idx !== i && idx !== j) return card;
    if (isMatch) return { ...card, matched: true };
    return { ...card, flipped: false };
  });
  return {
    ...state,
    cards: newCards,
    moves: state.moves + 1,
    matchedPairs: isMatch ? state.matchedPairs + 1 : state.matchedPairs,
  };
}

// 全ペアが揃ってクリアしたか
function isGameClear(state) {
  return state.matchedPairs >= state.totalPairs;
}

if (typeof module !== 'undefined') {
  module.exports = {
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
  };
}
if (typeof window !== 'undefined') {
  window.MemoryLogic = {
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
  };
}
