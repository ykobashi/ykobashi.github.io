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
  const hostCollectBox = document.getElementById('host-collect-box');
  const collectionList = document.getElementById('collection-list');
  const collectNextBtn = document.getElementById('collect-next-btn');

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
  let fakeSubmissions = []; // ホストのみが保持する [{authorId, text}]
  let currentEntries = null; // ホストのみが保持する authorId込みのフルバージョン [{id,text,authorId}]
  let votes = {}; // ホストのみが保持する { voterId: votedEntryId }

  let hasSubmittedFake = false; // ゲスト側: 送信済みか
  let hasVoted = false; // ゲスト側: 投票済みか

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

  function nonHostRoster() {
    return roster.filter((p) => p.id !== HOST_ID);
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

    net = TahoiyaNet.hostRoom({
      onCode(code) {
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = '友達の参加を待っています…';
        roster = TahoiyaLogic.addPlayer(roster, { id: myId, name: myName });
        renderRoster();
      },
      onPeerConnected() {
        // 名前は 'join' メッセージで受け取ってから名簿に追加する
      },
      onPeerMessage: handleHostMessage,
      onPeerDisconnected(peerId) {
        roster = TahoiyaLogic.removePlayer(roster, peerId);
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

    net = TahoiyaNet.joinRoom(code, {
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

  // ================= ホスト側メッセージ処理 =================

  function handleHostMessage(peerId, data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join') {
      roster = TahoiyaLogic.addPlayer(roster, { id: peerId, name: data.name });
      renderRoster();
      broadcastRoster();
      return;
    }
    if (data.type === 'submit-fake') {
      fakeSubmissions = fakeSubmissions.filter((f) => f.authorId !== peerId);
      fakeSubmissions.push({ authorId: peerId, text: data.text });
      renderCollectionList();
      net.broadcast({ type: 'progress', submitted: fakeSubmissions.length, total: nonHostRoster().length });
      return;
    }
    if (data.type === 'vote') {
      votes[peerId] = data.votedEntryId;
      renderVoteProgress();
      return;
    }
  }

  // ================= ゲスト側メッセージ処理 =================

  function handleClientMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'roster') {
      roster = data.players;
      renderRoster();
      return;
    }
    if (data.type === 'word') {
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
    fakeSubmissions = [];
    currentEntries = null;
    votes = {};
    currentWordEntry = TahoiyaLogic.pickWordEntry(Math.random);

    net.broadcast({ type: 'word', word: currentWordEntry.word });
    enterSubmitPhase(currentWordEntry.word);
  }

  startBtn.addEventListener('click', () => {
    if (!TahoiyaLogic.hasMinPlayers(roster)) return;
    hostStartRound();
  });

  playAgainBtn.addEventListener('click', () => {
    if (!isHost) return;
    hostStartRound();
  });

  quitBtn.addEventListener('click', () => {
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

    if (isHost) {
      guestSubmitBox.classList.add('hidden');
      hostCollectBox.classList.remove('hidden');
      renderCollectionList();
    } else {
      guestSubmitBox.classList.remove('hidden');
      hostCollectBox.classList.add('hidden');
    }
  }

  submitFakeBtn.addEventListener('click', () => {
    const text = fakeDefinitionInput.value.trim();
    if (!text) return;
    hasSubmittedFake = true;
    fakeDefinitionInput.disabled = true;
    submitFakeBtn.disabled = true;
    fakeSubmittedStatus.textContent = '送信しました。他の人の回答を待っています…';
    fakeSubmittedStatus.classList.remove('hidden');
    conn.send({ type: 'submit-fake', text });
  });

  function renderCollectionList() {
    collectionList.innerHTML = '';
    nonHostRoster().forEach((p) => {
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
    submitPhase.classList.add('hidden');
    votingPhase.classList.remove('hidden');

    hasVoted = false;
    voteSubmittedStatus.classList.add('hidden');

    if (isHost) {
      guestVoteBox.classList.add('hidden');
      hostVoteBox.classList.remove('hidden');
      renderVoteProgress();
    } else {
      guestVoteBox.classList.remove('hidden');
      hostVoteBox.classList.add('hidden');
      renderEntriesList(entries);
    }
  }

  function renderEntriesList(entries) {
    entriesListEl.innerHTML = '';
    entries.forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-btn entry-btn';
      btn.textContent = entry.text;
      btn.addEventListener('click', () => {
        hasVoted = true;
        Array.from(entriesListEl.children).forEach((c) => { c.classList.remove('selected'); });
        btn.classList.add('selected');
        voteSubmittedStatus.classList.remove('hidden');
        conn.send({ type: 'vote', voterId: myId, votedEntryId: entry.id });
      });
      entriesListEl.appendChild(btn);
    });
  }

  function renderVoteProgress() {
    const total = nonHostRoster().length;
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
      roster,
    };
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
})();
