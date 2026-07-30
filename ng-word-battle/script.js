// script.js - NGワード対戦版 UIロジック(DOM操作・ロビー・オンライン対戦の配線)
(function () {
  'use strict';

  const HOST_ID = 'host';
  const REJOIN_GRACE_MS = 30000;

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

  // --- DOM要素(ゲーム画面) ---
  const gameArea = document.getElementById('game-area');
  const wordListEl = document.getElementById('word-list');
  const gameConnectionStatus = document.getElementById('game-connection-status');
  const quitBtn = document.getElementById('quit-btn');

  // --- DOM要素(結果画面) ---
  const resultOverlay = document.getElementById('result-overlay');
  const resultTextEl = document.getElementById('result-text');
  const resultWordListEl = document.getElementById('result-word-list');
  const playAgainBtn = document.getElementById('play-again-btn');

  // --- 状態 ---
  let isHost = false;
  let myId = null; // ホストは'host'固定、ゲストはPeerJSが割り当てたID
  let myName = '';
  let net = null; // ホスト:コントローラーオブジェクト / ゲスト:Peerインスタンス
  let conn = null; // ゲスト側のみ使用するDataConnection
  let roster = []; // [{id, name}]
  let currentPlayers = []; // [{id, name, word}] 直近のラウンドの単語一覧(全員分)
  let currentClaim = null; // ホストのみが保持する { catcherId, targetId } / 早い者勝ちの確定済みクレーム
  let scopeId = '';
  let pendingCatch = null;
  const processedActions = new Set();
  let roomCode = '', playerToken = '', joinRequestId = '';
  let savedSession = RejoinStorage.load('ng-word-battle');
  const rejoinTimers = new Map();

  function showOnlineError(message) {
    onlineErrorEl.textContent = message;
    onlineErrorEl.classList.remove('hidden');
    hostBtn.disabled = false;
    joinBtn.disabled = false;
    joinCodeInput.disabled = false;
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
      startBtn.disabled = !NgWordBattleLogic.hasMinPlayers(roster);
    }
  }

  function broadcastRoster() {
    net.broadcast({ type: 'roster', players: publicRoster() });
  }

  function publicRoster() { return roster.map((p) => ({ id: p.id, name: p.name })); }
  function replaceId(oldId, newId) {
    roster.forEach((p) => { if (p.id === oldId) p.id = newId; });
    currentPlayers.forEach((p) => { if (p.id === oldId) p.id = newId; });
    if (currentClaim) {
      if (currentClaim.catcherId === oldId) currentClaim.catcherId = newId;
      if (currentClaim.targetId === oldId) currentClaim.targetId = newId;
    }
  }
  function snapshotFor(id) {
    const phase = !resultOverlay.classList.contains('hidden') ? 'result'
      : (!gameArea.classList.contains('hidden') ? 'game' : 'lobby');
    return { type: 'state-snapshot', snapshotVersion: 1, phase, scopeId,
      roster: publicRoster(), players: currentPlayers, claim: currentClaim,
      self: { id } };
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

    net = NgWordBattleNet.hostRoom({
      onCode(code) {
        roomCode = code;
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = '友達の参加を待っています…';
        roster = NgWordBattleLogic.addPlayer(roster, { id: myId, name: myName, token: 'host' });
        renderRoster();
      },
      onPeerConnected() {
        // 名前は 'join' メッセージで受け取ってから名簿に追加する
      },
      onPeerMessage(peerId, data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'join') {
          const name = String(data.name || 'ゲスト').trim().slice(0, 10) || 'ゲスト';
          if (!roster.some((p) => p.token === data.token)) roster = NgWordBattleLogic.addPlayer(roster, { id: peerId, name, token: data.token });
          renderRoster();
          broadcastRoster();
          net.sendTo(peerId, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode });
          return;
        }
        if (data.type === 'rejoin') {
          const player = roster.find((p) => p.token === data.token);
          const pending = player && rejoinTimers.get(data.token);
          if (!player || !pending) {
            net.sendTo(peerId, { type: 'rejoin-rejected', rejoinRequestId: data.rejoinRequestId });
            return;
          }
          clearTimeout(pending.timer);
          rejoinTimers.delete(data.token);
          const oldPeerId = player.id;
          replaceId(oldPeerId, peerId);
          net.broadcast({ type: 'peer-id-changed', oldId: oldPeerId, newId: peerId });
          renderRoster();
          broadcastRoster();
          net.sendTo(peerId, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode });
          net.sendTo(peerId, snapshotFor(peerId));
          return;
        }
        if (data.type === 'catch' && data.actionId && data.scopeId === scopeId) {
          const key = peerId + ':catch:' + data.scopeId + ':' + data.actionId;
          let accepted = processedActions.has(key);
          if (!accepted) {
            accepted = processCatch(peerId, data.targetId);
          }
          if (accepted) {
            processedActions.add(key);
            net.sendTo(peerId, { type: 'catch-ack', actionId: data.actionId, scopeId: data.scopeId });
          }
          return;
        }
      },
      onPeerDisconnected(peerId) {
        const player = roster.find((p) => p.id === peerId);
        if (!player) return;
        if (gameArea.classList.contains('hidden') && resultOverlay.classList.contains('hidden')) {
          roster = NgWordBattleLogic.removePlayer(roster, peerId);
          renderRoster();
          if (net) broadcastRoster();
          return;
        }
        const timer = setTimeout(() => {
          rejoinTimers.delete(player.token);
          roster = NgWordBattleLogic.removePlayer(roster, peerId);
          broadcastRoster();
          gameConnectionStatus.textContent = player.name + 'さんが戻らなかったためゲームを終了してください。';
        }, REJOIN_GRACE_MS);
        rejoinTimers.set(player.token, { oldPeerId: peerId, timer, disconnectedAt: Date.now() });
        gameConnectionStatus.textContent = player.name + 'さんの再接続を30秒待っています…';
        gameConnectionStatus.classList.remove('hidden');
      },
      onConnectionHealthChange(peerId, healthy) {
        gameConnectionStatus.textContent = healthy ? '' : '参加者との通信が不安定です。再接続を待っています…';
        gameConnectionStatus.classList.toggle('hidden', healthy);
      },
      onError(err) {
        showOnlineError(PeerErrors.describe(err));
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

    roomCode = code;
    playerToken = savedSession && savedSession.roomCode === code ? savedSession.token : RejoinStorage.newToken();
    joinRequestId = RejoinStorage.newToken();
    net = NgWordBattleNet.joinRoom(code, {
      onOwnId(id) {
        myId = id;
      },
      onConnected(c) {
        conn = c;
        if (savedSession && savedSession.roomCode === code) conn.send({ type: 'rejoin', token: playerToken, name: myName, rejoinRequestId: joinRequestId });
        else conn.send({ type: 'join', name: myName, token: playerToken, joinRequestId });
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = 'ホストがゲームを開始するのを待っています…';
      },
      onMessage: handleClientMessage,
      onDisconnected: handleDisconnected,
      onConnectionHealthChange(healthy) {
        gameConnectionStatus.textContent = healthy ? '' : '通信が不安定です。再接続を試みています…';
        gameConnectionStatus.classList.toggle('hidden', healthy);
      },
      onError(err) {
        if (savedSession && savedSession.roomCode === code && err && err.type === 'peer-unavailable') {
          RejoinStorage.clear('ng-word-battle');
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
    if (data.type === 'join-ack' && data.joinRequestId === joinRequestId) { RejoinStorage.save('ng-word-battle', { roomCode: data.roomCode, token: playerToken, name: myName }); return; }
    if (data.type === 'rejoin-ack' && data.rejoinRequestId === joinRequestId) { RejoinStorage.save('ng-word-battle', { roomCode: data.roomCode, token: playerToken, name: myName }); return; }
    if (data.type === 'rejoin-rejected') { RejoinStorage.clear('ng-word-battle'); savedSession = null; showOnlineError('再参加の有効期限が切れました。通常参加してください。'); return; }
    if (data.type === 'state-snapshot' && data.snapshotVersion === 1) {
      scopeId = data.scopeId || ''; roster = data.roster || []; currentPlayers = data.players || [];
      currentClaim = data.claim || null; renderRoster();
      if (data.phase === 'game') enterGameScreen();
      else if (data.phase === 'result' && currentClaim) showResult({ type: 'result', catcherId: currentClaim.catcherId, targetId: currentClaim.targetId, players: currentPlayers });
      else lobbyPanel.classList.remove('hidden');
      return;
    }
    if (data.type === 'catch-ack' && pendingCatch && data.actionId === pendingCatch.id && data.scopeId === scopeId) {
      pendingCatch.attempt.confirm();
      pendingCatch = null;
      return;
    }
    if (data.type === 'roster') {
      roster = data.players;
      renderRoster();
      return;
    }
    if (data.type === 'peer-id-changed' && typeof data.oldId === 'string' && typeof data.newId === 'string') {
      replaceId(data.oldId, data.newId);
      renderRoster();
      return;
    }
    if (data.type === 'words') {
      currentPlayers = data.players;
      scopeId = data.scopeId || scopeId;
      enterGameScreen();
      return;
    }
    if (data.type === 'result') {
      showResult(data);
      return;
    }
  }

  function handleDisconnected() {
    gameConnectionStatus.textContent = 'ホストとの接続が切れました。ページを再読み込みして最初からやり直してください。';
    gameConnectionStatus.classList.remove('hidden');
  }

  // ================= ゲーム開始・再戦(ホストのみ操作) =================

  function hostStartRound() {
    currentClaim = null;
    scopeId = RejoinStorage.newToken();
    const playerIds = roster.map((p) => p.id);
    const wordMap = NgWordBattleLogic.assignSecretWords(playerIds, Math.random);
    currentPlayers = roster.map((p) => ({ id: p.id, name: p.name, word: wordMap[p.id] }));

    net.broadcast({ type: 'words', players: currentPlayers, scopeId });
    enterGameScreen();
  }

  startBtn.addEventListener('click', () => {
    WakeLockHelper.enable();
    if (!NgWordBattleLogic.hasMinPlayers(roster)) return;
    hostStartRound();
  });

  playAgainBtn.addEventListener('click', () => {
    if (!isHost) return;
    hostStartRound();
  });

  function enterGameScreen() {
    resultOverlay.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    setupScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    gameConnectionStatus.classList.add('hidden');
    renderWordList();
  }

  quitBtn.addEventListener('click', () => {
    WakeLockHelper.disable();
    RejoinStorage.clear('ng-word-battle');
    window.location.reload();
  });

  // ================= 単語一覧・キャッチ操作 =================

  function renderWordList() {
    wordListEl.innerHTML = '';
    const visible = NgWordBattleLogic.visibleListFor(myId, currentPlayers);
    visible.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'word-item';

      const info = document.createElement('div');
      info.className = 'word-item-info';
      const nameEl = document.createElement('span');
      nameEl.className = 'word-item-name';
      nameEl.textContent = p.name;
      const wordEl = document.createElement('span');
      wordEl.className = 'word-item-word';
      wordEl.textContent = p.word;
      info.appendChild(nameEl);
      info.appendChild(wordEl);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'catch-btn';
      btn.textContent = 'キャッチ!';
      btn.addEventListener('click', () => {
        sendCatch(p.id);
        disableAllCatchButtons();
      });

      li.appendChild(info);
      li.appendChild(btn);
      wordListEl.appendChild(li);
    });
  }

  function disableAllCatchButtons() {
    wordListEl.querySelectorAll('.catch-btn').forEach((btn) => {
      btn.disabled = true;
    });
  }

  function sendCatch(targetId) {
    if (isHost) {
      processCatch(myId, targetId);
    } else if (conn) {
      const actionId = RejoinStorage.newToken();
      const payload = { type: 'catch', targetId, actionId, scopeId };
      const attempt = AckSend.attempt({
        send() { conn.send(payload); },
        onPending() { gameConnectionStatus.textContent = 'キャッチを送信中です…'; gameConnectionStatus.classList.remove('hidden'); },
        onConfirmed() { gameConnectionStatus.classList.add('hidden'); },
        onFailed() { gameConnectionStatus.textContent = 'キャッチを確認できませんでした。もう一度お試しください。'; renderWordList(); },
        timeoutMs: 10000,
      });
      pendingCatch = { id: actionId, attempt };
    }
  }

  // ホストのみが呼ぶ: 早い者勝ちでクレームを確定し、最初の1件だけを全員に通知する
  function processCatch(catcherId, targetId) {
    if (!currentPlayers.some((p) => p.id === catcherId)
      || !currentPlayers.some((p) => p.id === targetId)
      || targetId === catcherId) return false;
    const previousClaim = currentClaim;
    currentClaim = NgWordBattleLogic.acceptClaim(currentClaim, { catcherId, targetId });
    if (previousClaim === null && currentClaim !== null) {
      const payload = {
        type: 'result',
        catcherId: currentClaim.catcherId,
        targetId: currentClaim.targetId,
        players: currentPlayers,
      };
      net.broadcast(payload);
      showResult(payload);
    }
    return true;
  }

  // ================= 結果表示 =================

  function nameFor(id, players) {
    const p = players.find((x) => x.id === id);
    return p ? p.name : id;
  }

  function showResult(data) {
    gameArea.classList.add('hidden');
    resultOverlay.classList.remove('hidden');

    const players = data.players || currentPlayers;
    currentPlayers = players;
    const catcherName = nameFor(data.catcherId, players);
    const targetPlayer = players.find((p) => p.id === data.targetId);
    const targetName = targetPlayer ? targetPlayer.name : data.targetId;
    const word = targetPlayer ? targetPlayer.word : '';
    resultTextEl.textContent = catcherName + 'さんが' + targetName + 'さんに「' + word + '」と言わせました!';

    resultWordListEl.innerHTML = '';
    players.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p.name + ' : ' + p.word;
      resultWordListEl.appendChild(li);
    });

    playAgainBtn.classList.toggle('hidden', !isHost);
  }
  if (savedSession && savedSession.roomCode && savedSession.name) {
    nameInput.value = savedSession.name;
    joinCodeInput.value = savedSession.roomCode;
    setTimeout(() => joinBtn.click(), 0);
  }
})();
