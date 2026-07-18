(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const HOST_ID = 'host';
  const canvas = $('drawing-canvas');
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#222'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  let isHost = false, myId = null, myName = '', net = null, conn = null;
  let roster = [], myRole = null, myTopic = null, wolfId = null, topic = null;
  let turnOrder = [], turnIndex = 0, votes = {}, voted = false, drawing = null, phase = 'lobby', segments = [];

  function showError(message) { $('error').textContent = message || ''; }
  function playerName(id) { const p = roster.find((player) => player.id === id); return p ? p.name : '不明な参加者'; }
  function renderRoster() {
    $('roster').innerHTML = '';
    roster.forEach((player) => { const li = document.createElement('li'); li.textContent = player.name + (player.id === myId ? '（あなた）' : ''); $('roster').appendChild(li); });
    $('start').disabled = !isHost || !DrawingWolfLogic.hasMinPlayers(roster);
  }
  function broadcastRoster() { if (net) net.broadcast({ type: 'roster', players: roster }); }
  function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
  function drawSegment(data) { ctx.beginPath(); ctx.moveTo(data.x0, data.y0); ctx.lineTo(data.x1, data.y1); ctx.stroke(); }
  function redrawCanvas() { clearCanvas(); segments.forEach(drawSegment); }
  function rememberSegment(data) { segments.push(data); drawSegment(data); }
  function resetCurrentTurn(index) { segments = segments.filter((segment) => segment.turnIndex !== index); redrawCanvas(); }
  function validSegment(data) { return ['x0', 'y0', 'x1', 'y1'].every((key) => Number.isFinite(data[key]) && data[key] >= 0 && data[key] <= 320); }
  function peerError(err) { console.error(err); showError('接続できませんでした。ルームコードや通信状態を確認してください。'); }
  function isCurrentDrawer(id) { const info = DrawingWolfLogic.currentTurnInfo(turnOrder, turnIndex, DrawingWolfLogic.ROUNDS); return phase === 'drawing' && info && info.playerId === id; }

  function setMyRole(data) {
    myRole = data.role; myTopic = data.topic || null;
    $('role-title').textContent = myRole === 'wolf' ? '🐺 あなたは人狼です' : '🖌️ あなたは人間です';
    $('topic').textContent = myRole === 'wolf' ? 'お題は知らされません' : myTopic;
    $('role-hint').textContent = myRole === 'wolf' ? 'みんなの絵からお題を推理しながら、ばれないように描きましょう。' : 'お題が人狼に伝わらないよう、少しずつ絵を描き足しましょう。';
  }
  function applyTurnState(data) {
    phase = 'drawing'; turnOrder = data.turnOrder; turnIndex = data.turnIndex;
    const info = DrawingWolfLogic.currentTurnInfo(turnOrder, turnIndex, data.rounds);
    if (!info) return;
    const mine = info.playerId === myId;
    $('turn-label').textContent = '第' + info.round + 'ラウンド：' + playerName(info.playerId) + 'さんの番';
    $('turn-hint').textContent = mine ? 'あなたの番です。絵を描き、終わったら次へ進んでください。' : '描き手が絵を描いています。少し待ちましょう。';
    $('drawing-controls').classList.toggle('hidden', !mine);
  }
  function enterGame() {
    $('setup').classList.add('hidden'); $('lobby').classList.add('hidden'); $('result').classList.add('hidden'); $('wolf-guess').classList.add('hidden'); $('vote').classList.add('hidden'); $('game').classList.remove('hidden');
  }
  function hostStartRound() {
    if (!DrawingWolfLogic.hasMinPlayers(roster)) return;
    const ids = roster.map((p) => p.id);
    wolfId = DrawingWolfLogic.assignWolf(ids); topic = DrawingWolfLogic.pickTopic(); turnOrder = DrawingWolfLogic.buildTurnOrder(ids); turnIndex = 0; votes = {}; voted = false; segments = []; clearCanvas();
    roster.forEach((p) => {
      const role = p.id === wolfId ? { type: 'role', role: 'wolf' } : { type: 'role', role: 'human', topic };
      if (p.id === HOST_ID) setMyRole(role); else net.sendTo(p.id, role);
    });
    enterGame();
    const state = { type: 'turn-state', turnOrder, turnIndex, rounds: DrawingWolfLogic.ROUNDS };
    net.broadcast(state); applyTurnState(state);
  }
  function hostAdvanceTurn(senderId) {
    if (!isCurrentDrawer(senderId)) return;
    turnIndex += 1;
    if (turnIndex >= DrawingWolfLogic.totalTurns(turnOrder, DrawingWolfLogic.ROUNDS)) { hostBeginVoting(); return; }
    const state = { type: 'turn-state', turnOrder, turnIndex, rounds: DrawingWolfLogic.ROUNDS };
    net.broadcast(state); applyTurnState(state);
  }
  function hostBeginVoting() { votes = {}; phase = 'voting'; const data = { type: 'phase', phase: 'voting' }; net.broadcast(data); enterVoting(); }
  function enterVoting() {
    phase = 'voting'; voted = false; $('drawing-controls').classList.add('hidden'); $('vote').classList.remove('hidden'); $('candidates').innerHTML = ''; $('vote-status').textContent = '';
    roster.filter((p) => p.id !== myId).forEach((p) => { const button = document.createElement('button'); button.textContent = p.name; button.addEventListener('click', () => castVote(p.id, button)); $('candidates').appendChild(button); });
    $('tally-box').classList.toggle('hidden', !isHost); updateProgress();
  }
  function castVote(target, button) {
    if (voted || phase !== 'voting') return;
    voted = true; Array.from($('candidates').children).forEach((b) => { b.disabled = true; }); button.classList.add('selected'); $('vote-status').textContent = '投票しました。';
    if (isHost) { votes[myId] = target; updateProgress(); } else conn.send({ type: 'vote', target });
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
    phase = 'wolf-guess'; const data = { type: 'phase', phase: 'wolf-guess', wolfId, wolfName: playerName(wolfId), tally };
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
    phase = 'result'; $('game').classList.add('hidden'); $('wolf-guess').classList.add('hidden'); $('result').classList.remove('hidden');
    $('result-title').textContent = data.winner === 'wolf' ? '🐺 人狼の勝ち！' : '🎉 人間チームの勝ち！';
    $('result-detail').textContent = data.reason + ' 人狼は「' + data.wolfName + '」でした。' + (data.wolfCaught ? ' 回答：' + (data.guess || '（回答なし）') + (data.guessCorrect ? '（正解）' : '') : '');
    $('result-topic').textContent = data.topic; $('counts').innerHTML = '';
    Object.keys(data.counts || {}).forEach((id) => { const li = document.createElement('li'); li.textContent = playerName(id) + '：' + data.counts[id] + '票'; $('counts').appendChild(li); });
    $('again').classList.toggle('hidden', !isHost);
  }
  function receive(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'roster') { roster = data.players; renderRoster(); }
    else if (data.type === 'role') { setMyRole(data); enterGame(); }
    else if (data.type === 'turn-state') applyTurnState(data);
    else if (data.type === 'stroke-segment' && data.playerId !== myId && validSegment(data)) rememberSegment(data);
    else if (data.type === 'reset-turn') resetCurrentTurn(data.turnIndex);
    else if (data.type === 'phase' && data.phase === 'voting') enterVoting();
    else if (data.type === 'phase' && data.phase === 'wolf-guess') enterWolfGuess(data);
    else if (data.type === 'result') showResult(data);
  }

  $('host').addEventListener('click', () => {
    myName = $('name').value.trim(); if (!myName) return showError('ニックネームを入力してください。');
    isHost = true; myId = HOST_ID; roster = [{ id: HOST_ID, name: myName }]; $('host').disabled = true; $('join').disabled = true;
    net = DrawingWolfNet.hostRoom({
      onCode(code) { $('room-code').textContent = code; $('host-code').classList.remove('hidden'); $('status').textContent = '参加者を待っています'; $('lobby').classList.remove('hidden'); renderRoster(); },
      onPeerConnected() {},
      onPeerMessage(id, data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'join' && phase === 'lobby') { roster = DrawingWolfLogic.addPlayer(roster, { id, name: String(data.name || '参加者').slice(0, 10) }); renderRoster(); broadcastRoster(); }
        else if (data.type === 'stroke-segment' && data.playerId === id && isCurrentDrawer(id) && data.turnIndex === turnIndex && validSegment(data)) { rememberSegment(data); net.broadcast(data); }
        else if (data.type === 'turn-done' && data.playerId === id) hostAdvanceTurn(id);
        else if (data.type === 'reset-turn' && isCurrentDrawer(id) && data.turnIndex === turnIndex) { resetCurrentTurn(turnIndex); net.broadcast({ type: 'reset-turn', turnIndex }); }
        else if (data.type === 'vote' && phase === 'voting' && roster.some((p) => p.id === id) && data.target !== id && roster.some((p) => p.id === data.target)) { votes[id] = data.target; updateProgress(); }
        else if (data.type === 'wolf-guess' && phase === 'wolf-guess' && id === wolfId) hostFinishGuess(String(data.answer || ''));
      },
      onPeerDisconnected(id) { if (phase === 'lobby') { roster = DrawingWolfLogic.removePlayer(roster, id); renderRoster(); broadcastRoster(); } else $('disconnect').textContent = '参加者が切断しました。モード選択に戻ってください。'; }, onError: peerError,
    });
  });
  $('join').addEventListener('click', () => {
    myName = $('name').value.trim(); const code = $('code').value.trim();
    if (!myName) return showError('ニックネームを入力してください。'); if (code.length !== 6) return showError('6桁のルームコードを入力してください。');
    $('host').disabled = true; $('join').disabled = true;
    net = DrawingWolfNet.joinRoom(code, { onOwnId(id) { myId = id; }, onConnected(connection) { conn = connection; conn.send({ type: 'join', name: myName }); $('lobby').classList.remove('hidden'); $('status').textContent = 'ホストからの開始を待っています'; }, onMessage: receive, onDisconnected() { $('disconnect').textContent = 'ホストとの接続が切れました。モード選択に戻ってください。'; }, onError: peerError });
  });
  $('copy').addEventListener('click', () => { if (navigator.clipboard) navigator.clipboard.writeText($('room-code').textContent).then(() => { $('status').textContent = 'コードをコピーしました。'; }); });
  $('start').addEventListener('click', hostStartRound);
  $('turn-done').addEventListener('click', () => { if (!isCurrentDrawer(myId)) return; if (isHost) hostAdvanceTurn(myId); else conn.send({ type: 'turn-done', playerId: myId }); });
  $('reset-turn').addEventListener('click', () => { if (!isCurrentDrawer(myId)) return; if (isHost) { resetCurrentTurn(turnIndex); net.broadcast({ type: 'reset-turn', turnIndex }); } else conn.send({ type: 'reset-turn', turnIndex }); });
  $('tally').addEventListener('click', hostTallyVotes);
  $('guess-btn').addEventListener('click', () => { const answer = $('guess-input').value.trim(); if (!answer) return; if (isHost) hostFinishGuess(answer); else conn.send({ type: 'wolf-guess', answer }); });
  $('again').addEventListener('click', hostStartRound); $('quit').addEventListener('click', () => location.reload());

  function point(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; }
  function sendSegment(segment) { const data = Object.assign({ turnIndex }, segment); rememberSegment(data); if (isHost) net.broadcast(data); else conn.send(data); }
  canvas.addEventListener('pointerdown', (event) => { if (!isCurrentDrawer(myId)) return; canvas.setPointerCapture(event.pointerId); drawing = { pointerId: event.pointerId, point: point(event) }; });
  canvas.addEventListener('pointermove', (event) => { if (!drawing || drawing.pointerId !== event.pointerId || !isCurrentDrawer(myId)) return; const next = point(event); sendSegment({ type: 'stroke-segment', playerId: myId, x0: drawing.point.x, y0: drawing.point.y, x1: next.x, y1: next.y }); drawing.point = next; });
  function stopDrawing(event) { if (drawing && drawing.pointerId === event.pointerId) drawing = null; }
  canvas.addEventListener('pointerup', stopDrawing); canvas.addEventListener('pointercancel', stopDrawing);
})();
