// script.js - 神経衰弱 UIロジック(DOM操作・入力ハンドリング・CPU/オンライン対戦の配線)
(function () {
  'use strict';

  const MISMATCH_DELAY_MS = 700;
  const AI_THINK_MS = 550;
  const AI_FLIP_DELAY_MS = 500;
  const AI_RECALL_CHANCE = 0.75;

  // --- DOM要素 ---
  const setupScreen = document.getElementById('setup-screen');
  const modeSelect = document.getElementById('mode-select');
  const modeSoloBtn = document.getElementById('mode-solo-btn');
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

  const boardEl = document.getElementById('board');
  const movesEl = document.getElementById('moves-count');
  const timeEl = document.getElementById('elapsed-time');
  const turnTextEl = document.getElementById('turn-text');
  const movesStat = document.getElementById('moves-stat');
  const timeStat = document.getElementById('time-stat');
  const turnStat = document.getElementById('turn-stat');
  const scoreboard = document.getElementById('scoreboard');
  const scorePlayerEls = [document.getElementById('score-player-0'), document.getElementById('score-player-1')];
  const scoreLabelEls = [document.getElementById('score-label-0'), document.getElementById('score-label-1')];
  const scoreValueEls = [document.getElementById('score-value-0'), document.getElementById('score-value-1')];

  const resetBtn = document.getElementById('reset-btn');
  const resultOverlay = document.getElementById('result-overlay');
  const resultText = document.getElementById('result-text');
  const resultDetail = document.getElementById('result-detail');
  const playAgainBtn = document.getElementById('play-again-btn');

  // --- ゲーム状態 ---
  // mode: 'solo' | 'local' | 'cpu' | 'online'
  let mode = null;
  let state = null;
  let cardEls = [];
  let locked = false; // 不一致判定待ち・CPU思考中などは入力を無視
  let startTime = null;
  let timerId = null;
  let elapsedSeconds = 0;
  let aiMemory = MemoryLogic.createAiMemory();

  // online専用
  let onlinePeer = null;
  let onlineConn = null;
  let myPlayerIndex = 0;

  // ================= 盤面共通 =================

  function buildBoard() {
    boardEl.innerHTML = '';
    cardEls = state.cards.map((card, index) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'card';
      cardEl.innerHTML =
        '<div class="card-inner">' +
        '<div class="card-face card-back"></div>' +
        '<div class="card-face card-front">' + card.symbol + '</div>' +
        '</div>';
      cardEl.addEventListener('click', () => onCardClick(index));
      boardEl.appendChild(cardEl);
      return cardEl;
    });
  }

  function renderCards() {
    state.cards.forEach((card, i) => {
      const el = cardEls[i];
      el.classList.toggle('flipped', card.flipped);
      el.classList.toggle('matched', card.matched);
    });
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }

  function startTimer() {
    stopTimer();
    startTime = Date.now();
    elapsedSeconds = 0;
    timeEl.textContent = formatTime(0);
    timerId = setInterval(() => {
      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      timeEl.textContent = formatTime(elapsedSeconds);
    }, 250);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function updateTurnText() {
    if (mode === 'local') {
      turnTextEl.textContent = (state.currentPlayer === 0 ? 'プレイヤー1' : 'プレイヤー2') + 'の番です';
    } else if (mode === 'cpu') {
      turnTextEl.textContent = state.currentPlayer === 0 ? 'あなたの番です' : 'CPU思考中です…';
    } else if (mode === 'online') {
      turnTextEl.textContent = state.currentPlayer === myPlayerIndex ? 'あなたの番です' : '相手の番です…';
    }
  }

  function updateScoreboard() {
    if (!state.scores || state.scores.length < 2) {
      scoreboard.classList.add('hidden');
      return;
    }
    scoreboard.classList.remove('hidden');
    scoreValueEls[0].textContent = String(state.scores[0]);
    scoreValueEls[1].textContent = String(state.scores[1]);
    scorePlayerEls[0].classList.toggle('active-turn', state.currentPlayer === 0);
    scorePlayerEls[1].classList.toggle('active-turn', state.currentPlayer === 1);
  }

  function updateStats() {
    movesEl.textContent = String(state.moves);
    if (mode === 'solo') {
      movesStat.classList.remove('hidden');
      timeStat.classList.remove('hidden');
      turnStat.classList.add('hidden');
      scoreboard.classList.add('hidden');
    } else {
      movesStat.classList.remove('hidden');
      timeStat.classList.add('hidden');
      turnStat.classList.remove('hidden');
      updateScoreboard();
      updateTurnText();
    }
  }

  // ================= 対局終了 =================

  function finishGame() {
    if (mode === 'solo') {
      stopTimer();
      resultText.textContent = 'クリア!';
      resultDetail.textContent = '手数: ' + state.moves + ' / 時間: ' + formatTime(elapsedSeconds);
    } else {
      const winners = MemoryLogic.getWinnerIndices(state);
      if (winners.length !== 1) {
        resultText.textContent = '引き分けです';
      } else if (mode === 'local') {
        resultText.textContent = (winners[0] === 0 ? 'プレイヤー1' : 'プレイヤー2') + 'の勝ちです!';
      } else if (mode === 'cpu') {
        resultText.textContent = winners[0] === 0 ? 'あなたの勝ちです!' : 'CPUの勝ちです';
      } else if (mode === 'online') {
        resultText.textContent = winners[0] === myPlayerIndex ? 'あなたの勝ちです!' : '相手の勝ちです';
      }
      resultDetail.textContent = 'スコア: ' + state.scores.join(' - ') + ' / 手数: ' + state.moves;
    }
    resultOverlay.classList.remove('hidden');
  }

  // ================= 1枚めくる処理(人間・オンライン受信共通) =================

  function applyFlip(index, shouldBroadcast) {
    state = MemoryLogic.flipCard(state, index);
    renderCards();

    if (mode === 'online' && shouldBroadcast) {
      sendToPeer({ type: 'flip', index });
    }
    if (mode === 'cpu') {
      aiMemory = MemoryLogic.rememberCard(aiMemory, index, state.cards[index].symbol);
    }

    const evalResult = MemoryLogic.evaluateFlippedPair(state);
    if (!evalResult) return; // まだ1枚目

    updateStats();

    if (evalResult.isMatch) {
      state = MemoryLogic.resolvePair(state, evalResult.indices, true);
      renderCards();
      updateStats();
      if (MemoryLogic.isGameClear(state)) {
        finishGame();
        return;
      }
      afterTurnSettled();
      return;
    }

    locked = true;
    setTimeout(() => {
      state = MemoryLogic.resolvePair(state, evalResult.indices, false);
      renderCards();
      updateStats();
      locked = false;
      if (MemoryLogic.isGameClear(state)) {
        finishGame();
        return;
      }
      afterTurnSettled();
    }, MISMATCH_DELAY_MS);
  }

  function afterTurnSettled() {
    if (mode === 'cpu' && state.currentPlayer === 1) {
      scheduleAiTurn();
    }
  }

  function onCardClick(index) {
    if (locked || !state) return;
    if (!MemoryLogic.canFlip(state, index)) return;
    if (mode === 'cpu' && state.currentPlayer !== 0) return;
    if (mode === 'online' && (state.currentPlayer !== myPlayerIndex || !onlineConn)) return;

    applyFlip(index, true);
  }

  // ================= CPU(AI)の手番 =================

  function scheduleAiTurn() {
    locked = true;
    setTimeout(() => {
      const firstIndex = MemoryLogic.chooseAiFirstFlip(state, aiMemory, Math.random, AI_RECALL_CHANCE);
      if (firstIndex === null) {
        locked = false;
        return;
      }
      const firstSymbol = state.cards[firstIndex].symbol;
      state = MemoryLogic.flipCard(state, firstIndex);
      aiMemory = MemoryLogic.rememberCard(aiMemory, firstIndex, firstSymbol);
      renderCards();

      setTimeout(() => {
        const secondIndex = MemoryLogic.chooseAiSecondFlip(state, aiMemory, firstIndex, firstSymbol, Math.random, AI_RECALL_CHANCE);
        if (secondIndex === null) {
          locked = false;
          return;
        }
        const secondSymbol = state.cards[secondIndex].symbol;
        state = MemoryLogic.flipCard(state, secondIndex);
        aiMemory = MemoryLogic.rememberCard(aiMemory, secondIndex, secondSymbol);
        renderCards();
        updateStats();

        const evalResult = MemoryLogic.evaluateFlippedPair(state);
        const isMatch = evalResult.isMatch;

        const settle = () => {
          state = MemoryLogic.resolvePair(state, evalResult.indices, isMatch);
          renderCards();
          updateStats();
          locked = false;
          if (MemoryLogic.isGameClear(state)) {
            finishGame();
            return;
          }
          if (state.currentPlayer === 1) {
            scheduleAiTurn();
          }
        };

        if (isMatch) {
          settle();
        } else {
          setTimeout(settle, MISMATCH_DELAY_MS);
        }
      }, AI_FLIP_DELAY_MS);
    }, AI_THINK_MS);
  }

  // ================= モード切り替え・リセット =================

  function resetCommon() {
    locked = false;
    resultOverlay.classList.add('hidden');
    buildBoard();
    renderCards();
    updateStats();
  }

  function restartSoloGame() {
    mode = 'solo';
    stopTimer();
    state = MemoryLogic.createInitialState(MemoryLogic.DEFAULT_SYMBOLS, Math.random, 1);
    resetCommon();
    startTimer();
  }

  function restartLocalGame() {
    mode = 'local';
    stopTimer();
    scoreLabelEls[0].textContent = 'プレイヤー1';
    scoreLabelEls[1].textContent = 'プレイヤー2';
    state = MemoryLogic.createInitialState(MemoryLogic.DEFAULT_SYMBOLS, Math.random, 2);
    resetCommon();
  }

  function restartCpuGame() {
    mode = 'cpu';
    stopTimer();
    scoreLabelEls[0].textContent = 'あなた';
    scoreLabelEls[1].textContent = 'CPU';
    aiMemory = MemoryLogic.createAiMemory();
    state = MemoryLogic.createInitialState(MemoryLogic.DEFAULT_SYMBOLS, Math.random, 2);
    resetCommon();
  }

  function requestRestart() {
    if (mode === 'solo') restartSoloGame();
    else if (mode === 'local') restartLocalGame();
    else if (mode === 'cpu') restartCpuGame();
    else if (mode === 'online') startNewOnlineDeck();
  }

  resetBtn.addEventListener('click', requestRestart);
  playAgainBtn.addEventListener('click', requestRestart);

  // ================= モード選択画面 =================

  function showModeSelect() {
    stopTimer();
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

  modeSoloBtn.addEventListener('click', () => {
    setupScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    restartSoloGame();
  });

  modeLocalBtn.addEventListener('click', () => {
    setupScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    restartLocalGame();
  });

  modeCpuBtn.addEventListener('click', () => {
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

    onlinePeer = MemoryNet.hostRoom({
      onCode(code) {
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        onlineStatusEl.textContent = '相手の参加を待っています…';
      },
      onConnected(conn) {
        onlineConn = conn;
        enterOnlineGame(true);
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

    onlinePeer = MemoryNet.joinRoom(code, {
      onConnected(conn) {
        onlineConn = conn;
        enterOnlineGame(false);
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

    if (data.type === 'init') {
      applyOnlineInit(data.deck);
      return;
    }

    if (data.type === 'flip') {
      if (!state) return;
      applyFlip(data.index, false);
      return;
    }
  }

  function handlePeerDisconnected() {
    if (mode !== 'online') return;
    onlineConnectionStatus.textContent = '相手との接続が切れました。「対戦をやめてモード選択に戻る」から再度接続してください。';
    onlineConnectionStatus.classList.remove('hidden');
  }

  function applyOnlineInit(deck) {
    state = MemoryLogic.createStateFromDeck(deck, 2);
    resetCommon();
  }

  function startNewOnlineDeck() {
    const deck = MemoryLogic.dealCards(MemoryLogic.DEFAULT_SYMBOLS, Math.random);
    applyOnlineInit(deck);
    sendToPeer({ type: 'init', deck });
  }

  function enterOnlineGame(isHost) {
    mode = 'online';
    myPlayerIndex = isHost ? 0 : 1;
    setupScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    quitOnlineBtn.classList.remove('hidden');
    onlineConnectionStatus.classList.remove('hidden');
    onlineConnectionStatus.textContent = '接続しました。';
    scoreLabelEls[0].textContent = isHost ? 'あなた' : '相手';
    scoreLabelEls[1].textContent = isHost ? '相手' : 'あなた';

    if (isHost) {
      startNewOnlineDeck();
    }
  }

  // ================= 初期表示 =================

  showModeSelect();
})();
