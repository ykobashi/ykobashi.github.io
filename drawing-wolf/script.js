(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const HOST_ID = 'host';
  const canvas = $('drawing-canvas');
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#222'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  let isHost = false, myId = null, myName = '', net = null, conn = null;
  let roster = [], myRole = null, myTopic = null, wolfId = null, topic = null;
  let turnOrder = [], turnIndex = 0, votes = {}, voted = false, drawing = null, phase = 'lobby', segments = [], strokeSeq = 0, gameId = 0;
  let turnAttempt = null, voteAttempt = null;
  const processedActions = new Set();
  const REJOIN_GRACE_MS = 30000, GAME_KEY = 'drawing-wolf';
  const pendingRejoins = new Map();
  let guestToken = null, roomCode = '', lastResult = null, lastWolfGuess = null;

  function showError(message) { $('error').textContent = message || ''; }
  function playerName(id) { const p = roster.find((player) => player.id === id); return p ? p.name : '不明な参加者'; }
  function renderRoster() {
    $('roster').innerHTML = '';
    roster.forEach((player) => { const li = document.createElement('li'); li.textContent = player.name + (player.id === myId ? '（あなた）' : ''); $('roster').appendChild(li); });
    $('start').disabled = !isHost || !DrawingWolfLogic.hasMinPlayers(roster);
  }
  function publicRoster() { return roster.map((p) => ({ id: p.id, name: p.name })); }
  function broadcastRoster() { if (net) net.broadcast({ type: 'roster', players: publicRoster() }); }
  function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
  function drawSegment(data) { ctx.beginPath(); ctx.moveTo(data.x0, data.y0); ctx.lineTo(data.x1, data.y1); ctx.stroke(); }
  function redrawCanvas() { clearCanvas(); segments.forEach(drawSegment); }
  function rememberSegment(data) { segments.push(data); drawSegment(data); refreshDrawingButtons(); }
  function resetCurrentTurn(index) { segments = segments.filter((segment) => segment.turnIndex !== index); redrawCanvas(); refreshDrawingButtons(); }
  function undoCurrentTurnStroke(index) {
    const scoped = segments.filter((segment) => segment.turnIndex === index);
    const updatedScoped = DrawingWolfLogic.undoLastStroke(scoped);
    if (updatedScoped.length === scoped.length) return;
    const removedStrokeId = scoped[scoped.length - 1].strokeId;
    segments = segments.filter((segment) => !(segment.turnIndex === index && segment.strokeId === removedStrokeId));
    redrawCanvas();
    refreshDrawingButtons();
  }
  function refreshDrawingButtons() { $('undo-stroke').disabled = !segments.some((segment) => segment.turnIndex === turnIndex); }
  function validSegment(data) { return Number.isFinite(data.strokeId) && ['x0', 'y0', 'x1', 'y1'].every((key) => Number.isFinite(data[key]) && data[key] >= 0 && data[key] <= 320); }
  function peerError(err) { console.error(err); showError(PeerErrors.describe(err)); }
  function connectionHealthChanged(a, b) { const healthy = typeof b === 'boolean' ? b : a; $('connection-health').classList.toggle('hidden', healthy); }
  function isCurrentDrawer(id) { const info = DrawingWolfLogic.currentTurnInfo(turnOrder, turnIndex, DrawingWolfLogic.ROUNDS); return phase === 'drawing' && info && info.playerId === id; }

  function setMyRole(data) {
    myRole = data.role; myTopic = data.topic || null;
    $('role-title').textContent = myRole === 'wolf' ? '🐺 あなたは人狼です' : '🖌️ あなたは人間です';
    $('topic').textContent = myRole === 'wolf' ? 'お題は知らされません' : myTopic;
    $('role-hint').textContent = myRole === 'wolf' ? 'みんなの絵からお題を推理しながら、ばれないように描きましょう。' : 'お題が人狼に伝わらないよう、少しずつ絵を描き足しましょう。';
  }
  function applyTurnState(data) {
    if (Number.isInteger(data.gameId)) gameId = data.gameId;
    phase = 'drawing'; turnOrder = data.turnOrder; turnIndex = data.turnIndex;
    $('topic-reveal-controls').classList.add('hidden');
    const info = DrawingWolfLogic.currentTurnInfo(turnOrder, turnIndex, data.rounds);
    if (!info) return;
    const mine = info.playerId === myId;
    $('turn-label').textContent = '第' + info.round + 'ラウンド：' + playerName(info.playerId) + 'さんの番';
    $('turn-hint').textContent = mine ? 'あなたの番です。絵を描き、終わったら次へ進んでください。' : '描き手が絵を描いています。少し待ちましょう。';
    $('drawing-controls').classList.toggle('hidden', !mine);
    refreshDrawingButtons();
  }
  function enterGame() {
    $('setup').classList.add('hidden'); $('lobby').classList.add('hidden'); $('result').classList.add('hidden'); $('wolf-guess').classList.add('hidden'); $('vote').classList.add('hidden'); $('game').classList.remove('hidden');
  }
  function enterTopicReveal() {
    phase = 'topic-reveal'; enterGame();
    $('turn-label').textContent = 'まもなく開始します';
    $('turn-hint').textContent = isHost ? 'お題を確認したら「描き始める」を押してください。' : 'ホストが開始するのを待っています。';
    $('drawing-controls').classList.add('hidden');
    $('topic-reveal-controls').classList.toggle('hidden', !isHost);
  }
  function hostRerollTopic() {
    topic = DrawingWolfLogic.pickTopic();
    roster.forEach((p) => {
      const role = p.id === wolfId ? { type: 'role', role: 'wolf' } : { type: 'role', role: 'human', topic };
      if (p.id === HOST_ID) setMyRole(role); else net.sendTo(p.id, role);
    });
    enterTopicReveal();
    net.broadcast({ type: 'phase', phase: 'topic-reveal' });
  }
  function hostBeginDrawing() {
    if (!isHost || phase !== 'topic-reveal') return;
    const state = { type: 'turn-state', gameId, turnOrder, turnIndex, rounds: DrawingWolfLogic.ROUNDS };
    net.broadcast(state); applyTurnState(state);
  }
  function hostStartRound() {
    if (!DrawingWolfLogic.hasMinPlayers(roster)) return;
    gameId += 1; processedActions.clear();
    const ids = roster.map((p) => p.id);
    wolfId = DrawingWolfLogic.assignWolf(ids); turnOrder = DrawingWolfLogic.buildTurnOrder(ids); turnIndex = 0; votes = {}; voted = false; segments = []; strokeSeq = 0; lastResult = null; lastWolfGuess = null; clearCanvas();
    hostRerollTopic();
  }
  function hostAdvanceTurn(senderId) {
    if (!isCurrentDrawer(senderId)) return;
    turnIndex += 1;
    if (turnIndex >= DrawingWolfLogic.totalTurns(turnOrder, DrawingWolfLogic.ROUNDS)) { hostBeginVoting(); return; }
    const state = { type: 'turn-state', gameId, turnOrder, turnIndex, rounds: DrawingWolfLogic.ROUNDS };
    net.broadcast(state); applyTurnState(state);
  }
  function hostBeginVoting() { votes = {}; phase = 'voting'; const data = { type: 'phase', phase: 'voting', gameId }; net.broadcast(data); enterVoting(); }
  function enterVoting() {
    phase = 'voting'; voted = false; $('drawing-controls').classList.add('hidden'); $('vote').classList.remove('hidden'); $('candidates').innerHTML = ''; $('vote-status').textContent = '';
    roster.filter((p) => p.id !== myId).forEach((p) => { const button = document.createElement('button'); button.textContent = p.name; button.addEventListener('click', () => castVote(p.id, button)); $('candidates').appendChild(button); });
    $('tally-box').classList.toggle('hidden', !isHost); updateProgress();
  }
  function castVote(target, button) {
    if (phase !== 'voting') return;
    voted = true; Array.from($('candidates').children).forEach((b) => { b.classList.remove('selected'); }); button.classList.add('selected'); $('vote-status').textContent = '投票しました。（集計開始まで変更できます）';
    if (isHost) { votes[myId] = target; updateProgress(); } else {
      const actionId = RejoinStorage.newToken(), scopeId = gameId + ':voting';
      const payload = { type: 'vote', target, actionId, scopeId };
      const attempt = AckSend.attempt({ send() { conn.send(payload); }, onPending() { $('vote-status').textContent = '投票を送信中です…'; }, onConfirmed() { $('vote-status').textContent = '投票しました。集計を待っています。'; }, onFailed() { voteAttempt = null; voted = false; $('vote-status').textContent = '投票を確認できませんでした。もう一度お試しください。'; } });
      voteAttempt = { actionId, scopeId, attempt };
    }
  }
  function updateProgress() { if (isHost) $('progress').textContent = '投票: ' + Object.keys(votes).length + '/' + roster.length + '人'; }
  function resultPayload(winner, reason, tally, guess, guessCorrect) {
    return { type: 'result', winner, reason, topic, wolfName: playerName(wolfId), wolfCaught: DrawingWolfLogic.determineWolfCaught(tally, wolfId), guess: guess || '', guessCorrect: !!guessCorrect, counts: tally.counts };
  }
  function hostTallyVotes() {
    if (Object.keys(votes).length < roster.length) { $('progress').textContent = '全員の投票を待っています（' + Object.keys(votes).length + '/' + roster.length + '人）'; return; }
    const tally = DrawingWolfLogic.tallyVotes(votes);
    if (!DrawingWolfLogic.determineWolfCaught(tally, wolfId)) {
      const data = resultPayload('wolf', tally.isTie ? '投票が同数でした。人狼は見破られませんでした。' : '人狼以外が選ばれました。', tally);
      net.broadcast(data); showResult(data); return;
    }
    phase = 'wolf-guess'; const data = { type: 'phase', phase: 'wolf-guess', wolfId, wolfName: playerName(wolfId), tally }; lastWolfGuess = data;
    net.broadcast(data); enterWolfGuess(data);
  }
  function enterWolfGuess(data) {
    phase = 'wolf-guess'; $('game').classList.add('hidden'); $('wolf-guess').classList.remove('hidden'); $('guess-input').value = '';
    const amWolf = myId === data.wolfId;
    $('guess-message').textContent = amWolf ? '人狼だと見破られました。人間側のお題を当てれば逆転勝ちです。' : data.wolfName + 'さんが人狼でした。お題の回答を待っています。';
    $('guess-controls').classList.toggle('hidden', !amWolf);
  }
  function hostFinishGuess(answer) {
    const tally = DrawingWolfLogic.tallyVotes(votes); const correct = DrawingWolfLogic.isCorrectGuess(answer, topic);
    const data = resultPayload(correct ? 'wolf' : 'human', correct ? '人狼がお題を言い当て、逆転勝利しました！' : '人狼はお題を言い当てられませんでした。', tally, answer, correct);
    net.broadcast(data); showResult(data);
  }
  function showResult(data) {
    phase = 'result'; lastResult = data; RejoinStorage.clear(GAME_KEY); $('game').classList.add('hidden'); $('wolf-guess').classList.add('hidden'); $('result').classList.remove('hidden');
    $('result-title').textContent = data.winner === 'wolf' ? '🐺 人狼の勝ち！' : '🎉 人間チームの勝ち！';
    $('result-reason').textContent = data.reason;
    $('result-wolf').textContent = '人狼：' + data.wolfName + 'さん';
    $('result-guess').classList.toggle('hidden', !data.wolfCaught);
    if (data.wolfCaught) $('result-guess').textContent = '人狼の回答：' + (data.guess || '（回答なし）') + (data.guessCorrect ? '（正解）' : '（不正解）');
    $('result-topic').textContent = data.topic; $('counts').innerHTML = '';
    Object.keys(data.counts || {}).forEach((id) => { const li = document.createElement('li'); li.textContent = playerName(id) + '：' + data.counts[id] + '票'; $('counts').appendChild(li); });
    $('again').classList.toggle('hidden', !isHost);
  }
  function receive(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'roster') { roster = data.players; renderRoster(); }
    else if (data.type === 'role') { setMyRole(data); enterGame(); }
    else if (data.type === 'phase' && data.phase === 'topic-reveal') enterTopicReveal();
    else if (data.type === 'turn-state') applyTurnState(data);
    else if (data.type === 'stroke-segment' && data.playerId !== myId && validSegment(data)) rememberSegment(data);
    else if (data.type === 'reset-turn') resetCurrentTurn(data.turnIndex);
    else if (data.type === 'undo-stroke') undoCurrentTurnStroke(data.turnIndex);
    else if (data.type === 'phase' && data.phase === 'voting') { if (Number.isInteger(data.gameId)) gameId = data.gameId; enterVoting(); }
    else if (data.type === 'phase' && data.phase === 'wolf-guess') enterWolfGuess(data);
    else if (data.type === 'turn-done-ack' && turnAttempt && data.actionId === turnAttempt.actionId && data.scopeId === turnAttempt.scopeId) { turnAttempt.attempt.confirm(); turnAttempt = null; }
    else if (data.type === 'vote-ack' && voteAttempt && data.actionId === voteAttempt.actionId && data.scopeId === voteAttempt.scopeId) { voteAttempt.attempt.confirm(); voteAttempt = null; }
    else if (data.type === 'join-ack' && data.joinRequestId && data.joinRequestId === joinRequestId) { RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName }); }
    else if (data.type === 'rejoin-ack' && data.rejoinRequestId && data.rejoinRequestId === rejoinRequestId) { RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName }); }
    else if (data.type === 'rejoin-rejected') { RejoinStorage.clear(GAME_KEY); if (net && net.destroy) net.destroy(); showError('再参加できませんでした。もう一度ルームへ参加してください。'); showSetup(); }
    else if (data.type === 'state-snapshot') applySnapshot(data);
    else if (data.type === 'peer-id-changed' && typeof data.oldId === 'string' && typeof data.newId === 'string') { replaceId(data.oldId, data.newId); renderRoster(); if (phase === 'drawing') applyTurnState({ gameId, turnOrder, turnIndex, rounds: DrawingWolfLogic.ROUNDS }); else if (phase === 'voting') enterVoting(); }
    else if (data.type === 'result') showResult(data);
  }

  let joinRequestId = null, rejoinRequestId = null;
  function showSetup() { $('setup').classList.remove('hidden'); $('lobby').classList.add('hidden'); $('game').classList.add('hidden'); $('vote').classList.add('hidden'); $('wolf-guess').classList.add('hidden'); $('result').classList.add('hidden'); $('host').disabled = false; $('join').disabled = false; }
  function replaceId(oldId, newId) {
    roster.forEach((p) => { if (p.id === oldId) p.id = newId; });
    if (wolfId === oldId) wolfId = newId;
    turnOrder = turnOrder.map((id) => id === oldId ? newId : id);
    const nextVotes = {};
    Object.keys(votes).forEach((id) => { nextVotes[id === oldId ? newId : id] = votes[id] === oldId ? newId : votes[id]; });
    votes = nextVotes;
    segments.forEach((segment) => { if (segment.playerId === oldId) segment.playerId = newId; });
    Array.from(processedActions).forEach((key) => { if (key.indexOf(oldId + ':') === 0) { processedActions.delete(key); processedActions.add(newId + key.slice(oldId.length)); } });
  }
  function snapshotFor(id) {
    const role = id === wolfId ? 'wolf' : 'human';
    return { type: 'state-snapshot', snapshotVersion: 1, phase, gameId, roster: publicRoster(), role, topic: role === 'human' ? topic : null, turnOrder, turnIndex, rounds: DrawingWolfLogic.ROUNDS, segments, voted: Object.prototype.hasOwnProperty.call(votes, id), wolfGuess: lastWolfGuess, result: lastResult };
  }
  function applySnapshot(data) {
    if (data.snapshotVersion !== 1 || !Array.isArray(data.roster) || !Array.isArray(data.segments)) return;
    roster = data.roster; gameId = data.gameId; segments = data.segments.filter(validSegment); strokeSeq = segments.filter((segment) => segment.playerId === myId).reduce((max, segment) => Math.max(max, segment.strokeId || 0), 0); renderRoster(); redrawCanvas(); setMyRole({ role: data.role, topic: data.topic });
    if (data.phase === 'topic-reveal') enterTopicReveal();
    else if (data.phase === 'drawing') applyTurnState(data);
    else if (data.phase === 'voting') { phase = 'voting'; enterVoting(); if (data.voted) { voted = true; $('vote-status').textContent = '投票済みです。集計を待っています。'; } }
    else if (data.phase === 'wolf-guess' && data.wolfGuess) enterWolfGuess(data.wolfGuess);
    else if (data.phase === 'result' && data.result) showResult(data.result);
    $('disconnect').textContent = '';
  }
  function handleRejoin(id, data) {
    const existing = roster.find((p) => p.token === data.token);
    const pending = existing && pendingRejoins.get(data.token);
    if (!pending || pending.oldPeerId !== existing.id || !data.rejoinRequestId || phase === 'result') { net.sendTo(id, { type: 'rejoin-rejected' }); return; }
    if (pending.timer) clearTimeout(pending.timer); pendingRejoins.delete(data.token); replaceId(pending.oldPeerId, id); net.broadcast({ type: 'peer-id-changed', oldId: pending.oldPeerId, newId: id }); broadcastRoster();
    net.sendTo(id, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode });
    net.sendTo(id, snapshotFor(id));
  }
  function deferDisconnect(id) {
    const player = roster.find((p) => p.id === id);
    if (!player || !player.token) return;
    const previous = pendingRejoins.get(player.token); if (previous) clearTimeout(previous.timer);
    $('disconnect').textContent = player.name + 'さんとの接続が不安定です。再接続を待っています。';
    const timer = setTimeout(() => { pendingRejoins.delete(player.token); $('disconnect').textContent = '参加者が切断しました。モード選択に戻ってください。'; }, REJOIN_GRACE_MS);
    pendingRejoins.set(player.token, { oldPeerId: id, timer });
  }
  function connectGuest(session) {
    const rejoining = !!session;
    myName = rejoining ? session.name : myName; roomCode = rejoining ? session.roomCode : roomCode;
    guestToken = rejoining ? session.token : RejoinStorage.newToken();
    joinRequestId = rejoining ? null : RejoinStorage.newToken(); rejoinRequestId = rejoining ? RejoinStorage.newToken() : null;
    $('host').disabled = true; $('join').disabled = true;
    net = DrawingWolfNet.joinRoom(roomCode, { onOwnId(id) { myId = id; }, onConnected(connection) { conn = connection; conn.send(rejoining ? { type: 'rejoin', token: guestToken, name: myName, rejoinRequestId } : { type: 'join', name: myName, token: guestToken, joinRequestId }); if (!rejoining) { $('lobby').classList.remove('hidden'); $('status').textContent = 'ホストからの開始を待っています'; } }, onMessage: receive, onDisconnected() { $('disconnect').textContent = 'ホストとの接続が切れました。再接続してください。'; }, onError(err) { if (rejoining && err && err.type === 'peer-unavailable') { RejoinStorage.clear(GAME_KEY); showSetup(); } peerError(err); }, onConnectionHealthChange: connectionHealthChanged });
  }

  $('host').addEventListener('click', () => {
    myName = $('name').value.trim(); if (!myName) return showError('ニックネームを入力してください。');
    isHost = true; myId = HOST_ID; roster = [{ id: HOST_ID, name: myName, token: null }]; $('host').disabled = true; $('join').disabled = true;
    net = DrawingWolfNet.hostRoom({
      onCode(code) { roomCode = code; WakeLockHelper.enable(); $('room-code').textContent = code; $('host-code').classList.remove('hidden'); $('status').textContent = '参加者を待っています'; $('lobby').classList.remove('hidden'); renderRoster(); },
      onPeerConnected() {},
      onPeerMessage(id, data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'join' && phase === 'lobby' && typeof data.token === 'string' && data.token && typeof data.joinRequestId === 'string') { const existing = roster.find((p) => p.token === data.token); if (!existing) roster = DrawingWolfLogic.addPlayer(roster, { id, name: String(data.name || '参加者').slice(0, 10), token: data.token }); renderRoster(); broadcastRoster(); net.sendTo(id, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode }); }
        else if (data.type === 'rejoin') handleRejoin(id, data);
        else if (data.type === 'stroke-segment' && data.playerId === id && isCurrentDrawer(id) && data.turnIndex === turnIndex && validSegment(data)) { rememberSegment(data); net.broadcast(data); }
        else if (data.type === 'turn-done' && data.playerId === id && data.actionId && data.scopeId === gameId + ':' + data.turnIndex) {
          const key = id + ':turn-done:' + data.scopeId + ':' + data.actionId;
          if (!processedActions.has(key)) { if (!isCurrentDrawer(id) || data.turnIndex !== turnIndex) return; processedActions.add(key); hostAdvanceTurn(id); }
          net.sendTo(id, { type: 'turn-done-ack', actionId: data.actionId, scopeId: data.scopeId });
        }
        else if (data.type === 'reset-turn' && isCurrentDrawer(id) && data.turnIndex === turnIndex) { resetCurrentTurn(turnIndex); net.broadcast({ type: 'reset-turn', turnIndex }); }
        else if (data.type === 'undo-stroke' && isCurrentDrawer(id) && data.turnIndex === turnIndex) { undoCurrentTurnStroke(turnIndex); net.broadcast({ type: 'undo-stroke', turnIndex }); }
        else if (data.type === 'vote' && data.actionId && data.scopeId === gameId + ':voting' && roster.some((p) => p.id === id) && data.target !== id && roster.some((p) => p.id === data.target)) {
          const key = id + ':vote:' + data.scopeId + ':' + data.actionId;
          if (!processedActions.has(key)) { if (phase !== 'voting') return; processedActions.add(key); votes[id] = data.target; updateProgress(); }
          net.sendTo(id, { type: 'vote-ack', actionId: data.actionId, scopeId: data.scopeId });
        }
        else if (data.type === 'wolf-guess' && phase === 'wolf-guess' && id === wolfId) hostFinishGuess(String(data.answer || ''));
      },
      onPeerDisconnected(id) { if (phase === 'lobby') { roster = DrawingWolfLogic.removePlayer(roster, id); renderRoster(); broadcastRoster(); } else deferDisconnect(id); }, onError: peerError, onConnectionHealthChange: connectionHealthChanged,
    });
  });
  $('join').addEventListener('click', () => {
    myName = $('name').value.trim(); const code = $('code').value.trim();
    if (!myName) return showError('ニックネームを入力してください。'); if (code.length !== 6) return showError('6桁のルームコードを入力してください。');
    roomCode = code.toUpperCase(); connectGuest(null);
  });
  $('copy').addEventListener('click', () => { if (navigator.clipboard) navigator.clipboard.writeText($('room-code').textContent).then(() => { $('status').textContent = 'コードをコピーしました。'; }); });
  $('start').addEventListener('click', hostStartRound);
  $('reroll-topic').addEventListener('click', () => { if (!isHost || phase !== 'topic-reveal') return; hostRerollTopic(); });
  $('begin-drawing').addEventListener('click', hostBeginDrawing);
  $('turn-done').addEventListener('click', () => { if (!isCurrentDrawer(myId) || turnAttempt) return; if (isHost) hostAdvanceTurn(myId); else { const actionId = RejoinStorage.newToken(), scopeId = gameId + ':' + turnIndex; const payload = { type: 'turn-done', playerId: myId, turnIndex, actionId, scopeId }; const attempt = AckSend.attempt({ send() { conn.send(payload); }, onPending() { $('turn-done').disabled = true; $('disconnect').textContent = '手番完了を送信中です…'; }, onConfirmed() { $('disconnect').textContent = '手番完了を送信しました。'; }, onFailed() { turnAttempt = null; $('turn-done').disabled = false; $('disconnect').textContent = '手番完了を確認できませんでした。もう一度お試しください。'; } }); turnAttempt = { actionId, scopeId, attempt }; } });
  $('reset-turn').addEventListener('click', () => { if (!isCurrentDrawer(myId)) return; if (isHost) { resetCurrentTurn(turnIndex); net.broadcast({ type: 'reset-turn', turnIndex }); } else conn.send({ type: 'reset-turn', turnIndex }); });
  $('undo-stroke').addEventListener('click', () => { if (!isCurrentDrawer(myId)) return; if (isHost) { undoCurrentTurnStroke(turnIndex); net.broadcast({ type: 'undo-stroke', turnIndex }); } else conn.send({ type: 'undo-stroke', turnIndex }); });
  $('tally').addEventListener('click', hostTallyVotes);
  $('guess-btn').addEventListener('click', () => { const answer = $('guess-input').value.trim(); if (!answer) return; if (isHost) hostFinishGuess(answer); else conn.send({ type: 'wolf-guess', answer }); });
  $('again').addEventListener('click', hostStartRound); $('quit').addEventListener('click', () => { WakeLockHelper.disable(); RejoinStorage.clear('drawing-wolf'); location.reload(); });

  function point(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; }
  function sendSegment(segment) { const data = Object.assign({ turnIndex }, segment); rememberSegment(data); if (isHost) net.broadcast(data); else conn.send(data); }
  canvas.addEventListener('pointerdown', (event) => { if (!isCurrentDrawer(myId)) return; canvas.setPointerCapture(event.pointerId); strokeSeq += 1; drawing = { pointerId: event.pointerId, point: point(event), strokeId: strokeSeq }; });
  canvas.addEventListener('pointermove', (event) => { if (!drawing || drawing.pointerId !== event.pointerId || !isCurrentDrawer(myId)) return; const next = point(event); sendSegment({ type: 'stroke-segment', playerId: myId, strokeId: drawing.strokeId, x0: drawing.point.x, y0: drawing.point.y, x1: next.x, y1: next.y }); drawing.point = next; });
  function stopDrawing(event) { if (drawing && drawing.pointerId === event.pointerId) drawing = null; }
  canvas.addEventListener('pointerup', stopDrawing); canvas.addEventListener('pointercancel', stopDrawing);
  const savedSession = RejoinStorage.load(GAME_KEY);
  if (savedSession && savedSession.roomCode && savedSession.token && savedSession.name) connectGuest(savedSession);
})();
