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

    net = ItoNet.hostRoom({
      onCode(code) {
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
          roster = ItoLogic.addPlayer(roster, { id: peerId, name: data.name });
          renderRoster();
          broadcastRoster();
        }
      },
      onPeerDisconnected(peerId) {
        roster = ItoLogic.removePlayer(roster, peerId);
        renderRoster();
        if (net) broadcastRoster();
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

    net = ItoNet.joinRoom(code, {
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
    if (data.type === 'game-start') {
      enterGameScreen(data.theme);
      return;
    }
    if (data.type === 'number') {
      myNumberEl.textContent = String(data.number);
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
    const theme = ItoLogic.pickTheme(Math.random);
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
    if (!ItoLogic.hasMinPlayers(roster)) return;
    hostStartRound();
  });

  playAgainBtn.addEventListener('click', () => {
    if (!isHost) return;
    hostStartRound();
  });

  function enterGameScreen(theme) {
    resultOverlay.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    setupScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    themeTitleEl.textContent = theme.title;
    themeScaleEl.textContent = theme.low + ' ←→ ' + theme.high;
    myNumberEl.textContent = '--';

    if (isHost) {
      orderPanel.classList.remove('hidden');
      waitForHostEl.classList.add('hidden');
      renderOrderPanel();
    } else {
      orderPanel.classList.add('hidden');
      waitForHostEl.classList.remove('hidden');
    }
  }

  quitBtn.addEventListener('click', () => {
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
})();
