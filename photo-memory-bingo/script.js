// script.js - 画像記憶ビンゴ UI・ロビー・オンライン対戦
(function () {
  'use strict';

  const HOST_ID = 'host';
  const GAME_KEY = 'photo-memory-bingo';
  const REJOIN_GRACE_MS = 30000;
  const VIEW_MS = 15000;
  const L = PhotoMemoryBingoLogic;

  const setupScreen = document.getElementById('setup-screen');
  const nameInput = document.getElementById('name-input');
  const hostBtn = document.getElementById('host-btn');
  const joinCodeInput = document.getElementById('join-code-input');
  const joinBtn = document.getElementById('join-btn');
  const onlineErrorEl = document.getElementById('online-error');
  const lobbyPanel = document.getElementById('lobby-panel');
  const hostWait = document.getElementById('host-wait');
  const roomCodeText = document.getElementById('room-code-text');
  const copyCodeBtn = document.getElementById('copy-code-btn');
  const onlineStatusEl = document.getElementById('online-status');
  const rosterList = document.getElementById('roster-list');
  const startBtn = document.getElementById('start-btn');

  const gameArea = document.getElementById('game-area');
  const roundStatusEl = document.getElementById('round-status');
  const phaseLabelEl = document.getElementById('phase-label');
  const countdownTextEl = document.getElementById('countdown-text');
  const observationPanel = document.getElementById('observation-panel');
  const memoryImageEl = document.getElementById('memory-image');
  const answerPanel = document.getElementById('answer-panel');
  const statementGridEl = document.getElementById('statement-grid');
  const submitBtn = document.getElementById('submit-btn');
  const answerStatusEl = document.getElementById('answer-status');
  const hostProgressBox = document.getElementById('host-progress-box');
  const progressTextEl = document.getElementById('progress-text');
  const progressListEl = document.getElementById('progress-list');
  const forceResultBtn = document.getElementById('force-result-btn');
  const gameConnectionStatus = document.getElementById('game-connection-status');
  const quitBtn = document.getElementById('quit-btn');

  const roundResultOverlay = document.getElementById('round-result-overlay');
  const resultRoundLabelEl = document.getElementById('result-round-label');
  const resultGridEl = document.getElementById('result-grid');
  const resultMyPointsEl = document.getElementById('result-my-points');
  const resultMyBingoEl = document.getElementById('result-my-bingo');
  const resultDeltasListEl = document.getElementById('result-deltas-list');
  const resultScoreboardListEl = document.getElementById('result-scoreboard-list');
  const resultNextBtn = document.getElementById('result-next-btn');
  const finalResultScreen = document.getElementById('final-result-screen');
  const finalWinnerTextEl = document.getElementById('final-winner-text');
  const finalMyRankTextEl = document.getElementById('final-my-rank-text');
  const finalScoreboardListEl = document.getElementById('final-scoreboard-list');
  const playAgainBtn = document.getElementById('play-again-btn');
  const backToTopLink = document.getElementById('back-to-top-link');

  let isHost = false;
  let myId = null;
  let myName = '';
  let net = null;
  let conn = null;
  let roster = [];
  let phase = 'lobby';
  let roundStage = null;
  let roomCode = '';
  let playerToken = '';
  let joinRequestId = '';
  let savedSession = RejoinStorage.load(GAME_KEY);

  let scoresByToken = {};
  let selectedRounds = [];
  let runId = '';
  let roundIndex = -1;
  let activeRoundEntry = null;
  let currentRoundPayload = null;
  let marksByPlayer = {};
  let currentResultPayload = null;
  let currentFinalPayload = null;
  let tallied = false;
  let hostStageDeadlineAt = 0;

  let localMarks = Array(L.GRID_SIZE).fill(false);
  let submitted = false;
  let pendingSubmission = null;
  const processedActions = new Set();
  const pendingRejoins = new Map();
  let countdownInterval = null;
  let uiStageTimer = null;

  function scopeIdFor(currentRunId, currentRoundIndex) {
    return currentRunId + ':' + currentRoundIndex;
  }

  function currentScopeId() {
    return scopeIdFor(runId, roundIndex);
  }

  function validMarks(marks) {
    return Array.isArray(marks) && marks.length === L.GRID_SIZE && marks.every((mark) => typeof mark === 'boolean');
  }

  function validOpaqueId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9-]{8,128}$/.test(value);
  }

  function validRosterPayload(players) {
    return Array.isArray(players) && players.length > 0 && players.every((player) =>
      player && typeof player.id === 'string' && player.id.length > 0 && player.id.length <= 128 &&
      typeof player.name === 'string' && player.name.length > 0 && player.name.length <= 10
    );
  }

  function validScoresPayload(scoreMap, players) {
    return scoreMap && typeof scoreMap === 'object' && players.every((player) =>
      typeof scoreMap[player.id] === 'number' && Number.isFinite(scoreMap[player.id])
    );
  }

  function validResultPayload(data) {
    if (!data || data.type !== 'round-result' || !validOpaqueId(data.runId) ||
        !Number.isInteger(data.roundIndex) || data.roundIndex < 0 || data.roundIndex >= L.ROUND_TOTAL ||
        data.scopeId !== scopeIdFor(data.runId, data.roundIndex) || !validRosterPayload(data.roster) ||
        !validScoresPayload(data.scores, data.roster) || !Array.isArray(data.statements) ||
        data.statements.length !== L.GRID_SIZE || !data.statements.every((statement) =>
          statement && typeof statement.text === 'string' && statement.text.length > 0 &&
          statement.text.length <= 200 && typeof statement.isTrue === 'boolean')) return false;
    return data.roster.every((player) => {
      const marks = data.marksByPlayer && data.marksByPlayer[player.id];
      const delta = data.deltasByPlayer && data.deltasByPlayer[player.id];
      if (!validMarks(marks) || !delta || !Number.isInteger(delta.correctCount) || delta.correctCount < 0 ||
          delta.correctCount > L.GRID_SIZE || !Array.isArray(delta.incorrectIndexes) ||
          !delta.incorrectIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < L.GRID_SIZE) ||
          new Set(delta.incorrectIndexes).size !== delta.incorrectIndexes.length ||
          delta.correctCount + delta.incorrectIndexes.length !== L.GRID_SIZE ||
          !Number.isInteger(delta.bingoLineCount) || delta.bingoLineCount < 0 || delta.bingoLineCount > 8) return false;
      return Number.isInteger(delta.points) &&
        delta.points === delta.correctCount + delta.bingoLineCount * L.BINGO_BONUS;
    });
  }

  function validFinalPayload(data) {
    return data && data.type === 'final' && validOpaqueId(data.runId) && validRosterPayload(data.roster) &&
      validScoresPayload(data.scores, data.roster);
  }

  function publicRoster() {
    return roster.map((player) => ({ id: player.id, name: player.name }));
  }

  function publicScores() {
    const result = {};
    roster.forEach((player) => { result[player.id] = scoresByToken[player.token] || 0; });
    return result;
  }

  function tokenForId(id) {
    const player = roster.find((entry) => entry.id === id);
    return player ? player.token : null;
  }

  function nameFor(id, list) {
    const player = (list || roster).find((entry) => entry.id === id);
    return player ? player.name : id;
  }

  function moveMapKey(map, oldId, newId) {
    if (!map || !Object.prototype.hasOwnProperty.call(map, oldId)) return;
    map[newId] = map[oldId];
    delete map[oldId];
  }

  function refreshPublicPayloads() {
    if (currentResultPayload) {
      currentResultPayload.roster = publicRoster();
      currentResultPayload.scores = publicScores();
    }
    if (currentFinalPayload) {
      currentFinalPayload.roster = publicRoster();
      currentFinalPayload.scores = publicScores();
    }
  }

  function replacePlayerId(oldId, newId) {
    const player = roster.find((entry) => entry.id === oldId);
    if (player) player.id = newId;
    moveMapKey(marksByPlayer, oldId, newId);
    if (currentResultPayload) {
      moveMapKey(currentResultPayload.marksByPlayer, oldId, newId);
      moveMapKey(currentResultPayload.deltasByPlayer, oldId, newId);
    }
    refreshPublicPayloads();
  }

  function roundEntryForPayload(data) {
    if (!data || typeof data.roundId !== 'string') return null;
    const entry = L.ROUND_BANK.find((candidate) => candidate.id === data.roundId);
    return entry && entry.image === data.image ? entry : null;
  }

  function normalizeRoundPayload(data) {
    const entry = roundEntryForPayload(data);
    if (!entry || typeof data.runId !== 'string' || !Number.isInteger(data.roundIndex) ||
        data.roundIndex < 0 || data.roundIndex >= L.ROUND_TOTAL) return null;
    return {
      type: 'round',
      runId: data.runId,
      scopeId: scopeIdFor(data.runId, data.roundIndex),
      roundIndex: data.roundIndex,
      totalRounds: L.ROUND_TOTAL,
      isFinalRound: data.roundIndex === L.ROUND_TOTAL - 1,
      roundId: entry.id,
      image: entry.image,
      imageAlt: entry.imageAlt,
      statements: entry.statements.map((statement) => statement.text),
      viewMs: VIEW_MS,
    };
  }

  function roundWirePayload(payload) {
    return {
      type: 'round',
      runId: payload.runId,
      roundIndex: payload.roundIndex,
      isFinalRound: payload.isFinalRound,
      roundId: payload.roundId,
      image: payload.image,
      imageAlt: payload.imageAlt,
      viewMs: payload.viewMs,
    };
  }

  function snapshotFor(id) {
    const base = {
      type: 'state-snapshot',
      snapshotVersion: 1,
      phase,
      roster: publicRoster(),
      scores: publicScores(),
      runId,
      roundIndex,
    };
    if (phase === 'round' && currentRoundPayload) {
      const ownMarks = Object.prototype.hasOwnProperty.call(marksByPlayer, id) ? marksByPlayer[id].slice() : null;
      const roundSnapshot = {
        round: roundWirePayload(currentRoundPayload),
        stage: roundStage,
        submittedIds: Object.keys(marksByPlayer),
        myMarks: ownMarks,
      };
      if (roundStage === 'observe') roundSnapshot.remainingMs = Math.max(0, hostStageDeadlineAt - Date.now());
      return Object.assign(base, roundSnapshot);
    }
    if (phase === 'result' && currentResultPayload) return Object.assign(base, { result: currentResultPayload });
    if (phase === 'final' && currentFinalPayload) return Object.assign(base, { final: currentFinalPayload });
    return base;
  }

  function showOnlineError(message) {
    onlineErrorEl.textContent = message;
    onlineErrorEl.classList.remove('hidden');
    hostBtn.disabled = false;
    joinBtn.disabled = false;
    joinCodeInput.disabled = false;
  }

  function resetToSetup(message) {
    if (net && !isHost && typeof net.destroy === 'function') net.destroy();
    net = null;
    conn = null;
    phase = 'lobby';
    setupScreen.classList.remove('hidden');
    lobbyPanel.classList.add('hidden');
    gameArea.classList.add('hidden');
    roundResultOverlay.classList.add('hidden');
    finalResultScreen.classList.add('hidden');
    showOnlineError(message);
  }

  function renderRoster() {
    rosterList.innerHTML = '';
    roster.forEach((player) => {
      const li = document.createElement('li');
      li.className = 'roster-item';
      li.textContent = player.name + (player.id === myId ? '（あなた）' : '');
      rosterList.appendChild(li);
    });
    if (isHost) {
      startBtn.classList.remove('hidden');
      startBtn.disabled = !L.hasMinPlayers(roster);
    }
  }

  function broadcastRoster() {
    if (isHost && net) net.broadcast({ type: 'roster', players: publicRoster() });
  }

  function enterLobby() {
    phase = 'lobby';
    setupScreen.classList.add('hidden');
    lobbyPanel.classList.remove('hidden');
    gameArea.classList.add('hidden');
    roundResultOverlay.classList.add('hidden');
    finalResultScreen.classList.add('hidden');
    renderRoster();
  }

  hostBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) return showOnlineError('ニックネームを入力してください。');
    myName = name;
    isHost = true;
    myId = HOST_ID;
    roster = [{ id: HOST_ID, name: myName, token: 'host' }];
    hostBtn.disabled = true;
    joinBtn.disabled = true;
    joinCodeInput.disabled = true;
    onlineErrorEl.classList.add('hidden');

    net = PhotoMemoryBingoNet.hostRoom({
      onCode(code) {
        roomCode = code;
        WakeLockHelper.enable();
        roomCodeText.textContent = code;
        hostWait.classList.remove('hidden');
        onlineStatusEl.textContent = '友達の参加を待っています…';
        enterLobby();
      },
      onPeerConnected(peerId) {
        net.sendTo(peerId, { type: 'roster', players: publicRoster() });
      },
      onPeerMessage: handleHostMessage,
      onPeerDisconnected: handlePeerDisconnected,
      onConnectionHealthChange(peerId, healthy) {
        gameConnectionStatus.textContent = healthy ? '' : '参加者との通信が不安定です。再参加を待っています…';
        gameConnectionStatus.classList.toggle('hidden', healthy);
      },
      onError(err) { showOnlineError(PeerErrors.describe(err)); },
    });
  });

  joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const code = joinCodeInput.value.trim();
    if (!name) return showOnlineError('ニックネームを入力してください。');
    if (code.length !== 6) return showOnlineError('6桁のコードを入力してください。');
    myName = name;
    isHost = false;
    hostBtn.disabled = true;
    joinBtn.disabled = true;
    joinCodeInput.disabled = true;
    onlineErrorEl.classList.add('hidden');
    roomCode = code.toUpperCase();
    playerToken = savedSession && savedSession.roomCode === roomCode ? savedSession.token : RejoinStorage.newToken();
    joinRequestId = RejoinStorage.newToken();

    net = PhotoMemoryBingoNet.joinRoom(roomCode, {
      onOwnId(id) { myId = id; },
      onConnected(connection) {
        conn = connection;
        WakeLockHelper.enable();
        if (savedSession && savedSession.roomCode === roomCode) {
          conn.send({ type: 'rejoin', name: myName, token: playerToken, rejoinRequestId: joinRequestId });
        } else {
          conn.send({ type: 'join', name: myName, token: playerToken, joinRequestId: joinRequestId });
        }
        onlineStatusEl.textContent = 'ホストがゲームを開始するのを待っています…';
        enterLobby();
      },
      onMessage: handleClientMessage,
      onDisconnected: connectionLost,
      onConnectionHealthChange(healthy) {
        gameConnectionStatus.textContent = healthy ? '' : '通信が不安定です。切断された場合はページを再読み込みしてください。';
        gameConnectionStatus.classList.toggle('hidden', healthy);
      },
      onError(err) {
        if (savedSession && savedSession.roomCode === roomCode && err && err.type === 'peer-unavailable') {
          RejoinStorage.clear(GAME_KEY);
          savedSession = null;
        }
        showOnlineError(PeerErrors.describe(err));
      },
    });
  });

  copyCodeBtn.addEventListener('click', () => {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(roomCodeText.textContent);
  });

  quitBtn.addEventListener('click', () => {
    clearAllRoundTimers();
    WakeLockHelper.disable();
    RejoinStorage.clear(GAME_KEY);
    window.location.reload();
  });

  backToTopLink.addEventListener('click', () => {
    WakeLockHelper.disable();
    RejoinStorage.clear(GAME_KEY);
  });

  function handlePeerDisconnected(peerId) {
    const player = roster.find((entry) => entry.id === peerId);
    if (!player) return;
    if (phase === 'lobby') {
      roster = L.removePlayer(roster, peerId);
      broadcastRoster();
      renderRoster();
      return;
    }
    const timer = setTimeout(() => {
      pendingRejoins.delete(player.token);
      roster = L.removePlayer(roster, peerId);
      delete marksByPlayer[peerId];
      if (currentResultPayload) {
        delete currentResultPayload.marksByPlayer[peerId];
        delete currentResultPayload.deltasByPlayer[peerId];
      }
      refreshPublicPayloads();
      broadcastRoster();
      renderRoster();
      if (phase === 'round') maybeAutoTally();
    }, REJOIN_GRACE_MS);
    pendingRejoins.set(player.token, { oldId: peerId, timer: timer });
    gameConnectionStatus.textContent = player.name + 'さんの再参加を30秒待っています…';
    gameConnectionStatus.classList.remove('hidden');
  }

  function handleHostMessage(peerId, data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join') {
      if (phase !== 'lobby' || !validOpaqueId(data.token) || roster.some((player) => player.token === data.token)) return;
      roster = L.addPlayer(roster, {
        id: peerId,
        name: String(data.name || 'ゲスト').slice(0, 10),
        token: data.token,
      });
      broadcastRoster();
      renderRoster();
      net.sendTo(peerId, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode: roomCode });
      return;
    }
    if (data.type === 'rejoin') {
      if (!validOpaqueId(data.token)) {
        net.sendTo(peerId, { type: 'rejoin-rejected', rejoinRequestId: data.rejoinRequestId });
        return;
      }
      const player = roster.find((entry) => entry.token === data.token);
      const pending = player && pendingRejoins.get(data.token);
      if (!player || !pending) {
        net.sendTo(peerId, { type: 'rejoin-rejected', rejoinRequestId: data.rejoinRequestId });
        return;
      }
      if (pending) {
        clearTimeout(pending.timer);
        pendingRejoins.delete(data.token);
      }
      replacePlayerId(player.id, peerId);
      broadcastRoster();
      renderRoster();
      net.sendTo(peerId, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode: roomCode });
      net.sendTo(peerId, snapshotFor(peerId));
      return;
    }
    if (data.type === 'submit-marks' && phase === 'round' && roundStage === 'answer' &&
        data.scopeId === currentScopeId() && validOpaqueId(data.actionId) && validMarks(data.marks)) {
      const token = tokenForId(peerId);
      if (!token) return;
      const ack = { type: 'submit-marks-ack', actionId: data.actionId, scopeId: data.scopeId };
      if (Object.prototype.hasOwnProperty.call(marksByPlayer, peerId)) {
        net.sendTo(peerId, ack);
        return;
      }
      const actionKey = token + ':' + data.scopeId + ':' + data.actionId;
      if (processedActions.has(actionKey)) {
        net.sendTo(peerId, ack);
        return;
      }
      processedActions.add(actionKey);
      marksByPlayer[peerId] = data.marks.slice();
      net.sendTo(peerId, ack);
      publishProgressAndMaybeTally();
    }
  }

  function handleClientMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join-ack' && data.joinRequestId === joinRequestId) {
      RejoinStorage.save(GAME_KEY, { roomCode: data.roomCode, token: playerToken, name: myName });
      return;
    }
    if (data.type === 'rejoin-ack' && data.rejoinRequestId === joinRequestId) {
      RejoinStorage.save(GAME_KEY, { roomCode: data.roomCode, token: playerToken, name: myName });
      return;
    }
    if (data.type === 'rejoin-rejected' && data.rejoinRequestId === joinRequestId) {
      RejoinStorage.clear(GAME_KEY);
      savedSession = null;
      resetToSetup('再参加の有効期限が切れました。通常参加してください。');
      return;
    }
    if (data.type === 'state-snapshot' && data.snapshotVersion === 1) {
      applySnapshot(data);
      return;
    }
    if (data.type === 'submit-marks-ack' && pendingSubmission && data.actionId === pendingSubmission.id &&
        data.scopeId === pendingSubmission.scopeId) {
      pendingSubmission.attempt.confirm();
      pendingSubmission = null;
      return;
    }
    if (data.type === 'roster' && Array.isArray(data.players)) {
      roster = data.players;
      renderRoster();
      return;
    }
    if (data.type === 'round') {
      const payload = normalizeRoundPayload(data);
      if (payload) enterObservation(payload, payload.viewMs, null, []);
      return;
    }
    if (data.type === 'answer-phase' && phase === 'round' && data.scopeId === currentScopeId()) {
      enterAnswerStage();
      return;
    }
    if (data.type === 'progress' && phase === 'round' && data.scopeId === currentScopeId()) {
      renderProgress(Array.isArray(data.submittedIds) ? data.submittedIds : []);
      return;
    }
    if (data.type === 'round-result') {
      if (validResultPayload(data) && data.runId === runId && data.scopeId === currentScopeId()) showRoundResult(data);
      return;
    }
    if (data.type === 'final' && validFinalPayload(data) && data.runId === runId) showFinalResult(data);
  }

  function applySnapshot(data) {
    roster = Array.isArray(data.roster) ? data.roster : [];
    renderRoster();
    if (data.phase === 'round' && data.round) {
      const payload = normalizeRoundPayload(data.round);
      if (!payload) return resetToSetup('ゲーム状態を復元できませんでした。もう一度参加してください。');
      if (data.stage === 'answer') {
        enterObservation(payload, 0, validMarks(data.myMarks) ? data.myMarks : null, data.submittedIds || [], true);
        enterAnswerStage();
      } else {
        enterObservation(payload, Math.max(0, Number(data.remainingMs) || 0), null, data.submittedIds || []);
      }
      return;
    }
    if (data.phase === 'result' && validResultPayload(data.result)) return showRoundResult(data.result);
    if (data.phase === 'final' && validFinalPayload(data.final)) return showFinalResult(data.final);
    enterLobby();
  }

  function connectionLost() {
    gameConnectionStatus.textContent = 'ホストとの接続が切れました。ページを再読み込みすると30秒以内なら再参加を試みます。';
    gameConnectionStatus.classList.remove('hidden');
  }

  startBtn.addEventListener('click', () => {
    WakeLockHelper.enable();
    if (isHost && L.hasMinPlayers(roster)) startGame();
  });

  playAgainBtn.addEventListener('click', () => {
    if (isHost) startGame();
  });

  function startGame() {
    clearAllRoundTimers();
    scoresByToken = {};
    roster.forEach((player) => { scoresByToken[player.token] = 0; });
    selectedRounds = L.selectRounds(Math.random, L.ROUND_BANK);
    runId = RejoinStorage.newToken();
    roundIndex = -1;
    processedActions.clear();
    currentResultPayload = null;
    currentFinalPayload = null;
    startNextRound();
  }

  function startNextRound() {
    if (!isHost) return;
    clearAllRoundTimers();
    roundIndex += 1;
    activeRoundEntry = selectedRounds[roundIndex];
    marksByPlayer = {};
    tallied = false;
    const rawPayload = {
      type: 'round',
      runId: runId,
      roundIndex: roundIndex,
      roundId: activeRoundEntry.id,
      image: activeRoundEntry.image,
    };
    currentRoundPayload = normalizeRoundPayload(rawPayload);
    hostStageDeadlineAt = Date.now() + VIEW_MS;
    enterObservation(currentRoundPayload, VIEW_MS, null, []);
    net.broadcast(roundWirePayload(currentRoundPayload));
  }

  function clearUiTimers() {
    if (countdownInterval) clearInterval(countdownInterval);
    if (uiStageTimer) clearTimeout(uiStageTimer);
    countdownInterval = null;
    uiStageTimer = null;
  }

  function clearAllRoundTimers() {
    clearUiTimers();
    cancelPendingSubmission();
  }

  function cancelPendingSubmission() {
    if (pendingSubmission) pendingSubmission.attempt.cancel();
    pendingSubmission = null;
  }

  function startCountdown(remainingMs, onExpired) {
    clearUiTimers();
    const duration = Math.max(0, remainingMs);
    const deadline = Date.now() + duration;
    function render() {
      countdownTextEl.textContent = '残り ' + Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) + '秒';
    }
    render();
    countdownInterval = setInterval(render, 250);
    uiStageTimer = setTimeout(() => {
      clearUiTimers();
      countdownTextEl.textContent = '残り 0秒';
      onExpired();
    }, duration);
  }

  function showGameScreen() {
    setupScreen.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    roundResultOverlay.classList.add('hidden');
    finalResultScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    gameConnectionStatus.classList.add('hidden');
  }

  function enterObservation(payload, remainingMs, restoredMarks, submittedIds, skipTimer) {
    cancelPendingSubmission();
    phase = 'round';
    roundStage = 'observe';
    runId = payload.runId;
    roundIndex = payload.roundIndex;
    currentRoundPayload = payload;
    localMarks = validMarks(restoredMarks) ? restoredMarks.slice() : Array(L.GRID_SIZE).fill(false);
    submitted = validMarks(restoredMarks);
    showGameScreen();
    roundStatusEl.textContent = 'ラウンド ' + (roundIndex + 1) + ' / ' + L.ROUND_TOTAL;
    phaseLabelEl.textContent = '観察フェーズ';
    countdownTextEl.classList.remove('hidden');
    memoryImageEl.src = payload.image;
    memoryImageEl.alt = payload.imageAlt;
    observationPanel.classList.remove('hidden');
    answerPanel.classList.add('hidden');
    hostProgressBox.classList.toggle('hidden', !isHost);
    forceResultBtn.classList.add('hidden');
    forceResultBtn.disabled = false;
    renderProgress(Array.isArray(submittedIds) ? submittedIds : []);
    if (!skipTimer) {
      startCountdown(remainingMs, () => {
        if (phase !== 'round' || currentScopeId() !== payload.scopeId) return;
        if (isHost) beginHostAnswerStage(payload.scopeId);
        else enterAnswerStage();
      });
    }
  }

  function beginHostAnswerStage(scopeId) {
    if (!isHost || phase !== 'round' || scopeId !== currentScopeId() || roundStage !== 'observe') return;
    roundStage = 'answer';
    hostStageDeadlineAt = 0;
    enterAnswerStage();
    net.broadcast({ type: 'answer-phase', scopeId: scopeId });
  }

  function enterAnswerStage() {
    if (phase !== 'round' || !currentRoundPayload) return;
    clearUiTimers();
    roundStage = 'answer';
    phaseLabelEl.textContent = '回答フェーズ';
    countdownTextEl.textContent = '';
    countdownTextEl.classList.add('hidden');
    observationPanel.classList.add('hidden');
    answerPanel.classList.remove('hidden');
    renderStatementGrid();
    if (submitted) {
      answerStatusEl.textContent = '回答済みです';
      answerStatusEl.classList.remove('hidden');
    } else {
      answerStatusEl.classList.add('hidden');
    }
    forceResultBtn.classList.toggle('hidden', !isHost || tallied);
  }

  function renderStatementGrid() {
    statementGridEl.innerHTML = '';
    currentRoundPayload.statements.forEach((text, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'statement-cell';
      button.textContent = text;
      button.classList.toggle('is-marked', localMarks[index]);
      button.disabled = submitted;
      button.setAttribute('aria-pressed', localMarks[index] ? 'true' : 'false');
      button.addEventListener('click', () => {
        if (submitted || roundStage !== 'answer') return;
        localMarks[index] = !localMarks[index];
        renderStatementGrid();
      });
      statementGridEl.appendChild(button);
    });
    submitBtn.disabled = submitted;
  }

  submitBtn.addEventListener('click', submitMarks);

  function submitMarks() {
    if (submitted || phase !== 'round' || roundStage !== 'answer' || !validMarks(localMarks)) return;
    submitted = true;
    renderStatementGrid();
    answerStatusEl.textContent = '回答を送信中です…';
    answerStatusEl.classList.remove('hidden');
    if (isHost) {
      if (!Object.prototype.hasOwnProperty.call(marksByPlayer, myId)) marksByPlayer[myId] = localMarks.slice();
      answerStatusEl.textContent = '回答しました';
      publishProgressAndMaybeTally();
      return;
    }
    if (!conn) {
      submitted = false;
      renderStatementGrid();
      answerStatusEl.textContent = '接続がありません。再読み込みして再参加してください。';
      return;
    }
    const actionId = RejoinStorage.newToken();
    const scopeId = currentScopeId();
    const payload = { type: 'submit-marks', marks: localMarks.slice(), actionId: actionId, scopeId: scopeId };
    let failedSynchronously = false;
    const attempt = AckSend.attempt({
      send() { conn.send(payload); },
      onPending() {},
      onConfirmed() { answerStatusEl.textContent = '回答しました'; },
      onFailed() {
        failedSynchronously = true;
        if (phase !== 'round' || currentScopeId() !== scopeId || roundStage !== 'answer') return;
        if (pendingSubmission && pendingSubmission.id === actionId) pendingSubmission = null;
        submitted = false;
        answerStatusEl.textContent = '回答を確認できませんでした。もう一度確定してください。';
        renderStatementGrid();
      },
      timeoutMs: 10000,
    });
    if (!failedSynchronously) pendingSubmission = { id: actionId, scopeId: scopeId, attempt: attempt };
  }

  function publishProgressAndMaybeTally() {
    const ids = Object.keys(marksByPlayer);
    net.broadcast({ type: 'progress', scopeId: currentScopeId(), submittedIds: ids });
    renderProgress(ids);
    maybeAutoTally();
  }

  function maybeAutoTally() {
    if (!isHost || phase !== 'round' || roundStage !== 'answer' || tallied) return;
    if (roster.length > 0 && roster.every((player) => Object.prototype.hasOwnProperty.call(marksByPlayer, player.id))) tallyRound();
  }

  function renderProgress(ids) {
    progressTextEl.textContent = ids.length + ' / ' + roster.length + '人が回答済み';
    progressListEl.innerHTML = '';
    roster.forEach((player) => {
      const li = document.createElement('li');
      li.className = 'roster-item';
      li.textContent = (ids.includes(player.id) ? '✓ ' : '… ') + player.name;
      progressListEl.appendChild(li);
    });
  }

  forceResultBtn.addEventListener('click', () => {
    if (!isHost || phase !== 'round' || roundStage !== 'answer' || tallied) return;
    forceResultBtn.disabled = true;
    tallyRound();
  });

  function tallyRound() {
    if (!isHost || tallied || phase !== 'round' || !activeRoundEntry) return;
    tallied = true;
    forceResultBtn.disabled = true;
    forceResultBtn.classList.add('hidden');
    roster.forEach((player) => {
      if (!Object.prototype.hasOwnProperty.call(marksByPlayer, player.id)) {
        marksByPlayer[player.id] = Array(L.GRID_SIZE).fill(false);
      }
    });
    const deltasByPlayer = L.tallyRoundMarks(marksByPlayer, activeRoundEntry.statements);
    const tokenDeltas = {};
    Object.keys(deltasByPlayer).forEach((playerId) => {
      const token = tokenForId(playerId);
      if (token) tokenDeltas[token] = deltasByPlayer[playerId].points;
    });
    scoresByToken = L.applyScoreDeltas(scoresByToken, tokenDeltas);
    const payload = {
      type: 'round-result',
      runId: runId,
      scopeId: currentScopeId(),
      roundIndex: roundIndex,
      totalRounds: L.ROUND_TOTAL,
      isFinalRound: roundIndex === L.ROUND_TOTAL - 1,
      statements: activeRoundEntry.statements.map((statement) => ({ text: statement.text, isTrue: statement.isTrue })),
      marksByPlayer: Object.keys(marksByPlayer).reduce((map, id) => {
        map[id] = marksByPlayer[id].slice();
        return map;
      }, {}),
      deltasByPlayer: deltasByPlayer,
      scores: publicScores(),
      roster: publicRoster(),
    };
    currentResultPayload = payload;
    phase = 'result';
    clearUiTimers();
    net.broadcast(payload);
    showRoundResult(payload);
  }

  function resultCellState(statement, marked) {
    const correct = statement.isTrue === marked;
    return {
      className: correct ? 'result-correct' : 'result-wrong',
      label: statement.isTrue ? '本当' : 'ウソ',
    };
  }

  function showRoundResult(data) {
    if (!validResultPayload(data)) return;
    clearAllRoundTimers();
    phase = 'result';
    runId = data.runId;
    roundIndex = data.roundIndex;
    currentResultPayload = data;
    gameArea.classList.add('hidden');
    finalResultScreen.classList.add('hidden');
    roundResultOverlay.classList.remove('hidden');
    resultRoundLabelEl.textContent = 'ラウンド ' + (data.roundIndex + 1) + ' / ' + data.totalRounds;

    const ownMarks = validMarks(data.marksByPlayer && data.marksByPlayer[myId])
      ? data.marksByPlayer[myId] : Array(L.GRID_SIZE).fill(false);
    resultGridEl.innerHTML = '';
    data.statements.forEach((statement, index) => {
      const cell = document.createElement('div');
      const state = resultCellState(statement, ownMarks[index]);
      cell.className = 'statement-cell ' + state.className;
      cell.textContent = statement.text;
      const label = document.createElement('span');
      label.className = 'cell-result-label';
      label.textContent = state.label;
      cell.appendChild(label);
      resultGridEl.appendChild(cell);
    });

    const ownDelta = data.deltasByPlayer && data.deltasByPlayer[myId];
    const ownPoints = ownDelta ? ownDelta.points : 0;
    resultMyPointsEl.textContent = 'このラウンド: ' + ownPoints + '点';
    resultMyBingoEl.textContent = ownDelta && ownDelta.bingoLineCount
      ? 'ビンゴ ' + ownDelta.bingoLineCount + '本達成！' : 'ビンゴ達成なし';

    resultDeltasListEl.innerHTML = '';
    (data.roster || []).forEach((player) => {
      const delta = data.deltasByPlayer[player.id] || { points: 0, bingoLineCount: 0 };
      const li = document.createElement('li');
      li.textContent = player.name + ': ' + delta.points + '点' +
        (delta.bingoLineCount ? '（ビンゴ' + delta.bingoLineCount + '本）' : '');
      resultDeltasListEl.appendChild(li);
    });

    resultScoreboardListEl.innerHTML = '';
    L.buildScoreboard(data.scores || {}, data.roster || []).forEach((row) => {
      const li = document.createElement('li');
      li.textContent = row.rank + '位 ' + row.name + ' — ' + row.score + '点';
      resultScoreboardListEl.appendChild(li);
    });

    resultNextBtn.classList.toggle('hidden', !isHost);
    resultNextBtn.textContent = data.isFinalRound ? '最終結果を見る' : '次のラウンドへ';
    resultNextBtn.onclick = () => {
      if (!isHost) return;
      if (data.isFinalRound) {
        const finalPayload = { type: 'final', runId: runId, scores: publicScores(), roster: publicRoster() };
        currentFinalPayload = finalPayload;
        net.broadcast(finalPayload);
        showFinalResult(finalPayload);
      } else {
        startNextRound();
      }
    };
  }

  function showFinalResult(data) {
    if (!validFinalPayload(data)) return;
    clearAllRoundTimers();
    phase = 'final';
    currentFinalPayload = data;
    roundResultOverlay.classList.add('hidden');
    gameArea.classList.add('hidden');
    setupScreen.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    finalResultScreen.classList.remove('hidden');
    const scoreboard = L.buildScoreboard(data.scores || {}, data.roster || []);
    const winners = L.getWinners(scoreboard);
    finalWinnerTextEl.textContent = winners.length
      ? '優勝: ' + winners.map((winner) => winner.name).join('・') + '（' + winners[0].score + '点）' : '';
    const mine = scoreboard.find((row) => row.id === myId);
    finalMyRankTextEl.textContent = mine ? 'あなたの順位: ' + mine.rank + '位（' + mine.score + '点）' : '';
    finalScoreboardListEl.innerHTML = '';
    scoreboard.forEach((row) => {
      const li = document.createElement('li');
      li.textContent = row.rank + '位 ' + row.name + ' — ' + row.score + '点';
      finalScoreboardListEl.appendChild(li);
    });
    playAgainBtn.classList.toggle('hidden', !isHost);
  }

  if (savedSession && savedSession.roomCode && savedSession.token && savedSession.name) {
    nameInput.value = savedSession.name;
    joinCodeInput.value = savedSession.roomCode;
    joinBtn.click();
  }
})();
