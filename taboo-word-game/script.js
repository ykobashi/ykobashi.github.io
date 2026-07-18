// script.js - NGワードゲーム(タブー形式) UIロジック(DOM操作・ロビー・オンライン対戦の配線)
(function () {
  'use strict';

  const HOST_ID = 'host';
  const TOTAL_WORDS = TabooWordLogic.ROUND_WORD_COUNT;

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
  let attemptStartTime = null;
  let timerId = null;
  let pendingResult = null; // 'attempt-result'受信後、'leaderboard'受信まで一時保持(ゲスト側)

  function describePeerError(err) {
    if (err && err.type === 'peer-unavailable') return 'そのコードの部屋が見つかりませんでした。コードを確認してください。';
    if (err && err.type === 'network') return 'ネットワークエラーが発生しました。通信環境をご確認ください。';
    if (err && err.type === 'unavailable-id') return '部屋の作成に失敗しました。もう一度お試しください。';
    return '接続中にエラーが発生しました。もう一度お試しください。';
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
    net.broadcast({ type: 'roster', players: roster });
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
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = '友達の参加を待っています…';
        roster = TabooWordLogic.addPlayer(roster, { id: myId, name: myName });
        renderRoster();
      },
      onPeerConnected() {
        // 名前は 'join' メッセージで受け取ってから名簿に追加する
      },
      onPeerMessage(peerId, data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'join') {
          roster = TabooWordLogic.addPlayer(roster, { id: peerId, name: data.name });
          renderRoster();
          broadcastRoster();
          return;
        }
        if (data.type === 'correct') {
          if (peerId === describerId) hostAdvanceWord();
          return;
        }
      },
      onPeerDisconnected(peerId) {
        roster = TabooWordLogic.removePlayer(roster, peerId);
        renderRoster();
        if (net) broadcastRoster();
        if (describerId && peerId === describerId && !gameArea.classList.contains('hidden')) {
          gameConnectionStatus.textContent = '出題者との接続が切れました。「やめて最初からやり直す」からやり直してください。';
          gameConnectionStatus.classList.remove('hidden');
        }
      },
      onError(err) {
        showOnlineError(describePeerError(err));
      },
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

    net = TabooWordNet.joinRoom(code, {
      onOwnId(id) {
        myId = id;
      },
      onConnected(c) {
        conn = c;
        conn.send({ type: 'join', name: myName });
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = 'ホストがゲームを開始するのを待っています…';
      },
      onMessage: handleClientMessage,
      onDisconnected: handleDisconnected,
      onError(err) {
        showOnlineError(describePeerError(err));
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
    if (data.type === 'roster') {
      roster = data.players;
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
    roundWords = TabooWordLogic.pickRoundWords(Math.random, TabooWordLogic.TABOO_BANK, TOTAL_WORDS);
    currentIndex = 0;
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

  correctBtn.addEventListener('click', () => {
    if (myId === describerId) {
      if (isHost) {
        hostAdvanceWord();
      } else {
        conn.send({ type: 'correct' });
      }
    }
  });

  // ================= 挑戦画面の表示 =================

  function enterAttemptScreen() {
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

    startLocalTimer();
  }

  function applyWordToDescriberPanel(index, word, banned) {
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
    const localStart = Date.now();
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
    window.location.reload();
  });

  // ================= 結果表示 =================

  function showResult(justFinished, entries) {
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
      rankSpan.textContent = (i + 1) + '位 ' + e.describerName;
      const timeSpan = document.createElement('span');
      timeSpan.textContent = formatTime(Math.floor(e.elapsedMs / 1000));
      li.appendChild(rankSpan);
      li.appendChild(timeSpan);
      leaderboardListEl.appendChild(li);
    });

    playAgainBtn.classList.toggle('hidden', !isHost);
  }
})();
