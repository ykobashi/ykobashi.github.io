// script.js - スネークゲーム UIロジック(DOM操作・入力ハンドリング)
(function () {
  'use strict';

  const GRID_SIZE = 20;
  const TICK_MS = 130;
  const BEST_KEY = 'snake_best_score';

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score-count');
  const bestEl = document.getElementById('best-count');
  const resetBtn = document.getElementById('reset-btn');
  const resultOverlay = document.getElementById('result-overlay');
  const resultText = document.getElementById('result-text');
  const resultDetail = document.getElementById('result-detail');
  const playAgainBtn = document.getElementById('play-again-btn');
  const dirButtons = document.querySelectorAll('.dir-btn');

  let canvasSize = 0;
  let cellPx = 0;

  let snake = [];
  let direction = SnakeLogic.DIRECTIONS.RIGHT;
  let pendingDirection = direction;
  let food = null;
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let gameOver = false;
  let timerId = null;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvasSize = Math.floor(rect.width);
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    cellPx = canvasSize / GRID_SIZE;
    draw();
  }

  function resetState() {
    snake = SnakeLogic.createInitialSnake(Math.floor(GRID_SIZE / 2), Math.floor(GRID_SIZE / 2), 3);
    direction = SnakeLogic.DIRECTIONS.RIGHT;
    pendingDirection = direction;
    food = SnakeLogic.generateFoodPosition(snake, GRID_SIZE, Math.random);
    score = 0;
    gameOver = false;
    resultOverlay.classList.add('hidden');
    updateStats();
  }

  function updateStats() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
  }

  function draw() {
    ctx.fillStyle = '#16321f';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    if (food) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(food.x * cellPx + 1, food.y * cellPx + 1, cellPx - 2, cellPx - 2);
    }

    snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#22c55e' : '#4ade80';
      ctx.fillRect(seg.x * cellPx + 1, seg.y * cellPx + 1, cellPx - 2, cellPx - 2);
    });
  }

  function tick() {
    if (gameOver) return;

    if (!SnakeLogic.isOppositeDirection(direction, pendingDirection)) {
      direction = pendingDirection;
    }

    const head = snake[0];
    const nextHead = SnakeLogic.getNextHead(head, direction);
    const grow = food ? SnakeLogic.willGrow(nextHead, food) : false;
    const bodyForCheck = SnakeLogic.bodyForCollisionCheck(snake, grow);

    if (SnakeLogic.isGameOverMove(nextHead, GRID_SIZE, bodyForCheck)) {
      endGame();
      return;
    }

    snake = SnakeLogic.moveSnake(snake, nextHead, grow);

    if (grow) {
      score += 10;
      if (score > best) {
        best = score;
        localStorage.setItem(BEST_KEY, String(best));
      }
      food = SnakeLogic.generateFoodPosition(snake, GRID_SIZE, Math.random);
      updateStats();
      if (!food) {
        // 盤面が満杯 = クリア
        endGame(true);
        return;
      }
    }

    draw();
  }

  function endGame(cleared) {
    gameOver = true;
    stopLoop();
    draw();
    resultText.textContent = cleared ? 'クリア!' : 'ゲームオーバー';
    resultDetail.textContent = 'スコア: ' + score;
    resultOverlay.classList.remove('hidden');
  }

  function startLoop() {
    stopLoop();
    timerId = setInterval(tick, TICK_MS);
  }

  function stopLoop() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function setDirection(name) {
    const dir = SnakeLogic.DIRECTIONS[name];
    if (!dir) return;
    if (SnakeLogic.isOppositeDirection(direction, dir)) return;
    pendingDirection = dir;
  }

  function restart() {
    resetState();
    draw();
    startLoop();
  }

  document.addEventListener('keydown', (e) => {
    const map = {
      ArrowUp: 'UP',
      ArrowDown: 'DOWN',
      ArrowLeft: 'LEFT',
      ArrowRight: 'RIGHT',
    };
    const name = map[e.key];
    if (name) {
      e.preventDefault();
      setDirection(name);
    }
  });

  dirButtons.forEach((btn) => {
    btn.addEventListener('click', () => setDirection(btn.dataset.dir));
  });

  // スワイプ操作対応
  let touchStartX = 0;
  let touchStartY = 0;
  canvas.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = 20;
    if (Math.max(absX, absY) < threshold) return;
    if (absX > absY) {
      setDirection(dx > 0 ? 'RIGHT' : 'LEFT');
    } else {
      setDirection(dy > 0 ? 'DOWN' : 'UP');
    }
  }, { passive: true });

  resetBtn.addEventListener('click', restart);
  playAgainBtn.addEventListener('click', restart);
  window.addEventListener('resize', resizeCanvas);

  resetState();
  resizeCanvas();
  startLoop();
})();
