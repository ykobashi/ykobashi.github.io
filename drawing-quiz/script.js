(function () {
  'use strict';
  const L = window.DrawingQuizLogic, HOST_ID = 'host', SIZE = 320, MAX_SEGMENTS = 5000;
  const REJOIN_GRACE_MS = 30000, GAME_KEY = 'drawing-quiz';
  const $ = (id) => document.getElementById(id), hidden = (id, value) => $(id).classList.toggle('hidden', value);
  let net, conn = null, isHost = false, myId = '', myName = '', roomCode = '';
  let roster = [], phase = 'setup', gameId = 0, turnOrder = [], turnIndex = 0, scores = {}, usedTopics = [];
  let currentTopic = null, myTopic = null, segments = [], drawing = null;
  let lastRoundResult = null, lastFinalResult = null;
  let guestToken = null, joinRequestId = null, rejoinRequestId = null, skipAttempt = null;
  const processed = new Set();
  const pendingRejoins = new Map();
  const canvas = $('canvas'), ctx = canvas.getContext('2d'); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#223';

  function error(message) { $('error').textContent = message || ''; }
  function peerError(err) { console.error(err); error(window.PeerErrors ? PeerErrors.describe(err) : '接続エラーが発生しました。'); }
  function connectionHealthChanged(a, b) { const healthy = typeof b === 'boolean' ? b : a; hidden('connection-health', healthy); }
  function setPhase(next) { phase = next; hidden('setup', next !== 'setup'); hidden('lobby', next !== 'lobby'); hidden('game', next !== 'drawing'); hidden('round-result', next !== 'round-result'); hidden('final-result-screen', next !== 'final-result'); }
  function showSetup() { isHost = false; net = null; conn = null; WakeLockHelper.disable(); $('host').disabled = false; $('join').disabled = false; setPhase('setup'); }
  function nameOf(id) { const p = roster.find((item) => item.id === id); return p ? p.name : '参加者'; }
  function current() { return L.currentTurnInfo(turnOrder, turnIndex, L.ROUNDS); }
  function notify(peerId, data) { if (peerId === HOST_ID) receive(data); else net.sendTo(peerId, data); }
  function publicRoster() { return roster.map((p) => ({ id: p.id, name: p.name })); }
  function renderRoster() { $('roster').replaceChildren(...roster.map((p) => { const li = document.createElement('li'); li.textContent = p.name + (p.id === myId ? '（あなた）' : ''); return li; })); $('start').disabled = !isHost || !L.hasMinPlayers(roster); }
  function renderScores(target, source = scores) { const list = $(target); list.replaceChildren(...L.buildScoreboard(source, roster).map((row) => { const li = document.createElement('li'); li.textContent = row.rank + '位　' + row.name + '　' + row.score + '点'; return li; })); }
  function clearCanvas() { ctx.clearRect(0, 0, SIZE, SIZE); }
  function draw(s) { ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke(); }
  function redraw() { clearCanvas(); segments.forEach(draw); }
  function validSegment(data) { return data && Number.isInteger(data.strokeId) && ['x0', 'y0', 'x1', 'y1'].every((key) => Number.isFinite(data[key]) && data[key] >= 0 && data[key] <= SIZE); }
  function scopeOK(data) { return data && data.gameId === gameId && data.turnIndex === turnIndex; }
  function drawer() { const turn = current(); return turn && turn.playerId === myId; }
  function pushGuessLog(name, text) {
    const li = document.createElement('li');
    li.textContent = name + '：' + text;
    // 勢いよく複数人分の誤答が届く想定のため、上書きせず縦に積み上げて表示する。
    $('guess-log').appendChild(li);
    while ($('guess-log').children.length > 8) $('guess-log').firstElementChild.remove();
    setTimeout(() => { li.classList.add('fade-out'); setTimeout(() => li.remove(), 300); }, 5000);
  }
  function renderGame() { const turn = current(); if (!turn) return; $('turn-label').textContent = '第' + turn.round + '回・この回の' + turn.turnInRound + '人目　' + nameOf(turn.playerId) + 'さんの番'; $('topic').textContent = drawer() ? 'お題：' + (myTopic || '受信中…') : nameOf(turn.playerId) + 'さんがお題を描いています'; hidden('drawer-controls', !drawer()); hidden('guess-controls', drawer()); $('guess').value = ''; $('skip').disabled = false; skipAttempt = null; renderScores('scores'); redraw(); }
  function broadcastRoster() { net.broadcast({ type: 'roster', players: publicRoster() }); }

  // --- ターン進行・得点(ホストのみ実行) ---
  function hostStartGame() { if (!L.hasMinPlayers(roster)) return; gameId++; turnOrder = L.buildTurnOrder(roster.map((p) => p.id)); turnIndex = 0; scores = Object.fromEntries(turnOrder.map((id) => [id, 0])); processed.clear(); hostBeginTurn(); }
  function hostBeginTurn() {
    const turn = current();
    if (!turn) return hostFinal();
    const selected = L.selectRoundTopic(Math.random, L.TOPIC_BANK, usedTopics);
    currentTopic = selected.topic; usedTopics = selected.usedTopics; segments = []; myTopic = null; phase = 'drawing';
    // ゲスト側が turnIndex/turnOrder を更新し終える前にお題が届くと、スコープ判定に弾かれて
    // 描き手の画面が「受信中…」のまま止まってしまうため、必ず turn-state を先に届ける。
    const state = { type: 'turn-state', gameId, turnOrder, turnIndex, rounds: L.ROUNDS, scores };
    net.broadcast(state);
    receive(state);
    notify(turn.playerId, { type: 'topic', gameId, turnIndex, topic: currentTopic });
  }
  function hostResult(winnerId, skipped) {
    if (phase !== 'drawing') return;
    phase = 'round-result';
    if (winnerId) scores = L.applyScoreDeltas(scores, { [winnerId]: 1 });
    const turn = current();
    const data = { type: 'round-result', gameId, turnIndex, drawerId: turn.playerId, drawerName: nameOf(turn.playerId), winnerId: winnerId || null, winnerName: winnerId ? nameOf(winnerId) : '', topic: currentTopic, correct: !!winnerId, skipped: !!skipped, scores, isLastTurn: turn.isLastTurn };
    lastRoundResult = data;
    net.broadcast(data); receive(data);
  }
  function hostAdvance() { if (!isHost || phase !== 'round-result') return; turnIndex++; if (turnIndex >= L.totalTurns(turnOrder, L.ROUNDS)) hostFinal(); else hostBeginTurn(); }
  function hostFinal() {
    phase = 'final-result';
    const scoreboard = L.buildScoreboard(scores, roster);
    const data = { type: 'final-result', gameId, scoreboard, winners: L.getWinners(scoreboard) };
    lastFinalResult = data;
    net.broadcast(data); receive(data);
  }
  function handleGameAction(sender, data) {
    const turn = current();
    if (phase !== 'drawing' || !scopeOK(data) || !turn || !roster.some((p) => p.id === sender)) return;
    // segments は直接更新済みなので、ここで receive() を呼ぶと同じ更新(push/undo)が
    // ホスト側だけ二重に適用されてしまう(例: 1手戻るが2手戻ってしまう)。
    // 描画の反映だけを行い、状態更新は receive() に任せない。
    if (data.type === 'stroke-segment') { if (sender !== turn.playerId || !validSegment(data) || segments.length >= MAX_SEGMENTS) return; const message = { type: 'stroke-segment', gameId, turnIndex, playerId: sender, strokeId: data.strokeId, x0: data.x0, y0: data.y0, x1: data.x1, y1: data.y1 }; segments.push(message); net.broadcast(message); draw(message); }
    else if (data.type === 'undo-stroke' && sender === turn.playerId) { segments = L.undoLastStroke(segments); const message = { type: 'undo-stroke', gameId, turnIndex, playerId: sender }; net.broadcast(message); redraw(); }
    else if (data.type === 'reset-turn' && sender === turn.playerId) { segments = []; const message = { type: 'reset-turn', gameId, turnIndex, playerId: sender }; net.broadcast(message); redraw(); }
    else if (data.type === 'skip-round' && sender === turn.playerId && typeof data.actionId === 'string' && data.scopeId === gameId + ':' + turnIndex) { const key = sender + ':skip-round:' + data.scopeId + ':' + data.actionId; if (!processed.has(key)) { processed.add(key); hostResult(null, true); } if (sender !== HOST_ID) net.sendTo(sender, { type: 'skip-round-ack', actionId: data.actionId, scopeId: data.scopeId }); }
    // 回答できるのは描き手以外。描き手自身の送信を誤って受理しないよう明示的に除外する。
    else if (data.type === 'guess' && sender !== turn.playerId && typeof data.actionId === 'string' && data.scopeId === gameId + ':' + turnIndex) {
      const key = sender + ':guess:' + data.scopeId + ':' + data.actionId;
      if (processed.has(key)) return; processed.add(key);
      const text = String(data.text || '').trim().slice(0, 30);
      if (!text) return;
      if (L.isCorrectGuess(text, currentTopic)) hostResult(sender, false);
      else { const message = { type: 'wrong-guess', gameId, turnIndex, playerId: sender, playerName: nameOf(sender), text }; net.broadcast(message); receive(message); }
    }
  }
  function sendAction(data) { if (isHost) handleGameAction(HOST_ID, data); else conn.send(data); }

  // --- 受信メッセージの反映(ホスト・ゲスト共通) ---
  function receiveRoundResult(data) { scores = data.scores || scores; setPhase('round-result'); $('result-title').textContent = data.correct ? (data.winnerName + 'さんが正解！') : 'このターンはスキップ'; $('result-topic').textContent = 'お題は「' + data.topic + '」でした。'; renderScores('result-scores'); hidden('next', !isHost); }
  function receiveFinalResult(data) { setPhase('final-result'); const winners = (data.winners || []).map((p) => p.name).join('、'); $('winner').textContent = '優勝：' + winners; $('final-scores').replaceChildren(...(data.scoreboard || []).map((row) => { const li = document.createElement('li'); li.textContent = row.rank + '位　' + row.name + '　' + row.score + '点' + (row.id === myId ? '（あなた）' : ''); return li; })); hidden('again', !isHost); }
  function receive(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'roster' && Array.isArray(data.players) && phase === 'lobby') { roster = data.players; renderRoster(); }
    else if (data.type === 'turn-state' && Number.isInteger(data.gameId) && Array.isArray(data.turnOrder) && Number.isInteger(data.turnIndex)) { gameId = data.gameId; turnOrder = data.turnOrder; turnIndex = data.turnIndex; scores = data.scores || {}; myTopic = null; segments = []; $('guess-log').replaceChildren(); setPhase('drawing'); renderGame(); }
    else if (data.type === 'topic' && scopeOK(data) && drawer()) { myTopic = String(data.topic || ''); renderGame(); }
    else if (data.type === 'stroke-segment' && scopeOK(data) && validSegment(data)) { segments.push(data); draw(data); }
    else if (data.type === 'undo-stroke' && scopeOK(data)) { segments = L.undoLastStroke(segments); redraw(); }
    else if (data.type === 'reset-turn' && scopeOK(data)) { segments = []; redraw(); }
    else if (data.type === 'wrong-guess' && scopeOK(data)) { pushGuessLog(data.playerName, data.text); }
    else if (data.type === 'skip-round-ack' && skipAttempt && data.actionId === skipAttempt.actionId && data.scopeId === skipAttempt.scopeId) { skipAttempt.attempt.confirm(); skipAttempt = null; }
    else if (data.type === 'round-result' && data.gameId === gameId && data.turnIndex === turnIndex) { receiveRoundResult(data); }
    else if (data.type === 'final-result' && data.gameId === gameId) { receiveFinalResult(data); }
    else if (data.type === 'game-in-progress') { error('ゲームが進行中のため参加できません。少し待ってから再度お試しください。'); showSetup(); }
    else if (data.type === 'join-ack' && data.joinRequestId && data.joinRequestId === joinRequestId) { RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName }); }
    else if (data.type === 'rejoin-ack' && data.rejoinRequestId && data.rejoinRequestId === rejoinRequestId) { RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName }); }
    else if (data.type === 'rejoin-rejected') { RejoinStorage.clear(GAME_KEY); if (net && net.destroy) net.destroy(); error('再参加できませんでした。もう一度ルームへ参加してください。'); showSetup(); }
    else if (data.type === 'state-snapshot') { applySnapshot(data); }
    else if (data.type === 'peer-id-changed' && typeof data.oldId === 'string' && typeof data.newId === 'string') { replaceId(data.oldId, data.newId); renderRoster(); if (phase === 'drawing') renderGame(); }
  }

  // --- 再接続(ゲストのみ) ---
  function replaceId(oldId, newId) {
    roster.forEach((p) => { if (p.id === oldId) p.id = newId; });
    turnOrder = turnOrder.map((id) => (id === oldId ? newId : id));
    if (Object.prototype.hasOwnProperty.call(scores, oldId)) { scores[newId] = scores[oldId]; delete scores[oldId]; }
    segments.forEach((s) => { if (s.playerId === oldId) s.playerId = newId; });
    Array.from(processed).forEach((key) => { if (key.indexOf(oldId + ':') === 0) { processed.delete(key); processed.add(newId + key.slice(oldId.length)); } });
  }
  function snapshotFor(id) {
    const turn = current();
    const iAmDrawer = !!(turn && turn.playerId === id);
    return { type: 'state-snapshot', snapshotVersion: 1, phase, gameId, roster: publicRoster(), turnOrder, turnIndex, rounds: L.ROUNDS, scores, segments, topic: iAmDrawer ? currentTopic : null, roundResult: lastRoundResult, finalResult: lastFinalResult };
  }
  function applySnapshot(data) {
    if (data.snapshotVersion !== 1 || !Array.isArray(data.roster) || !Array.isArray(data.segments)) return;
    roster = data.roster; gameId = data.gameId; turnOrder = data.turnOrder; turnIndex = data.turnIndex;
    scores = data.scores || {}; segments = data.segments.filter(validSegment);
    renderRoster();
    if (data.phase === 'drawing') { myTopic = data.topic || null; setPhase('drawing'); renderGame(); }
    else if (data.phase === 'round-result' && data.roundResult) receiveRoundResult(data.roundResult);
    else if (data.phase === 'final-result' && data.finalResult) receiveFinalResult(data.finalResult);
    else setPhase(data.phase);
    $('disconnect').textContent = ''; hidden('disconnect', true);
  }
  function handleRejoin(id, data) {
    const existing = roster.find((p) => p.token && p.token === data.token);
    const pending = existing && pendingRejoins.get(data.token);
    if (!pending || pending.oldPeerId !== existing.id || !data.rejoinRequestId || phase === 'final-result') { net.sendTo(id, { type: 'rejoin-rejected' }); return; }
    if (pending.timer) clearTimeout(pending.timer);
    pendingRejoins.delete(data.token);
    replaceId(pending.oldPeerId, id);
    net.broadcast({ type: 'peer-id-changed', oldId: pending.oldPeerId, newId: id });
    broadcastRoster();
    net.sendTo(id, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode });
    net.sendTo(id, snapshotFor(id));
    $('disconnect').textContent = ''; hidden('disconnect', true);
  }
  function deferDisconnect(id) {
    const player = roster.find((p) => p.id === id);
    if (!player || !player.token) return;
    const previous = pendingRejoins.get(player.token); if (previous) clearTimeout(previous.timer);
    $('disconnect').textContent = player.name + 'さんとの接続が不安定です。再接続を待っています。'; hidden('disconnect', false);
    const timer = setTimeout(() => { pendingRejoins.delete(player.token); $('disconnect').textContent = player.name + 'さんが切断しました。モード選択に戻ってください。'; }, REJOIN_GRACE_MS);
    pendingRejoins.set(player.token, { oldPeerId: id, timer });
  }
  function connectGuest(session) {
    const rejoining = !!session;
    myName = rejoining ? session.name : myName;
    roomCode = rejoining ? session.roomCode : roomCode;
    guestToken = rejoining ? session.token : RejoinStorage.newToken();
    joinRequestId = rejoining ? null : RejoinStorage.newToken();
    rejoinRequestId = rejoining ? RejoinStorage.newToken() : null;
    $('host').disabled = true; $('join').disabled = true;
    net = DrawingQuizNet.joinRoom(roomCode, {
      onOwnId(id) { myId = id; },
      onConnected(c) {
        conn = c;
        conn.send(rejoining ? { type: 'rejoin', token: guestToken, name: myName, rejoinRequestId } : { type: 'join', name: myName, token: guestToken, joinRequestId });
        if (!rejoining) { setPhase('lobby'); $('status').textContent = 'ホストの開始を待っています。'; }
      },
      onMessage: receive,
      onDisconnected() { $('disconnect').textContent = 'ホストとの接続が切れました。ページを再読み込みすると再接続を試みます。'; hidden('disconnect', false); },
      onError(err) { if (rejoining && err && err.type === 'peer-unavailable') { RejoinStorage.clear(GAME_KEY); showSetup(); } peerError(err); },
      onConnectionHealthChange: connectionHealthChanged,
    });
  }

  function hostMessage(id, data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join') {
      if (phase !== 'lobby') return net.sendTo(id, { type: 'game-in-progress' });
      const name = String(data.name || '').trim().slice(0, 10); if (!name) return;
      const token = typeof data.token === 'string' && data.token ? data.token : null;
      if (!roster.some((p) => p.id === id)) roster = L.addPlayer(roster, { id, name, token });
      renderRoster(); broadcastRoster();
      if (typeof data.joinRequestId === 'string') net.sendTo(id, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode });
    } else if (data.type === 'rejoin') { handleRejoin(id, data); }
    else { handleGameAction(id, data); }
  }
  function point(event) { const r = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(SIZE, (event.clientX - r.left) * SIZE / r.width)), y: Math.max(0, Math.min(SIZE, (event.clientY - r.top) * SIZE / r.height)) }; }
  function begin(event) { if (!drawer() || phase !== 'drawing') return; canvas.setPointerCapture(event.pointerId); const p = point(event); drawing = { id: event.pointerId, strokeId: Date.now(), point: p }; sendAction({ type: 'stroke-segment', gameId, turnIndex, strokeId: drawing.strokeId, x0: p.x, y0: p.y, x1: p.x + .01, y1: p.y + .01 }); }
  canvas.addEventListener('pointerdown', begin);
  canvas.addEventListener('pointermove', (event) => { if (!drawing || drawing.id !== event.pointerId) return; const p = point(event), q = drawing.point; drawing.point = p; sendAction({ type: 'stroke-segment', gameId, turnIndex, strokeId: drawing.strokeId, x0: q.x, y0: q.y, x1: p.x, y1: p.y }); });
  ['pointerup', 'pointercancel'].forEach((name) => canvas.addEventListener(name, (e) => { if (drawing && drawing.id === e.pointerId) drawing = null; }));

  $('host').addEventListener('click', () => {
    myName = $('name').value.trim().slice(0, 10); if (!myName) return error('ニックネームを入力してください。');
    isHost = true; myId = HOST_ID; phase = 'lobby'; roster = [{ id: HOST_ID, name: myName, token: null }];
    net = DrawingQuizNet.hostRoom({
      onCode(code) { roomCode = code; WakeLockHelper.enable(); $('room-code').textContent = code; hidden('host-code', false); setPhase('lobby'); renderRoster(); },
      onPeerMessage: hostMessage,
      onPeerDisconnected(id) { if (phase === 'lobby') { roster = L.removePlayer(roster, id); renderRoster(); broadcastRoster(); } else if (phase === 'drawing' || phase === 'round-result') { deferDisconnect(id); } },
      onError: peerError,
      onConnectionHealthChange: connectionHealthChanged,
    });
  });
  $('join').addEventListener('click', () => {
    myName = $('name').value.trim().slice(0, 10);
    const code = $('code').value.trim().toUpperCase();
    if (!myName || code.length !== 6) return error('名前と6桁のコードを入力してください。');
    roomCode = code; connectGuest(null);
  });
  $('start').addEventListener('click', hostStartGame);
  $('next').addEventListener('click', hostAdvance);
  $('again').addEventListener('click', hostStartGame);
  $('undo').addEventListener('click', () => sendAction({ type: 'undo-stroke', gameId, turnIndex }));
  $('reset').addEventListener('click', () => sendAction({ type: 'reset-turn', gameId, turnIndex }));
  $('skip').addEventListener('click', () => {
    if (!drawer() || phase !== 'drawing' || $('skip').disabled) return;
    const payload = { type: 'skip-round', gameId, turnIndex, scopeId: gameId + ':' + turnIndex, actionId: crypto.randomUUID() };
    if (isHost) { handleGameAction(HOST_ID, payload); return; }
    skipAttempt = { actionId: payload.actionId, scopeId: payload.scopeId, attempt: AckSend.attempt({
      send() { conn.send(payload); },
      onPending() { $('skip').disabled = true; },
      onConfirmed() { skipAttempt = null; },
      onFailed() { skipAttempt = null; $('skip').disabled = false; error('スキップを確認できませんでした。もう一度お試しください。'); },
    }) };
  });
  $('guess-button').addEventListener('click', () => { const text = $('guess').value; sendAction({ type: 'guess', gameId, turnIndex, text, scopeId: gameId + ':' + turnIndex, actionId: crypto.randomUUID() }); $('guess').value = ''; });
  $('copy').addEventListener('click', () => navigator.clipboard && navigator.clipboard.writeText(roomCode));
  $('quit').addEventListener('click', () => { RejoinStorage.clear(GAME_KEY); WakeLockHelper.disable(); window.location.reload(); });

  const savedSession = RejoinStorage.load(GAME_KEY);
  if (savedSession && savedSession.roomCode && savedSession.token && savedSession.name) connectGuest(savedSession);
})();
