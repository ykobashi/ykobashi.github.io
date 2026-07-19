(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const HOST_ID = 'host';
  const canvas = $('drawing-canvas');
  const ctx = canvas.getContext('2d');
  let isHost = false, myId = null, myName = '', net = null, conn = null;
  let roster = [], gameRoster = [], playerOrder = [], submissions = [];
  let currentRound = 0, totalRoundsCount = 0, assignments = new Map(), roundSubmittedIds = new Set();
  let phase = 'lobby', strokes = [], drawing = null, revealChains = [], revealIndex = 0;

  function setHidden(id, hidden) { $(id).classList.toggle('hidden', hidden); }
  function normalizeName(value) { return typeof value === 'string' ? value.trim().slice(0, 10) : ''; }
  function showError(message) { $('online-error').textContent = message; setHidden('online-error', !message); }
  function describePeerError(error) {
    if (error && error.type === 'peer-unavailable') return '部屋が見つかりません。コードを確認してください。';
    if (error && (error.type === 'network' || error.type === 'socket-error')) return '通信エラーです。ネットワークを確認してください。';
    if (error && error.type === 'unavailable-id') return '部屋を作れませんでした。もう一度お試しください。';
    return '接続できませんでした。ルームコードや通信状態を確認してください。';
  }
  function peerError(error) { console.error(error); showError(describePeerError(error)); $('host-btn').disabled = false; $('join-btn').disabled = false; }
  function nameFor(id) { const player = gameRoster.find((item) => item.id === id) || roster.find((item) => item.id === id); return player ? player.name : '不明な参加者'; }
  function renderRoster() {
    $('roster-list').innerHTML = '';
    roster.forEach((player) => { const li = document.createElement('li'); li.className = 'roster-item'; li.textContent = player.name + (player.id === myId ? '（あなた）' : ''); $('roster-list').appendChild(li); });
    setHidden('start-btn', !isHost); $('start-btn').disabled = !isHost || phase !== 'lobby' || !PictureTelephoneLogic.hasMinPlayers(roster);
  }
  function broadcastRoster() { if (net) net.broadcast({ type: 'roster', players: roster }); }
  function enterLobby() { setHidden('setup-screen', true); setHidden('lobby-panel', false); renderRoster(); }

  function drawSegment(targetCtx, segment) {
    targetCtx.save(); targetCtx.strokeStyle = '#222'; targetCtx.lineWidth = 5; targetCtx.lineCap = 'round'; targetCtx.lineJoin = 'round';
    targetCtx.beginPath(); targetCtx.moveTo(segment.x0, segment.y0); targetCtx.lineTo(segment.x1, segment.y1); targetCtx.stroke(); targetCtx.restore();
  }
  function renderStrokes(targetCtx, items) { targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height); items.forEach((item) => drawSegment(targetCtx, item)); }
  function resetDrawing() { drawing = null; strokes = []; renderStrokes(ctx, strokes); }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    const clamp = (value) => Math.max(0, Math.min(PictureTelephoneLogic.CANVAS_SIZE, value));
    return { x: clamp((event.clientX - rect.left) * canvas.width / rect.width), y: clamp((event.clientY - rect.top) * canvas.height / rect.height) };
  }

  function enterGame() { setHidden('setup-screen', true); setHidden('lobby-panel', true); setHidden('game-area', false); setHidden('reveal-overlay', true); }
  function applyAssignment(data) {
    if (!data || typeof data !== 'object' || !Number.isInteger(data.round)) return;
    phase = 'playing'; currentRound = data.round; totalRoundsCount = data.total; enterGame();
    $('round-status').textContent = 'ラウンド ' + (data.round + 1) + ' / ' + data.total;
    setHidden('submitted-status', true); setHidden('write-box', data.contributionType !== 'write'); setHidden('draw-box', data.contributionType !== 'draw');
    $('phrase-input').value = ''; $('submit-phrase-btn').disabled = false; $('submit-drawing-btn').disabled = false;
    if (data.contributionType === 'write') {
      const hasPreview = data.round > 0 && PictureTelephoneLogic.validStrokes(data.prevContent);
      $('write-hint').textContent = data.round === 0 ? '自由にお題を考えて入力してください。' : 'この絵が何を表しているか当ててください。';
      setHidden('prev-drawing-preview', !hasPreview);
      if (hasPreview) renderStrokes($('prev-drawing-preview').getContext('2d'), data.prevContent);
    } else {
      $('draw-hint').textContent = 'このお題を絵で表現してください：「' + String(data.prevContent || '') + '」'; resetDrawing();
    }
    setHidden('host-progress-box', !isHost); if (isHost) updateProgress(0, playerOrder.length);
  }
  function submitContent(content) {
    if (phase !== 'playing') return;
    if (isHost) hostHandleSubmit(HOST_ID, currentRound, content); else if (conn && conn.open) conn.send({ type: 'submit', round: currentRound, content });
  }
  function markSubmitted() { setHidden('write-box', true); setHidden('draw-box', true); setHidden('submitted-status', false); }
  function updateProgress(submitted, total) { $('progress-text').textContent = submitted + '/' + total + '人 送信済み'; }

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
  function hostHandleSubmit(senderId, round, content) {
    if (phase !== 'playing' || round !== currentRound || !playerOrder.includes(senderId) || roundSubmittedIds.has(senderId)) return;
    const assignment = assignments.get(senderId); if (!assignment) return;
    let cleaned;
    if (assignment.type === 'write') { if (typeof content !== 'string') return; cleaned = PictureTelephoneLogic.normalizePhrase(content); if (!cleaned) return; }
    else { if (!PictureTelephoneLogic.validStrokes(content) || content.length === 0) return; cleaned = content.map((item) => ({ x0: item.x0, y0: item.y0, x1: item.x1, y1: item.y1 })); }
    submissions[assignment.chainIndex].push({ round, authorId: senderId, type: assignment.type, content: cleaned }); roundSubmittedIds.add(senderId);
    const progress = { type: 'progress', submitted: roundSubmittedIds.size, total: playerOrder.length }; net.broadcast(progress); updateProgress(progress.submitted, progress.total);
    if (senderId === HOST_ID) markSubmitted();
    if (roundSubmittedIds.size === playerOrder.length) hostAdvanceRound();
  }
  function hostAdvanceRound() { currentRound += 1; if (currentRound >= totalRoundsCount) { hostEnterReveal(); return; } roundSubmittedIds = new Set(); sendAssignments(); }
  function hostEnterReveal() { phase = 'reveal'; const payload = { type: 'reveal', submissions, roster: gameRoster }; net.broadcast(payload); showReveal(payload); }

  function showReveal(data) {
    if (!data || !Array.isArray(data.submissions)) return; phase = 'reveal'; revealChains = data.submissions; gameRoster = Array.isArray(data.roster) ? data.roster : gameRoster; revealIndex = 0;
    setHidden('game-area', true); setHidden('reveal-overlay', false); setHidden('play-again-btn', !isHost); renderRevealChain();
  }
  function renderRevealChain() {
    const chain = revealChains[revealIndex] || []; $('reveal-chain-label').textContent = 'チェーン ' + (revealIndex + 1) + ' / ' + revealChains.length; $('reveal-steps-list').innerHTML = '';
    chain.forEach((step, index) => {
      const card = document.createElement('article'); card.className = 'reveal-step'; const author = document.createElement('p'); author.className = 'reveal-author';
      author.textContent = nameFor(step.authorId) + 'さんの' + (step.type === 'draw' ? '絵' : (index === 0 ? 'お題' : '回答')); card.appendChild(author);
      if (step.type === 'draw' && PictureTelephoneLogic.validStrokes(step.content)) { const resultCanvas = document.createElement('canvas'); resultCanvas.width = 320; resultCanvas.height = 320; resultCanvas.className = 'result-canvas'; resultCanvas.setAttribute('aria-label', author.textContent); card.appendChild(resultCanvas); renderStrokes(resultCanvas.getContext('2d'), step.content); }
      else { const text = document.createElement('p'); text.textContent = '「' + String(step.content || '') + '」'; card.appendChild(text); }
      $('reveal-steps-list').appendChild(card);
    });
    $('reveal-prev-btn').disabled = revealIndex === 0; $('reveal-next-btn').disabled = revealIndex >= revealChains.length - 1;
  }
  function abortGame(message) { if (phase !== 'playing') return; phase = 'disconnected'; $('game-connection-status').textContent = message; setHidden('game-connection-status', false); $('submit-phrase-btn').disabled = true; $('submit-drawing-btn').disabled = true; }

  function receive(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'roster' && Array.isArray(data.players) && phase === 'lobby') { roster = data.players; renderRoster(); }
    else if (data.type === 'assignment') applyAssignment(data);
    else if (data.type === 'progress' && Number.isInteger(data.submitted)) { if (isHost) updateProgress(data.submitted, data.total); }
    else if (data.type === 'reveal') showReveal(data);
    else if (data.type === 'game-in-progress') { showError('この部屋はゲーム中です。終了後にもう一度参加してください。'); }
    else if (data.type === 'game-aborted') abortGame('参加者との接続が切れました。ページを再読み込みして最初からやり直してください。');
  }
  function handleHostMessage(id, data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join') {
      if (phase !== 'lobby') { net.sendTo(id, { type: 'game-in-progress' }); return; }
      const name = normalizeName(data.name); if (!name) return; roster = PictureTelephoneLogic.addPlayer(roster, { id, name }); renderRoster(); broadcastRoster();
    } else if (data.type === 'submit') hostHandleSubmit(id, data.round, data.content);
  }

  $('host-btn').addEventListener('click', () => {
    myName = normalizeName($('name-input').value); if (!myName) return showError('ニックネームを入力してください。'); showError(''); isHost = true; myId = HOST_ID; phase = 'lobby'; roster = [{ id: HOST_ID, name: myName }]; $('host-btn').disabled = true; $('join-btn').disabled = true;
    net = PictureTelephoneNet.hostRoom({ onCode(code) { $('room-code-text').textContent = code; setHidden('host-wait', false); $('online-status').textContent = '参加者を待っています。'; enterLobby(); }, onPeerConnected() {}, onPeerMessage: handleHostMessage,
      onPeerDisconnected(id) { if (phase === 'lobby') { roster = PictureTelephoneLogic.removePlayer(roster, id); renderRoster(); broadcastRoster(); } else if (phase === 'playing') { const message = '参加者との接続が切れました。ページを再読み込みして最初からやり直してください。'; net.broadcast({ type: 'game-aborted' }); abortGame(message); } }, onError: peerError });
  });
  $('join-btn').addEventListener('click', () => {
    myName = normalizeName($('name-input').value); const code = $('join-code-input').value.trim().toUpperCase(); if (!myName) return showError('ニックネームを入力してください。'); if (code.length !== 6) return showError('6桁のルームコードを入力してください。'); showError(''); phase = 'lobby'; $('host-btn').disabled = true; $('join-btn').disabled = true;
    net = PictureTelephoneNet.joinRoom(code, { onOwnId(id) { myId = id; }, onConnected(connection) { conn = connection; conn.send({ type: 'join', name: myName }); $('online-status').textContent = 'ホストからの開始を待っています。'; enterLobby(); }, onMessage: receive, onDisconnected() { abortGame('ホストとの接続が切れました。ページを再読み込みして最初からやり直してください。'); if (phase === 'lobby') showError('ホストとの接続が切れました。ページを再読み込みしてください。'); }, onError: peerError });
  });
  $('copy-code-btn').addEventListener('click', () => { const code = $('room-code-text').textContent; if (!navigator.clipboard) { $('online-status').textContent = 'コードを選択してコピーしてください。'; return; } navigator.clipboard.writeText(code).then(() => { $('online-status').textContent = 'コードをコピーしました。'; }, () => { $('online-status').textContent = 'コピーできませんでした。コードを手動で共有してください。'; }); });
  $('start-btn').addEventListener('click', hostStartRound); $('quit-btn').addEventListener('click', () => window.location.reload()); $('play-again-btn').addEventListener('click', hostStartRound);
  $('submit-phrase-btn').addEventListener('click', () => { const phrase = PictureTelephoneLogic.normalizePhrase($('phrase-input').value); if (!phrase) { $('write-hint').textContent = '文章を入力してください。'; return; } $('submit-phrase-btn').disabled = true; submitContent(phrase); if (!isHost) markSubmitted(); });
  $('submit-drawing-btn').addEventListener('click', () => { if (strokes.length === 0) { $('draw-hint').textContent = '絵を描いてから送信してください。'; return; } $('submit-drawing-btn').disabled = true; submitContent(strokes.slice()); if (!isHost) markSubmitted(); });
  $('clear-canvas-btn').addEventListener('click', resetDrawing); $('reveal-prev-btn').addEventListener('click', () => { if (revealIndex > 0) { revealIndex--; renderRevealChain(); } }); $('reveal-next-btn').addEventListener('click', () => { if (revealIndex < revealChains.length - 1) { revealIndex++; renderRevealChain(); } });
  canvas.addEventListener('pointerdown', (event) => { if (phase !== 'playing' || $('draw-box').classList.contains('hidden')) return; canvas.setPointerCapture(event.pointerId); drawing = { pointerId: event.pointerId, point: point(event) }; });
  canvas.addEventListener('pointermove', (event) => { if (!drawing || drawing.pointerId !== event.pointerId || strokes.length >= PictureTelephoneLogic.MAX_SEGMENTS) return; const next = point(event); const segment = { x0: drawing.point.x, y0: drawing.point.y, x1: next.x, y1: next.y }; strokes.push(segment); drawSegment(ctx, segment); drawing.point = next; });
  function stopDrawing(event) { if (drawing && drawing.pointerId === event.pointerId) drawing = null; }
  canvas.addEventListener('pointerup', stopDrawing); canvas.addEventListener('pointercancel', stopDrawing);
})();
