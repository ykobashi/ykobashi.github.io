// script.js - はぁっていうゲーム風・表情当てクイズ UIロジック(DOM操作・ロビー・オンライン対戦の配線)
(function () {
  'use strict';

  const HOST_ID = 'host';
  const L = ExpressionQuizLogic;
  const GAME_KEY = 'expression-quiz';
  const REJOIN_GRACE_MS = 30000;
  const ALLOWED_IMAGE_PATHS = L.allImagePaths(L.EXPRESSION_BANK);

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

  // --- DOM要素(出題画面) ---
  const gameArea = document.getElementById('game-area');
  const roundStatusEl = document.getElementById('round-status');
  const expressionImageEl = document.getElementById('expression-image');
  const choicesListEl = document.getElementById('choices-list');
  const answerStatusEl = document.getElementById('answer-status');
  const hostProgressBox = document.getElementById('host-progress-box');
  const progressTextEl = document.getElementById('progress-text');
  const progressListEl = document.getElementById('progress-list');
  const gameConnectionStatus = document.getElementById('game-connection-status');
  const quitBtn = document.getElementById('quit-btn');

  // --- DOM要素(ラウンド結果) ---
  const roundResultOverlay = document.getElementById('round-result-overlay');
  const resultRoundLabelEl = document.getElementById('result-round-label');
  const resultScenarioEl = document.getElementById('result-scenario');
  const resultCorrectAnswerersEl = document.getElementById('result-correct-answerers');
  const resultScoreboardListEl = document.getElementById('result-scoreboard-list');
  const resultNextBtn = document.getElementById('result-next-btn');

  // --- DOM要素(最終結果) ---
  const finalResultScreen = document.getElementById('final-result-screen');
  const finalWinnerTextEl = document.getElementById('final-winner-text');
  const finalMyRankTextEl = document.getElementById('final-my-rank-text');
  const finalScoreboardListEl = document.getElementById('final-scoreboard-list');
  const playAgainBtn = document.getElementById('play-again-btn');

  // --- 状態 ---
  let isHost = false;
  let myId = null; // ホストは'host'固定、ゲストはPeerJSが割り当てたID
  let myName = '';
  let net = null; // ホスト:コントローラーオブジェクト / ゲスト:Peerインスタンス
  let conn = null; // ゲスト側のみ使用するDataConnection
  let roster = []; // [{id, name}]
  let phase = 'lobby'; // 'lobby' | 'question' | 'result' | 'final'

  let scores = {}; // ホストが管理する通算スコア(全員が受け取ってミラーする)
  let usedEntryIds = []; // ホストのみが保持する、この部屋で出題済みのパターン(重複出題防止)
  let currentRound = 0;
  let pendingAnswer = null;
  const processedActions = new Set();
  let currentEntry = null; // ホストのみが保持する今回のエントリ {id, image, correctScenario, decoyScenarios}
  let answers = {}; // ホストのみが保持する今回の回答マップ {playerId: selectedScenario}
  let tallied = false;
  let answered = false; // 自分が回答済みかどうか
  let roomCode = '';
  let playerToken = '';
  let joinRequestId = '';
  let savedSession = RejoinStorage.load(GAME_KEY);
  const pendingRejoins = new Map();
  let currentQuestionPayload = null;
  let currentResultPayload = null;
  let currentFinalPayload = null;

  function showOnlineError(message) {
    onlineErrorEl.textContent = message;
    onlineErrorEl.classList.remove('hidden');
    hostBtn.disabled = false;
    joinBtn.disabled = false;
    joinCodeInput.disabled = false;
  }

  function nameFor(id, list) {
    const p = (list || roster).find((x) => x.id === id);
    return p ? p.name : id;
  }

  function publicRoster() {
    return roster.map((p) => ({ id: p.id, name: p.name }));
  }

  function publicScores() {
    const result = {};
    roster.forEach((p) => { result[p.id] = scores[p.token] || 0; });
    return result;
  }

  function tokenForId(id) {
    const player = roster.find((p) => p.id === id);
    return player ? player.token : null;
  }

  function replacePlayerId(oldId, newId) {
    const player = roster.find((p) => p.id === oldId);
    if (player) player.id = newId;
    if (Object.prototype.hasOwnProperty.call(answers, oldId)) {
      answers[newId] = answers[oldId];
      delete answers[oldId];
    }
    if (currentResultPayload) {
      currentResultPayload.correctIds = currentResultPayload.correctIds.map((id) => id === oldId ? newId : id);
      currentResultPayload.roster = publicRoster();
      currentResultPayload.totalScores = publicScores();
    }
    if (currentFinalPayload) {
      currentFinalPayload.roster = publicRoster();
      currentFinalPayload.totalScores = publicScores();
    }
  }

  function snapshotFor(id) {
    const base = { type: 'state-snapshot', snapshotVersion: 1, phase, roster: publicRoster() };
    if (phase === 'question' && currentQuestionPayload) {
      return Object.assign(base, { question: currentQuestionPayload, answeredIds: Object.keys(answers), myAnswer: Object.prototype.hasOwnProperty.call(answers, id) ? answers[id] : null });
    }
    if (phase === 'result' && currentResultPayload) return Object.assign(base, { result: currentResultPayload });
    if (phase === 'final' && currentFinalPayload) return Object.assign(base, { final: currentFinalPayload });
    return base;
  }

  // 既知バンクに実在するパスかを照合してから img.src に設定する(ネットワーク越しの値を無検証で使わない)
  function setImage(imgEl, path) {
    const allowed = typeof path === 'string' && ALLOWED_IMAGE_PATHS.includes(path);
    imgEl.src = allowed ? path : '';
  }

  // ================= ロビー名簿 =================

  function renderRoster() {
    rosterList.innerHTML = '';
    roster.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'roster-item';
      li.textContent = p.name + (p.id === myId ? '（あなた）' : '');
      rosterList.appendChild(li);
    });
    if (isHost) {
      startBtn.classList.remove('hidden');
      startBtn.disabled = !L.hasMinPlayers(roster);
    }
  }

  function broadcastRoster() {
    net.broadcast({ type: 'roster', players: publicRoster() });
  }

  function enterLobby() {
    setupScreen.classList.add('hidden');
    lobbyPanel.classList.remove('hidden');
    renderRoster();
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
    roster = [{ id: myId, name: myName, token: 'host' }];
    hostBtn.disabled = true;
    joinBtn.disabled = true;
    joinCodeInput.disabled = true;
    onlineErrorEl.classList.add('hidden');

    net = ExpressionQuizNet.hostRoom({
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
      onPeerDisconnected(peerId) {
        const player = roster.find((p) => p.id === peerId);
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
          delete answers[peerId];
          broadcastRoster();
          renderRoster();
          if (phase === 'question') maybeAutoTally();
        }, REJOIN_GRACE_MS);
        pendingRejoins.set(player.token, { oldId: peerId, timer });
        gameConnectionStatus.textContent = player.name + 'さんの再参加を30秒待っています…';
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

    roomCode = code.toUpperCase();
    playerToken = savedSession && savedSession.roomCode === roomCode ? savedSession.token : RejoinStorage.newToken();
    joinRequestId = RejoinStorage.newToken();
    net = ExpressionQuizNet.joinRoom(roomCode, {
      onOwnId(id) {
        myId = id;
      },
      onConnected(c) {
        conn = c;
        if (savedSession && savedSession.roomCode === roomCode) {
          conn.send({ type: 'rejoin', name: myName, token: playerToken, rejoinRequestId: joinRequestId });
        } else {
          conn.send({ type: 'join', name: myName, token: playerToken, joinRequestId });
        }
        onlineStatusEl.textContent = 'ホストがゲームを開始するのを待っています…';
        enterLobby();
      },
      onMessage: handleClientMessage,
      onDisconnected: connectionLost,
      onConnectionHealthChange(healthy) {
        gameConnectionStatus.textContent = healthy ? '' : '通信が不安定です。再接続を試みています…';
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
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(roomCodeText.textContent);
    }
  });

  quitBtn.addEventListener('click', () => {
    WakeLockHelper.disable();
    RejoinStorage.clear(GAME_KEY);
    window.location.reload();
  });

  // ================= メッセージ処理 =================

  function handleHostMessage(peerId, data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join') {
      if (phase !== 'lobby') return;
      if (!data.token || roster.some((p) => p.token === data.token)) return;
      roster = L.addPlayer(roster, { id: peerId, name: String(data.name || 'ゲスト').slice(0, 10), token: data.token });
      broadcastRoster();
      renderRoster();
      net.sendTo(peerId, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode });
      return;
    }
    if (data.type === 'rejoin') {
      const player = roster.find((p) => p.token === data.token);
      const pending = player && pendingRejoins.get(data.token);
      if (!player || !pending) {
        net.sendTo(peerId, { type: 'rejoin-rejected', rejoinRequestId: data.rejoinRequestId });
        return;
      }
      clearTimeout(pending.timer);
      pendingRejoins.delete(data.token);
      replacePlayerId(player.id, peerId);
      broadcastRoster();
      renderRoster();
      net.sendTo(peerId, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode });
      net.sendTo(peerId, snapshotFor(peerId));
      return;
    }
    if (data.type === 'answer' && phase === 'question' && data.scopeId === String(currentRound) && data.actionId) {
      const key = peerId + ':answer:' + data.scopeId + ':' + data.actionId;
      if (!processedActions.has(key)) {
        processedActions.add(key);
        acceptAnswer(peerId, data.selectedScenario);
      }
      net.sendTo(peerId, { type: 'answer-ack', actionId: data.actionId, scopeId: data.scopeId });
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
    if (data.type === 'rejoin-rejected') {
      RejoinStorage.clear(GAME_KEY);
      showOnlineError('再参加の有効期限が切れました。通常参加してください。');
      return;
    }
    if (data.type === 'state-snapshot' && data.snapshotVersion === 1) {
      roster = data.roster || [];
      renderRoster();
      if (data.phase === 'question' && data.question) {
        enterQuestion(data.question);
        if (data.myAnswer !== null && data.myAnswer !== undefined) {
          answered = true;
          Array.prototype.forEach.call(choicesListEl.children, (b) => {
            b.disabled = true;
            b.classList.toggle('selected', b.textContent === data.myAnswer);
          });
          answerStatusEl.classList.remove('hidden');
        }
        renderProgress(data.answeredIds || []);
      } else if (data.phase === 'result' && data.result) showRoundResult(data.result);
      else if (data.phase === 'final' && data.final) showFinalResult(data.final);
      else enterLobby();
      return;
    }
    if (data.type === 'answer-ack' && pendingAnswer && data.actionId === pendingAnswer.id && data.scopeId === String(currentRound)) {
      pendingAnswer.attempt.confirm();
      pendingAnswer = null;
      return;
    }
    if (data.type === 'roster') {
      roster = data.players;
      renderRoster();
      return;
    }
    if (data.type === 'question') {
      enterQuestion(data);
      return;
    }
    if (data.type === 'progress') {
      renderProgress(data.answeredIds);
      return;
    }
    if (data.type === 'result') {
      showRoundResult(data);
      return;
    }
    if (data.type === 'final') {
      showFinalResult(data);
      return;
    }
  }

  function connectionLost() {
    gameConnectionStatus.textContent = 'ホストとの接続が切れました。ページを再読み込みすると再参加を試みます。';
    gameConnectionStatus.classList.remove('hidden');
  }

  // ================= ゲーム開始・出題(ホストのみ操作) =================

  startBtn.addEventListener('click', () => {
    WakeLockHelper.enable();
    if (!isHost || !L.hasMinPlayers(roster)) return;
    startGame();
  });

  playAgainBtn.addEventListener('click', () => {
    if (!isHost) return;
    startGame();
  });

  function startGame() {
    scores = {};
    currentRound = 0;
    usedEntryIds = [];
    roster.forEach((p) => { scores[p.token] = 0; });
    currentResultPayload = null;
    currentFinalPayload = null;
    startRound();
  }

  function startRound() {
    if (!isHost) return;
    currentRound += 1;
    const selection = L.selectRoundEntry(Math.random, L.EXPRESSION_BANK, usedEntryIds);
    usedEntryIds = selection.usedIds;
    currentEntry = selection.entry;
    answers = {};
    tallied = false;
    const choices = L.buildChoices(currentEntry, Math.random);
    const data = {
      type: 'question',
      round: currentRound,
      totalRounds: L.ROUND_TOTAL,
      image: currentEntry.image,
      choices,
    };
    currentQuestionPayload = data;
    net.broadcast(data);
    enterQuestion(data);
  }

  function enterQuestion(data) {
    phase = 'question';
    currentRound = data.round;
    currentQuestionPayload = data;
    answered = false;
    setupScreen.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    roundResultOverlay.classList.add('hidden');
    finalResultScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    gameConnectionStatus.classList.add('hidden');

    roundStatusEl.textContent = 'ラウンド ' + data.round + ' / ' + data.totalRounds;
    setImage(expressionImageEl, data.image);
    answerStatusEl.classList.add('hidden');
    renderChoices(data.choices);
    hostProgressBox.classList.toggle('hidden', !isHost);
    renderProgress([]);
  }

  function renderChoices(choices) {
    choicesListEl.innerHTML = '';
    choices.forEach((scenario) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-btn choice-btn';
      btn.textContent = scenario;
      btn.addEventListener('click', () => submitAnswer(scenario, btn));
      choicesListEl.appendChild(btn);
    });
  }

  function submitAnswer(scenario, btnEl) {
    if (answered || phase !== 'question') return;
    answered = true;
    Array.prototype.forEach.call(choicesListEl.children, (b) => { b.disabled = true; });
    btnEl.classList.add('selected');
    answerStatusEl.classList.remove('hidden');
    if (isHost) {
      acceptAnswer(myId, scenario);
    } else if (conn) {
      const actionId = RejoinStorage.newToken();
      const payload = { type: 'answer', selectedScenario: scenario, actionId, scopeId: String(currentRound) };
      const attempt = AckSend.attempt({
        send() { conn.send(payload); },
        onPending() { answerStatusEl.textContent = '回答を送信中です…'; },
        onConfirmed() { answerStatusEl.textContent = '回答しました'; },
        onFailed() {
          answered = false;
          answerStatusEl.textContent = '回答を確認できませんでした。もう一度選んでください。';
          Array.prototype.forEach.call(choicesListEl.children, (b) => { b.disabled = false; });
        },
        timeoutMs: 10000,
      });
      pendingAnswer = { id: actionId, attempt };
    }
  }

  function acceptAnswer(playerId, scenario) {
    if (!isHost || phase !== 'question') return;
    if (Object.prototype.hasOwnProperty.call(answers, playerId)) return;
    if (typeof scenario !== 'string' || !scenario) return;
    answers[playerId] = scenario;
    const ids = Object.keys(answers);
    net.broadcast({ type: 'progress', answeredIds: ids });
    renderProgress(ids);
    maybeAutoTally();
  }

  function maybeAutoTally() {
    if (!isHost || phase !== 'question' || tallied) return;
    if (roster.length > 0 && roster.every((p) => Object.prototype.hasOwnProperty.call(answers, p.id))) {
      tallyRound();
    }
  }

  function renderProgress(ids) {
    progressTextEl.textContent = ids.length + ' / ' + roster.length + '人が回答済み';
    progressListEl.innerHTML = '';
    roster.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'roster-item';
      li.textContent = (ids.includes(p.id) ? '✓ ' : '… ') + p.name;
      progressListEl.appendChild(li);
    });
  }

  // ================= 集計・ラウンド結果(ホストのみ操作) =================

  function tallyRound() {
    if (!isHost || tallied || !currentEntry) return;
    tallied = true;
    const tally = L.tallyRoundAnswers(answers, currentEntry.correctScenario);
    const idDeltas = L.computeRoundScoreDeltas(tally);
    const tokenDeltas = {};
    Object.keys(idDeltas).forEach((id) => {
      const token = tokenForId(id);
      if (token) tokenDeltas[token] = (tokenDeltas[token] || 0) + idDeltas[id];
    });
    scores = L.applyScoreDeltas(scores, tokenDeltas);
    const payload = {
      type: 'result',
      round: currentRound,
      totalRounds: L.ROUND_TOTAL,
      correctScenario: currentEntry.correctScenario,
      correctIds: tally.correctIds,
      totalScores: publicScores(),
      isFinalRound: currentRound >= L.ROUND_TOTAL,
      roster: publicRoster(),
    };
    currentResultPayload = payload;
    net.broadcast(payload);
    showRoundResult(payload);
  }

  function showRoundResult(data) {
    phase = 'result';
    currentResultPayload = data;
    gameArea.classList.add('hidden');
    finalResultScreen.classList.add('hidden');
    roundResultOverlay.classList.remove('hidden');

    resultRoundLabelEl.textContent = 'ラウンド ' + data.round + ' / ' + data.totalRounds;
    resultScenarioEl.textContent = data.correctScenario;
    resultCorrectAnswerersEl.textContent = '正解: ' + (data.correctIds.length
      ? data.correctIds.map((id) => nameFor(id, data.roster)).join('、')
      : 'なし');

    resultScoreboardListEl.innerHTML = '';
    L.buildScoreboard(data.totalScores, data.roster).forEach((row) => {
      const li = document.createElement('li');
      li.textContent = row.rank + '位 ' + row.name + ' — ' + row.score + '点';
      resultScoreboardListEl.appendChild(li);
    });

    resultNextBtn.classList.toggle('hidden', !isHost);
    resultNextBtn.textContent = data.isFinalRound ? '最終結果を見る' : '次の問題へ';
    resultNextBtn.onclick = () => {
      if (!isHost) return;
      if (data.isFinalRound) {
        const finalPayload = { type: 'final', totalScores: data.totalScores, roster: data.roster };
        currentFinalPayload = finalPayload;
        net.broadcast(finalPayload);
        showFinalResult(finalPayload);
      } else {
        startRound();
      }
    };
  }

  // ================= 最終結果 =================

  function showFinalResult(data) {
    phase = 'final';
    currentFinalPayload = data;
    roundResultOverlay.classList.add('hidden');
    gameArea.classList.add('hidden');
    finalResultScreen.classList.remove('hidden');

    const scoreboard = L.buildScoreboard(data.totalScores, data.roster);
    const winners = L.getWinners(scoreboard);
    finalWinnerTextEl.textContent = winners.length
      ? '優勝: ' + winners.map((w) => w.name).join('・') + '（' + winners[0].score + '点）'
      : '';

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
