// script.js - 入れ子○×ゲーム UIロジック(DOM操作・入力ハンドリング・オンライン対戦の配線)
(function () {
  'use strict';

  const BLACK = NestedTicTacToeLogic.BLACK;
  const WHITE = NestedTicTacToeLogic.WHITE;
  const DRAW = NestedTicTacToeLogic.DRAW;
  const EMPTY = NestedTicTacToeLogic.EMPTY;
  const AI_THINK_MS = 350;

  // --- DOM要素 ---
  const setupScreen = document.getElementById('setup-screen');
  const modeSelect = document.getElementById('mode-select');
  const modeLocalBtn = document.getElementById('mode-local-btn');
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

  const metaBoardEl = document.getElementById('meta-board');
  const turnTextEl = document.getElementById('turn-text');
  const turnIndicatorEl = document.getElementById('turn-indicator');
  const forcedHintEl = document.getElementById('forced-hint');
  const resetBtn = document.getElementById('reset-btn');
  const resultOverlay = document.getElementById('result-overlay');
  const resultText = document.getElementById('result-text');
  const playAgainBtn = document.getElementById('play-again-btn');

  // --- ゲーム状態 ---
  let game = NestedTicTacToeLogic.createGame();
  let forced = null;
  let currentPlayer = BLACK;
  let gameOver = false;
  let aiThinking = false;

  // mode: 'local' | 'cpu' | 'online' | null
  let mode = null;
  // online専用
  let onlinePeer = null;
  let onlineConn = null;
  let myColor = BLACK;

  const subBoardEls = [];
  const miniCellEls = [];
  const winnerMarkEls = [];

  // ================= 盤面共通 =================

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

    if (mode === 'online') {
      turnTextEl.textContent = currentPlayer === myColor ? 'あなたの番です' : '相手の番です…';
    } else if (mode === 'local') {
      turnTextEl.textContent = markLabel(currentPlayer) + '番の手番です';
    } else if (currentPlayer === BLACK) {
      turnTextEl.textContent = 'あなたの番です(○)';
    } else {
      turnTextEl.textContent = 'CPU思考中です(×)…';
    }
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

  function resultMessageFor(winnerOrDraw) {
    if (winnerOrDraw === DRAW) return '引き分けです';
    if (mode === 'online') {
      return winnerOrDraw === myColor ? 'あなたの勝ちです!' : '相手の勝ちです';
    }
    if (mode === 'local') {
      return markLabel(winnerOrDraw) + 'の勝ちです!';
    }
    return winnerOrDraw === BLACK ? 'あなたの勝ちです!' : 'CPUの勝ちです';
  }

  // applyMoveAndCheck: 人間クリック・CPU・オンライン受信の3経路が全て通る単一のミューテータ。
  // 決着した場合は true を返す(呼び出し側はそれ以上手番を進めない)。
  function applyMoveAndCheck(sub, cell, player) {
    const result = NestedTicTacToeLogic.playMove(game, forced, sub, cell, player);
    game = result.state;
    forced = result.nextForced;

    const bigWinner = NestedTicTacToeLogic.checkBigWinner(game);
    const drawn = !bigWinner && NestedTicTacToeLogic.isGameOver(game);
    if (bigWinner || drawn) gameOver = true;

    render();

    if (bigWinner) {
      showResult(resultMessageFor(bigWinner));
      return true;
    }
    if (drawn) {
      showResult(resultMessageFor(DRAW));
      return true;
    }
    return false;
  }

  function resetBoardState() {
    game = NestedTicTacToeLogic.createGame();
    forced = null;
    currentPlayer = BLACK;
    gameOver = false;
    aiThinking = false;
    metaBoardEl.classList.remove('thinking');
    resultOverlay.classList.add('hidden');
    render();
  }

  // ================= クリック処理 =================

  function onCellClick(e) {
    if (gameOver) return;
    const sub = Number(e.currentTarget.dataset.sub);
    const cell = Number(e.currentTarget.dataset.cell);
    if (!NestedTicTacToeLogic.canPlaceAt(game, forced, sub, cell)) return;

    if (mode === 'online') {
      if (currentPlayer !== myColor || !onlineConn) return;
      if (applyMoveAndCheck(sub, cell, myColor)) {
        sendToPeer({ type: 'move', sub, cell });
        return;
      }
      sendToPeer({ type: 'move', sub, cell });
      currentPlayer = NestedTicTacToeLogic.otherPlayer(currentPlayer);
      render();
      return;
    }

    if (mode === 'local') {
      if (applyMoveAndCheck(sub, cell, currentPlayer)) return;
      currentPlayer = NestedTicTacToeLogic.otherPlayer(currentPlayer);
      render();
      return;
    }

    // CPUモード
    if (aiThinking || currentPlayer !== BLACK) return;
    if (applyMoveAndCheck(sub, cell, BLACK)) return;
    currentPlayer = WHITE;
    render();
    scheduleAiMove();
  }

  function scheduleAiMove() {
    aiThinking = true;
    metaBoardEl.classList.add('thinking');
    setTimeout(() => {
      const move = NestedTicTacToeLogic.chooseAiMove(game, forced, WHITE, BLACK);
      aiThinking = false;
      metaBoardEl.classList.remove('thinking');
      if (!move || gameOver) return;

      if (applyMoveAndCheck(move.sub, move.cell, WHITE)) return;

      currentPlayer = BLACK;
      render();
    }, AI_THINK_MS);
  }

  // ================= 対局リセット =================

  function restartCpuGame() {
    mode = 'cpu';
    resetBoardState();
  }

  function restartLocalGame() {
    mode = 'local';
    resetBoardState();
  }

  function requestRestart() {
    if (mode === 'online') {
      resetBoardState();
      sendToPeer({ type: 'reset' });
    } else if (mode === 'local') {
      restartLocalGame();
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

  modeLocalBtn.addEventListener('click', () => {
    mode = 'local';
    setupScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    restartLocalGame();
  });

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

    onlinePeer = NestedTicTacToeNet.hostRoom({
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

    onlinePeer = NestedTicTacToeNet.joinRoom(code, {
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
      const opponentColor = NestedTicTacToeLogic.otherPlayer(myColor);
      if (!NestedTicTacToeLogic.canPlaceAt(game, forced, data.sub, data.cell)) return;
      if (applyMoveAndCheck(data.sub, data.cell, opponentColor)) return;
      currentPlayer = myColor;
      render();
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
      ? '接続しました。あなたは○番(先手)です。'
      : '接続しました。あなたは×番(後手)です。';
    resetBoardState();
  }

  // ================= 初期表示 =================

  buildBoard();
  showModeSelect();
})();
