(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const HOST_ID = 'host';
  const canvas = $('drawing-canvas');
  const ctx = canvas.getContext('2d');
  const SUBMIT_ACK_TIMEOUT_MS = 10000;
  const REJOIN_GRACE_MS = 30000;
  let isHost = false, myId = null, myName = '', net = null, conn = null;
  let roster = [], gameRoster = [], playerOrder = [], submissions = [];
  let currentRound = 0, totalRoundsCount = 0, assignments = new Map(), roundSubmittedIds = new Set();
  let phase = 'lobby', strokes = [], strokeBoundaries = [], drawing = null, revealChains = [], revealIndex = 0;
  let submitAckTimer = null, pendingSubmitRound = -1, pendingSubmitActionId = '';
  const processedSubmits = new Set();
  let roomCode = '', playerToken = '', joinRequestId = '', savedSession = RejoinStorage.load('picture-telephone');
  const rejoinTimers = new Map();

  function setHidden(id, hidden) { $(id).classList.toggle('hidden', hidden); }
  function normalizeName(value) { return typeof value === 'string' ? value.trim().slice(0, 10) : ''; }
  function showError(message) { $('online-error').textContent = message; setHidden('online-error', !message); }
function peerError(error) { console.error(error); showError(PeerErrors.describe(error)); $('host-btn').disabled = false; $('join-btn').disabled = false; }
  function nameFor(id) { const player = gameRoster.find((item) => item.id === id) || roster.find((item) => item.id === id); return player ? player.name : '不明な参加者'; }
  function renderRoster() {
    $('roster-list').innerHTML = '';
    roster.forEach((player) => { const li = document.createElement('li'); li.className = 'roster-item'; li.textContent = player.name + (player.id === myId ? '（あなた）' : ''); $('roster-list').appendChild(li); });
    setHidden('start-btn', !isHost); $('start-btn').disabled = !isHost || phase !== 'lobby' || !PictureTelephoneLogic.hasMinPlayers(roster);
  }
  function publicRoster() { return roster.map((p) => ({ id: p.id, name: p.name })); }
  function broadcastRoster() { if (net) net.broadcast({ type: 'roster', players: publicRoster() }); }
  function replacePlayerId(oldId, newId) {
    roster.forEach((p) => { if (p.id === oldId) p.id = newId; });
    gameRoster.forEach((p) => { if (p.id === oldId) p.id = newId; });
    playerOrder = playerOrder.map((id) => id === oldId ? newId : id);
    if (assignments.has(oldId)) { assignments.set(newId, assignments.get(oldId)); assignments.delete(oldId); }
    if (roundSubmittedIds.has(oldId)) { roundSubmittedIds.delete(oldId); roundSubmittedIds.add(newId); }
    submissions.forEach((chain) => chain.forEach((step) => { if (step.authorId === oldId) step.authorId = newId; }));
  }
  function snapshotFor(id) {
    const assignment = assignments.get(id);
    return { type: 'state-snapshot', snapshotVersion: 1, phase, roster: publicRoster(), gameRoster, playerOrder, currentRound, total: totalRoundsCount, assignment: assignment ? { type: 'assignment', round: currentRound, total: totalRoundsCount, contributionType: assignment.type, prevContent: currentRound === 0 ? null : submissions[assignment.chainIndex][currentRound - 1].content } : null, submitted: roundSubmittedIds.has(id), reveal: phase === 'reveal' ? { submissions, roster: gameRoster } : null };
  }
  function enterLobby() { setHidden('setup-screen', true); setHidden('lobby-panel', false); renderRoster(); }

  function drawSegment(targetCtx, segment) {
    targetCtx.save(); targetCtx.strokeStyle = '#222'; targetCtx.lineWidth = 5; targetCtx.lineCap = 'round'; targetCtx.lineJoin = 'round';
    targetCtx.beginPath(); targetCtx.moveTo(segment.x0, segment.y0); targetCtx.lineTo(segment.x1, segment.y1); targetCtx.stroke(); targetCtx.restore();
  }
  function renderStrokes(targetCtx, items) { targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height); items.forEach((item) => drawSegment(targetCtx, item)); }
  function updateUndoButtonState() { $('undo-stroke-btn').disabled = strokeBoundaries.length === 0; }
  function resetDrawing() { drawing = null; strokes = []; strokeBoundaries = []; renderStrokes(ctx, strokes); setHidden('draw-limit-notice', true); updateUndoButtonState(); }
  function undoLastStroke() {
    if (strokeBoundaries.length === 0) return;
    const result = PictureTelephoneLogic.undoLastStroke(strokes, strokeBoundaries);
    strokes = result.strokes; strokeBoundaries = result.strokeBoundaries;
    renderStrokes(ctx, strokes);
    setHidden('draw-limit-notice', strokes.length < PictureTelephoneLogic.MAX_SEGMENTS);
    updateUndoButtonState();
  }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    const clamp = (value) => Math.max(0, Math.min(PictureTelephoneLogic.CANVAS_SIZE, value));
    return { x: clamp((event.clientX - rect.left) * canvas.width / rect.width), y: clamp((event.clientY - rect.top) * canvas.height / rect.height) };
  }

  function enterGame() { setHidden('setup-screen', true); setHidden('lobby-panel', true); setHidden('game-area', false); setHidden('reveal-overlay', true); }
  function clearSubmitTimer() { if (submitAckTimer) { clearTimeout(submitAckTimer); submitAckTimer = null; } }
  function applyAssignment(data) {
    if (!data || typeof data !== 'object' || !Number.isInteger(data.round)) return;
    phase = 'playing'; currentRound = data.round; totalRoundsCount = data.total; enterGame();
    clearSubmitTimer(); pendingSubmitRound = -1;
    $('round-status').textContent = 'ラウンド ' + (data.round + 1) + ' / ' + data.total;
    setHidden('submitted-status', true); setHidden('submit-pending-status', true); setHidden('submit-retry-status', true);
    setHidden('write-box', data.contributionType !== 'write'); setHidden('draw-box', data.contributionType !== 'draw');
    $('phrase-input').value = ''; $('submit-phrase-btn').disabled = false; $('submit-drawing-btn').disabled = false;
    if (data.contributionType === 'write') {
      const hasPreview = data.round > 0 && PictureTelephoneLogic.validStrokes(data.prevContent);
      $('write-hint').textContent = data.round === 0 ? '自由にお題を考えて入力してください。' : 'この絵が何を表しているか当ててください。';
      setHidden('prev-drawing-preview', !hasPreview);
      if (hasPreview) renderStrokes($('prev-drawing-preview').getContext('2d'), data.prevContent);
    } else {
      $('draw-hint').textContent = 'このお題を絵で表現してください：「' + String(data.prevContent || '') + '」'; resetDrawing();
    }
    setHidden('host-progress-box', !isHost); if (isHost) updateProgress(0, playerOrder.length, missingPlayerNames());
  }
  function showSubmitPending() { setHidden('submit-retry-status', true); setHidden('submitted-status', true); setHidden('submit-pending-status', false); }
  function showSubmitFailure() {
    clearSubmitTimer();
    setHidden('submit-pending-status', true); setHidden('submit-retry-status', false);
    $('submit-phrase-btn').disabled = $('write-box').classList.contains('hidden');
    $('submit-drawing-btn').disabled = $('draw-box').classList.contains('hidden');
  }
  function handleSubmitAck(round, actionId) {
    if (round !== pendingSubmitRound || round !== currentRound || actionId !== pendingSubmitActionId) return;
    clearSubmitTimer(); markSubmitted();
  }
  function attemptSubmit(content) {
    if (phase !== 'playing') return;
    pendingSubmitRound = currentRound;
    if (isHost) { if (hostHandleSubmit(HOST_ID, currentRound, content)) markSubmitted(); else showSubmitFailure(); return; }
    if (!conn || !conn.open) { showSubmitFailure(); return; }
    pendingSubmitActionId = RejoinStorage.newToken();
    conn.send({ type: 'submit', round: currentRound, content, actionId: pendingSubmitActionId, scopeId: String(currentRound) });
    showSubmitPending();
    clearSubmitTimer();
    submitAckTimer = setTimeout(showSubmitFailure, SUBMIT_ACK_TIMEOUT_MS);
  }
  function markSubmitted() {
    clearSubmitTimer();
    setHidden('write-box', true); setHidden('draw-box', true);
    setHidden('submit-pending-status', true); setHidden('submit-retry-status', true);
    setHidden('submitted-status', false);
  }
  function missingPlayerNames() { return PictureTelephoneLogic.missingPlayers(playerOrder, roundSubmittedIds).map(nameFor); }
  function updateProgress(submitted, total, missing) {
    $('progress-text').textContent = submitted + '/' + total + '人 送信済み';
    const names = Array.isArray(missing) ? missing : [];
    setHidden('progress-missing', names.length === 0);
    if (names.length) $('progress-missing').textContent = '未提出: ' + names.join('、');
    setHidden('force-advance-btn', !isHost || submitted >= total);
  }

  function sendAssignments() {
    assignments = new Map();
    playerOrder.forEach((id, index) => {
      const chainIndex = PictureTelephoneLogic.chainIndexForPlayer(index, currentRound, playerOrder.length);
      const type = PictureTelephoneLogic.roundType(currentRound);
      const previous = currentRound === 0 ? null : submissions[chainIndex][currentRound - 1].content;
      assignments.set(id, { chainIndex, type });
      const payload = { type: 'assignment', round: currentRound, total: totalRoundsCount, contributionType: type, prevContent: previous };
      if (id === HOST_ID) applyAssignment(payload); else net.sendTo(id, payload);
    });
  }
  function hostStartRound() {
    if (!isHost || (phase !== 'lobby' && phase !== 'reveal') || !PictureTelephoneLogic.hasMinPlayers(roster)) return;
    gameRoster = roster.map((player) => ({ id: player.id, name: player.name })); playerOrder = gameRoster.map((player) => player.id);
    submissions = playerOrder.map(() => []); currentRound = 0; totalRoundsCount = PictureTelephoneLogic.totalRounds(playerOrder.length);
    roundSubmittedIds = new Set(); revealChains = []; revealIndex = 0; resetDrawing(); $('phrase-input').value = ''; phase = 'playing'; sendAssignments();
  }
  function hostHandleSubmit(senderId, round, content, actionId) {
    const actionKey = senderId + ':submit:' + round + ':' + actionId;
    if (actionId && processedSubmits.has(actionKey)) { if (senderId !== HOST_ID) net.sendTo(senderId, { type: 'submit-ack', round, actionId, scopeId: String(round) }); return true; }
    const assignment = assignments.get(senderId);
    if (!PictureTelephoneLogic.canAcceptSubmit({ phase, round, currentRound, senderId, playerOrder, submittedIds: roundSubmittedIds, assignment })) return false;
    let cleaned;
    if (assignment.type === 'write') { if (typeof content !== 'string') return false; cleaned = PictureTelephoneLogic.normalizePhrase(content); if (!cleaned) return false; }
    else { if (!PictureTelephoneLogic.validStrokes(content) || content.length === 0) return false; cleaned = content.map((item) => ({ x0: item.x0, y0: item.y0, x1: item.x1, y1: item.y1 })); }
    submissions[assignment.chainIndex].push({ round, authorId: senderId, type: assignment.type, content: cleaned }); roundSubmittedIds.add(senderId);
    if (actionId) processedSubmits.add(actionKey);
    const missing = missingPlayerNames();
    const progress = { type: 'progress', submitted: roundSubmittedIds.size, total: playerOrder.length, missing }; net.broadcast(progress); updateProgress(progress.submitted, progress.total, missing);
    if (senderId !== HOST_ID) net.sendTo(senderId, { type: 'submit-ack', round, actionId, scopeId: String(round) });
    if (roundSubmittedIds.size === playerOrder.length) hostAdvanceRound();
    return true;
  }
  function hostAdvanceRound() { currentRound += 1; if (currentRound >= totalRoundsCount) { hostEnterReveal(); return; } roundSubmittedIds = new Set(); sendAssignments(); }
  function hostForceAdvance() {
    if (!isHost || phase !== 'playing') return;
    playerOrder.forEach((id) => {
      if (roundSubmittedIds.has(id)) return;
      const assignment = assignments.get(id); if (!assignment) return;
      const cleaned = assignment.type === 'write' ? '(未提出)' : [];
      submissions[assignment.chainIndex].push({ round: currentRound, authorId: id, type: assignment.type, content: cleaned, skipped: true });
      roundSubmittedIds.add(id);
    });
    const progress = { type: 'progress', submitted: roundSubmittedIds.size, total: playerOrder.length, missing: [] };
    net.broadcast(progress); updateProgress(progress.submitted, progress.total, []);
    hostAdvanceRound();
  }
  function hostEnterReveal() { phase = 'reveal'; const payload = { type: 'reveal', submissions, roster: gameRoster }; net.broadcast(payload); showReveal(payload); }

  function showReveal(data) {
    if (!data || !Array.isArray(data.submissions)) return; phase = 'reveal'; revealChains = data.submissions; gameRoster = Array.isArray(data.roster) ? data.roster : gameRoster; revealIndex = 0;
    setHidden('game-area', true); setHidden('reveal-overlay', false); setHidden('play-again-btn', !isHost); renderRevealChain();
  }
  function renderRevealChainDots() {
    const container = $('reveal-chain-dots'); container.innerHTML = '';
    revealChains.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button'; dot.className = 'chain-dot' + (index === revealIndex ? ' active' : ''); dot.textContent = String(index + 1);
      dot.setAttribute('aria-label', 'チェーン ' + (index + 1) + ' を表示');
      if (index === revealIndex) dot.setAttribute('aria-current', 'true');
      dot.addEventListener('click', () => { if (revealIndex === index) return; revealIndex = index; renderRevealChain(); });
      container.appendChild(dot);
    });
  }
  function renderRevealChain() {
    const chain = revealChains[revealIndex] || []; $('reveal-chain-label').textContent = 'チェーン ' + (revealIndex + 1) + ' / ' + revealChains.length + ' を表示中'; renderRevealChainDots(); $('reveal-steps-list').innerHTML = '';
    chain.forEach((step, index) => {
      const card = document.createElement('article'); card.className = 'reveal-step'; const author = document.createElement('p'); author.className = 'reveal-author';
      author.textContent = nameFor(step.authorId) + 'さんの' + (step.type === 'draw' ? '絵' : (index === 0 ? 'お題' : '回答')); card.appendChild(author);
      if (step.type === 'draw' && PictureTelephoneLogic.validStrokes(step.content)) { const resultCanvas = document.createElement('canvas'); resultCanvas.width = 320; resultCanvas.height = 320; resultCanvas.className = 'result-canvas'; resultCanvas.setAttribute('aria-label', author.textContent); card.appendChild(resultCanvas); renderStrokes(resultCanvas.getContext('2d'), step.content); }
      else { const text = document.createElement('p'); text.textContent = '「' + String(step.content || '') + '」'; card.appendChild(text); }
      $('reveal-steps-list').appendChild(card);
    });
    $('reveal-prev-btn').disabled = revealIndex === 0; $('reveal-next-btn').disabled = revealIndex >= revealChains.length - 1;
  }
  function abortGame(message) {
    if (phase !== 'playing') return; phase = 'disconnected'; clearSubmitTimer();
    $('game-connection-status').textContent = message; setHidden('game-connection-status', false);
    setHidden('submit-pending-status', true); setHidden('submit-retry-status', true);
    $('submit-phrase-btn').disabled = true; $('submit-drawing-btn').disabled = true;
  }

  function receive(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'roster' && Array.isArray(data.players) && phase === 'lobby') { roster = data.players; renderRoster(); }
    else if (data.type === 'assignment') applyAssignment(data);
    else if (data.type === 'progress' && Number.isInteger(data.submitted)) { if (isHost) updateProgress(data.submitted, data.total, data.missing); }
    else if (data.type === 'submit-ack' && Number.isInteger(data.round)) handleSubmitAck(data.round, data.actionId);
    else if (data.type === 'reveal') showReveal(data);
    else if (data.type === 'game-in-progress') { showError('この部屋はゲーム中です。終了後にもう一度参加してください。'); }
    else if (data.type === 'game-aborted') abortGame('参加者との接続が切れました。ページを再読み込みして最初からやり直してください。');
    else if (data.type === 'join-ack' && data.joinRequestId === joinRequestId) { RejoinStorage.save('picture-telephone', { roomCode: data.roomCode, token: playerToken, name: myName }); }
    else if (data.type === 'rejoin-ack' && data.rejoinRequestId === joinRequestId) { RejoinStorage.save('picture-telephone', { roomCode: data.roomCode, token: playerToken, name: myName }); }
    else if (data.type === 'rejoin-rejected') { RejoinStorage.clear('picture-telephone'); showError('再参加の有効期限が切れました。通常参加してください。'); }
    else if (data.type === 'state-snapshot' && data.snapshotVersion === 1) { roster = data.roster || []; gameRoster = data.gameRoster || []; playerOrder = data.playerOrder || []; currentRound = data.currentRound || 0; totalRoundsCount = data.total || 0; renderRoster(); if (data.phase === 'playing' && data.assignment) { applyAssignment(data.assignment); if (data.submitted) markSubmitted(); } else if (data.phase === 'reveal' && data.reveal) showReveal(data.reveal); else enterLobby(); }
  }
  function handleHostMessage(id, data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join') {
      if (phase !== 'lobby') { net.sendTo(id, { type: 'game-in-progress' }); return; }
      const name = normalizeName(data.name); if (!name || !data.token) return; if (!roster.some((p) => p.token === data.token)) roster.push({ id, name, token: data.token }); renderRoster(); broadcastRoster(); net.sendTo(id, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode });
    } else if (data.type === 'rejoin') {
      const player = roster.find((p) => p.token === data.token); const pending = player && rejoinTimers.get(data.token);
      if (!player || !pending) { net.sendTo(id, { type: 'rejoin-rejected', rejoinRequestId: data.rejoinRequestId }); return; }
      clearTimeout(pending.timer); rejoinTimers.delete(data.token); replacePlayerId(player.id, id); renderRoster(); broadcastRoster(); net.sendTo(id, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode }); net.sendTo(id, snapshotFor(id));
    } else if (data.type === 'submit' && data.scopeId === String(currentRound) && data.actionId) hostHandleSubmit(id, data.round, data.content, data.actionId);
  }

  $('host-btn').addEventListener('click', () => {
    myName = normalizeName($('name-input').value); if (!myName) return showError('ニックネームを入力してください。'); showError(''); isHost = true; myId = HOST_ID; phase = 'lobby'; roster = [{ id: HOST_ID, name: myName, token: 'host' }]; $('host-btn').disabled = true; $('join-btn').disabled = true;
    net = PictureTelephoneNet.hostRoom({ onCode(code) { roomCode = code; $('room-code-text').textContent = code; setHidden('host-wait', false); $('online-status').textContent = '参加者を待っています。'; enterLobby(); }, onPeerConnected() {}, onPeerMessage: handleHostMessage,
      onConnectionHealthChange(id, healthy) { $('game-connection-status').textContent = healthy ? '' : '参加者との通信が不安定です。再接続を待っています…'; setHidden('game-connection-status', healthy); },
      onPeerDisconnected(id) { if (phase === 'lobby') { roster = PictureTelephoneLogic.removePlayer(roster, id); renderRoster(); broadcastRoster(); } else if (phase !== 'lobby') { const player = roster.find((p) => p.id === id); if (!player) return; const timer = setTimeout(() => { rejoinTimers.delete(player.token); const message = player.name + 'さんが30秒以内に戻らなかったため、ゲームを中断しました。'; net.broadcast({ type: 'game-aborted' }); abortGame(message); }, REJOIN_GRACE_MS); rejoinTimers.set(player.token, { oldPeerId: id, timer, disconnectedAt: Date.now() }); $('game-connection-status').textContent = player.name + 'さんの再接続を30秒待っています…'; setHidden('game-connection-status', false); } }, onError: peerError });
  });
  function connectGuest(session) {
    const rejoining = !!session;
    myName = rejoining ? session.name : normalizeName($('name-input').value);
    roomCode = rejoining ? session.roomCode : $('join-code-input').value.trim().toUpperCase();
    if (!rejoining) {
      if (!myName) return showError('ニックネームを入力してください。');
      if (roomCode.length !== 6) return showError('6桁のルームコードを入力してください。');
    }
    showError(''); phase = 'lobby'; $('host-btn').disabled = true; $('join-btn').disabled = true;
    playerToken = rejoining ? session.token : RejoinStorage.newToken(); joinRequestId = RejoinStorage.newToken();
    net = PictureTelephoneNet.joinRoom(roomCode, { onOwnId(id) { myId = id; }, onConnected(connection) { conn = connection; conn.send(rejoining ? { type: 'rejoin', token: playerToken, name: myName, rejoinRequestId: joinRequestId } : { type: 'join', name: myName, token: playerToken, joinRequestId }); $('online-status').textContent = 'ホストからの開始を待っています。'; enterLobby(); }, onMessage: receive, onDisconnected() { abortGame('ホストとの接続が切れました。ページを再読み込みして最初からやり直してください。'); if (phase === 'lobby') showError('ホストとの接続が切れました。ページを再読み込みしてください。'); }, onConnectionHealthChange(healthy) { $('game-connection-status').textContent = healthy ? '' : '通信が不安定です。再接続を試みています…'; setHidden('game-connection-status', healthy); }, onError(error) { if (rejoining && error && error.type === 'peer-unavailable') { RejoinStorage.clear('picture-telephone'); savedSession = null; } peerError(error); } });
  }
  $('join-btn').addEventListener('click', () => connectGuest(null));
  $('copy-code-btn').addEventListener('click', () => { const code = $('room-code-text').textContent; if (!navigator.clipboard) { $('online-status').textContent = 'コードを選択してコピーしてください。'; return; } navigator.clipboard.writeText(code).then(() => { $('online-status').textContent = 'コードをコピーしました。'; }, () => { $('online-status').textContent = 'コピーできませんでした。コードを手動で共有してください。'; }); });
  $('start-btn').addEventListener('click', () => { WakeLockHelper.enable(); hostStartRound(); }); $('quit-btn').addEventListener('click', () => { WakeLockHelper.disable(); RejoinStorage.clear('picture-telephone'); window.location.reload(); }); $('play-again-btn').addEventListener('click', hostStartRound);
  $('force-advance-btn').addEventListener('click', hostForceAdvance);
  $('submit-phrase-btn').addEventListener('click', () => { const phrase = PictureTelephoneLogic.normalizePhrase($('phrase-input').value); if (!phrase) { $('write-hint').textContent = '文章を入力してください。'; return; } $('submit-phrase-btn').disabled = true; attemptSubmit(phrase); });
  $('submit-drawing-btn').addEventListener('click', () => { if (strokes.length === 0) { $('draw-hint').textContent = '絵を描いてから送信してください。'; return; } $('submit-drawing-btn').disabled = true; attemptSubmit(strokes.slice()); });
  $('clear-canvas-btn').addEventListener('click', resetDrawing); $('undo-stroke-btn').addEventListener('click', undoLastStroke); $('reveal-prev-btn').addEventListener('click', () => { if (revealIndex > 0) { revealIndex--; renderRevealChain(); } }); $('reveal-next-btn').addEventListener('click', () => { if (revealIndex < revealChains.length - 1) { revealIndex++; renderRevealChain(); } });
  canvas.addEventListener('pointerdown', (event) => { if (phase !== 'playing' || $('draw-box').classList.contains('hidden')) return; canvas.setPointerCapture(event.pointerId); drawing = { pointerId: event.pointerId, point: point(event), started: false }; });
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    if (strokes.length >= PictureTelephoneLogic.MAX_SEGMENTS) { setHidden('draw-limit-notice', false); return; }
    const next = point(event); const segment = { x0: drawing.point.x, y0: drawing.point.y, x1: next.x, y1: next.y };
    if (!drawing.started) { strokeBoundaries.push(strokes.length); drawing.started = true; updateUndoButtonState(); }
    strokes.push(segment); drawSegment(ctx, segment); drawing.point = next;
    if (strokes.length >= PictureTelephoneLogic.MAX_SEGMENTS) setHidden('draw-limit-notice', false);
  });
  function stopDrawing(event) { if (drawing && drawing.pointerId === event.pointerId) drawing = null; }
  canvas.addEventListener('pointerup', stopDrawing); canvas.addEventListener('pointercancel', stopDrawing);
  if (savedSession && savedSession.roomCode && savedSession.token && savedSession.name) connectGuest(savedSession);
})();
