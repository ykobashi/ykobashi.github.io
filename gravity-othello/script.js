// script.js - 重力オセロ UIロジック(DOM操作・入力ハンドリング)
(function () {
  'use strict';

  const ROWS = GravityOthelloLogic.ROWS;
  const COLS = GravityOthelloLogic.COLS;
  const BLACK = GravityOthelloLogic.BLACK;
  const WHITE = GravityOthelloLogic.WHITE;

  const boardEl = document.getElementById('board');
  const turnTextEl = document.getElementById('turn-text');
  const turnIndicatorEl = document.getElementById('turn-indicator');
  const resetBtn = document.getElementById('reset-btn');
  const resultOverlay = document.getElementById('result-overlay');
  const resultText = document.getElementById('result-text');
  const playAgainBtn = document.getElementById('play-again-btn');
  const blackCountEl = document.getElementById('black-count');
  const whiteCountEl = document.getElementById('white-count');

  let board = GravityOthelloLogic.createEmptyBoard();
  let currentPlayer = BLACK;
  let gameOver = false;
  const cellEls = [];

  function buildBoard() {
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    boardEl.style.gridTemplateRows = `repeat(${ROWS}, 1fr)`;
    cellEls.length = 0;
    for (let r = 0; r < ROWS; r++) {
      const rowEls = [];
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.addEventListener('click', onCellClick);
        cell.addEventListener('mouseenter', () => setColumnHover(c, true));
        cell.addEventListener('mouseleave', () => setColumnHover(c, false));
        boardEl.appendChild(cell);
        rowEls.push(cell);
      }
      cellEls.push(rowEls);
    }
  }

  function setColumnHover(col, on) {
    if (gameOver) return;
    for (let r = 0; r < ROWS; r++) {
      cellEls[r][col].classList.toggle('col-hover', on);
    }
  }

  function updateTurnIndicator() {
    const preview = turnIndicatorEl.querySelector('.stone-preview');
    preview.className = 'stone-preview ' + currentPlayer;
    turnTextEl.textContent = (currentPlayer === BLACK ? '黒' : '白') + '番の手番です';
  }

  function updateStoneCounts() {
    let black = 0;
    let white = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell === BLACK) black++;
        else if (cell === WHITE) white++;
      }
    }
    blackCountEl.textContent = black;
    whiteCountEl.textContent = white;
  }

  function setCellStone(row, col, player, animationClass) {
    const cell = cellEls[row][col];
    cell.classList.remove('black', 'white', 'flipping', 'dropping');
    cell.classList.add(player);
    if (animationClass) {
      void cell.offsetWidth;
      cell.classList.add(animationClass);
    }
  }

  function dropAndCheck(col, player) {
    const { board: newBoard, row, flipped } = GravityOthelloLogic.dropStone(board, col, player);
    board = newBoard;

    setCellStone(row, col, player, 'dropping');
    for (const { row: r, col: c } of flipped) {
      setCellStone(r, c, player, 'flipping');
    }
    updateStoneCounts();

    const cellsToCheck = [{ row, col }, ...flipped];
    if (GravityOthelloLogic.hasWin(board, cellsToCheck)) {
      gameOver = true;
      showResult((player === BLACK ? '黒' : '白') + 'の勝ちです!');
      return true;
    }
    if (GravityOthelloLogic.isBoardFull(board)) {
      gameOver = true;
      showResult('引き分けです');
      return true;
    }
    return false;
  }

  function showResult(message) {
    resultText.textContent = message;
    resultOverlay.classList.remove('hidden');
  }

  function resetBoardState() {
    board = GravityOthelloLogic.createEmptyBoard();
    currentPlayer = BLACK;
    gameOver = false;
    resultOverlay.classList.add('hidden');
    buildBoard();
    updateTurnIndicator();
    updateStoneCounts();
  }

  function onCellClick(e) {
    if (gameOver) return;
    const col = Number(e.currentTarget.dataset.col);
    if (!GravityOthelloLogic.canDropInColumn(board, col)) return;

    if (dropAndCheck(col, currentPlayer)) return;
    currentPlayer = GravityOthelloLogic.otherPlayer(currentPlayer);
    updateTurnIndicator();
  }

  resetBtn.addEventListener('click', resetBoardState);
  playAgainBtn.addEventListener('click', resetBoardState);

  buildBoard();
  resetBoardState();
})();
