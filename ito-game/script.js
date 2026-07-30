// script.js - ito(数字順ならべゲーム) UIロジック(DOM操作・ロビー・オンライン対戦の配線)
(function () {
  'use strict';

  const HOST_ID = 'host';

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
  const themeTitleEl = document.getElementById('theme-title');
  const themeScaleEl = document.getElementById('theme-scale');
  const rerollThemeBtn = document.getElementById('reroll-theme-btn');
  const myNumberEl = document.getElementById('my-number');
  const orderPanel = document.getElementById('order-panel');
  const orderCandidatesEl = document.getElementById('order-candidates');
  const orderBuiltEl = document.getElementById('order-built');
  const orderUndoBtn = document.getElementById('order-undo-btn');
  const orderConfirmBtn = document.getElementById('order-confirm-btn');
  const waitForHostEl = document.getElementById('wait-for-host');
  const gameConnectionStatus = document.getElementById('game-connection-status');
  const quitBtn = document.getElementById('quit-btn');

  // --- DOM要素(結果画面) ---
  const resultOverlay = document.getElementById('result-overlay');
  const resultTextEl = document.getElementById('result-text');
  const resultOrderEl = document.getElementById('result-order');
  const playAgainBtn = document.getElementById('play-again-btn');

  // --- 状態 ---
  let isHost = false;
  let myId = null; // ホストは'host'固定、ゲストはPeerJSが割り当てたID
  let myName = '';
  let net = null; // ホスト:コントローラーオブジェクト / ゲスト:Peerインスタンス
  let conn = null; // ゲスト側のみ使用するDataConnection
  let roster = []; // [{id, name}]
  let orderBuilding = []; // ホストが並べている途中のid配列
  let currentNumberMap = null; // ホストのみが保持する {id: number}
  let currentTheme = null; // 現在のお題(ホスト・ゲスト共通で保持)
  let phase = 'lobby', roomCode = '', playerToken = '', joinRequestId = '';
  let savedSession = RejoinStorage.load('ito-game');
  const rejoinTimers = new Map();
  let usedThemes = [];

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
      startBtn.disabled = !ItoLogic.hasMinPlayers(roster);
    }
  }

  function broadcastRoster() {
    net.broadcast({ type: 'roster', players: roster.map((p) => ({ id: p.id, name: p.name })) });
  }
  function replaceId(oldId, newId) { roster.forEach((p) => { if (p.id === oldId) p.id = newId; }); orderBuilding = orderBuilding.map((id) => id === oldId ? newId : id); if (currentNumberMap && currentNumberMap[oldId] !== undefined) { currentNumberMap[newId] = currentNumberMap[oldId]; delete currentNumberMap[oldId]; } }
  function snapshotFor(id) { return { type: 'state-snapshot', snapshotVersion: 1, phase, roster: roster.map((p) => ({ id: p.id, name: p.name })), theme: currentTheme, number: currentNumberMap && currentNumberMap[id], orderBuilding }; }

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

    net = ItoNet.hostRoom({
      onCode(code) {
        roomCode = code;
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = '友達の参加を待っています…';
        roster = ItoLogic.addPlayer(roster, { id: myId, name: myName });
        renderRoster();
      },
      onPeerConnected() {
        // 名前は 'join' メッセージで受け取ってから名簿に追加する
      },
      onPeerMessage(peerId, data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'join') {
          const name = String(data.name || 'ゲスト').trim().slice(0, 10) || 'ゲスト';
          if (!roster.some((p) => p.token === data.token)) roster.push({ id: peerId, name, token: data.token });
          renderRoster();
          broadcastRoster();
          net.sendTo(peerId, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode });
        } else if (data.type === 'rejoin') {
          const player = roster.find((p) => p.token === data.token); const pending = player && rejoinTimers.get(data.token);
          if (!player || !pending) { net.sendTo(peerId, { type: 'rejoin-rejected', rejoinRequestId: data.rejoinRequestId }); return; }
          clearTimeout(pending.timer); rejoinTimers.delete(data.token); replaceId(player.id, peerId); renderRoster(); broadcastRoster(); net.sendTo(peerId, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode }); net.sendTo(peerId, snapshotFor(peerId));
        }
      },
      onPeerDisconnected(peerId) {
        const player = roster.find((p) => p.id === peerId); if (!player) return;
        if (phase === 'lobby') { roster = ItoLogic.removePlayer(roster, peerId); renderRoster(); if (net) broadcastRoster(); return; }
        const timer = setTimeout(() => { rejoinTimers.delete(player.token); roster = ItoLogic.removePlayer(roster, peerId); broadcastRoster(); gameConnectionStatus.textContent = player.name + 'さんが戻らなかったためゲームを終了してください。'; }, 30000);
        rejoinTimers.set(player.token, { oldPeerId: peerId, timer, disconnectedAt: Date.now() });
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

    roomCode = code; playerToken = savedSession && savedSession.roomCode === code ? savedSession.token : RejoinStorage.newToken(); joinRequestId = RejoinStorage.newToken();
    net = ItoNet.joinRoom(code, {
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
          RejoinStorage.clear('ito-game');
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
    if (data.type === 'join-ack' && data.joinRequestId === joinRequestId) { RejoinStorage.save('ito-game', { roomCode: data.roomCode, token: playerToken, name: myName }); return; }
    if (data.type === 'rejoin-ack' && data.rejoinRequestId === joinRequestId) { RejoinStorage.save('ito-game', { roomCode: data.roomCode, token: playerToken, name: myName }); return; }
    if (data.type === 'rejoin-rejected') { RejoinStorage.clear('ito-game'); showOnlineError('再参加の有効期限が切れました。通常参加してください。'); return; }
    if (data.type === 'state-snapshot' && data.snapshotVersion === 1) { roster = data.roster || []; orderBuilding = data.orderBuilding || []; currentTheme = data.theme; renderRoster(); if (data.phase === 'game') { enterGameScreen(data.theme); myNumberEl.textContent = String(data.number); renderOrderPanel(); } else lobbyPanel.classList.remove('hidden'); return; }
    if (data.type === 'roster') {
      roster = data.players;
      renderRoster();
      return;
    }
    if (data.type === 'game-start') {
      enterGameScreen(data.theme);
      return;
    }
    if (data.type === 'number') {
      myNumberEl.textContent = String(data.number);
      return;
    }
    if (data.type === 'theme-update') {
      currentTheme = data.theme;
      renderTheme(currentTheme);
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
    orderBuilding = [];
    const themeSel = ItoLogic.selectRoundTheme(Math.random, ItoLogic.THEME_BANK, usedThemes);
    const theme = themeSel.entry;
    usedThemes = themeSel.used;
    const playerIds = roster.map((p) => p.id);
    currentNumberMap = ItoLogic.assignNumbers(playerIds, Math.random);

    net.broadcast({ type: 'game-start', theme });
    roster.forEach((p) => {
      if (p.id === HOST_ID) return;
      net.sendTo(p.id, { type: 'number', number: currentNumberMap[p.id] });
    });

    enterGameScreen(theme);
    myNumberEl.textContent = String(currentNumberMap[HOST_ID]);
  }

  startBtn.addEventListener('click', () => {
    WakeLockHelper.enable();
    if (!ItoLogic.hasMinPlayers(roster)) return;
    hostStartRound();
  });

  playAgainBtn.addEventListener('click', () => {
    if (!isHost) return;
    hostStartRound();
  });

  function renderTheme(theme) {
    themeTitleEl.textContent = theme.title;
    themeScaleEl.textContent = theme.low + ' ←→ ' + theme.high;
  }

  function enterGameScreen(theme) {
    phase = 'game';
    currentTheme = theme;
    resultOverlay.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    setupScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    renderTheme(theme);
    myNumberEl.textContent = '--';
    rerollThemeBtn.classList.toggle('hidden', !isHost);

    if (isHost) {
      orderPanel.classList.remove('hidden');
      waitForHostEl.classList.add('hidden');
      renderOrderPanel();
    } else {
      orderPanel.classList.add('hidden');
      waitForHostEl.classList.remove('hidden');
    }
  }

  // お題を再抽選して全員に再配布する(ホストのみ操作、数字の再配布は行わない)
  function rerollTheme() {
    if (!isHost) return;
    const themeSel = ItoLogic.selectRoundTheme(Math.random, ItoLogic.THEME_BANK, usedThemes);
    currentTheme = themeSel.entry;
    usedThemes = themeSel.used;
    net.broadcast({ type: 'theme-update', theme: currentTheme });
    renderTheme(currentTheme);
  }

  rerollThemeBtn.addEventListener('click', rerollTheme);

  quitBtn.addEventListener('click', () => {
    WakeLockHelper.disable();
    RejoinStorage.clear('ito-game');
    window.location.reload();
  });

  // ================= 並び順確定(ホストのみ操作) =================

  function renderOrderPanel() {
    orderCandidatesEl.innerHTML = '';
    roster
      .filter((p) => orderBuilding.indexOf(p.id) === -1)
      .forEach((p) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode-btn order-candidate-btn';
        btn.textContent = p.name;
        btn.addEventListener('click', () => {
          orderBuilding.push(p.id);
          renderOrderPanel();
        });
        orderCandidatesEl.appendChild(btn);
      });

    orderBuiltEl.innerHTML = '';
    orderBuilding.forEach((id) => {
      const player = roster.find((p) => p.id === id);
      const li = document.createElement('li');
      li.textContent = player ? player.name : id;
      orderBuiltEl.appendChild(li);
    });

    orderUndoBtn.disabled = orderBuilding.length === 0;
    orderConfirmBtn.disabled = orderBuilding.length !== roster.length;
  }

  orderUndoBtn.addEventListener('click', () => {
    orderBuilding.pop();
    renderOrderPanel();
  });

  orderConfirmBtn.addEventListener('click', () => {
    if (orderBuilding.length !== roster.length) return;
    const checked = ItoLogic.checkOrder(orderBuilding, currentNumberMap);
    const payload = {
      type: 'result',
      isCorrect: checked.isCorrect,
      correctOrderIds: checked.correctOrderIds,
      numbers: currentNumberMap,
      roster,
    };
    net.broadcast(payload);
    showResult(payload);
  });

  // ================= 結果表示 =================

  function nameFor(id, rosterForNames) {
    const p = rosterForNames.find((r) => r.id === id);
    return p ? p.name : id;
  }

  function showResult(data) {
    phase = 'result';
    gameArea.classList.add('hidden');
    resultOverlay.classList.remove('hidden');
    resultTextEl.textContent = data.isCorrect ? '正解! みごと数字の順番通りでした' : '残念、数字の順番とは違いました';

    const rosterForNames = data.roster || roster;
    resultOrderEl.innerHTML = '';
    data.correctOrderIds.forEach((id) => {
      const li = document.createElement('li');
      li.textContent = nameFor(id, rosterForNames) + ' : ' + data.numbers[id];
      resultOrderEl.appendChild(li);
    });

    playAgainBtn.classList.toggle('hidden', !isHost);
  }
  if (savedSession && savedSession.roomCode && savedSession.name) { nameInput.value = savedSession.name; joinCodeInput.value = savedSession.roomCode; setTimeout(() => joinBtn.click(), 0); }
})();
