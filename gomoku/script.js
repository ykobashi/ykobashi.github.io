// script.js - 五目並べ UIロジック(DOM操作・入力ハンドリング)
(function () {
  'use strict';

  const SIZE = GomokuLogic.BOARD_SIZE;
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
    turnTextEl.textContent = (currentPlayer === GomokuLogic.BLACK ? '黒' : '白') + '番の手番です';
  }

  function onCellClick(e) {
    if (gameOver) return;
    const row = Number(e.currentTarget.dataset.row);
    const col = Number(e.currentTarget.dataset.col);
    if (!GomokuLogic.canPlaceStone(board, row, col)) return;

    board = GomokuLogic.placeStone(board, row, col, currentPlayer);
    cellEls[row][col].classList.add(currentPlayer);

    if (GomokuLogic.checkWin(board, row, col)) {
      gameOver = true;
      showResult((currentPlayer === GomokuLogic.BLACK ? '黒' : '白') + 'の勝ち!');
      return;
    }

    if (GomokuLogic.isBoardFull(board)) {
      gameOver = true;
      showResult('引き分けです');
      return;
    }

    currentPlayer = GomokuLogic.otherPlayer(currentPlayer);
    updateTurnIndicator();
  }

  function showResult(message) {
    resultText.textContent = message;
    resultOverlay.classList.remove('hidden');
  }

  function resetGame() {
    board = GomokuLogic.createEmptyBoard(SIZE);
    currentPlayer = GomokuLogic.BLACK;
    gameOver = false;
    resultOverlay.classList.add('hidden');
    buildBoard();
    updateTurnIndicator();
  }

  resetBtn.addEventListener('click', resetGame);
  playAgainBtn.addEventListener('click', resetGame);

  buildBoard();
  updateTurnIndicator();
})();
