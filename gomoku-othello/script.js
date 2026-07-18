// script.js - 五目オセロ UIロジック(DOM操作・入力ハンドリング)
(function () {
  'use strict';

  const SIZE = GomokuOthelloLogic.BOARD_SIZE;
  const BLACK = GomokuOthelloLogic.BLACK;
  const WHITE = GomokuOthelloLogic.WHITE;

  const boardEl = document.getElementById('board');
  const turnTextEl = document.getElementById('turn-text');
  const turnIndicatorEl = document.getElementById('turn-indicator');
  const resetBtn = document.getElementById('reset-btn');
  const resultOverlay = document.getElementById('result-overlay');
  const resultText = document.getElementById('result-text');
  const playAgainBtn = document.getElementById('play-again-btn');
  const blackCountEl = document.getElementById('black-count');
  const whiteCountEl = document.getElementById('white-count');

  let board = GomokuOthelloLogic.createEmptyBoard(SIZE);
  let currentPlayer = BLACK;
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

  function setCellStone(row, col, player, animate) {
    const cell = cellEls[row][col];
    cell.classList.remove('black', 'white', 'flipping');
    cell.classList.add(player);
    if (animate) {
      // 一度クラスを外して付け直すことでアニメーションを再生させる
      void cell.offsetWidth;
      cell.classList.add('flipping');
    }
  }

  function placeAndCheck(row, col, player) {
    const { board: newBoard, flipped } = GomokuOthelloLogic.applyMove(board, row, col, player);
    board = newBoard;

    setCellStone(row, col, player, false);
    for (const { row: r, col: c } of flipped) {
      setCellStone(r, c, player, true);
    }
    updateStoneCounts();

    const cellsToCheck = [{ row, col }, ...flipped];
    if (GomokuOthelloLogic.hasWin(board, cellsToCheck)) {
      gameOver = true;
      showResult((player === BLACK ? '黒' : '白') + 'の勝ちです!');
      return true;
    }
    if (GomokuOthelloLogic.isBoardFull(board)) {
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
    board = GomokuOthelloLogic.createEmptyBoard(SIZE);
    currentPlayer = BLACK;
    gameOver = false;
    resultOverlay.classList.add('hidden');
    buildBoard();
    updateTurnIndicator();
    updateStoneCounts();
  }

  function onCellClick(e) {
    if (gameOver) return;
    const row = Number(e.currentTarget.dataset.row);
    const col = Number(e.currentTarget.dataset.col);
    if (!GomokuOthelloLogic.canPlaceStone(board, row, col)) return;

    if (placeAndCheck(row, col, currentPlayer)) return;
    currentPlayer = GomokuOthelloLogic.otherPlayer(currentPlayer);
    updateTurnIndicator();
  }

  resetBtn.addEventListener('click', resetBoardState);
  playAgainBtn.addEventListener('click', resetBoardState);

  buildBoard();
  resetBoardState();
})();
