// script.js - 2048 UIロジック(DOM操作・入力ハンドリング)
(function () {
  'use strict';

  const SIZE = Game2048Logic.GRID_SIZE;
  const boardEl = document.getElementById('board');
  const scoreEl = document.getElementById('score-count');
  const bestEl = document.getElementById('best-count');
  const resetBtn = document.getElementById('reset-btn');
  const resultOverlay = document.getElementById('result-overlay');
  const resultText = document.getElementById('result-text');
  const resultDetail = document.getElementById('result-detail');
  const playAgainBtn = document.getElementById('play-again-btn');
  const dirButtons = document.querySelectorAll('.dir-btn');

  const BEST_KEY = 'game2048_best_score';

  let grid = Game2048Logic.createEmptyGrid(SIZE);
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let gameOver = false;
  let hasShownWin = false;

  const cellEls = [];

  function buildBoard() {
    boardEl.innerHTML = '';
    for (let r = 0; r < SIZE; r++) {
      const rowEls = [];
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        boardEl.appendChild(cell);
        rowEls.push(cell);
      }
      cellEls.push(rowEls);
    }
  }

  function render() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const value = grid[r][c];
        const cell = cellEls[r][c];
        if (value === 0) {
          cell.textContent = '';
          cell.removeAttribute('data-value');
        } else {
          cell.textContent = String(value);
          cell.setAttribute('data-value', String(value));
        }
      }
    }
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
  }

  function applyMove(direction) {
    if (gameOver) return;
    let result;
    if (direction === 'left') result = Game2048Logic.moveLeft(grid);
    else if (direction === 'right') result = Game2048Logic.moveRight(grid);
    else if (direction === 'up') result = Game2048Logic.moveUp(grid);
    else if (direction === 'down') result = Game2048Logic.moveDown(grid);
    else return;

    if (!result.moved) return;

    grid = Game2048Logic.addRandomTile(result.grid);
    score += result.score;
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
    }
    render();

    if (!hasShownWin && Game2048Logic.hasWon(grid)) {
      hasShownWin = true;
      gameOver = true;
      showResult('2048達成!', 'スコア: ' + score);
      return;
    }

    if (!Game2048Logic.canMove(grid)) {
      gameOver = true;
      showResult('ゲームオーバー', 'スコア: ' + score);
    }
  }

  function showResult(title, detail) {
    resultText.textContent = title;
    resultDetail.textContent = detail;
    resultOverlay.classList.remove('hidden');
  }

  function resetGame() {
    grid = Game2048Logic.createEmptyGrid(SIZE);
    grid = Game2048Logic.addRandomTile(grid);
    grid = Game2048Logic.addRandomTile(grid);
    score = 0;
    gameOver = false;
    hasShownWin = false;
    resultOverlay.classList.add('hidden');
    render();
  }

  document.addEventListener('keydown', (e) => {
    const map = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    };
    const dir = map[e.key];
    if (dir) {
      e.preventDefault();
      applyMove(dir);
    }
  });

  dirButtons.forEach((btn) => {
    btn.addEventListener('click', () => applyMove(btn.dataset.dir));
  });

  // スワイプ操作対応
  let touchStartX = 0;
  let touchStartY = 0;
  boardEl.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }, { passive: true });

  boardEl.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = 20;
    if (Math.max(absX, absY) < threshold) return;
    if (absX > absY) {
      applyMove(dx > 0 ? 'right' : 'left');
    } else {
      applyMove(dy > 0 ? 'down' : 'up');
    }
  }, { passive: true });

  resetBtn.addEventListener('click', resetGame);
  playAgainBtn.addEventListener('click', resetGame);

  buildBoard();
  resetGame();
})();
