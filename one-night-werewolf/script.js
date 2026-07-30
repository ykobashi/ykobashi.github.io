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
  const connectionHealthEl = document.getElementById('connection-health');

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
  let voteAttempt = null;
  const processedVotes = new Set();
  let gameInProgress = false; // ラウンド開始後(切断時の扱いを変えるため)
  let hasPickedSeerLocally = false;
  let hasVotedLocally = false;
  let discussionIntervalId = null;
  const REJOIN_GRACE_MS = 30000;
  const rejoinTimers = new Map(), hasPickedSeer = new Set(), seerResults = new Map();
  let roomCode = '', playerToken = '', joinRequestId = '';
  let savedSession = RejoinStorage.load('one-night-werewolf');
  let currentPhase = 'lobby', currentPhaseData = null, lastResult = null;

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
    net.broadcast({ type: 'roster', players: publicRoster() });
  }
  function publicRoster() { return roster.map((p) => ({ id: p.id, name: p.name })); }
  function replacePlayerId(oldId, newId) {
    roster.forEach((p) => { if (p.id === oldId) p.id = newId; });
    if (currentRoleMap && currentRoleMap[oldId] !== undefined) { currentRoleMap[newId] = currentRoleMap[oldId]; delete currentRoleMap[oldId]; }
    if (votes[oldId] !== undefined) { votes[newId] = votes[oldId]; delete votes[oldId]; }
    Object.keys(votes).forEach((id) => { if (votes[id] === oldId) votes[id] = newId; });
    if (hasPickedSeer.delete(oldId)) hasPickedSeer.add(newId);
    if (seerResults.has(oldId)) { seerResults.set(newId, seerResults.get(oldId)); seerResults.delete(oldId); }
  }
  function snapshotFor(id) {
    return { type: 'state-snapshot', snapshotVersion: 1, phase: currentPhase, phaseData: currentPhaseData,
      roster: publicRoster(), role: currentRoleMap && currentRoleMap[id], voted: Object.prototype.hasOwnProperty.call(votes, id),
      hasPickedSeer: hasPickedSeer.has(id), seerResult: seerResults.get(id) || null,
      result: currentPhase === 'result' ? lastResult : null };
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
        roomCode = code;
        WakeLockHelper.enable();
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = '友達の参加を待っています…';
        roster = WerewolfLogic.addPlayer(roster, { id: myId, name: myName, token: 'host' });
        renderRoster();
      },
      onPeerConnected() {
        // 名前は 'join' メッセージで受け取ってから名簿に追加する
      },
      onPeerMessage(peerId, data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'join') {
          if (currentPhase !== 'lobby') { net.sendTo(peerId, { type: 'rejoin-rejected', rejoinRequestId: data.joinRequestId }); return; }
          if (!data.token || roster.some((p) => p.token === data.token)) return;
          const name = String(data.name || 'ゲスト').trim().slice(0, 10) || 'ゲスト';
          roster = WerewolfLogic.addPlayer(roster, { id: peerId, name, token: data.token });
          renderRoster();
          broadcastRoster();
          net.sendTo(peerId, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode });
          return;
        }
        if (data.type === 'rejoin') {
          const player = roster.find((p) => p.token === data.token);
          const pending = player && rejoinTimers.get(data.token);
          if (!player || !pending) { net.sendTo(peerId, { type: 'rejoin-rejected', rejoinRequestId: data.rejoinRequestId }); return; }
          clearTimeout(pending.timer); rejoinTimers.delete(data.token);
          const oldPeerId = player.id;
          replacePlayerId(oldPeerId, peerId);
          net.broadcast({ type: 'peer-id-changed', oldId: oldPeerId, newId: peerId });
          renderRoster(); broadcastRoster();
          net.sendTo(peerId, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode });
          net.sendTo(peerId, snapshotFor(peerId));
          return;
        }
        if (data.type === 'seer-pick') {
          if (!currentRoleMap || currentRoleMap[peerId] !== 'seer' || hasPickedSeer.has(peerId)) return;
          const isWolf = WerewolfLogic.checkSeerResult(currentRoleMap, data.targetId);
          hasPickedSeer.add(peerId);
          seerResults.set(peerId, { targetId: data.targetId, isWolf });
          net.sendTo(peerId, { type: 'seer-result', targetId: data.targetId, isWolf });
          return;
        }
        if (data.type === 'vote') {
          if (data.scopeId !== 'voting' || !data.actionId ||
              !roster.some((p) => p.id === peerId) ||
              !roster.some((p) => p.id === data.votedForId)) return;
          const key = peerId + ':vote:voting:' + data.actionId;
          if (!processedVotes.has(key)) {
            processedVotes.add(key);
            votes[peerId] = data.votedForId;
          }
          updateVotingProgress();
          net.sendTo(peerId, { type: 'vote-ack', actionId: data.actionId, scopeId: 'voting' });
          return;
        }
      },
      onPeerDisconnected(peerId) {
        const disconnectedPlayer = roster.find((p) => p.id === peerId);
        if (gameInProgress && disconnectedPlayer) {
          const timer = setTimeout(() => {
            rejoinTimers.delete(disconnectedPlayer.token);
            roster = WerewolfLogic.removePlayer(roster, peerId);
            broadcastRoster();
            gameConnectionStatus.textContent = disconnectedPlayer.name + 'さんが戻らなかったため、このままゲームを続けてください。';
          }, REJOIN_GRACE_MS);
          rejoinTimers.set(disconnectedPlayer.token, { oldPeerId: peerId, timer });
          gameConnectionStatus.textContent = disconnectedPlayer.name + 'さんの再接続を30秒待っています…';
          gameConnectionStatus.classList.remove('hidden');
          return;
        }
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
    roomCode = code;
    savedSession = RejoinStorage.load('one-night-werewolf');
    playerToken = savedSession && savedSession.roomCode === code ? savedSession.token : RejoinStorage.newToken();
    joinRequestId = RejoinStorage.newToken();
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
        if (savedSession && savedSession.roomCode === code) conn.send({ type: 'rejoin', name: myName, token: playerToken, rejoinRequestId: joinRequestId });
        else conn.send({ type: 'join', name: myName, token: playerToken, joinRequestId });
        lobbyPanel.classList.remove('hidden');
        onlineStatusEl.textContent = 'ホストがゲームを開始するのを待っています…';
      },
      onMessage: handleClientMessage,
      onDisconnected: handleDisconnected,
      onConnectionHealthChange: connectionHealthChanged,
      onError(err) {
        if (savedSession && savedSession.roomCode === code && err && err.type === 'peer-unavailable') {
          RejoinStorage.clear('one-night-werewolf');
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
      RejoinStorage.save('one-night-werewolf', { roomCode: data.roomCode, token: playerToken, name: myName }); return;
    }
    if (data.type === 'rejoin-ack' && data.rejoinRequestId === joinRequestId) {
      RejoinStorage.save('one-night-werewolf', { roomCode: data.roomCode, token: playerToken, name: myName }); return;
    }
    if (data.type === 'rejoin-rejected') {
      RejoinStorage.clear('one-night-werewolf'); savedSession = null;
      showOnlineError('再参加の有効期限が切れました。通常参加してください。'); return;
    }
    if (data.type === 'state-snapshot' && data.snapshotVersion === 1) {
      roster = data.roster || []; myRole = data.role || null; gameInProgress = data.phase !== 'lobby';
      renderRoster();
      if (data.phase === 'result' && data.result) showResult(data.result);
      else if (gameInProgress) {
        enterGameScreen(); renderRole(); applyPhase(data.phaseData || { phase: data.phase });
        if (data.hasPickedSeer) {
          hasPickedSeerLocally = true;
          Array.from(seerCandidatesEl.children).forEach((btn) => { btn.disabled = true; });
          if (data.seerResult) showSeerResult(data.seerResult.isWolf);
        }
        if (data.voted) { hasVotedLocally = true; votingStatus.classList.remove('hidden'); }
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
    if (data.type === 'vote-ack' && voteAttempt &&
        data.actionId === voteAttempt.actionId && data.scopeId === voteAttempt.scopeId) {
      voteAttempt.attempt.confirm();
      voteAttempt = null;
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
    processedVotes.clear();
    hasPickedSeer.clear();
    seerResults.clear();
    hasPickedSeerLocally = false;
    hasVotedLocally = false;
    gameInProgress = true;
    currentPhase = 'seer';
    currentPhaseData = { type: 'phase', phase: 'seer' };
    lastResult = null;

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
    WakeLockHelper.disable();
    RejoinStorage.clear('one-night-werewolf');
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
    currentPhase = data.phase;
    currentPhaseData = Object.assign({}, data);
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
      hasPickedSeer.add(myId);
      seerResults.set(myId, { targetId, isWolf });
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
      const actionId = RejoinStorage.newToken();
      const scopeId = 'voting';
      const payload = { type: 'vote', actionId, scopeId, votedForId };
      const attempt = AckSend.attempt({
        send() { conn.send(payload); },
        onPending() { votingStatus.textContent = '投票を送信中です…'; },
        onConfirmed() { votingStatus.textContent = '投票しました。集計を待っています。'; },
        onFailed() {
          voteAttempt = null;
          hasVotedLocally = false;
          votingStatus.textContent = '投票を確認できませんでした。もう一度お試しください。';
        },
      });
      voteAttempt = { actionId, scopeId, attempt };
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
      roster: publicRoster(),
      winner,
    };
    currentPhase = 'result';
    lastResult = payload;
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

  if (savedSession && savedSession.roomCode && savedSession.name) {
    nameInput.value = savedSession.name;
    joinCodeInput.value = savedSession.roomCode;
    setTimeout(() => joinBtn.click(), 0);
  }
})();
