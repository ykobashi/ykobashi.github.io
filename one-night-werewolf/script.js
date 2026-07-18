// script.js - ワンナイト人狼(簡易版) UIロジック(DOM操作・ロビー・オンライン対戦の配線)
(function () {
  'use strict';

  const HOST_ID = 'host';
  const ROLE_NAME_JA = { wolf: '人狼', seer: '占い師', villager: '村人' };

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

  // --- DOM要素(ゲーム画面共通) ---
  const gameArea = document.getElementById('game-area');
  const roleValueEl = document.getElementById('role-value');
  const gameConnectionStatus = document.getElementById('game-connection-status');
  const quitBtn = document.getElementById('quit-btn');

  // --- DOM要素(占いフェーズ) ---
  const seerPhasePanel = document.getElementById('seer-phase-panel');
  const seerPicker = document.getElementById('seer-picker');
  const seerCandidatesEl = document.getElementById('seer-candidates');
  const seerResultTextEl = document.getElementById('seer-result-text');
  const seerWaitText = document.getElementById('seer-wait-text');
  const seerHostControls = document.getElementById('seer-host-controls');
  const seerNextBtn = document.getElementById('seer-next-btn');

  // --- DOM要素(討論フェーズ) ---
  const discussionPhasePanel = document.getElementById('discussion-phase-panel');
  const discussionTimerEl = document.getElementById('discussion-timer');
  const discussionHostControls = document.getElementById('discussion-host-controls');
  const discussionNextBtn = document.getElementById('discussion-next-btn');

  // --- DOM要素(投票フェーズ) ---
  const votingPhasePanel = document.getElementById('voting-phase-panel');
  const votingCandidatesEl = document.getElementById('voting-candidates');
  const votingStatus = document.getElementById('voting-status');
  const votingHostControls = document.getElementById('voting-host-controls');
  const votingProgress = document.getElementById('voting-progress');
  const votingTallyBtn = document.getElementById('voting-tally-btn');

  // --- DOM要素(結果画面) ---
  const resultOverlay = document.getElementById('result-overlay');
  const resultTextEl = document.getElementById('result-text');
  const resultWinnerEl = document.getElementById('result-winner');
  const resultVotesEl = document.getElementById('result-votes');
  const resultRolesEl = document.getElementById('result-roles');
  const playAgainBtn = document.getElementById('play-again-btn');

  // --- 状態 ---
  let isHost = false;
  let myId = null; // ホストは'host'固定、ゲストはPeerJSが割り当てたID
  let myName = '';
  let myRole = null; // 自分の役職('wolf'|'seer'|'villager')
  let net = null; // ホスト:コントローラーオブジェクト / ゲスト:Peerインスタンス
  let conn = null; // ゲスト側のみ使用するDataConnection
  let roster = []; // [{id, name}]
  let currentRoleMap = null; // ホストのみが保持する {id: role}
  let votes = {}; // ホストのみが保持する {voterId: votedForId}
  let gameInProgress = false; // ラウンド開始後(切断時の扱いを変えるため)
  let hasPickedSeerLocally = false;
  let hasVotedLocally = false;
  let discussionIntervalId = null;

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

  function nameFor(id, rosterForNames) {
    const p = rosterForNames.find((r) => r.id === id);
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
      startBtn.disabled = !WerewolfLogic.hasMinPlayers(roster);
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

    net = WerewolfNet.hostRoom({
      onCode(code) {
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = '友達の参加を待っています…';
        roster = WerewolfLogic.addPlayer(roster, { id: myId, name: myName });
        renderRoster();
      },
      onPeerConnected() {
        // 名前は 'join' メッセージで受け取ってから名簿に追加する
      },
      onPeerMessage(peerId, data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'join') {
          roster = WerewolfLogic.addPlayer(roster, { id: peerId, name: data.name });
          renderRoster();
          broadcastRoster();
          return;
        }
        if (data.type === 'seer-pick') {
          if (!currentRoleMap) return;
          const isWolf = WerewolfLogic.checkSeerResult(currentRoleMap, data.targetId);
          net.sendTo(peerId, { type: 'seer-result', targetId: data.targetId, isWolf });
          return;
        }
        if (data.type === 'vote') {
          votes[data.voterId] = data.votedForId;
          updateVotingProgress();
          return;
        }
      },
      onPeerDisconnected(peerId) {
        if (!gameInProgress) {
          roster = WerewolfLogic.removePlayer(roster, peerId);
          renderRoster();
          if (net) broadcastRoster();
        } else {
          const p = roster.find((r) => r.id === peerId);
          const name = p ? p.name : '誰か';
          gameConnectionStatus.textContent = name + ' さんとの接続が切れました。続行できない場合はページを再読み込みして最初からやり直してください。';
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

    net = WerewolfNet.joinRoom(code, {
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
      gameInProgress = true;
      enterGameScreen();
      renderRole();
      return;
    }
    if (data.type === 'phase') {
      applyPhase(data);
      return;
    }
    if (data.type === 'seer-result') {
      showSeerResult(data.isWolf);
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
    hasPickedSeerLocally = false;
    hasVotedLocally = false;
    gameInProgress = true;

    const playerIds = roster.map((p) => p.id);
    currentRoleMap = WerewolfLogic.assignRoles(playerIds, Math.random);

    roster.forEach((p) => {
      if (p.id === HOST_ID) return;
      net.sendTo(p.id, { type: 'role', role: currentRoleMap[p.id] });
    });
    myRole = currentRoleMap[HOST_ID];

    enterGameScreen();
    renderRole();

    const phaseData = { type: 'phase', phase: 'seer' };
    net.broadcast(phaseData);
    applyPhase(phaseData);
  }

  startBtn.addEventListener('click', () => {
    if (!WerewolfLogic.hasMinPlayers(roster)) return;
    hostStartRound();
  });

  playAgainBtn.addEventListener('click', () => {
    if (!isHost) return;
    hostStartRound();
  });

  quitBtn.addEventListener('click', () => {
    window.location.reload();
  });

  function enterGameScreen() {
    resultOverlay.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    setupScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    gameConnectionStatus.classList.add('hidden');
    hidePhasePanels();
  }

  function renderRole() {
    roleValueEl.textContent = ROLE_NAME_JA[myRole] || '--';
  }

  function hidePhasePanels() {
    seerPhasePanel.classList.add('hidden');
    discussionPhasePanel.classList.add('hidden');
    votingPhasePanel.classList.add('hidden');
    clearDiscussionTimer();
  }

  // ================= フェーズ遷移 =================

  function applyPhase(data) {
    if (data.phase === 'seer') {
      hidePhasePanels();
      seerPhasePanel.classList.remove('hidden');
      seerResultTextEl.classList.add('hidden');
      seerResultTextEl.classList.remove('is-wolf');
      seerResultTextEl.textContent = '';
      hasPickedSeerLocally = false;
      if (myRole === 'seer') {
        seerPicker.classList.remove('hidden');
        seerWaitText.classList.add('hidden');
        renderSeerCandidates();
      } else {
        seerPicker.classList.add('hidden');
        seerWaitText.classList.remove('hidden');
      }
      seerHostControls.classList.toggle('hidden', !isHost);
    } else if (data.phase === 'discussion') {
      hidePhasePanels();
      discussionPhasePanel.classList.remove('hidden');
      discussionHostControls.classList.toggle('hidden', !isHost);
      startDiscussionTimer(data.durationSec || 180);
    } else if (data.phase === 'voting') {
      hidePhasePanels();
      votingPhasePanel.classList.remove('hidden');
      votingHostControls.classList.toggle('hidden', !isHost);
      hasVotedLocally = false;
      votingStatus.classList.add('hidden');
      renderVotingCandidates();
      updateVotingProgress();
    }
  }

  // ---- 占いフェーズ ----

  function renderSeerCandidates() {
    seerCandidatesEl.innerHTML = '';
    roster
      .filter((p) => p.id !== myId)
      .forEach((p) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode-btn candidate-btn';
        btn.textContent = p.name;
        btn.addEventListener('click', () => onSeerPick(p.id, btn));
        seerCandidatesEl.appendChild(btn);
      });
  }

  function onSeerPick(targetId, btnEl) {
    if (hasPickedSeerLocally) return;
    hasPickedSeerLocally = true;
    Array.from(seerCandidatesEl.children).forEach((btn) => {
      btn.disabled = true;
    });
    if (btnEl) btnEl.classList.add('picked');

    if (isHost) {
      const isWolf = WerewolfLogic.checkSeerResult(currentRoleMap, targetId);
      showSeerResult(isWolf);
    } else {
      conn.send({ type: 'seer-pick', targetId });
      seerResultTextEl.classList.remove('hidden');
      seerResultTextEl.textContent = '結果を待っています…';
    }
  }

  function showSeerResult(isWolf) {
    seerResultTextEl.classList.remove('hidden');
    seerResultTextEl.textContent = isWolf ? '人狼でした!' : '人狼ではありませんでした。';
    seerResultTextEl.classList.toggle('is-wolf', isWolf);
  }

  seerNextBtn.addEventListener('click', () => {
    if (!isHost) return;
    const phaseData = { type: 'phase', phase: 'discussion', durationSec: 180 };
    net.broadcast(phaseData);
    applyPhase(phaseData);
  });

  // ---- 討論フェーズ ----

  function clearDiscussionTimer() {
    if (discussionIntervalId) {
      clearInterval(discussionIntervalId);
      discussionIntervalId = null;
    }
  }

  function updateDiscussionDisplay(remainingSec) {
    const m = Math.floor(remainingSec / 60);
    const s = remainingSec % 60;
    discussionTimerEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function startDiscussionTimer(durationSec) {
    clearDiscussionTimer();
    let remaining = durationSec;
    updateDiscussionDisplay(remaining);
    discussionIntervalId = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = 0;
        updateDiscussionDisplay(remaining);
        clearDiscussionTimer();
        return;
      }
      updateDiscussionDisplay(remaining);
    }, 1000);
  }

  discussionNextBtn.addEventListener('click', () => {
    if (!isHost) return;
    const phaseData = { type: 'phase', phase: 'voting' };
    net.broadcast(phaseData);
    applyPhase(phaseData);
  });

  // ---- 投票フェーズ ----

  function renderVotingCandidates() {
    votingCandidatesEl.innerHTML = '';
    roster.forEach((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-btn candidate-btn';
      btn.textContent = p.name + (p.id === myId ? '(自分)' : '');
      btn.addEventListener('click', () => onVote(p.id, btn));
      votingCandidatesEl.appendChild(btn);
    });
  }

  function onVote(votedForId, btnEl) {
    hasVotedLocally = true;
    Array.from(votingCandidatesEl.children).forEach((btn) => {
      btn.classList.remove('voted');
    });
    if (btnEl) btnEl.classList.add('voted');
    votingStatus.classList.remove('hidden');

    if (isHost) {
      votes[myId] = votedForId;
      updateVotingProgress();
    } else {
      conn.send({ type: 'vote', voterId: myId, votedForId });
    }
  }

  function updateVotingProgress() {
    if (!isHost) return;
    votingProgress.textContent = Object.keys(votes).length + ' / ' + roster.length + '人 投票済み';
  }

  votingTallyBtn.addEventListener('click', () => {
    if (!isHost) return;
    if (Object.keys(votes).length === 0) return;
    const tally = WerewolfLogic.tallyVotes(votes, Math.random);
    const winner = WerewolfLogic.determineWinner(currentRoleMap, tally.eliminatedId);
    const payload = {
      type: 'result',
      eliminatedId: tally.eliminatedId,
      counts: tally.counts,
      roleMap: currentRoleMap,
      roster,
      winner,
    };
    net.broadcast(payload);
    showResult(payload);
  });

  // ================= 結果表示 =================

  function showResult(data) {
    clearDiscussionTimer();
    gameArea.classList.add('hidden');
    resultOverlay.classList.remove('hidden');

    const rosterForNames = data.roster || roster;
    const eliminatedName = nameFor(data.eliminatedId, rosterForNames);
    resultTextEl.textContent = eliminatedName + ' さんが追放されました';
    resultWinnerEl.textContent = data.winner === 'villagers' ? '村人陣営の勝利!' : '人狼陣営の勝利!';

    resultVotesEl.innerHTML = '';
    rosterForNames.forEach((p) => {
      const count = data.counts[p.id] || 0;
      const li = document.createElement('li');
      li.textContent = p.name + ' : ' + count + '票';
      resultVotesEl.appendChild(li);
    });

    resultRolesEl.innerHTML = '';
    rosterForNames.forEach((p) => {
      const role = data.roleMap[p.id];
      const li = document.createElement('li');
      li.textContent = p.name + ' : ' + (ROLE_NAME_JA[role] || role);
      resultRolesEl.appendChild(li);
    });

    playAgainBtn.classList.toggle('hidden', !isHost);
  }
})();
