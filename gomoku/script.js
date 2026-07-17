// script.js - 五目並べ UIロジック(DOM操作・入力ハンドリング)
(function () {
  'use strict';

  const SIZE = GomokuLogic.BOARD_SIZE;
  const HUMAN = GomokuLogic.BLACK;
  const AI = GomokuLogic.WHITE;
  const AI_THINK_MS = 450;

  const boardEl = document.getElementById('board');
  const turnTextEl = document.getElementById('turn-text');
  const turnIndicatorEl = document.getElementById('turn-indicator');
  const resetBtn = document.getElementById('reset-btn');
  const resultOverlay = document.getElementById('result-overlay');
  const resultText = document.getElementById('result-text');
  const playAgainBtn = document.getElementById('play-again-btn');

  let board = GomokuLogic.createEmptyBoard(SIZE);
  let currentPlayer = GomokuLogic.BLACK;
  let gameOver = false;
  let aiThinking = false;
  const cellEls = [];

  function buildBoard() {
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${SIZE}, 1fr)`;
    boardEl.style.gridTemplateRows = `repeat(${SIZE}, 1fr)`;
    cellEls.length = 0;
    for (let r = 0; r < SIZE; r++) {
      const rowEls = [];
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.addEventListener('click', onCellClick);
        boardEl.appendChild(cell);
        rowEls.push(cell);
      }
      cellEls.push(rowEls);
    }
  }

  function updateTurnIndicator() {
    const preview = turnIndicatorEl.querySelector('.stone-preview');
    preview.className = 'stone-preview ' + currentPlayer;
    if (currentPlayer === HUMAN) {
      turnTextEl.textContent = 'あなたの番です(黒)';
    } else {
      turnTextEl.textContent = 'CPU思考中です(白)…';
    }
  }

  function placeAndCheck(row, col, player) {
    board = GomokuLogic.placeStone(board, row, col, player);
    cellEls[row][col].classList.add(player);

    if (GomokuLogic.checkWin(board, row, col)) {
      gameOver = true;
      showResult(player === HUMAN ? 'あなたの勝ちです!' : 'CPUの勝ちです');
      return true;
    }
    if (GomokuLogic.isBoardFull(board)) {
      gameOver = true;
      showResult('引き分けです');
      return true;
    }
    return false;
  }

  function onCellClick(e) {
    if (gameOver || aiThinking || currentPlayer !== HUMAN) return;
    const row = Number(e.currentTarget.dataset.row);
    const col = Number(e.currentTarget.dataset.col);
    if (!GomokuLogic.canPlaceStone(board, row, col)) return;

    if (placeAndCheck(row, col, HUMAN)) return;

    currentPlayer = AI;
    updateTurnIndicator();
    scheduleAiMove();
  }

  function scheduleAiMove() {
    aiThinking = true;
    boardEl.classList.add('thinking');
    setTimeout(() => {
      const move = GomokuLogic.chooseAiMove(board, AI, HUMAN);
      aiThinking = false;
      boardEl.classList.remove('thinking');
      if (!move || gameOver) return;

      if (placeAndCheck(move.row, move.col, AI)) return;

      currentPlayer = HUMAN;
      updateTurnIndicator();
    }, AI_THINK_MS);
  }

  function showResult(message) {
    resultText.textContent = message;
    resultOverlay.classList.remove('hidden');
  }

  function resetGame() {
    board = GomokuLogic.createEmptyBoard(SIZE);
    currentPlayer = GomokuLogic.BLACK;
    gameOver = false;
    aiThinking = false;
    boardEl.classList.remove('thinking');
    resultOverlay.classList.add('hidden');
    buildBoard();
    updateTurnIndicator();
  }

  resetBtn.addEventListener('click', resetGame);
  playAgainBtn.addEventListener('click', resetGame);

  buildBoard();
  updateTurnIndicator();
})();
