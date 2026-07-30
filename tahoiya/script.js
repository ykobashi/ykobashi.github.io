// script.js - たほいや(辞書ゲーム) UIロジック(DOM操作・ロビー・オンライン対戦の配線)
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
  const wordTitleEl = document.getElementById('word-title');

  const submitPhase = document.getElementById('submit-phase');
  const guestSubmitBox = document.getElementById('guest-submit-box');
  const fakeDefinitionInput = document.getElementById('fake-definition-input');
  const submitFakeBtn = document.getElementById('submit-fake-btn');
  const fakeSubmittedStatus = document.getElementById('fake-submitted-status');
  const templateHintButtons = document.querySelectorAll('#template-hint-list .template-btn');
  const hostCollectBox = document.getElementById('host-collect-box');
  const collectionList = document.getElementById('collection-list');
  const collectNextBtn = document.getElementById('collect-next-btn');
  const rerollWordBtn = document.getElementById('reroll-word-btn');

  const votingPhase = document.getElementById('voting-phase');
  const guestVoteBox = document.getElementById('guest-vote-box');
  const entriesListEl = document.getElementById('entries-list');
  const voteSubmittedStatus = document.getElementById('vote-submitted-status');
  const hostVoteBox = document.getElementById('host-vote-box');
  const voteProgressText = document.getElementById('vote-progress-text');
  const tallyBtn = document.getElementById('tally-btn');

  const gameConnectionStatus = document.getElementById('game-connection-status');
  const quitBtn = document.getElementById('quit-btn');

  // --- DOM要素(結果画面) ---
  const resultOverlay = document.getElementById('result-overlay');
  const resultWordEl = document.getElementById('result-word');
  const resultRealDefinitionEl = document.getElementById('result-real-definition');
  const resultCorrectVotersEl = document.getElementById('result-correct-voters');
  const resultMostDeceptiveEl = document.getElementById('result-most-deceptive');
  const resultTallyListEl = document.getElementById('result-tally-list');
  const playAgainBtn = document.getElementById('play-again-btn');

  // --- 状態 ---
  let isHost = false;
  let myId = null; // ホストは'host'固定、ゲストはPeerJSが割り当てたID
  let myName = '';
  let net = null; // ホスト:コントローラーオブジェクト / ゲスト:Peerインスタンス
  let conn = null; // ゲスト側のみ使用するDataConnection
  let roster = []; // [{id, name}]

  let currentWordEntry = null; // ホストのみが保持する { word, definition }
  let usedWords = []; // ホストのみが保持する、部屋内で出題済みの語(word)の履歴
  let fakeSubmissions = []; // ホストのみが保持する [{authorId, text}]
  let currentEntries = null; // ホストのみが保持する authorId込みのフルバージョン [{id,text,authorId}]
  let votes = {}; // ホストのみが保持する { voterId: votedEntryId }

  let hasSubmittedFake = false; // 送信済みか(ホスト自身も含む)
  let hasVoted = false; // 投票済みか(ホスト自身も含む)
  let scopeId = '';
  const processedActions = new Set();
  const pendingActions = {};
  let roomCode = '', playerToken = '', joinRequestId = '', phase = 'lobby', lastResult = null;
  let savedSession = RejoinStorage.load('tahoiya');
  const rejoinTimers = new Map();

  function showOnlineError(message) {
    onlineErrorEl.textContent = message;
    onlineErrorEl.classList.remove('hidden');
    hostBtn.disabled = false;
    joinBtn.disabled = false;
    joinCodeInput.disabled = false;
  }

  function nameFor(id, rosterForNames) {
    const list = rosterForNames || roster;
    const p = list.find((r) => r.id === id);
    return p ? p.name : id;
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
      startBtn.disabled = !TahoiyaLogic.hasMinPlayers(roster);
    }
  }

  function broadcastRoster() {
    net.broadcast({ type: 'roster', players: publicRoster() });
  }

  function publicRoster() { return roster.map((p) => ({ id: p.id, name: p.name })); }
  function replaceId(oldId, newId) {
    roster.forEach((p) => { if (p.id === oldId) p.id = newId; });
    fakeSubmissions.forEach((f) => { if (f.authorId === oldId) f.authorId = newId; });
    if (currentEntries) currentEntries.forEach((e) => { if (e.authorId === oldId) e.authorId = newId; });
    if (votes[oldId] !== undefined) { votes[newId] = votes[oldId]; delete votes[oldId]; }
    if (lastResult) {
      lastResult.correctVoterIds = lastResult.correctVoterIds.map((id) => id === oldId ? newId : id);
      if (lastResult.mostDeceptiveAuthorId === oldId) lastResult.mostDeceptiveAuthorId = newId;
      lastResult.entries.forEach((e) => { if (e.authorId === oldId) e.authorId = newId; });
      lastResult.roster = publicRoster();
    }
  }
  function snapshotFor(id) {
    return { type: 'state-snapshot', snapshotVersion: 1, phase, scopeId,
      roster: publicRoster(), word: currentWordEntry && currentWordEntry.word,
      entries: currentEntries && currentEntries.map((e) => ({ id: e.id, text: e.text })),
      self: { submittedFake: fakeSubmissions.some((f) => f.authorId === id), votedEntryId: votes[id] },
      result: lastResult };
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

    net = TahoiyaNet.hostRoom({
      onCode(code) {
        roomCode = code;
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = '友達の参加を待っています…';
        roster = TahoiyaLogic.addPlayer(roster, { id: myId, name: myName, token: 'host' });
        renderRoster();
      },
      onPeerConnected() {
        // 名前は 'join' メッセージで受け取ってから名簿に追加する
      },
      onPeerMessage: handleHostMessage,
      onPeerDisconnected(peerId) {
        const player = roster.find((p) => p.id === peerId);
        if (!player) return;
        if (phase === 'lobby') {
          roster = TahoiyaLogic.removePlayer(roster, peerId);
          renderRoster();
          if (net) broadcastRoster();
          return;
        }
        const timer = setTimeout(() => {
          rejoinTimers.delete(player.token);
          roster = TahoiyaLogic.removePlayer(roster, peerId);
          broadcastRoster();
          gameConnectionStatus.textContent = player.name + 'さんが戻らなかったためゲームを終了してください。';
        }, 30000);
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
    net = TahoiyaNet.joinRoom(code, {
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
          RejoinStorage.clear('tahoiya');
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

  // ================= ホスト側メッセージ処理 =================

  function handleHostMessage(peerId, data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join') {
      const name = String(data.name || 'ゲスト').trim().slice(0, 10) || 'ゲスト';
      if (!roster.some((p) => p.token === data.token)) roster = TahoiyaLogic.addPlayer(roster, { id: peerId, name, token: data.token });
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
      replaceId(player.id, peerId);
      renderRoster();
      broadcastRoster();
      net.sendTo(peerId, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode });
      net.sendTo(peerId, snapshotFor(peerId));
      return;
    }
    if (data.type === 'submit-fake' && data.actionId && data.scopeId === scopeId) {
      const key = peerId + ':submit-fake:' + data.scopeId + ':' + data.actionId;
      if (!processedActions.has(key)) {
        processedActions.add(key);
        fakeSubmissions = fakeSubmissions.filter((f) => f.authorId !== peerId);
        fakeSubmissions.push({ authorId: peerId, text: String(data.text || '').trim().slice(0, 100) });
        broadcastFakeProgress();
      }
      net.sendTo(peerId, { type: 'submit-fake-ack', actionId: data.actionId, scopeId: data.scopeId });
      return;
    }
    if (data.type === 'vote' && data.actionId && data.scopeId === scopeId && currentEntries && currentEntries.some((entry) => entry.id === data.votedEntryId)) {
      const key = peerId + ':vote:' + data.scopeId + ':' + data.actionId;
      if (!processedActions.has(key)) {
        processedActions.add(key);
        votes[peerId] = data.votedEntryId;
        renderVoteProgress();
      }
      net.sendTo(peerId, { type: 'vote-ack', actionId: data.actionId, scopeId: data.scopeId });
      return;
    }
  }

  // ================= ゲスト側メッセージ処理 =================

  function handleClientMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join-ack' && data.joinRequestId === joinRequestId) { RejoinStorage.save('tahoiya', { roomCode: data.roomCode, token: playerToken, name: myName }); return; }
    if (data.type === 'rejoin-ack' && data.rejoinRequestId === joinRequestId) { RejoinStorage.save('tahoiya', { roomCode: data.roomCode, token: playerToken, name: myName }); return; }
    if (data.type === 'rejoin-rejected') { RejoinStorage.clear('tahoiya'); savedSession = null; showOnlineError('再参加の有効期限が切れました。通常参加してください。'); return; }
    if (data.type === 'state-snapshot' && data.snapshotVersion === 1) {
      scopeId = data.scopeId || ''; roster = data.roster || []; renderRoster();
      if (data.phase === 'submit') {
        enterSubmitPhase(data.word);
        if (data.self && data.self.submittedFake) { hasSubmittedFake = true; fakeDefinitionInput.disabled = true; submitFakeBtn.disabled = true; fakeSubmittedStatus.classList.remove('hidden'); }
      } else if (data.phase === 'vote') {
        enterSubmitPhase(data.word); enterVotingPhase(data.entries || []);
        if (data.self && data.self.votedEntryId) {
          hasVoted = true; voteSubmittedStatus.classList.remove('hidden');
          Array.from(entriesListEl.children).forEach((button) => button.classList.toggle('selected', button.dataset.entryId === data.self.votedEntryId));
        }
      } else if (data.phase === 'result' && data.result) showResult(data.result);
      else lobbyPanel.classList.remove('hidden');
      return;
    }
    if ((data.type === 'submit-fake-ack' || data.type === 'vote-ack') && data.scopeId === scopeId) {
      const type = data.type === 'vote-ack' ? 'vote' : 'submit-fake';
      const pending = pendingActions[type];
      if (pending && pending.id === data.actionId) {
        pending.attempt.confirm();
        delete pendingActions[type];
      }
      return;
    }
    if (data.type === 'roster') {
      roster = data.players;
      renderRoster();
      return;
    }
    if (data.type === 'word') {
      scopeId = data.scopeId || scopeId;
      enterSubmitPhase(data.word);
      return;
    }
    if (data.type === 'progress') {
      fakeSubmittedStatus.textContent = '送信しました。現在 ' + data.submitted + '/' + data.total + ' 人が送信済みです。';
      return;
    }
    if (data.type === 'entries') {
      enterVotingPhase(data.entries);
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
    phase = 'submit';
    lastResult = null;
    scopeId = RejoinStorage.newToken();
    fakeSubmissions = [];
    currentEntries = null;
    votes = {};

    const sel = TahoiyaLogic.selectRoundWordEntry(Math.random, TahoiyaLogic.WORD_BANK, usedWords);
    currentWordEntry = sel.entry;
    usedWords = sel.used;

    net.broadcast({ type: 'word', word: currentWordEntry.word, scopeId });
    enterSubmitPhase(currentWordEntry.word);
  }

  startBtn.addEventListener('click', () => {
    WakeLockHelper.enable();
    if (!TahoiyaLogic.hasMinPlayers(roster)) return;
    hostStartRound();
  });

  playAgainBtn.addEventListener('click', () => {
    if (!isHost) return;
    hostStartRound();
  });

  rerollWordBtn.addEventListener('click', () => {
    if (!isHost) return;
    hostStartRound();
  });

  quitBtn.addEventListener('click', () => {
    WakeLockHelper.disable();
    RejoinStorage.clear('tahoiya');
    window.location.reload();
  });

  // ================= フェーズ1: ニセ定義の投稿(回収) =================

  function enterSubmitPhase(word) {
    resultOverlay.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    setupScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    wordTitleEl.textContent = word;

    submitPhase.classList.remove('hidden');
    votingPhase.classList.add('hidden');

    hasSubmittedFake = false;
    hasVoted = false;
    fakeDefinitionInput.value = '';
    fakeDefinitionInput.disabled = false;
    submitFakeBtn.disabled = false;
    fakeSubmittedStatus.classList.add('hidden');

    guestSubmitBox.classList.remove('hidden');
    hostCollectBox.classList.toggle('hidden', !isHost);
    if (isHost) renderCollectionList();
  }

  // 辞書っぽい言い回しのテンプレートを、カーソル位置に挿入する
  templateHintButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.template;
      const el = fakeDefinitionInput;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      const pos = start + text.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  });

  submitFakeBtn.addEventListener('click', () => {
    const text = fakeDefinitionInput.value.trim();
    if (!text) return;
    hasSubmittedFake = true;
    fakeDefinitionInput.disabled = true;
    submitFakeBtn.disabled = true;
    fakeSubmittedStatus.textContent = '送信しました。他の人の回答を待っています…';
    fakeSubmittedStatus.classList.remove('hidden');
    if (isHost) {
      fakeSubmissions = fakeSubmissions.filter((f) => f.authorId !== myId);
      fakeSubmissions.push({ authorId: myId, text });
      broadcastFakeProgress();
    } else {
      sendAction('submit-fake', { text }, fakeSubmittedStatus);
    }
  });

  function broadcastFakeProgress() {
    renderCollectionList();
    net.broadcast({ type: 'progress', submitted: fakeSubmissions.length, total: roster.length });
  }

  function renderCollectionList() {
    collectionList.innerHTML = '';
    roster.forEach((p) => {
      const submitted = fakeSubmissions.some((f) => f.authorId === p.id);
      const li = document.createElement('li');
      li.className = 'roster-item';
      li.textContent = p.name + ' : ' + (submitted ? '済' : '未');
      collectionList.appendChild(li);
    });
    collectNextBtn.disabled = fakeSubmissions.length === 0;
  }

  collectNextBtn.addEventListener('click', () => {
    if (!isHost || fakeSubmissions.length === 0) return;
    currentEntries = TahoiyaLogic.buildEntryList(currentWordEntry.definition, fakeSubmissions, Math.random);
    const anonEntries = currentEntries.map((e) => ({ id: e.id, text: e.text }));
    net.broadcast({ type: 'entries', entries: anonEntries });
    enterVotingPhase(anonEntries);
  });

  // ================= フェーズ2: 投票 =================

  function enterVotingPhase(entries) {
    phase = 'vote';
    submitPhase.classList.add('hidden');
    votingPhase.classList.remove('hidden');

    hasVoted = false;
    voteSubmittedStatus.classList.add('hidden');

    guestVoteBox.classList.remove('hidden');
    hostVoteBox.classList.toggle('hidden', !isHost);
    if (isHost) renderVoteProgress();
    renderEntriesList(entries);
  }

  function renderEntriesList(entries) {
    entriesListEl.innerHTML = '';
    entries.forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-btn entry-btn';
      btn.dataset.entryId = entry.id;
      btn.textContent = entry.text;
      btn.addEventListener('click', () => {
        hasVoted = true;
        Array.from(entriesListEl.children).forEach((c) => { c.classList.remove('selected'); });
        btn.classList.add('selected');
        voteSubmittedStatus.classList.remove('hidden');
        if (isHost) {
          votes[myId] = entry.id;
          renderVoteProgress();
        } else {
          sendAction('vote', { votedEntryId: entry.id }, voteSubmittedStatus);
        }
      });
      entriesListEl.appendChild(btn);
    });
  }

  function sendAction(type, data, statusEl) {
    if (pendingActions[type]) pendingActions[type].attempt.cancel();
    const actionId = RejoinStorage.newToken();
    const payload = Object.assign({ type, actionId, scopeId }, data);
    const attempt = AckSend.attempt({
      send() { conn.send(payload); },
      onPending() { statusEl.textContent = '送信中です…'; statusEl.classList.remove('hidden'); },
      onConfirmed() { statusEl.textContent = type === 'vote' ? '投票しました。' : '送信しました。他の人の回答を待っています…'; },
      onFailed() {
        statusEl.textContent = '送信を確認できませんでした。もう一度お試しください。';
        if (type === 'submit-fake') { hasSubmittedFake = false; fakeDefinitionInput.disabled = false; submitFakeBtn.disabled = false; }
      },
      timeoutMs: 10000,
    });
    pendingActions[type] = { id: actionId, attempt };
  }

  function renderVoteProgress() {
    const total = roster.length;
    const submitted = Object.keys(votes).length;
    voteProgressText.textContent = submitted + '/' + total + ' 人が投票済みです。';
    tallyBtn.disabled = submitted === 0;
  }

  tallyBtn.addEventListener('click', () => {
    if (!isHost || !currentEntries) return;
    const result = TahoiyaLogic.tallyTahoiyaVotes(votes, currentEntries);
    const payload = {
      type: 'result',
      word: currentWordEntry.word,
      realEntryId: result.realEntryId,
      realDefinition: currentWordEntry.definition,
      correctVoterIds: result.correctVoterIds,
      voteCounts: result.voteCounts,
      mostDeceptiveAuthorId: result.mostDeceptiveAuthorId,
      entries: currentEntries,
      roster: publicRoster(),
    };
    phase = 'result';
    lastResult = payload;
    net.broadcast(payload);
    showResult(payload);
  });

  // ================= 結果表示 =================

  function showResult(data) {
    gameArea.classList.add('hidden');
    resultOverlay.classList.remove('hidden');

    const rosterForNames = data.roster || roster;

    resultWordEl.textContent = data.word;
    resultRealDefinitionEl.textContent = data.realDefinition;

    if (data.correctVoterIds.length === 0) {
      resultCorrectVotersEl.textContent = '正解した人はいませんでした。';
    } else {
      const names = data.correctVoterIds.map((id) => nameFor(id, rosterForNames));
      resultCorrectVotersEl.textContent = '正解した人: ' + names.join('、');
    }

    if (data.mostDeceptiveAuthorId) {
      resultMostDeceptiveEl.textContent = '最も人を騙した人: ' + nameFor(data.mostDeceptiveAuthorId, rosterForNames);
    } else {
      resultMostDeceptiveEl.textContent = '誰のニセ定義にも票が入りませんでした。';
    }

    resultTallyListEl.innerHTML = '';
    data.entries.forEach((entry) => {
      const count = data.voteCounts[entry.id] || 0;
      const isReal = entry.id === data.realEntryId;
      const li = document.createElement('li');
      li.className = 'result-tally-item' + (isReal ? ' result-tally-real' : '');
      const authorLabel = isReal ? '本物' : nameFor(entry.authorId, rosterForNames) + ' の回答';
      li.innerHTML = '';
      const textEl = document.createElement('p');
      textEl.className = 'result-tally-text';
      textEl.textContent = entry.text;
      const metaEl = document.createElement('p');
      metaEl.className = 'result-tally-meta';
      metaEl.textContent = authorLabel + ' / ' + count + '票';
      li.appendChild(textEl);
      li.appendChild(metaEl);
      resultTallyListEl.appendChild(li);
    });

    playAgainBtn.classList.toggle('hidden', !isHost);
  }
  if (savedSession && savedSession.roomCode && savedSession.name) {
    nameInput.value = savedSession.name;
    joinCodeInput.value = savedSession.roomCode;
    setTimeout(() => joinBtn.click(), 0);
  }
})();
