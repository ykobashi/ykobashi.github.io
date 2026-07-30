// script.js - ライツアウト UIロジック(DOM操作・入力ハンドリング)
(function () {
  'use strict';

  const SIZE = LightsOutLogic.BOARD_SIZE;
  const MOVE_COUNT = 15;

  const boardEl = document.getElementById('board');
  const movesEl = document.getElementById('moves-count');
  const resetBtn = document.getElementById('reset-btn');
  const resultOverlay = document.getElementById('result-overlay');
  const resultText = document.getElementById('result-text');
  const resultDetail = document.getElementById('result-detail');
  const playAgainBtn = document.getElementById('play-again-btn');

  let board = LightsOutLogic.createEmptyBoard(SIZE);
  let moves = 0;
  let gameOver = false;
  const cellEls = [];

  function buildBoard() {
    boardEl.innerHTML = '';
    cellEls.length = 0;
    for (let r = 0; r < SIZE; r++) {
      const rowEls = [];
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.setAttribute('aria-label', (r + 1) + '行' + (c + 1) + '列');
        cell.addEventListener('click', () => onCellClick(r, c));
        boardEl.appendChild(cell);
        rowEls.push(cell);
      }
      cellEls.push(rowEls);
    }
  }

  function render() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        cellEls[r][c].classList.toggle('on', board[r][c]);
      }
    }
    movesEl.textContent = String(moves);
  }

  function onCellClick(r, c) {
    if (gameOver) return;
    board = LightsOutLogic.toggleCell(board, r, c);
    moves += 1;
    render();
    if (LightsOutLogic.isCleared(board)) {
      gameOver = true;
      resultText.textContent = 'クリア!';
      resultDetail.textContent = '手数: ' + moves;
      resultOverlay.classList.remove('hidden');
    }
  }

  function newPuzzle() {
    board = LightsOutLogic.generateSolvableBoard(SIZE, MOVE_COUNT, Math.random);
    // 生成直後にすでに全消灯(まれ)なら作り直す
    let guard = 0;
    while (LightsOutLogic.isCleared(board) && guard < 10) {
      board = LightsOutLogic.generateSolvableBoard(SIZE, MOVE_COUNT, Math.random);
      guard++;
    }
    moves = 0;
    gameOver = false;
    resultOverlay.classList.add('hidden');
    render();
  }

  resetBtn.addEventListener('click', newPuzzle);
  playAgainBtn.addEventListener('click', newPuzzle);

  buildBoard();
  newPuzzle();
})();
