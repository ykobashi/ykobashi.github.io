(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const HOST_ID = 'host', GAME_KEY = 'escape-run', REJOIN_GRACE_MS = 30000, LOBBY_SYNC_INTERVAL_MS = 4000, STARTUP_DELAY_MS = 350;
  const SCALE = 0.55, PLAYER_SCREEN_X = 130, JUMP_HEIGHT_PX = 64;
  let isHost = false, myId = null, myName = '', roomCode = '', net = null, conn = null;
  let roster = [], phase = 'lobby';
  let gameId = 0, guestToken = null, joinRequestId = null, rejoinRequestId = null;
  let courseSeed = 0, startedAt = 0, obstacles = [], judgedCount = 0;
  let players = new Map();
  let rafId = null, lobbySyncTimer = null;
  const pendingRejoins = new Map();

  function error(message) { $('error').textContent = message || ''; }
  function player(id) { return roster.find((p) => p.id === id); }
  function publicRoster() { return roster.map(({ id, name, joinOrder }) => ({ id, name, joinOrder })); }
  function enter(which) { ['setup', 'lobby', 'game', 'result'].forEach((id) => $(id).classList.toggle('hidden', id !== which)); }
  function stopLobbySync() { if (lobbySyncTimer) { clearInterval(lobbySyncTimer); lobbySyncTimer = null; } }
  function startLobbySync() {
    stopLobbySync();
    lobbySyncTimer = setInterval(() => {
      if (isHost || phase !== 'lobby' || !conn || !conn.open) { stopLobbySync(); return; }
      conn.send({ type: 'sync-request' });
    }, LOBBY_SYNC_INTERVAL_MS);
  }
  function showSetup() { isHost = false; net = null; conn = null; stopLobbySync(); stopGameLoop(); $('host').disabled = false; $('join').disabled = false; enter('setup'); }
  function broadcastRoster() { net.broadcast({ type: 'roster', players: publicRoster() }); }
  function renderRoster() {
    const ul = $('roster'); if (!ul) return;
    ul.innerHTML = '';
    roster.forEach((p) => {
      const li = document.createElement('li');
      li.className = EscapeRunLogic.colorClass(p.joinOrder);
      li.textContent = 'P' + p.joinOrder + '　' + p.name + (p.id === myId ? '（あなた）' : '');
      ul.appendChild(li);
    });
    $('start').disabled = !isHost || !EscapeRunLogic.hasMinPlayers(roster);
    $('again').disabled = !isHost || !EscapeRunLogic.hasMinPlayers(roster);
  }
  function renderLives() {
    const container = $('run-lives'); if (!container) return;
    container.innerHTML = '';
    roster.slice().sort((a, b) => a.joinOrder - b.joinOrder).forEach((rp) => {
      const p = players.get(rp.id); if (!p) return;
      const div = document.createElement('div');
      div.className = 'run-life ' + EscapeRunLogic.colorClass(rp.joinOrder) + (p.status === 'eliminated' ? ' is-down' : '');
      div.textContent = rp.name + '：' + '❤'.repeat(p.lives) + '🖤'.repeat(Math.max(0, EscapeRunLogic.LIVES_START - p.lives));
      container.appendChild(div);
    });
  }
  function renderProgress(x) { $('run-progress-bar').style.width = (EscapeRunLogic.progressRatio(x) * 100) + '%'; }
  function updateControlsEnabled() {
    const me = players.get(myId);
    const canAct = phase === 'playing' && me && me.status === 'running';
    $('jump-btn').disabled = !canAct;
    $('duck-btn').disabled = !canAct;
  }

  // --- 入力 ---
  function announceAction(action) {
    const payload = { type: 'player-action', action, at: Date.now() };
    if (isHost) net.broadcast({ ...payload, id: myId });
    else if (conn) conn.send(payload);
  }
  function startJump() {
    const me = players.get(myId);
    if (!me || me.status !== 'running') return;
    me.visual = 'jumping'; me.jumpStartedAt = Date.now();
    players.set(myId, me);
    announceAction('jump');
  }
  function startDuck() {
    const me = players.get(myId);
    if (!me || me.status !== 'running' || me.visual === 'ducking') return;
    me.visual = 'ducking';
    players.set(myId, me);
    announceAction('duck-start');
  }
  function endDuck() {
    const me = players.get(myId);
    if (!me || me.visual !== 'ducking') return;
    me.visual = 'running';
    players.set(myId, me);
    announceAction('duck-end');
  }
  function applyRemoteAction(id, action, at) {
    const p = players.get(id);
    if (!p || p.status !== 'running') return;
    if (action === 'jump') { p.visual = 'jumping'; p.jumpStartedAt = at || Date.now(); }
    else if (action === 'duck-start') p.visual = 'ducking';
    else if (action === 'duck-end') { if (p.visual === 'ducking') p.visual = 'running'; }
    players.set(id, p);
  }

  // --- 被弾・生死 ---
  function relayStatus(id) {
    const p = players.get(id); if (!p) return;
    const payload = { type: 'player-status', id, lives: p.lives, status: p.status, stunUntil: p.stunUntil, hits: p.hits };
    if (isHost) net.broadcast(payload); else if (conn) conn.send(payload);
  }
  function selfHit(now) {
    const before = players.get(myId);
    if (!before || before.status !== 'running') return;
    const after = EscapeRunLogic.applyHit(before, now);
    after.visual = 'running';
    players.set(myId, after);
    renderLives(); updateControlsEnabled();
    relayStatus(myId);
  }
  function applyStatus(data) {
    const existing = players.get(data.id); if (!existing) return;
    players.set(data.id, { ...existing, lives: data.lives, status: data.status, stunUntil: data.stunUntil, hits: data.hits, visual: data.status === 'running' ? existing.visual : 'running' });
  }
  function recoverStuns(now) {
    const me = players.get(myId);
    if (!me || me.status !== 'stunned') return;
    const recovered = EscapeRunLogic.recoverFromStun(me, now);
    if (recovered.status !== me.status) {
      recovered.visual = 'running';
      players.set(myId, recovered);
      renderLives(); updateControlsEnabled();
      relayStatus(myId);
    }
  }
  function updateVisualTimers(now) {
    players.forEach((p) => { if (p.visual === 'jumping' && now - p.jumpStartedAt >= EscapeRunLogic.JUMP_MS) p.visual = 'running'; });
  }
  function judgeSelfObstacles(x, now) {
    const me = players.get(myId);
    if (!me || me.status === 'eliminated') return;
    const toJudge = EscapeRunLogic.obstaclesToJudge(obstacles, judgedCount, x);
    if (!toJudge.length) return;
    judgedCount += toJudge.length;
    toJudge.forEach((i) => {
      const current = players.get(myId);
      if (!current || current.status === 'eliminated') return;
      const effectiveVisual = current.status === 'stunned' ? 'stunned' : current.visual;
      if (!EscapeRunLogic.judgeObstacle(effectiveVisual, obstacles[i].type)) selfHit(now);
    });
  }

  // --- ゲームループ ---
  function stopGameLoop() { if (rafId) cancelAnimationFrame(rafId); rafId = null; }
  function startGameLoop() { stopGameLoop(); rafId = requestAnimationFrame(frame); }
  function frame() {
    if (phase !== 'playing') { rafId = null; return; }
    const now = Date.now();
    const x = EscapeRunLogic.worldX(startedAt, now);
    updateVisualTimers(now);
    recoverStuns(now);
    judgeSelfObstacles(x, now);
    renderProgress(x);
    renderCanvas(x, now);
    if (isHost) hostCheckOutcome(x);
    rafId = requestAnimationFrame(frame);
  }

  // --- 描画 ---
  function getCssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v && v.trim() ? v.trim() : fallback;
  }
  function worldToScreenX(worldXValue, camera) { return PLAYER_SCREEN_X + (worldXValue - camera) * SCALE; }
  function drawObstacle(ctx, sx, groundY, type) {
    if (type === 'jump') {
      ctx.fillStyle = '#92400e';
      ctx.fillRect(sx - 14, groundY - 32, 28, 32);
    } else {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(sx - 16, groundY - 110, 32, 46);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(sx - 3, groundY - 64, 6, 64);
    }
  }
  function drawPlayer(ctx, p, idx, total, groundY, now) {
    const baseX = PLAYER_SCREEN_X + (idx - (total - 1) / 2) * 30;
    let bodyH = 46, bodyW = 26, offsetY = 0;
    if (p.status === 'eliminated') ctx.globalAlpha = 0.35;
    else if (p.status === 'stunned') offsetY = Math.sin(now / 40) * 3;
    if (p.status === 'running' && p.visual === 'jumping') {
      const progress = Math.min(1, (now - p.jumpStartedAt) / EscapeRunLogic.JUMP_MS);
      offsetY -= Math.sin(Math.PI * progress) * JUMP_HEIGHT_PX;
    } else if (p.status === 'running' && p.visual === 'ducking') {
      bodyH = 26;
    }
    const color = getCssVar('--' + EscapeRunLogic.colorClass(p.joinOrder) + '-color', '#2563eb');
    ctx.fillStyle = p.status === 'stunned' ? getCssVar('--danger', '#dc2626') : color;
    ctx.fillRect(baseX - bodyW / 2, groundY - bodyH + offsetY, bodyW, bodyH);
    ctx.beginPath();
    ctx.arc(baseX, groundY - bodyH + offsetY - 12, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = getCssVar('--text', '#182230');
    ctx.font = '12px "Hiragino Sans","Yu Gothic",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, baseX, groundY + 16);
  }
  function renderCanvas(camera, now) {
    const canvas = $('run-canvas'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, groundY = h - 70;
    ctx.clearRect(0, 0, w, h);
    const lead = EscapeRunLogic.leadDistance(camera);
    const dangerScreenX = worldToScreenX(camera - lead, camera);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = getCssVar('--danger', '#dc2626');
    ctx.fillRect(0, 0, Math.max(0, Math.min(w, dangerScreenX)), h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = getCssVar('--card-border', '#d0d5dd');
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(w, groundY); ctx.stroke();
    obstacles.forEach((o) => {
      const sx = worldToScreenX(o.x, camera);
      if (sx < -60 || sx > w + 60) return;
      drawObstacle(ctx, sx, groundY, o.type);
    });
    const ordered = roster.slice().sort((a, b) => a.joinOrder - b.joinOrder);
    ordered.forEach((rp, idx) => {
      const p = players.get(rp.id); if (!p) return;
      drawPlayer(ctx, p, idx, ordered.length, groundY, now);
    });
  }

  // --- ラン開始・終了 ---
  function hostStartGame() {
    if (!isHost) return;
    if (net && net.peerIds) {
      const connected = new Set([HOST_ID].concat(net.peerIds()));
      const before = roster.length;
      roster = roster.filter((p) => connected.has(p.id));
      if (roster.length !== before) { renderRoster(); broadcastRoster(); }
    }
    if (!EscapeRunLogic.hasMinPlayers(roster)) return;
    clearPending();
    gameId += 1; phase = 'playing';
    courseSeed = EscapeRunLogic.generateSeed();
    startedAt = Date.now() + STARTUP_DELAY_MS;
    obstacles = EscapeRunLogic.generateCourse(courseSeed);
    judgedCount = 0;
    players = new Map(roster.map((p) => [p.id, { ...EscapeRunLogic.createPlayerState(p.id, p.name, p.joinOrder), visual: 'running', jumpStartedAt: 0 }]));
    const data = { type: 'start-game', gameId, roster: publicRoster(), seed: courseSeed, startedAt };
    net.broadcast(data);
    applyStart(data);
  }
  function applyStart(data) {
    if (data.gameId == null) return;
    stopLobbySync();
    gameId = data.gameId; phase = 'playing';
    if (!isHost) roster = data.roster || roster;
    courseSeed = data.seed; startedAt = data.startedAt;
    obstacles = EscapeRunLogic.generateCourse(courseSeed);
    judgedCount = 0;
    if (!isHost) players = new Map(roster.map((p) => [p.id, { ...EscapeRunLogic.createPlayerState(p.id, p.name, p.joinOrder), visual: 'running', jumpStartedAt: 0 }]));
    renderRoster(); renderLives(); renderProgress(0); updateControlsEnabled(); enter('game'); startGameLoop();
    if (!isHost) RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName });
  }
  function hostCheckOutcome(x) {
    if (!isHost || phase !== 'playing') return;
    const alive = roster.filter((p) => { const st = players.get(p.id); return st && st.status !== 'eliminated'; });
    if (alive.length === 0) { endRun('fail'); return; }
    if (x >= EscapeRunLogic.DISTANCE_GOAL) endRun('clear');
  }
  function endRun(outcome) {
    phase = 'result'; clearPending();
    const data = { type: 'run-end', gameId, outcome, players: Array.from(players.values()).map((p) => ({ id: p.id, name: p.name, joinOrder: p.joinOrder, lives: p.lives, status: p.status, hits: p.hits })) };
    net.broadcast(data);
    showResult(data);
    if (net && net.peerIds) {
      const connected = new Set([HOST_ID].concat(net.peerIds()));
      roster = roster.filter((p) => connected.has(p.id));
      renderRoster(); broadcastRoster();
    }
  }
  function showResult(data) {
    if (data.gameId !== gameId) return;
    phase = 'result'; stopGameLoop();
    const summary = EscapeRunLogic.buildRunSummary(data.players || []);
    $('result-outcome').textContent = data.outcome === 'clear' ? '🎉 全員でゴール到達！' : '💥 全滅…波にのまれてしまった';
    const mine = summary.find((p) => p.id === myId);
    $('result-my-status').textContent = mine ? 'あなたは' + (mine.alive ? '生還しました' : '途中で脱落しました') + '（被弾' + mine.hits + '回）' : '';
    $('result-summary').innerHTML = '';
    summary.forEach((p) => {
      const li = document.createElement('li');
      li.className = EscapeRunLogic.colorClass(p.joinOrder);
      li.textContent = p.name + '：被弾' + p.hits + '回' + (p.alive ? '（生還）' : '（脱落）');
      $('result-summary').appendChild(li);
    });
    $('again').classList.toggle('hidden', !isHost);
    enter('result');
  }

  // --- 再接続 ---
  function replaceId(oldId, newId) {
    if (oldId === newId) return;
    roster.forEach((p) => { if (p.id === oldId) p.id = newId; });
    if (players.has(oldId)) { players.set(newId, { ...players.get(oldId), id: newId }); players.delete(oldId); }
  }
  function snapshot() {
    return {
      type: 'state-snapshot', snapshotVersion: 1, gameId, phase,
      roster: publicRoster(), seed: courseSeed, startedAt,
      players: Array.from(players.values()).map((p) => ({ id: p.id, name: p.name, joinOrder: p.joinOrder, lives: p.lives, status: p.status, stunUntil: p.stunUntil, hits: p.hits })),
    };
  }
  function applySnapshot(data) {
    if (data.snapshotVersion !== 1 || data.gameId == null) return;
    stopLobbySync();
    gameId = data.gameId; roster = data.roster || [];
    courseSeed = data.seed; startedAt = data.startedAt;
    obstacles = EscapeRunLogic.generateCourse(courseSeed);
    players = new Map((data.players || []).map((p) => [p.id, { ...p, visual: 'running', jumpStartedAt: 0 }]));
    renderRoster(); renderLives(); updateControlsEnabled();
    if (data.phase === 'playing') {
      phase = 'playing';
      const nowX = EscapeRunLogic.worldX(startedAt, Date.now());
      judgedCount = EscapeRunLogic.obstaclesToJudge(obstacles, 0, nowX).length;
      enter('game'); startGameLoop();
    } else {
      phase = 'lobby'; enter('lobby'); $('status').textContent = 'ホストの開始を待っています。'; startLobbySync();
    }
  }
  function clearPending() { pendingRejoins.forEach((v) => clearTimeout(v.timer)); pendingRejoins.clear(); }
  function deferDisconnect(id) {
    const p = player(id); if (!p || !p.token) return;
    const old = pendingRejoins.get(p.token); if (old) clearTimeout(old.timer);
    pendingRejoins.set(p.token, { oldPeerId: id, timer: setTimeout(() => { pendingRejoins.delete(p.token); $('disconnect').textContent = p.name + 'さんが切断しました。残りの参加者で続けます。'; }, REJOIN_GRACE_MS) });
    $('disconnect').textContent = p.name + 'さんの再接続を30秒待っています。';
  }
  function handleRejoin(id, data) {
    const p = roster.find((x) => x.token === data.token);
    if (phase === 'lobby' || !p || !data.rejoinRequestId) { net.sendTo(id, { type: 'rejoin-rejected' }); return; }
    const pending = pendingRejoins.get(data.token); if (pending) clearTimeout(pending.timer); pendingRejoins.delete(data.token);
    const oldId = p.id;
    if (oldId !== id) { replaceId(oldId, id); net.broadcast({ type: 'peer-id-changed', oldId, newId: id }); broadcastRoster(); }
    net.sendTo(id, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode });
    net.sendTo(id, snapshot());
    renderRoster();
    $('disconnect').textContent = '';
  }

  // --- メッセージ受信(ゲスト) ---
  function receive(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'roster') { roster = data.players || []; renderRoster(); }
    else if (data.type === 'join-ack' && data.joinRequestId === joinRequestId) RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName });
    else if (data.type === 'rejoin-ack' && data.rejoinRequestId === rejoinRequestId) RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName });
    else if (data.type === 'room-full' || data.type === 'game-in-progress') { const message = data.type === 'room-full' ? 'この部屋は満員です。' : 'ゲームはすでに始まっています。'; if (net && net.destroy) net.destroy(); showSetup(); error(message); }
    else if (data.type === 'rejoin-rejected') { RejoinStorage.clear(GAME_KEY); if (net && net.destroy) net.destroy(); showSetup(); error('再参加できませんでした。もう一度参加してください。'); }
    else if (data.type === 'start-game') applyStart(data);
    else if (data.type === 'player-action') { if (data.id === myId) return; applyRemoteAction(data.id, data.action, data.at); }
    else if (data.type === 'player-status') { if (data.id === myId) return; applyStatus(data); renderLives(); updateControlsEnabled(); }
    else if (data.type === 'run-end') showResult(data);
    else if (data.type === 'peer-id-changed') { replaceId(data.oldId, data.newId); renderRoster(); }
    else if (data.type === 'state-snapshot') applySnapshot(data);
  }
  function connectGuest(session) {
    const rejoining = !!session;
    myName = rejoining ? session.name : myName;
    roomCode = (rejoining ? session.roomCode : roomCode).toUpperCase();
    guestToken = rejoining ? session.token : RejoinStorage.newToken();
    joinRequestId = rejoining ? null : RejoinStorage.newToken();
    rejoinRequestId = rejoining ? RejoinStorage.newToken() : null;
    $('host').disabled = true; $('join').disabled = true;
    net = EscapeRunNet.joinRoom(roomCode, {
      onOwnId(id) { myId = id; },
      onConnected(connection) {
        conn = connection;
        conn.send(rejoining ? { type: 'rejoin', token: guestToken, name: myName, rejoinRequestId } : { type: 'join', name: myName, token: guestToken, joinRequestId });
        if (!rejoining) { enter('lobby'); $('status').textContent = 'ホストの開始を待っています。'; startLobbySync(); }
      },
      onMessage: receive,
      onDisconnected() { if (phase === 'lobby') error('ホストとの接続が切れました。'); else $('disconnect').textContent = 'ホストとの接続が切れました。ページを再読み込みすると再接続を試みます。'; },
      onError(err) { if (rejoining && err && err.type === 'peer-unavailable') { RejoinStorage.clear(GAME_KEY); if (net && net.destroy) net.destroy(); showSetup(); } error(PeerErrors.describe(err)); },
      onConnectionHealthChange(healthy) { $('connection-health').classList.toggle('hidden', healthy); },
    });
  }

  // --- ホスト ---
  $('host').addEventListener('click', () => {
    myName = $('name').value.trim().slice(0, 10);
    if (!myName) return error('ニックネームを入力してください。');
    isHost = true; myId = HOST_ID;
    roster = [{ id: HOST_ID, name: myName, token: null, joinOrder: 1 }];
    net = EscapeRunNet.hostRoom({
      onCode(code) { roomCode = code; WakeLockHelper.enable(); $('room-code').textContent = code; $('host-code').classList.remove('hidden'); $('status').textContent = '参加者を待っています。'; enter('lobby'); renderRoster(); },
      onPeerMessage(id, data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'join') {
          if (phase !== 'lobby') return net.sendTo(id, { type: 'game-in-progress' });
          if (EscapeRunLogic.hasMaxPlayers(roster)) return net.sendTo(id, { type: 'room-full' });
          const name = String(data.name || '').trim().slice(0, 10);
          if (!name || typeof data.token !== 'string' || !data.token || typeof data.joinRequestId !== 'string' || roster.some((p) => p.token === data.token)) return net.sendTo(id, { type: 'rejoin-rejected' });
          roster = EscapeRunLogic.addPlayer(roster, { id, name, token: data.token, joinOrder: roster.length + 1 });
          renderRoster(); broadcastRoster();
          net.sendTo(id, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode });
        } else if (data.type === 'rejoin') handleRejoin(id, data);
        else if (data.type === 'player-action') { if (phase !== 'playing' || !player(id)) return; applyRemoteAction(id, data.action, data.at); net.broadcast({ type: 'player-action', id, action: data.action, at: data.at }); }
        else if (data.type === 'player-status' && data.id === id) { if (phase !== 'playing' || !player(id)) return; applyStatus(data); net.broadcast({ type: 'player-status', id: data.id, lives: data.lives, status: data.status, stunUntil: data.stunUntil, hits: data.hits }); }
        else if (data.type === 'sync-request') { if (phase === 'lobby') net.sendTo(id, { type: 'roster', players: publicRoster() }); else if (player(id)) net.sendTo(id, snapshot()); }
      },
      onPeerDisconnected(id) { if (phase === 'lobby' || phase === 'result') { roster = EscapeRunLogic.removePlayer(roster, id); renderRoster(); broadcastRoster(); } else if (phase === 'playing') deferDisconnect(id); },
      onError(err) { error(PeerErrors.describe(err)); },
      onConnectionHealthChange(id, healthy) { $('connection-health').classList.toggle('hidden', healthy); },
    });
  });
  $('join').addEventListener('click', () => {
    myName = $('name').value.trim().slice(0, 10);
    roomCode = $('code').value.trim();
    if (!myName) return error('ニックネームを入力してください。');
    if (roomCode.length !== 6) return error('6桁のルームコードを入力してください。');
    connectGuest(null);
  });

  // --- 操作系イベント ---
  $('jump-btn').addEventListener('click', () => { if (phase === 'playing') startJump(); });
  $('duck-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); if (phase === 'playing') startDuck(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((evt) => $('duck-btn').addEventListener(evt, () => { if (phase === 'playing') endDuck(); }));
  document.addEventListener('keydown', (e) => {
    if (phase !== 'playing') return;
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); startJump(); }
    else if (e.code === 'ArrowDown' && !e.repeat) { e.preventDefault(); startDuck(); }
  });
  document.addEventListener('keyup', (e) => { if (e.code === 'ArrowDown') endDuck(); });

  $('copy').addEventListener('click', () => navigator.clipboard && navigator.clipboard.writeText(roomCode));
  $('start').addEventListener('click', hostStartGame);
  $('again').addEventListener('click', hostStartGame);
  $('quit').addEventListener('click', () => {
    clearPending(); stopGameLoop(); stopLobbySync(); WakeLockHelper.disable(); RejoinStorage.clear(GAME_KEY);
    location.reload();
  });

  const saved = RejoinStorage.load(GAME_KEY);
  if (saved && saved.roomCode && saved.token && saved.name) connectGuest(saved);
})();
