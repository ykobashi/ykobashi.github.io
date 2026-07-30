(function () {
  'use strict';
  const L = MinesweeperLogic;
  const boardEl = document.getElementById('board');
  const minesEl = document.getElementById('mines-count');
  const timeEl = document.getElementById('time-count');
  const messageEl = document.getElementById('game-message');
  const difficultyEl = document.getElementById('difficulty');
  const newGameBtn = document.getElementById('new-game-btn');
  const flagModeBtn = document.getElementById('flag-mode-btn');
  let difficultyKey = 'beginner', board, boardInitialized = false, flagMode = false, elapsedSeconds = 0, timerId = null, gameOver = false, gameWon = false, explodedCell = null, cellEls = [];

  function config() { return L.DIFFICULTIES[difficultyKey]; }
  function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
  function startTimer() { if (!timerId) timerId = setInterval(() => { elapsedSeconds++; renderStatus(); }, 1000); }
  function renderStatus() { minesEl.textContent = String(L.remainingMineCount(board, config().mines)); timeEl.textContent = L.formatTime(elapsedSeconds); }
  function buildBoard() {
    const { rows, cols } = config(); boardEl.innerHTML = ''; boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`; cellEls = [];
    for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'cell'; el.setAttribute('aria-label', `${r + 1}行${c + 1}列`); el.addEventListener('click', () => onCellClick(r, c)); el.addEventListener('contextmenu', (event) => { event.preventDefault(); onFlag(r, c); }); boardEl.appendChild(el); row.push(el);
    } cellEls.push(row); }
  }
  function render() {
    board.forEach((row, r) => row.forEach((cell, c) => {
      const el = cellEls[r][c]; el.className = 'cell'; el.textContent = ''; el.disabled = gameOver;
      if (cell.opened) { el.classList.add('opened'); if (cell.mine) { el.classList.add('mine'); el.textContent = explodedCell && explodedCell[0] === r && explodedCell[1] === c ? '💥' : '💣'; if (explodedCell && explodedCell[0] === r && explodedCell[1] === c) el.classList.add('exploded'); } else if (cell.adjacent) { el.classList.add('number-' + cell.adjacent); el.textContent = String(cell.adjacent); } }
      else if (cell.flagged) { el.classList.add('flagged'); el.textContent = '🚩'; }
    })); renderStatus();
  }
  function finish(won) { gameOver = true; gameWon = won; stopTimer(); if (!won) L.revealAllMines(board); messageEl.textContent = won ? `クリア！ ${L.formatTime(elapsedSeconds)}` : 'ゲームオーバー！'; messageEl.className = won ? 'message win' : 'message lose'; render(); }
  function onFlag(r, c) { if (gameOver || !board[r][c].opened) { if (!gameOver) { L.toggleFlag(board, r, c); render(); } } }
  function onCellClick(r, c) {
    if (gameOver) return;
    if (flagMode) { onFlag(r, c); return; }
    if (board[r][c].flagged) return;
    if (!boardInitialized) { board = L.generateBoard(config().rows, config().cols, config().mines, [r, c]); boardInitialized = true; startTimer(); }
    if (board[r][c].mine) { explodedCell = [r, c]; finish(false); return; }
    L.floodOpen(board, r, c); if (L.isWin(board)) finish(true); else render();
  }
  function newGame() { stopTimer(); board = L.createEmptyBoard(config().rows, config().cols); boardInitialized = false; flagMode = false; elapsedSeconds = 0; gameOver = false; gameWon = false; explodedCell = null; messageEl.textContent = '最初のマスは必ず安全です'; messageEl.className = 'message'; flagModeBtn.setAttribute('aria-pressed', 'false'); flagModeBtn.textContent = '🚩 旗モード'; buildBoard(); render(); }
  difficultyEl.addEventListener('change', () => { difficultyKey = difficultyEl.value; newGame(); });
  newGameBtn.addEventListener('click', newGame);
  flagModeBtn.addEventListener('click', () => { flagMode = !flagMode; flagModeBtn.setAttribute('aria-pressed', String(flagMode)); flagModeBtn.textContent = flagMode ? '🚩 旗モード中' : '🚩 旗モード'; });
  newGame();
})();
