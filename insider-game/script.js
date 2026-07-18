// script.js - インサイダーゲーム UIロジック(DOM操作・ロビー・オンライン対戦の配線)
(function () {
  'use strict';

  const HOST_ID = 'host';

  const ROLE_LABELS = {
    master: 'マスター',
    insider: 'インサイダー',
    commoner: '庶民',
  };

  const ROLE_HINTS = {
    master: 'あなたはマスターです。お題を知っています。庶民からの「はい/いいえ」で答えられる質問に、正直に答えてください。庶民が正解を言い当てたら下のボタンを押してください。',
    insider: 'あなたはインサイダーです。お題を知っていますが、知らないふりをして質問に参加し、正体がバレないように振る舞いましょう。',
    commoner: 'あなたは庶民です。マスターに「はい/いいえ」で答えられる質問を重ねて、お題を当てましょう。',
  };

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
  const roleTitleEl = document.getElementById('role-title');
  const topicBox = document.getElementById('topic-box');
  const topicTitleEl = document.getElementById('topic-title');
  const roleHintEl = document.getElementById('role-hint');
  const correctGuessBtn = document.getElementById('correct-guess-btn');
  const votingPanel = document.getElementById('voting-panel');
  const votingCandidatesEl = document.getElementById('voting-candidates');
  const votedStatusEl = document.getElementById('voted-status');
  const hostTallyBox = document.getElementById('host-tally-box');
  const voteProgressEl = document.getElementById('vote-progress');
  const tallyBtn = document.getElementById('tally-btn');
  const gameConnectionStatus = document.getElementById('game-connection-status');
  const quitBtn = document.getElementById('quit-btn');

  // --- DOM要素(結果画面) ---
  const resultOverlay = document.getElementById('result-overlay');
  const resultTextEl = document.getElementById('result-text');
  const resultTopicEl = document.getElementById('result-topic');
  const resultCountsEl = document.getElementById('result-counts');
  const resultCorrectVotersEl = document.getElementById('result-correct-voters');
  const playAgainBtn = document.getElementById('play-again-btn');

  // --- 状態 ---
  let isHost = false;
  let myId = null; // ホストは'host'固定、ゲストはPeerJSが割り当てたID
  let myName = '';
  let net = null; // ホスト:コントローラーオブジェクト / ゲスト:Peerインスタンス
  let conn = null; // ゲスト側のみ使用するDataConnection
  let roster = []; // [{id, name}]
  let myRole = null;
  let myTopic = null;
  let myVoteCast = false;
  let currentRoleMap = null; // ホストのみが保持する {id: role}
  let currentTopic = null; // ホストのみが保持する
  let votes = {}; // ホストのみが保持する {voterId: votedForId}

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
      startBtn.disabled = !InsiderGameLogic.hasMinPlayers(roster);
    }
  }

  function broadcastRoster() {
    net.broadcast({ type: 'roster', players: roster });
  }

  function nameFor(id, rosterForNames) {
    const p = (rosterForNames || roster).find((r) => r.id === id);
    return p ? p.name : id;
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

    net = InsiderGameNet.hostRoom({
      onCode(code) {
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = '友達の参加を待っています…';
        roster = InsiderGameLogic.addPlayer(roster, { id: myId, name: myName });
        renderRoster();
      },
      onPeerConnected() {
        // 名前は 'join' メッセージで受け取ってから名簿に追加する
      },
      onPeerMessage(peerId, data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'join') {
          roster = InsiderGameLogic.addPlayer(roster, { id: peerId, name: data.name });
          renderRoster();
          broadcastRoster();
          return;
        }
        if (data.type === 'correct-guess') {
          moveToVotingPhase();
          return;
        }
        if (data.type === 'vote') {
          votes[data.voterId] = data.votedForId;
          updateHostVoteProgress();
          return;
        }
      },
      onPeerDisconnected(peerId) {
        roster = InsiderGameLogic.removePlayer(roster, peerId);
        if (!gameArea.classList.contains('hidden')) {
          gameConnectionStatus.textContent = '参加者が切断しました。ゲームを続けるのが難しい場合はやり直してください。';
          gameConnectionStatus.classList.remove('hidden');
        } else {
          renderRoster();
        }
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

    net = InsiderGameNet.joinRoom(code, {
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
    if (data.type === 'role') {
      myRole = data.role;
      myTopic = data.topic || null;
      enterRoleScreen();
      return;
    }
    if (data.type === 'phase' && data.phase === 'voting') {
      enterVotingScreen();
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
    votes = {};
    const playerIds = roster.map((p) => p.id);
    currentRoleMap = InsiderGameLogic.assignInsiderRoles(playerIds, Math.random);
    currentTopic = InsiderGameLogic.pickTopic(Math.random);

    roster.forEach((p) => {
      const role = currentRoleMap[p.id];
      const payload = (role === 'master' || role === 'insider')
        ? { type: 'role', role, topic: currentTopic }
        : { type: 'role', role: 'commoner' };
      if (p.id === HOST_ID) {
        myRole = payload.role;
        myTopic = payload.topic || null;
      } else {
        net.sendTo(p.id, payload);
      }
    });

    enterRoleScreen();
  }

  startBtn.addEventListener('click', () => {
    if (!InsiderGameLogic.hasMinPlayers(roster)) return;
    hostStartRound();
  });

  playAgainBtn.addEventListener('click', () => {
    if (!isHost) return;
    hostStartRound();
  });

  function enterRoleScreen() {
    resultOverlay.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    setupScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    gameConnectionStatus.classList.add('hidden');

    votingPanel.classList.add('hidden');
    votedStatusEl.classList.add('hidden');
    hostTallyBox.classList.add('hidden');
    myVoteCast = false;

    roleTitleEl.textContent = ROLE_LABELS[myRole] || myRole;
    roleHintEl.textContent = ROLE_HINTS[myRole] || '';

    if (myRole === 'master' || myRole === 'insider') {
      topicBox.classList.remove('hidden');
      topicTitleEl.textContent = myTopic;
    } else {
      topicBox.classList.add('hidden');
      topicTitleEl.textContent = '';
    }

    correctGuessBtn.classList.toggle('hidden', myRole !== 'master');
  }

  correctGuessBtn.addEventListener('click', () => {
    if (myRole !== 'master') return;
    if (isHost) {
      moveToVotingPhase();
    } else if (conn) {
      conn.send({ type: 'correct-guess' });
    }
  });

  function moveToVotingPhase() {
    if (!isHost) return;
    votes = {};
    net.broadcast({ type: 'phase', phase: 'voting' });
    enterVotingScreen();
  }

  function enterVotingScreen() {
    correctGuessBtn.classList.add('hidden');
    votingPanel.classList.remove('hidden');
    votedStatusEl.classList.add('hidden');
    myVoteCast = false;
    renderVotingCandidates();

    if (isHost) {
      hostTallyBox.classList.remove('hidden');
      updateHostVoteProgress();
    } else {
      hostTallyBox.classList.add('hidden');
    }
  }

  function renderVotingCandidates() {
    votingCandidatesEl.innerHTML = '';
    roster
      .filter((p) => p.id !== myId)
      .forEach((p) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode-btn voting-candidate-btn';
        btn.textContent = p.name;
        btn.addEventListener('click', () => castVote(p.id, btn));
        votingCandidatesEl.appendChild(btn);
      });
  }

  function castVote(votedForId, btnEl) {
    if (myVoteCast) return;
    myVoteCast = true;

    Array.from(votingCandidatesEl.children).forEach((el) => {
      el.disabled = true;
      el.classList.remove('selected');
    });
    if (btnEl) btnEl.classList.add('selected');

    if (isHost) {
      votes[myId] = votedForId;
      updateHostVoteProgress();
    } else if (conn) {
      conn.send({ type: 'vote', voterId: myId, votedForId });
    }
    votedStatusEl.classList.remove('hidden');
  }

  function updateHostVoteProgress() {
    if (!isHost) return;
    voteProgressEl.textContent = '投票: ' + Object.keys(votes).length + '/' + roster.length + '人';
  }

  tallyBtn.addEventListener('click', () => {
    if (!isHost || !currentRoleMap) return;
    const insiderId = Object.keys(currentRoleMap).find((id) => currentRoleMap[id] === 'insider');
    const insiderName = nameFor(insiderId, roster);
    const tallied = InsiderGameLogic.tallyInsiderVotes(votes, insiderId);
    const payload = {
      type: 'result',
      insiderId,
      insiderName,
      topic: currentTopic,
      counts: tallied.counts,
      correctVoterIds: tallied.correctVoterIds,
      roster,
    };
    net.broadcast(payload);
    showResult(payload);
  });

  quitBtn.addEventListener('click', () => {
    window.location.reload();
  });

  // ================= 結果表示 =================

  function showResult(data) {
    gameArea.classList.add('hidden');
    resultOverlay.classList.remove('hidden');

    const rosterForNames = data.roster || roster;
    resultTextEl.textContent = 'インサイダーは ' + data.insiderName + ' でした!';
    resultTopicEl.textContent = data.topic;

    resultCountsEl.innerHTML = '';
    const votedIds = Object.keys(data.counts || {});
    if (votedIds.length === 0) {
      const li = document.createElement('li');
      li.textContent = '投票はありませんでした';
      resultCountsEl.appendChild(li);
    } else {
      votedIds.forEach((id) => {
        const li = document.createElement('li');
        li.textContent = nameFor(id, rosterForNames) + ' : ' + data.counts[id] + '票';
        resultCountsEl.appendChild(li);
      });
    }

    const correctVoterIds = data.correctVoterIds || [];
    resultCorrectVotersEl.textContent = correctVoterIds.length > 0
      ? 'インサイダーを当てた人: ' + correctVoterIds.map((id) => nameFor(id, rosterForNames)).join('、')
      : 'インサイダーを当てた人はいませんでした';

    playAgainBtn.classList.toggle('hidden', !isHost);
  }
})();
