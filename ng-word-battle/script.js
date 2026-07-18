// script.js - NGワード対戦版 UIロジック(DOM操作・ロビー・オンライン対戦の配線)
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
      startBtn.disabled = !NgWordBattleLogic.hasMinPlayers(roster);
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

    net = NgWordBattleNet.hostRoom({
      onCode(code) {
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = '友達の参加を待っています…';
        roster = NgWordBattleLogic.addPlayer(roster, { id: myId, name: myName });
        renderRoster();
      },
      onPeerConnected() {
        // 名前は 'join' メッセージで受け取ってから名簿に追加する
      },
      onPeerMessage(peerId, data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'join') {
          roster = NgWordBattleLogic.addPlayer(roster, { id: peerId, name: data.name });
          renderRoster();
          broadcastRoster();
          return;
        }
        if (data.type === 'catch') {
          processCatch(data.catcherId, data.targetId);
          return;
        }
      },
      onPeerDisconnected(peerId) {
        roster = NgWordBattleLogic.removePlayer(roster, peerId);
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

    net = NgWordBattleNet.joinRoom(code, {
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
    if (data.type === 'words') {
      currentPlayers = data.players;
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
    const playerIds = roster.map((p) => p.id);
    const wordMap = NgWordBattleLogic.assignSecretWords(playerIds, Math.random);
    currentPlayers = roster.map((p) => ({ id: p.id, name: p.name, word: wordMap[p.id] }));

    net.broadcast({ type: 'words', players: currentPlayers });
    enterGameScreen();
  }

  startBtn.addEventListener('click', () => {
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
      conn.send({ type: 'catch', catcherId: myId, targetId });
    }
  }

  // ホストのみが呼ぶ: 早い者勝ちでクレームを確定し、最初の1件だけを全員に通知する
  function processCatch(catcherId, targetId) {
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
})();
