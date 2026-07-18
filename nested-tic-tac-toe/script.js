// script.js - 入れ子○×ゲーム UIロジック(DOM操作・入力ハンドリング)
(function () {
  'use strict';

  const BLACK = NestedTicTacToeLogic.BLACK;
  const WHITE = NestedTicTacToeLogic.WHITE;
  const DRAW = NestedTicTacToeLogic.DRAW;
  const EMPTY = NestedTicTacToeLogic.EMPTY;

  const metaBoardEl = document.getElementById('meta-board');
  const turnTextEl = document.getElementById('turn-text');
  const turnIndicatorEl = document.getElementById('turn-indicator');
  const forcedHintEl = document.getElementById('forced-hint');
  const resetBtn = document.getElementById('reset-btn');
  const resultOverlay = document.getElementById('result-overlay');
  const resultText = document.getElementById('result-text');
  const playAgainBtn = document.getElementById('play-again-btn');

  let game = NestedTicTacToeLogic.createGame();
  let forced = null;
  let currentPlayer = BLACK;
  let gameOver = false;

  const subBoardEls = [];
  const miniCellEls = [];
  const winnerMarkEls = [];

  function buildBoard() {
    metaBoardEl.innerHTML = '';
    subBoardEls.length = 0;
    miniCellEls.length = 0;
    winnerMarkEls.length = 0;

    for (let s = 0; s < 9; s++) {
      const subBoardEl = document.createElement('div');
      subBoardEl.className = 'sub-board';
      subBoardEl.dataset.sub = s;

      const winnerMark = document.createElement('div');
      winnerMark.className = 'sub-winner-mark';
      subBoardEl.appendChild(winnerMark);
      winnerMarkEls.push(winnerMark);

      const cells = [];
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement('div');
        cell.className = 'mini-cell';
        cell.dataset.sub = s;
        cell.dataset.cell = c;
        cell.addEventListener('click', onCellClick);
        subBoardEl.appendChild(cell);
        cells.push(cell);
      }
      miniCellEls.push(cells);

      metaBoardEl.appendChild(subBoardEl);
      subBoardEls.push(subBoardEl);
    }
  }

  function markLabel(value) {
    if (value === BLACK) return '○';
    if (value === WHITE) return '×';
    if (value === DRAW) return '△';
    return '';
  }

  function render() {
    const legal = new Set(gameOver ? [] : NestedTicTacToeLogic.legalSubBoards(game, forced));

    for (let s = 0; s < 9; s++) {
      const subBoardEl = subBoardEls[s];
      const status = game.bigBoard[s];
      const decided = status !== EMPTY;

      subBoardEl.classList.toggle('decided', decided);
      subBoardEl.classList.toggle('won-black', status === BLACK);
      subBoardEl.classList.toggle('won-white', status === WHITE);
      subBoardEl.classList.toggle('drawn', status === DRAW);
      subBoardEl.classList.toggle('active', legal.has(s));

      winnerMarkEls[s].textContent = markLabel(status);
      winnerMarkEls[s].className = 'sub-winner-mark' + (status === BLACK ? ' black' : status === WHITE ? ' white' : status === DRAW ? ' draw' : '');

      for (let c = 0; c < 9; c++) {
        const cellEl = miniCellEls[s][c];
        const value = game.subBoards[s][c];
        cellEl.classList.remove('black', 'white');
        if (value === BLACK) cellEl.classList.add('black');
        else if (value === WHITE) cellEl.classList.add('white');
      }
    }

    updateTurnIndicator();
    updateForcedHint(legal);
  }

  function updateTurnIndicator() {
    const preview = turnIndicatorEl.querySelector('.stone-preview');
    preview.className = 'stone-preview ' + currentPlayer;
    turnTextEl.textContent = markLabel(currentPlayer) + '番の手番です';
  }

  function updateForcedHint(legal) {
    if (gameOver) {
      forcedHintEl.textContent = '';
      return;
    }
    if (forced !== null && legal.size === 1) {
      forcedHintEl.textContent = `指定された小盤(ハイライト箇所)に置いてください`;
    } else {
      forcedHintEl.textContent = 'どの小盤にも置けます(ハイライト箇所)';
    }
  }

  function showResult(message) {
    resultText.textContent = message;
    resultOverlay.classList.remove('hidden');
  }

  function onCellClick(e) {
    if (gameOver) return;
    const sub = Number(e.currentTarget.dataset.sub);
    const cell = Number(e.currentTarget.dataset.cell);
    if (!NestedTicTacToeLogic.canPlaceAt(game, forced, sub, cell)) return;

    const result = NestedTicTacToeLogic.playMove(game, forced, sub, cell, currentPlayer);
    game = result.state;
    forced = result.nextForced;

    const bigWinner = NestedTicTacToeLogic.checkBigWinner(game);
    if (bigWinner) {
      gameOver = true;
      render();
      showResult(markLabel(bigWinner) + 'の勝ちです!');
      return;
    }
    if (NestedTicTacToeLogic.isGameOver(game)) {
      gameOver = true;
      render();
      showResult('引き分けです');
      return;
    }

    currentPlayer = NestedTicTacToeLogic.otherPlayer(currentPlayer);
    render();
  }

  function resetBoardState() {
    game = NestedTicTacToeLogic.createGame();
    forced = null;
    currentPlayer = BLACK;
    gameOver = false;
    resultOverlay.classList.add('hidden');
    buildBoard();
    render();
  }

  resetBtn.addEventListener('click', resetBoardState);
  playAgainBtn.addEventListener('click', resetBoardState);

  resetBoardState();
})();
