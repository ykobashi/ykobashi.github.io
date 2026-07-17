// script.js - 五目並べ UIロジック(DOM操作・入力ハンドリング・オンライン対戦の配線)
(function () {
  'use strict';

  const SIZE = GomokuLogic.BOARD_SIZE;
  const BLACK = GomokuLogic.BLACK;
  const WHITE = GomokuLogic.WHITE;
  const AI_THINK_MS = 450;

  // --- DOM要素 ---
  const setupScreen = document.getElementById('setup-screen');
  const modeSelect = document.getElementById('mode-select');
  const modeCpuBtn = document.getElementById('mode-cpu-btn');
  const modeOnlineBtn = document.getElementById('mode-online-btn');

  const onlinePanel = document.getElementById('online-panel');
  const onlineBackBtn = document.getElementById('online-back-btn');
  const hostBtn = document.getElementById('host-btn');
  const joinBtn = document.getElementById('join-btn');
  const joinCodeInput = document.getElementById('join-code-input');
  const hostWait = document.getElementById('host-wait');
  const roomCodeText = document.getElementById('room-code-text');
  const copyCodeBtn = document.getElementById('copy-code-btn');
  const onlineStatusEl = document.getElementById('online-status');
  const onlineErrorEl = document.getElementById('online-error');

  const gameArea = document.getElementById('game-area');
  const onlineConnectionStatus = document.getElementById('online-connection-status');
  const quitOnlineBtn = document.getElementById('quit-online-btn');

  const boardEl = document.getElementById('board');
  const turnTextEl = document.getElementById('turn-text');
  const turnIndicatorEl = document.getElementById('turn-indicator');
  const resetBtn = document.getElementById('reset-btn');
  const resultOverlay = document.getElementById('result-overlay');
  const resultText = document.getElementById('result-text');
  const playAgainBtn = document.getElementById('play-again-btn');

  // --- ゲーム状態 ---
  let board = GomokuLogic.createEmptyBoard(SIZE);
  let currentPlayer = BLACK;
  let gameOver = false;
  let aiThinking = false;
  const cellEls = [];

  // mode: 'cpu' | 'online'
  let mode = null;
  // online専用
  let onlinePeer = null;
  let onlineConn = null;
  let myColor = BLACK;

  // ================= 盤面共通 =================

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

    if (mode === 'online') {
      turnTextEl.textContent = currentPlayer === myColor ? 'あなたの番です' : '相手の番です…';
    } else if (currentPlayer === BLACK) {
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
      showResult(resultMessageFor(player));
      return true;
    }
    if (GomokuLogic.isBoardFull(board)) {
      gameOver = true;
      showResult('引き分けです');
      return true;
    }
    return false;
  }

  function resultMessageFor(winner) {
    if (mode === 'online') {
      return winner === myColor ? 'あなたの勝ちです!' : '相手の勝ちです';
    }
    return winner === BLACK ? 'あなたの勝ちです!' : 'CPUの勝ちです';
  }

  function showResult(message) {
    resultText.textContent = message;
    resultOverlay.classList.remove('hidden');
  }

  function resetBoardState() {
    board = GomokuLogic.createEmptyBoard(SIZE);
    currentPlayer = BLACK;
    gameOver = false;
    aiThinking = false;
    boardEl.classList.remove('thinking');
    resultOverlay.classList.add('hidden');
    buildBoard();
    updateTurnIndicator();
  }

  // ================= クリック処理 =================

  function onCellClick(e) {
    if (gameOver) return;
    const row = Number(e.currentTarget.dataset.row);
    const col = Number(e.currentTarget.dataset.col);
    if (!GomokuLogic.canPlaceStone(board, row, col)) return;

    if (mode === 'online') {
      if (currentPlayer !== myColor || !onlineConn) return;
      if (placeAndCheck(row, col, myColor)) {
        sendToPeer({ type: 'move', row, col });
        return;
      }
      sendToPeer({ type: 'move', row, col });
      currentPlayer = GomokuLogic.otherPlayer(currentPlayer);
      updateTurnIndicator();
      return;
    }

    // CPUモード
    if (aiThinking || currentPlayer !== BLACK) return;
    if (placeAndCheck(row, col, BLACK)) return;
    currentPlayer = WHITE;
    updateTurnIndicator();
    scheduleAiMove();
  }

  function scheduleAiMove() {
    aiThinking = true;
    boardEl.classList.add('thinking');
    setTimeout(() => {
      const move = GomokuLogic.chooseAiMove(board, WHITE, BLACK);
      aiThinking = false;
      boardEl.classList.remove('thinking');
      if (!move || gameOver) return;

      if (placeAndCheck(move.row, move.col, WHITE)) return;

      currentPlayer = BLACK;
      updateTurnIndicator();
    }, AI_THINK_MS);
  }

  // ================= 対局リセット =================

  function restartCpuGame() {
    mode = 'cpu';
    resetBoardState();
  }

  function requestRestart() {
    if (mode === 'online') {
      resetBoardState();
      sendToPeer({ type: 'reset' });
    } else {
      restartCpuGame();
    }
  }

  resetBtn.addEventListener('click', requestRestart);
  playAgainBtn.addEventListener('click', requestRestart);

  // ================= モード選択画面 =================

  function showModeSelect() {
    modeSelect.classList.remove('hidden');
    onlinePanel.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    gameArea.classList.add('hidden');
    onlineConnectionStatus.classList.add('hidden');
    quitOnlineBtn.classList.add('hidden');
    resetOnlinePanel();
  }

  function resetOnlinePanel() {
    hostWait.classList.add('hidden');
    onlineErrorEl.classList.add('hidden');
    onlineErrorEl.textContent = '';
    joinCodeInput.value = '';
    hostBtn.disabled = false;
    joinBtn.disabled = false;
    joinCodeInput.disabled = false;
  }

  modeCpuBtn.addEventListener('click', () => {
    mode = 'cpu';
    setupScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    restartCpuGame();
  });

  modeOnlineBtn.addEventListener('click', () => {
    modeSelect.classList.add('hidden');
    onlinePanel.classList.remove('hidden');
    resetOnlinePanel();
  });

  onlineBackBtn.addEventListener('click', () => {
    cleanupOnlineConnection();
    modeSelect.classList.remove('hidden');
    onlinePanel.classList.add('hidden');
  });

  quitOnlineBtn.addEventListener('click', () => {
    cleanupOnlineConnection();
    showModeSelect();
  });

  // ================= オンライン対戦 =================

  function cleanupOnlineConnection() {
    if (onlineConn) {
      try { onlineConn.close(); } catch (err) { /* noop */ }
      onlineConn = null;
    }
    if (onlinePeer) {
      try { onlinePeer.destroy(); } catch (err) { /* noop */ }
      onlinePeer = null;
    }
  }

  function showOnlineError(message) {
    onlineErrorEl.textContent = message;
    onlineErrorEl.classList.remove('hidden');
    hostBtn.disabled = false;
    joinBtn.disabled = false;
    joinCodeInput.disabled = false;
    hostWait.classList.add('hidden');
  }

  function describePeerError(err) {
    if (err && err.type === 'peer-unavailable') return 'そのコードの部屋が見つかりませんでした。コードを確認してください。';
    if (err && err.type === 'network') return 'ネットワークエラーが発生しました。通信環境をご確認ください。';
    if (err && err.type === 'unavailable-id') return '部屋の作成に失敗しました。もう一度お試しください。';
    return '接続中にエラーが発生しました。もう一度お試しください。';
  }

  hostBtn.addEventListener('click', () => {
    hostBtn.disabled = true;
    joinBtn.disabled = true;
    joinCodeInput.disabled = true;
    onlineErrorEl.classList.add('hidden');

    onlinePeer = GomokuNet.hostRoom({
      onCode(code) {
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        onlineStatusEl.textContent = '相手の参加を待っています…';
      },
      onConnected(conn) {
        onlineConn = conn;
        myColor = BLACK;
        enterOnlineGame();
      },
      onMessage: handlePeerMessage,
      onDisconnected: handlePeerDisconnected,
      onError(err) {
        showOnlineError(describePeerError(err));
      },
    });
  });

  joinBtn.addEventListener('click', () => {
    const code = joinCodeInput.value.trim();
    if (code.length !== 6) {
      showOnlineError('6桁のコードを入力してください。');
      return;
    }
    hostBtn.disabled = true;
    joinBtn.disabled = true;
    joinCodeInput.disabled = true;
    onlineErrorEl.classList.add('hidden');
    onlineStatusEl.textContent = '';
    hostWait.classList.add('hidden');

    onlinePeer = GomokuNet.joinRoom(code, {
      onConnected(conn) {
        onlineConn = conn;
        myColor = WHITE;
        enterOnlineGame();
      },
      onMessage: handlePeerMessage,
      onDisconnected: handlePeerDisconnected,
      onError(err) {
        showOnlineError(describePeerError(err));
      },
    });
  });

  copyCodeBtn.addEventListener('click', () => {
    const code = roomCodeText.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        onlineStatusEl.textContent = 'コピーしました。相手の参加を待っています…';
      }).catch(() => {
        onlineStatusEl.textContent = 'コードをコピーできませんでした。手動で伝えてください: ' + code;
      });
    }
  });

  function sendToPeer(message) {
    if (onlineConn && onlineConn.open) {
      onlineConn.send(message);
    }
  }

  function handlePeerMessage(data) {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'move') {
      if (gameOver) return;
      const opponentColor = GomokuLogic.otherPlayer(myColor);
      if (!GomokuLogic.canPlaceStone(board, data.row, data.col)) return;
      if (placeAndCheck(data.row, data.col, opponentColor)) return;
      currentPlayer = myColor;
      updateTurnIndicator();
      return;
    }

    if (data.type === 'reset') {
      resetBoardState();
      return;
    }
  }

  function handlePeerDisconnected() {
    if (mode !== 'online') return;
    gameOver = true;
    onlineConnectionStatus.textContent = '相手との接続が切れました。「対戦をやめてモード選択に戻る」から再度接続してください。';
    onlineConnectionStatus.classList.remove('hidden');
  }

  function enterOnlineGame() {
    mode = 'online';
    setupScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    quitOnlineBtn.classList.remove('hidden');
    onlineConnectionStatus.classList.remove('hidden');
    onlineConnectionStatus.textContent = myColor === BLACK
      ? '接続しました。あなたは黒番(先手)です。'
      : '接続しました。あなたは白番(後手)です。';
    resetBoardState();
  }

  // ================= 初期表示 =================

  buildBoard();
  showModeSelect();
})();
