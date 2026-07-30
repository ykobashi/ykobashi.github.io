// script.js - Wikipedia冒頭当てクイズ UIロジック(DOM操作・ロビー・オンライン対戦の配線)
// fetch(Wikipedia REST API)を呼ぶのはホストのみ。ゲストはホストから配信された
// 伏字済みの抜粋文と選択肢だけを受け取る(通信の権威はホストに一元化する)。
(function () {
  'use strict';

  const HOST_ID = 'host';
  const L = WikipediaQuizLogic;
  const FETCH_TIMEOUT_MS = 6000;
  const REJOIN_GRACE_MS = 30000;
  const GAME_KEY = 'wikipedia-quiz';

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

  // --- DOM要素(問題準備中) ---
  const loadingPanel = document.getElementById('loading-panel');
  const loadingTextEl = document.getElementById('loading-text');
  const hostFetchError = document.getElementById('host-fetch-error');
  const retryFetchBtn = document.getElementById('retry-fetch-btn');

  // --- DOM要素(出題画面) ---
  const gameArea = document.getElementById('game-area');
  const roundStatusEl = document.getElementById('round-status');
  const excerptTextEl = document.getElementById('excerpt-text');
  const choicesListEl = document.getElementById('choices-list');
  const answerStatusEl = document.getElementById('answer-status');
  const hostProgressBox = document.getElementById('host-progress-box');
  const progressTextEl = document.getElementById('progress-text');
  const progressListEl = document.getElementById('progress-list');
  const tallyBtn = document.getElementById('tally-btn');
  const gameConnectionStatus = document.getElementById('game-connection-status');
  const quitBtn = document.getElementById('quit-btn');
  const connectionHealthEl = document.getElementById('connection-health');

  // --- DOM要素(ラウンド結果) ---
  const roundResultOverlay = document.getElementById('round-result-overlay');
  const resultRoundLabelEl = document.getElementById('result-round-label');
  const resultWordEl = document.getElementById('result-word');
  const resultSourceLinkEl = document.getElementById('result-source-link');
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
  let phase = 'lobby'; // 'lobby' | 'loading' | 'question' | 'result' | 'final'

  let scores = {}; // ホストが管理する通算スコア(全員が受け取ってミラーする)
  let usedTitles = []; // ホストのみが保持する、この部屋で出題済みのタイトル(重複出題防止)
  let currentRound = 0;
  let currentRoundId = null;
  let currentCorrectTitle = null; // ホストのみが保持する今回の正解タイトル(集計まで非公開)
  let answers = {}; // ホストのみが保持する今回の回答マップ {playerId: choice}
  let tallied = false;
  let myAnswer = null; // 自分が選んだ選択肢(未回答ならnull)
  let answerAttempt = null;
  const processedActions = new Set();
  let roomCode = '';
  let playerToken = '';
  let joinRequestId = '';
  let savedSession = RejoinStorage.load(GAME_KEY);
  const pendingRejoins = new Map();
  let currentRoundPayload = null;
  let currentResultPayload = null;
  let currentFinalPayload = null;

  function publicRoster() {
    return roster.map((p) => ({ id: p.id, name: p.name }));
  }

  function tokenForId(id) {
    const player = roster.find((p) => p.id === id);
    return player ? player.token : null;
  }

  function publicScores() {
    const result = {};
    roster.forEach((p) => { result[p.id] = scores[p.token] || 0; });
    return result;
  }

  function replacePlayerId(oldId, newId) {
    const player = roster.find((p) => p.id === oldId);
    if (player) player.id = newId;
    if (Object.prototype.hasOwnProperty.call(answers, oldId)) {
      answers[newId] = answers[oldId];
      delete answers[oldId];
    }
    [currentResultPayload, currentFinalPayload].forEach((payload) => {
      if (!payload) return;
      if (payload.totalScores && Object.prototype.hasOwnProperty.call(payload.totalScores, oldId)) {
        payload.totalScores[newId] = payload.totalScores[oldId];
        delete payload.totalScores[oldId];
      }
      if (payload.roundScoreDelta && Object.prototype.hasOwnProperty.call(payload.roundScoreDelta, oldId)) {
        payload.roundScoreDelta[newId] = payload.roundScoreDelta[oldId];
        delete payload.roundScoreDelta[oldId];
      }
      if (payload.correctVoterIds) {
        payload.correctVoterIds = payload.correctVoterIds.map((id) => id === oldId ? newId : id);
      }
      if (payload.roster) {
        const entry = payload.roster.find((p) => p.id === oldId);
        if (entry) entry.id = newId;
      }
    });
  }

  function snapshotFor(id) {
    const base = { type: 'state-snapshot', snapshotVersion: 1, phase, roster: publicRoster() };
    if (phase === 'question' && currentRoundPayload) {
      return Object.assign(base, { round: currentRoundPayload, answeredIds: Object.keys(answers), myAnswer: answers[id] || null });
    }
    if (phase === 'result' && currentResultPayload) return Object.assign(base, { result: currentResultPayload });
    if (phase === 'final' && currentFinalPayload) return Object.assign(base, { final: currentFinalPayload });
    return base;
  }

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

  function nameFor(id, list) {
    const p = (list || roster).find((x) => x.id === id);
    return p ? p.name : id;
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
    roster = [{ id: myId, name: myName, token: HOST_ID }];
    hostBtn.disabled = true;
    joinBtn.disabled = true;
    joinCodeInput.disabled = true;
    onlineErrorEl.classList.add('hidden');

    net = WikipediaQuizNet.hostRoom({
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
          if (phase === 'question') updateTallyButtonState();
        }, REJOIN_GRACE_MS);
        pendingRejoins.set(player.token, { oldId: peerId, timer });
        gameConnectionStatus.textContent = player.name + 'さんとの接続が不安定です。30秒間再参加を待ちます。';
        gameConnectionStatus.classList.remove('hidden');
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
    isHost = false;
    hostBtn.disabled = true;
    joinBtn.disabled = true;
    joinCodeInput.disabled = true;
    onlineErrorEl.classList.add('hidden');

    roomCode = code.toUpperCase();
    playerToken = savedSession && savedSession.roomCode === roomCode ? savedSession.token : RejoinStorage.newToken();
    joinRequestId = RejoinStorage.newToken();
    net = WikipediaQuizNet.joinRoom(roomCode, {
      onOwnId(id) {
        myId = id;
      },
      onConnected(c) {
        conn = c;
        conn.send({ type: 'join', name: myName, token: playerToken, joinRequestId });
        onlineStatusEl.textContent = 'ホストがゲームを開始するのを待っています…';
        enterLobby();
      },
      onMessage: handleClientMessage,
      onDisconnected: connectionLost,
      onConnectionHealthChange: connectionHealthChanged,
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
    RejoinStorage.clear('wikipedia-quiz');
    window.location.reload();
  });

  // ================= メッセージ処理 =================

  function handleHostMessage(peerId, data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join') {
      if (phase !== 'lobby') return;
      if (!data.token) return;
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
    if (data.type === 'answer' && phase === 'question') {
      acceptAnswer(peerId, data.roundId, data.choice, data.actionId);
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
      if (data.phase === 'question' && data.round) {
        enterQuestion(data.round);
        if (data.myAnswer !== null) {
          myAnswer = data.myAnswer;
          Array.prototype.forEach.call(choicesListEl.children, (b) => { b.disabled = true; });
          answerStatusEl.classList.remove('hidden');
        }
        renderProgress(data.answeredIds || []);
      } else if (data.phase === 'result' && data.result) showRoundResult(data.result);
      else if (data.phase === 'final' && data.final) showFinalResult(data.final);
      else enterLobby();
      return;
    }
    if (data.type === 'roster') {
      roster = data.players;
      renderRoster();
      return;
    }
    if (data.type === 'round') {
      enterQuestion(data);
      return;
    }
    if (data.type === 'progress') {
      if (data.roundId !== currentRoundId) return;
      renderProgress(data.answeredIds);
      return;
    }
    if (data.type === 'answer-ack' && answerAttempt &&
        data.actionId === answerAttempt.actionId && data.scopeId === answerAttempt.scopeId) {
      answerAttempt.attempt.confirm();
      answerAttempt = null;
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
    gameConnectionStatus.textContent = 'ホストとの接続が切れました。ページを再読み込みして最初からやり直してください。';
    gameConnectionStatus.classList.remove('hidden');
  }

  // ================= Wikipedia REST API 取得(ホストのみ) =================

  async function fetchOneSummary(title) {
    let timeoutId = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch('https://ja.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title), {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.extract || data.type === 'disambiguation') return null;
      return { title, extract: data.extract };
    } catch (err) {
      return null; // オフライン・タイムアウト・該当記事なし等はすべてフォールバック対象
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  // 未出題タイトルの候補キューを順に試し、最初に成功した抜粋を返す。全滅したらnull。
  async function fetchRoundContent() {
    const candidates = L.pickArticleCandidates(usedTitles, Math.random, L.ARTICLE_LIST, L.FETCH_CANDIDATE_COUNT);
    for (let i = 0; i < candidates.length; i++) {
      const result = await fetchOneSummary(candidates[i]);
      if (result) return result;
    }
    return null;
  }

  // ================= ゲーム開始・出題(ホストのみ操作) =================

  startBtn.addEventListener('click', () => {
    if (!isHost || !L.hasMinPlayers(roster)) return;
    startGame();
  });

  playAgainBtn.addEventListener('click', () => {
    if (!isHost) return;
    startGame();
  });

  retryFetchBtn.addEventListener('click', () => {
    if (!isHost) return;
    startRound();
  });

  function startGame() {
    scores = {};
    currentRound = 0;
    roster.forEach((p) => { scores[p.token] = 0; });
    startRound();
  }

  function showLoading() {
    phase = 'loading';
    setupScreen.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    gameArea.classList.add('hidden');
    roundResultOverlay.classList.add('hidden');
    finalResultScreen.classList.add('hidden');
    hostFetchError.classList.add('hidden');
    loadingTextEl.textContent = '問題を準備しています…';
    loadingPanel.classList.remove('hidden');
  }

  async function startRound() {
    if (!isHost) return;
    currentRound += 1;
    showLoading();
    const result = await fetchRoundContent();
    if (!result) {
      currentRound -= 1; // 失敗時はラウンド数を消費しない
      loadingTextEl.textContent = '問題の取得に失敗しました。';
      hostFetchError.classList.remove('hidden');
      return;
    }
    usedTitles.push(result.title);
    currentCorrectTitle = result.title;
    const excerpt = L.prepareExcerpt(result.extract, result.title);
    const choices = L.buildChoices(result.title, Math.random);
    currentRoundId = 'r' + Date.now() + '-' + currentRound;
    answers = {};
    processedActions.clear();
    tallied = false;
    const data = {
      type: 'round',
      round: currentRound,
      totalRounds: L.ROUND_TOTAL,
      roundId: currentRoundId,
      excerpt,
      choices,
    };
    currentRoundPayload = data;
    currentResultPayload = null;
    currentFinalPayload = null;
    net.broadcast(data);
    enterQuestion(data);
  }

  function enterQuestion(data) {
    phase = 'question';
    myAnswer = null;
    currentRoundId = data.roundId;
    setupScreen.classList.add('hidden');
    lobbyPanel.classList.add('hidden');
    loadingPanel.classList.add('hidden');
    roundResultOverlay.classList.add('hidden');
    finalResultScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    gameConnectionStatus.classList.add('hidden');

    roundStatusEl.textContent = 'ラウンド ' + data.round + ' / ' + data.totalRounds;
    excerptTextEl.textContent = data.excerpt;
    answerStatusEl.classList.add('hidden');
    renderChoices(data.choices);
    hostProgressBox.classList.toggle('hidden', !isHost);
    renderProgress([]);
  }

  function renderChoices(choices) {
    choicesListEl.innerHTML = '';
    choices.forEach((title) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-btn choice-btn';
      btn.textContent = title;
      btn.addEventListener('click', () => submitAnswer(title, btn));
      choicesListEl.appendChild(btn);
    });
  }

  function submitAnswer(title, btnEl) {
    if (myAnswer !== null || phase !== 'question') return;
    myAnswer = title;
    Array.prototype.forEach.call(choicesListEl.children, (b) => { b.disabled = true; });
    btnEl.classList.add('selected');
    answerStatusEl.classList.remove('hidden');
    if (isHost) {
      acceptAnswer(myId, currentRoundId, title);
    } else if (conn) {
      const actionId = RejoinStorage.newToken();
      const scopeId = currentRoundId;
      const payload = { type: 'answer', roundId: currentRoundId, scopeId, actionId, choice: title };
      const attempt = AckSend.attempt({
        send() { conn.send(payload); },
        onPending() { answerStatusEl.textContent = '回答を送信中です…'; },
        onConfirmed() { answerStatusEl.textContent = '回答しました。集計を待っています。'; },
        onFailed() {
          answerStatusEl.textContent = '回答を確認できませんでした。もう一度お試しください。';
          myAnswer = null;
          Array.prototype.forEach.call(choicesListEl.children, (b) => { b.disabled = false; });
        },
      });
      answerAttempt = { actionId, scopeId, attempt };
    }
  }

  function acceptAnswer(playerId, roundId, choice, actionId) {
    if (!isHost || phase !== 'question' || roundId !== currentRoundId) return;
    const key = playerId + ':answer:' + roundId + ':' + String(actionId || '');
    if (processedActions.has(key)) {
      if (playerId !== HOST_ID) net.sendTo(playerId, { type: 'answer-ack', actionId, scopeId: roundId });
      return;
    }
    if (playerId !== HOST_ID && !actionId) return;
    if (!Object.prototype.hasOwnProperty.call(answers, playerId)) answers[playerId] = choice;
    processedActions.add(key);
    const ids = Object.keys(answers);
    net.broadcast({ type: 'progress', roundId: currentRoundId, answeredIds: ids });
    renderProgress(ids);
    if (playerId !== HOST_ID) net.sendTo(playerId, { type: 'answer-ack', actionId, scopeId: roundId });
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
    updateTallyButtonState();
  }

  // ================= 集計・ラウンド結果(ホストのみ操作、集計自体は手動トリガー) =================

  function updateTallyButtonState() {
    if (!isHost) return;
    const answeredCount = Object.keys(answers).length;
    const everyoneAnswered = roster.length > 0 && answeredCount >= roster.length;
    tallyBtn.disabled = tallied || !everyoneAnswered;
    tallyBtn.textContent = '集計して結果発表';
  }

  tallyBtn.addEventListener('click', () => {
    if (!isHost) return;
    tallyRound();
  });

  function tallyRound() {
    if (!isHost || tallied || !currentCorrectTitle) return;
    tallied = true;
    const deltas = L.computeRoundScoreDeltas(answers, currentCorrectTitle);
    Object.keys(deltas).forEach((id) => {
      const token = tokenForId(id);
      if (token) scores[token] = (scores[token] || 0) + deltas[id];
    });
    const correctVoterIds = Object.keys(answers).filter((id) => L.isCorrectAnswer(answers[id], currentCorrectTitle));
    const payload = {
      type: 'result',
      round: currentRound,
      totalRounds: L.ROUND_TOTAL,
      roundId: currentRoundId,
      correctTitle: currentCorrectTitle,
      correctVoterIds,
      roundScoreDelta: deltas,
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
    loadingPanel.classList.add('hidden');
    gameArea.classList.add('hidden');
    finalResultScreen.classList.add('hidden');
    roundResultOverlay.classList.remove('hidden');

    resultRoundLabelEl.textContent = 'ラウンド ' + data.round + ' / ' + data.totalRounds;
    resultWordEl.textContent = data.correctTitle;
    let sourceUrl = '';
    try {
      if (data.correctTitle) sourceUrl = L.wikipediaSourceUrl(String(data.correctTitle));
    } catch (err) {
      sourceUrl = '';
    }
    if (sourceUrl) {
      resultSourceLinkEl.href = sourceUrl;
      resultSourceLinkEl.classList.remove('hidden');
    } else {
      resultSourceLinkEl.removeAttribute('href');
      resultSourceLinkEl.classList.add('hidden');
    }
    resultCorrectAnswerersEl.textContent = '正解: ' + (data.correctVoterIds.length
      ? data.correctVoterIds.map((id) => nameFor(id, data.roster)).join('、')
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
    roundResultOverlay.classList.add('hidden');
    gameArea.classList.add('hidden');
    loadingPanel.classList.add('hidden');
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
    myName = savedSession.name;
    roomCode = savedSession.roomCode;
    playerToken = savedSession.token;
    joinRequestId = RejoinStorage.newToken();
    isHost = false;
    net = WikipediaQuizNet.joinRoom(roomCode, {
      onOwnId(id) { myId = id; },
      onConnected(c) {
        conn = c;
        conn.send({ type: 'rejoin', token: playerToken, name: myName, rejoinRequestId: joinRequestId });
      },
      onMessage: handleClientMessage,
      onDisconnected: connectionLost,
      onConnectionHealthChange: connectionHealthChanged,
      onError(err) {
        if (savedSession && savedSession.roomCode === roomCode && err && err.type === 'peer-unavailable') {
          RejoinStorage.clear(GAME_KEY);
          savedSession = null;
        }
        showOnlineError(PeerErrors.describe(err));
      },
    });
  }
})();
