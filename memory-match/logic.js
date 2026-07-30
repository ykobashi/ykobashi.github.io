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

// 指定した並び順(deck)から初期状態を生成する。playerCount>=2 の場合はスコア・手番を持つ対戦状態になる。
function createStateFromDeck(deck, playerCount = 1) {
  return {
    cards: deck.map((symbol) => ({ symbol, flipped: false, matched: false })),
    moves: 0,
    matchedPairs: 0,
    totalPairs: deck.length / 2,
    players: playerCount,
    currentPlayer: 0,
    scores: new Array(playerCount).fill(0),
  };
}

// 初期状態を生成する(シャッフルはこの関数内で行う)
function createInitialState(symbols = DEFAULT_SYMBOLS, rng = Math.random, playerCount = 1) {
  const dealt = dealCards(symbols, rng);
  return createStateFromDeck(dealt, playerCount);
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

// めくられている2枚を確定させる(一致ならmatched化、不一致なら裏返す)。手数を1増やす。
// players>=2 の対戦状態では、一致した場合は同じプレイヤーの得点が増えてもう一度手番(手番は変わらない)、
// 不一致の場合は次のプレイヤーに手番が移る。
function resolvePair(state, indices, isMatch) {
  const [i, j] = indices;
  const newCards = state.cards.map((card, idx) => {
    if (idx !== i && idx !== j) return card;
    if (isMatch) return { ...card, matched: true };
    return { ...card, flipped: false };
  });

  let scores = state.scores;
  let currentPlayer = state.currentPlayer;
  if (scores && scores.length >= 2) {
    scores = scores.slice();
    if (isMatch) {
      scores[currentPlayer] += 1;
    } else {
      currentPlayer = (currentPlayer + 1) % state.players;
    }
  }

  return {
    ...state,
    cards: newCards,
    moves: state.moves + 1,
    matchedPairs: isMatch ? state.matchedPairs + 1 : state.matchedPairs,
    scores,
    currentPlayer,
  };
}

// 全ペアが揃ってクリアしたか
function isGameClear(state) {
  return state.matchedPairs >= state.totalPairs;
}

// 対戦モードでの勝者インデックス一覧を返す(最高得点のプレイヤー。同点なら複数返る)。
// 1人プレイ(scoresなし/1人)の場合は空配列。
function getWinnerIndices(state) {
  if (!state.scores || state.scores.length < 2) return [];
  const max = Math.max(...state.scores);
  const winners = [];
  state.scores.forEach((s, i) => {
    if (s === max) winners.push(i);
  });
  return winners;
}

// ================= CPU(AI)対戦相手 =================
// AIは「これまでに見えたカード」を記憶として持ち、一定確率(recallChance)で正しく思い出す簡易AI。

function createAiMemory() {
  return {};
}

// index のカードが symbol であることを記憶に追加した新しい記憶を返す
function rememberCard(memory, index, symbol) {
  return Object.assign({}, memory, { [index]: symbol });
}

// 記憶の中から、まだ場に残っている(未確定・裏向きの)同じ記号のペアを探す
function findKnownPair(memory, state) {
  const knownIndices = Object.keys(memory)
    .map(Number)
    .filter((i) => {
      const card = state.cards[i];
      return card && !card.matched && !card.flipped;
    });

  for (let a = 0; a < knownIndices.length; a++) {
    for (let b = a + 1; b < knownIndices.length; b++) {
      const i = knownIndices[a];
      const j = knownIndices[b];
      if (memory[i] === memory[j]) return [i, j];
    }
  }
  return null;
}

// AIが1枚目に開くマスを選ぶ。記憶に既知のペアがあれば recallChance の確率でそれを選ぶ。なければランダム。
function chooseAiFirstFlip(state, memory, rng = Math.random, recallChance = 0.75) {
  const candidates = [];
  state.cards.forEach((card, i) => {
    if (!card.matched && !card.flipped) candidates.push(i);
  });
  if (candidates.length === 0) return null;

  const knownPair = findKnownPair(memory, state);
  if (knownPair && rng() < recallChance) {
    return knownPair[0];
  }
  return candidates[Math.floor(rng() * candidates.length)];
}

// 1枚目(firstIndex, 記号 firstSymbol)を開いた後、AIが2枚目に開くマスを選ぶ。
// 記憶の中に一致するカードがあれば recallChance の確率でそれを選ぶ。なければランダム。
function chooseAiSecondFlip(state, memory, firstIndex, firstSymbol, rng = Math.random, recallChance = 0.75) {
  const candidates = [];
  state.cards.forEach((card, i) => {
    if (i === firstIndex) return;
    if (!card.matched && !card.flipped) candidates.push(i);
  });
  if (candidates.length === 0) return null;

  const knownMatch = candidates.find((i) => memory[i] === firstSymbol);
  if (knownMatch !== undefined && rng() < recallChance) {
    return knownMatch;
  }
  return candidates[Math.floor(rng() * candidates.length)];
}

const MemoryLogicExports = {
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
};

if (typeof module !== 'undefined') {
  module.exports = MemoryLogicExports;
}
if (typeof window !== 'undefined') {
  window.MemoryLogic = MemoryLogicExports;
}
