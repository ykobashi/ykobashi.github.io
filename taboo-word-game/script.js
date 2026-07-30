// script.js - NGワードゲーム(タブー形式) UIロジック(DOM操作・ロビー・オンライン対戦の配線)
(function () {
  'use strict';

  const HOST_ID = 'host';
  const TOTAL_WORDS = TabooWordLogic.ROUND_WORD_COUNT;
  const REJOIN_GRACE_MS = 30000;
  const GAME_KEY = 'taboo-word-game';

  // --- DOM要素(名前入力・接続) ---
  const setupScreen = document.getElementById('setup-screen');
  const nameInput = document.getElementById('name-input');
  const hostBtn = document.getElementById('host-btn');
  const joinCodeInput = document.getElementById('join-code-input');
  const joinBtn = document.getElementById('join-btn');
  const onlineErrorEl = document.getElementById('online-error');

  // --- DOM要素(ロビー) ---
  const lobbyPanel = document.getElementById('lobby-panel');
  const hostWait = document.getElementById('host-wait');
  const roomCodeText = document.getElementById('room-code-text');
  const copyCodeBtn = document.getElementById('copy-code-btn');
  const onlineStatusEl = document.getElementById('online-status');
  const rosterList = document.getElementById('roster-list');
  const startBtn = document.getElementById('start-btn');

  // --- DOM要素(出題者選択) ---
  const describerSelect = document.getElementById('describer-select');
  const describerCandidatesEl = document.getElementById('describer-candidates');
  const describerWaitMessage = document.getElementById('describer-wait-message');

  // --- DOM要素(挑戦画面) ---
  const gameArea = document.getElementById('game-area');
  const attemptDescriberNameEl = document.getElementById('attempt-describer-name');
  const attemptProgressEl = document.getElementById('attempt-progress');
  const attemptTimerEl = document.getElementById('attempt-timer');
  const describerPanel = document.getElementById('describer-panel');
  const currentWordEl = document.getElementById('current-word');
  const bannedWordsListEl = document.getElementById('banned-words-list');
  const correctBtn = document.getElementById('correct-btn');
  const guesserPanel = document.getElementById('guesser-panel');
  const gameConnectionStatus = document.getElementById('game-connection-status');
  const quitBtn = document.getElementById('quit-btn');
  const connectionHealthEl = document.getElementById('connection-health');
  const rerollWordBtn = document.getElementById('reroll-word-btn');

  // --- DOM要素(結果画面) ---
  const resultOverlay = document.getElementById('result-overlay');
  const resultTextEl = document.getElementById('result-text');
  const leaderboardListEl = document.getElementById('leaderboard-list');
  const playAgainBtn = document.getElementById('play-again-btn');

  // --- 状態 ---
  let isHost = false;
  let myId = null; // ホストは'host'固定、ゲストはPeerJSが割り当てたID
  let myName = '';
  let net = null; // ホスト:コントローラーオブジェクト / ゲスト:Peerインスタンス
  let conn = null; // ゲスト側のみ使用するDataConnection
  let roster = []; // [{id, name}]
  let leaderboard = []; // [{describerName, elapsedMs}] セッション中のみ保持

  let describerId = null;
  let describerName = '';
  let roundWords = null; // ホストのみが保持する今回の10問 [{word, banned}]
  let currentIndex = 0; // ホストのみが管理する現在の問題インデックス
  let correctAttempt = null;
  const processedCorrect = new Set();
  let usedWords = []; // ホストのみが保持する、この部屋で出題済みの単語(重複出題防止)
  let attemptStartTime = null;
  let timerId = null;
  let pendingResult = null; // 'attempt-result'受信後、'leaderboard'受信まで一時保持(ゲスト側)
  let phase = 'lobby';
  let roomCode = '';
  let playerToken = '';
  let joinRequestId = '';
  let savedSession = RejoinStorage.load(GAME_KEY);
  const pendingRejoins = new Map();

  function publicRoster() {
    return roster.map((p) => ({ id: p.id, name: p.name }));
  }

  function replacePlayerId(oldId, newId) {
    const player = roster.find((p) => p.id === oldId);
    if (player) player.id = newId;
    if (describerId === oldId) describerId = newId;
  }

  function snapshotFor(id) {
    const snapshot = {
      type: 'state-snapshot',
      snapshotVersion: 1,
      phase,
      roster: publicRoster(),
      describerId,
      describerName,
      currentIndex,
      leaderboard,
      elapsedMs: attemptStartTime ? Date.now() - attemptStartTime : 0,
    };
    if (phase === 'attempt' && id === describerId && roundWords && roundWords[currentIndex]) {
      snapshot.word = roundWords[currentIndex];
    }
    if (phase === 'result') snapshot.result = pendingResult;
    return snapshot;
  }

  function connectionHealthChanged(a, b) {
    const healthy = typeof b === 'boolean' ? b : a;
    connectionHealthEl.classList.toggle('hidden', healthy);
  }

  function showOnlineError(message) {
    onlineErrorEl.textContent = message;
    onlineErrorEl.classList.remove('hidden');
    hostBtn.disabled = false;
    joinBtn.disabled = false;
    joinCodeInput.disabled = false;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }

  // ================= ロビー名簿 =================

  function renderRoster() {
    rosterList.innerHTML = '';
    roster.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'roster-item';
      li.textContent = p.name + (p.id === myId ? '(あなた)' : '');
      rosterList.appendChild(li);
    });
    if (isHost) {
      startBtn.classList.remove('hidden');
      startBtn.disabled = !TabooWordLogic.hasMinPlayers(roster);
    }
  }

  function broadcastRoster() {
    net.broadcast({ type: 'roster', players: publicRoster() });
  }

  // ================= 名前入力・部屋作成/参加 =================

  hostBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      showOnlineError('ニックネームを入力してください。');
      return;
    }
    myName = name;
    isHost = true;
    myId = HOST_ID;
    hostBtn.disabled = true;
    joinBtn.disabled = true;
    joinCodeInput.disabled = true;
    onlineErrorEl.classList.add('hidden');

    net = TabooWordNet.hostRoom({
      onCode(code) {
        roomCode = code;
        WakeLockHelper.enable();
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = '友達の参加を待っています…';
        roster = TabooWordLogic.addPlayer(roster, { id: myId, name: myName, token: HOST_ID });
        renderRoster();
      },
      onPeerConnected() {
        // 名前は 'join' メッセージで受け取ってから名簿に追加する
      },
      onPeerMessage(peerId, data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'join') {
          if (!data.token || phase !== 'lobby') return;
          const name = String(data.name || 'ゲスト').trim().slice(0, 10) || 'ゲスト';
          roster = TabooWordLogic.addPlayer(roster, { id: peerId, name, token: data.token });
          renderRoster();
          broadcastRoster();
          net.sendTo(peerId, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode });
          return;
        }
        if (data.type === 'rejoin') {
          const player = roster.find((p) => p.token === data.token);
          const pending = player && pendingRejoins.get(data.token);
          if (!player || !pending) {
            net.sendTo(peerId, { type: 'rejoin-rejected', rejoinRequestId: data.rejoinRequestId });
            return;
          }
          clearTimeout(pending.timer);
          pendingRejoins.delete(data.token);
          const oldPeerId = player.id;
          replacePlayerId(oldPeerId, peerId);
          net.broadcast({ type: 'peer-id-changed', oldId: oldPeerId, newId: peerId });
          renderRoster();
          broadcastRoster();
          net.sendTo(peerId, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode });
          net.sendTo(peerId, snapshotFor(peerId));
          return;
        }
        if (data.type === 'correct') {
          if (peerId !== describerId || data.scopeId !== String(currentIndex) || !data.actionId) return;
          const key = peerId + ':correct:' + data.scopeId + ':' + data.actionId;
          if (!processedCorrect.has(key)) {
            processedCorrect.add(key);
            hostAdvanceWord();
          }
          net.sendTo(peerId, { type: 'correct-ack', actionId: data.actionId, scopeId: data.scopeId });
          return;
        }
      },
      onPeerDisconnected(peerId) {
        const player = roster.find((p) => p.id === peerId);
        if (!player) return;
        if (phase === 'lobby') {
          roster = TabooWordLogic.removePlayer(roster, peerId);
          renderRoster();
          if (net) broadcastRoster();
          return;
        }
        if (describerId && peerId === describerId && !gameArea.classList.contains('hidden')) {
          gameConnectionStatus.textContent = '出題者との接続が不安定です。30秒間再参加を待ちます。';
          gameConnectionStatus.classList.remove('hidden');
        }
        const timer = setTimeout(() => {
          pendingRejoins.delete(player.token);
          roster = TabooWordLogic.removePlayer(roster, peerId);
          renderRoster();
          broadcastRoster();
        }, REJOIN_GRACE_MS);
        pendingRejoins.set(player.token, { oldId: peerId, timer });
      },
      onError(err) {
        showOnlineError(PeerErrors.describe(err));
      },
      onConnectionHealthChange: connectionHealthChanged,
    });
  });

  joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const code = joinCodeInput.value.trim();
    if (!name) {
      showOnlineError('ニックネームを入力してください。');
      return;
    }
    if (code.length !== 6) {
      showOnlineError('6桁のコードを入力してください。');
      return;
    }
    myName = name;
    isHost = false;
    hostBtn.disabled = true;
    joinBtn.disabled = true;
    joinCodeInput.disabled = true;
    onlineErrorEl.classList.add('hidden');

    roomCode = code.toUpperCase();
    playerToken = savedSession && savedSession.roomCode === roomCode ? savedSession.token : RejoinStorage.newToken();
    joinRequestId = RejoinStorage.newToken();
    net = TabooWordNet.joinRoom(roomCode, {
      onOwnId(id) {
        myId = id;
      },
      onConnected(c) {
        conn = c;
        conn.send({ type: 'join', name: myName, token: playerToken, joinRequestId });
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = 'ホストがゲームを開始するのを待っています…';
      },
      onMessage: handleClientMessage,
      onDisconnected: handleDisconnected,
      onConnectionHealthChange: connectionHealthChanged,
      onError(err) {
        if (savedSession && savedSession.roomCode === roomCode && err && err.type === 'peer-unavailable') {
          RejoinStorage.clear(GAME_KEY);
          savedSession = null;
        }
        showOnlineError(PeerErrors.describe(err));
      },
    });
  });

  copyCodeBtn.addEventListener('click', () => {
    const code = roomCodeText.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        onlineStatusEl.textContent = 'コピーしました。友達の参加を待っています…';
      }).catch(() => {
        onlineStatusEl.textContent = 'コードをコピーできませんでした。手動で伝えてください: ' + code;
      });
    }
  });

  // ================= ゲスト側メッセージ処理 =================

  function handleClientMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join-ack' && data.joinRequestId === joinRequestId) {
      RejoinStorage.save(GAME_KEY, { roomCode: data.roomCode, token: playerToken, name: myName });
      return;
    }
    if (data.type === 'rejoin-ack' && data.rejoinRequestId === joinRequestId) {
      RejoinStorage.save(GAME_KEY, { roomCode: data.roomCode, token: playerToken, name: myName });
      return;
    }
    if (data.type === 'rejoin-rejected') {
      RejoinStorage.clear(GAME_KEY);
      showOnlineError('再参加の有効期限が切れました。通常参加してください。');
      return;
    }
    if (data.type === 'state-snapshot' && data.snapshotVersion === 1) {
      roster = data.roster || [];
      describerId = data.describerId;
      describerName = data.describerName || '';
      currentIndex = data.currentIndex || 0;
      leaderboard = data.leaderboard || [];
      attemptStartTime = data.elapsedMs ? Date.now() - data.elapsedMs : null;
      renderRoster();
      if (data.phase === 'selection') showDescriberSelectScreen();
      else if (data.phase === 'attempt') {
        enterAttemptScreen();
        if (data.word && myId === describerId) {
          applyWordToDescriberPanel(currentIndex, data.word.word, data.word.banned);
        } else updateProgressDisplay(currentIndex);
      } else if (data.phase === 'result' && data.result) showResult(data.result, leaderboard);
      else {
        setupScreen.classList.add('hidden');
        lobbyPanel.classList.remove('hidden');
      }
      return;
    }
    if (data.type === 'roster') {
      roster = data.players;
      renderRoster();
      return;
    }
    if (data.type === 'peer-id-changed' && typeof data.oldId === 'string' && typeof data.newId === 'string') {
      replacePlayerId(data.oldId, data.newId);
      renderRoster();
      return;
    }
    if (data.type === 'describer-select-pending') {
      showDescriberSelectScreen();
      return;
    }
    if (data.type === 'attempt-start') {
      describerId = data.describerId;
      describerName = data.describerName;
      enterAttemptScreen();
      return;
    }
    if (data.type === 'word') {
      applyWordToDescriberPanel(data.index, data.word, data.banned);
      return;
    }
    if (data.type === 'correct-ack' && correctAttempt &&
        data.actionId === correctAttempt.actionId && data.scopeId === correctAttempt.scopeId) {
      correctAttempt.attempt.confirm();
      correctAttempt = null;
      return;
    }
    if (data.type === 'progress') {
      updateProgressDisplay(data.index);
      return;
    }
    if (data.type === 'attempt-result') {
      pendingResult = { describerId: data.describerId, describerName: data.describerName, elapsedMs: data.elapsedMs };
      return;
    }
    if (data.type === 'leaderboard') {
      leaderboard = data.entries;
      if (pendingResult) {
        showResult(pendingResult, leaderboard);
        pendingResult = null;
      }
      return;
    }
  }

  function handleDisconnected() {
    gameConnectionStatus.textContent = 'ホストとの接続が切れました。ページを再読み込みして最初からやり直してください。';
    gameConnectionStatus.classList.remove('hidden');
  }

  // ================= 出題者選択(ホストのみ操作) =================

  function hostBeginDescriberSelection() {
    phase = 'selection';
    if (net.broadcast) net.broadcast({ type: 'describer-select-pending' });
    showDescriberSelectScreen();
  }

  startBtn.addEventListener('click', () => {
    if (!TabooWordLogic.hasMinPlayers(roster)) return;
    hostBeginDescriberSelection();
  });

  playAgainBtn.addEventListener('click', () => {
    if (!isHost) return;
    hostBeginDescriberSelection();
  });

  function showDescriberSelectScreen() {
    phase = 'selection';
    setupScreen.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    gameArea.classList.add('hidden');
    resultOverlay.classList.add('hidden');
    describerSelect.classList.remove('hidden');

    if (isHost) {
      describerWaitMessage.classList.add('hidden');
      renderDescriberCandidates();
    } else {
      describerCandidatesEl.innerHTML = '';
      describerWaitMessage.classList.remove('hidden');
    }
  }

  function renderDescriberCandidates() {
    describerCandidatesEl.innerHTML = '';
    roster.forEach((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-btn describer-candidate-btn';
      btn.textContent = p.name + (p.id === myId ? '(あなた)' : '');
      btn.addEventListener('click', () => hostStartAttempt(p.id, p.name));
      describerCandidatesEl.appendChild(btn);
    });
  }

  // ================= 挑戦の開始・進行(ホストのみ操作) =================

  function hostStartAttempt(selectedDescriberId, selectedDescriberName) {
    phase = 'attempt';
    const selection = TabooWordLogic.selectRoundWords(Math.random, TabooWordLogic.TABOO_BANK, TOTAL_WORDS, usedWords);
    roundWords = selection.words;
    usedWords = selection.usedWords;
    currentIndex = 0;
    processedCorrect.clear();
    describerId = selectedDescriberId;
    describerName = selectedDescriberName;
    attemptStartTime = Date.now();

    net.broadcast({ type: 'attempt-start', describerId, describerName });

    if (describerId === HOST_ID) {
      enterAttemptScreen();
      applyWordToDescriberPanel(0, roundWords[0].word, roundWords[0].banned);
    } else {
      net.sendTo(describerId, { type: 'word', index: 0, word: roundWords[0].word, banned: roundWords[0].banned });
      enterAttemptScreen();
      updateProgressDisplay(0);
    }
  }

  function hostAdvanceWord() {
    if (!roundWords) return;
    currentIndex += 1;

    if (currentIndex < roundWords.length) {
      const next = roundWords[currentIndex];
      if (describerId === HOST_ID) {
        applyWordToDescriberPanel(currentIndex, next.word, next.banned);
      } else {
        net.sendTo(describerId, { type: 'word', index: currentIndex, word: next.word, banned: next.banned });
        updateProgressDisplay(currentIndex);
      }
      net.broadcast({ type: 'progress', index: currentIndex });
      return;
    }

    // 全問正解:ホストの時計を正とする経過時間を確定する
    const elapsedMs = Date.now() - attemptStartTime;
    const entry = { describerName, elapsedMs };
    leaderboard = TabooWordLogic.sortLeaderboard(leaderboard.concat([entry]));

    net.broadcast({ type: 'attempt-result', describerId, describerName, elapsedMs });
    net.broadcast({ type: 'leaderboard', entries: leaderboard });

    showResult({ describerId, describerName, elapsedMs }, leaderboard);
  }

  // 現在出題中のお題だけを、部屋の重複防止ロジックを維持したまま別の単語に差し替える(ホストのみ操作)
  function hostRerollCurrentWord() {
    if (!roundWords || currentIndex >= roundWords.length) return;

    // 差し替え対象の単語を履歴から一旦外し、既出プールを不必要に減らさないようにする
    const oldWord = roundWords[currentIndex].word;
    const historyWithoutCurrent = usedWords.filter((w) => w !== oldWord);
    const selection = TabooWordLogic.selectRoundWords(Math.random, TabooWordLogic.TABOO_BANK, 1, historyWithoutCurrent);
    const newEntry = selection.words[0];

    roundWords = roundWords.slice();
    roundWords[currentIndex] = newEntry;
    usedWords = selection.usedWords;

    if (describerId === HOST_ID) {
      applyWordToDescriberPanel(currentIndex, newEntry.word, newEntry.banned);
    } else {
      net.sendTo(describerId, { type: 'word', index: currentIndex, word: newEntry.word, banned: newEntry.banned });
    }
  }

  rerollWordBtn.addEventListener('click', () => {
    if (!isHost) return;
    hostRerollCurrentWord();
  });

  correctBtn.addEventListener('click', () => {
    if (myId === describerId) {
      if (isHost) {
        hostAdvanceWord();
      } else {
        if (correctAttempt) return;
        const actionId = RejoinStorage.newToken();
        const scopeId = String(currentIndex);
        const payload = { type: 'correct', actionId, scopeId };
        const attempt = AckSend.attempt({
          send() { conn.send(payload); },
          onPending() { correctBtn.disabled = true; },
          onConfirmed() {
            gameConnectionStatus.textContent = '正解操作を送信しました。';
            gameConnectionStatus.classList.remove('hidden');
          },
          onFailed() {
            correctAttempt = null;
            correctBtn.disabled = false;
            gameConnectionStatus.textContent = '正解操作を確認できませんでした。もう一度お試しください。';
            gameConnectionStatus.classList.remove('hidden');
          },
        });
        correctAttempt = { actionId, scopeId, attempt };
      }
    }
  });

  // ================= 挑戦画面の表示 =================

  function enterAttemptScreen() {
    phase = 'attempt';
    if (!attemptStartTime) attemptStartTime = Date.now();
    setupScreen.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    describerSelect.classList.add('hidden');
    resultOverlay.classList.add('hidden');
    gameArea.classList.remove('hidden');
    gameConnectionStatus.classList.add('hidden');

    attemptDescriberNameEl.textContent = describerName;
    attemptProgressEl.textContent = '1 / ' + TOTAL_WORDS;
    attemptTimerEl.textContent = '00:00';
    currentWordEl.textContent = '--';
    bannedWordsListEl.innerHTML = '';

    if (myId === describerId) {
      describerPanel.classList.remove('hidden');
      guesserPanel.classList.add('hidden');
    } else {
      describerPanel.classList.add('hidden');
      guesserPanel.classList.remove('hidden');
    }

    rerollWordBtn.classList.toggle('hidden', !isHost);

    startLocalTimer();
  }

  function applyWordToDescriberPanel(index, word, banned) {
    currentIndex = index;
    currentWordEl.textContent = word;
    bannedWordsListEl.innerHTML = '';
    banned.forEach((w) => {
      const li = document.createElement('li');
      li.textContent = w;
      bannedWordsListEl.appendChild(li);
    });
    updateProgressDisplay(index);
  }

  function updateProgressDisplay(index) {
    attemptProgressEl.textContent = (index + 1) + ' / ' + TOTAL_WORDS;
  }

  function startLocalTimer() {
    stopLocalTimer();
    const localStart = attemptStartTime || Date.now();
    timerId = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - localStart) / 1000);
      attemptTimerEl.textContent = formatTime(elapsedSeconds);
    }, 250);
  }

  function stopLocalTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  quitBtn.addEventListener('click', () => {
    WakeLockHelper.disable();
    RejoinStorage.clear('taboo-word-game');
    window.location.reload();
  });

  // ================= 結果表示 =================

  function showResult(justFinished, entries) {
    phase = 'result';
    pendingResult = justFinished;
    stopLocalTimer();
    gameArea.classList.add('hidden');
    describerSelect.classList.add('hidden');
    resultOverlay.classList.remove('hidden');

    const seconds = Math.floor(justFinished.elapsedMs / 1000);
    resultTextEl.textContent = '出題者: ' + justFinished.describerName + ' / タイム: ' + formatTime(seconds);

    leaderboardListEl.innerHTML = '';
    entries.forEach((e, i) => {
      const li = document.createElement('li');
      if (i === 0) li.classList.add('top-rank');
      const rankSpan = document.createElement('span');
      rankSpan.textContent = (i === 0 ? '🥇 ' : '') + (i + 1) + '位 ' + e.describerName;
      const timeSpan = document.createElement('span');
      timeSpan.textContent = formatTime(Math.floor(e.elapsedMs / 1000));
      li.appendChild(rankSpan);
      li.appendChild(timeSpan);
      leaderboardListEl.appendChild(li);
    });

    playAgainBtn.classList.toggle('hidden', !isHost);
  }

  if (savedSession && savedSession.roomCode && savedSession.token && savedSession.name) {
    myName = savedSession.name;
    roomCode = savedSession.roomCode;
    playerToken = savedSession.token;
    joinRequestId = RejoinStorage.newToken();
    isHost = false;
    net = TabooWordNet.joinRoom(roomCode, {
      onOwnId(id) { myId = id; },
      onConnected(c) {
        conn = c;
        conn.send({ type: 'rejoin', token: playerToken, name: myName, rejoinRequestId: joinRequestId });
      },
      onMessage: handleClientMessage,
      onDisconnected: handleDisconnected,
      onConnectionHealthChange: connectionHealthChanged,
      onError(err) {
        if (savedSession && savedSession.roomCode === roomCode && err && err.type === 'peer-unavailable') {
          RejoinStorage.clear(GAME_KEY);
          savedSession = null;
        }
        showOnlineError(PeerErrors.describe(err));
      },
    });
  }
})();
