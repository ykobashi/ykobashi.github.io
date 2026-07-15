// script.js - 神経衰弱 UIロジック(DOM操作・入力ハンドリング)
(function () {
  'use strict';

  const boardEl = document.getElementById('board');
  const movesEl = document.getElementById('moves-count');
  const timeEl = document.getElementById('elapsed-time');
  const resetBtn = document.getElementById('reset-btn');
  const resultOverlay = document.getElementById('result-overlay');
  const resultText = document.getElementById('result-text');
  const resultDetail = document.getElementById('result-detail');
  const playAgainBtn = document.getElementById('play-again-btn');

  const MISMATCH_DELAY_MS = 700;

  let state = MemoryLogic.createInitialState();
  let cardEls = [];
  let locked = false; // 不一致判定の待機中は入力を無視
  let startTime = null;
  let timerId = null;
  let elapsedSeconds = 0;

  function buildBoard() {
    boardEl.innerHTML = '';
    cardEls = state.cards.map((card, index) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'card';
      cardEl.innerHTML =
        '<div class="card-inner">' +
        '<div class="card-face card-back"></div>' +
        '<div class="card-face card-front">' + card.symbol + '</div>' +
        '</div>';
      cardEl.addEventListener('click', () => onCardClick(index));
      boardEl.appendChild(cardEl);
      return cardEl;
    });
  }

  function renderCards() {
    state.cards.forEach((card, i) => {
      const el = cardEls[i];
      el.classList.toggle('flipped', card.flipped);
      el.classList.toggle('matched', card.matched);
    });
  }

  function updateStats() {
    movesEl.textContent = String(state.moves);
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }

  function startTimer() {
    stopTimer();
    startTime = Date.now();
    elapsedSeconds = 0;
    timeEl.textContent = formatTime(0);
    timerId = setInterval(() => {
      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      timeEl.textContent = formatTime(elapsedSeconds);
    }, 250);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function onCardClick(index) {
    if (locked) return;
    if (!MemoryLogic.canFlip(state, index)) return;

    state = MemoryLogic.flipCard(state, index);
    renderCards();

    const evalResult = MemoryLogic.evaluateFlippedPair(state);
    if (!evalResult) return; // まだ1枚目

    updateStats();

    if (evalResult.isMatch) {
      state = MemoryLogic.resolvePair(state, evalResult.indices, true);
      renderCards();
      updateStats();
      if (MemoryLogic.isGameClear(state)) {
        stopTimer();
        showResult();
      }
      return;
    }

    // 不一致: 少し見せてから裏返す
    locked = true;
    setTimeout(() => {
      state = MemoryLogic.resolvePair(state, evalResult.indices, false);
      renderCards();
      updateStats();
      locked = false;
    }, MISMATCH_DELAY_MS);
  }

  function showResult() {
    resultText.textContent = 'クリア!';
    resultDetail.textContent = '手数: ' + state.moves + ' / 時間: ' + formatTime(elapsedSeconds);
    resultOverlay.classList.remove('hidden');
  }

  function resetGame() {
    state = MemoryLogic.createInitialState();
    locked = false;
    resultOverlay.classList.add('hidden');
    buildBoard();
    renderCards();
    updateStats();
    startTimer();
  }

  resetBtn.addEventListener('click', resetGame);
  playAgainBtn.addEventListener('click', resetGame);

  buildBoard();
  renderCards();
  updateStats();
  startTimer();
})();
