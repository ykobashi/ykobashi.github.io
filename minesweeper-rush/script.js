(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const HOST_ID = 'host', GAME_KEY = 'minesweeper-rush', REJOIN_GRACE_MS = 30000;
  let isHost = false, myId = null, myName = '', roomCode = '', net = null, conn = null;
  let roster = [], phase = 'lobby', difficultyKey = 'small', canonicalBoard = null, viewBoard = null, scores = {}, frozen = {};
  let gameId = 0, revision = 0, lastRevision = -1, guestToken = null, joinRequestId = null, rejoinRequestId = null, freezeTimer = null, lastFreezeState = null;
  let localFlags = new Set(), flagMode = false, highlightedCell = null, boardPointer = null, lobbySyncTimer = null;
  const pendingRejoins = new Map();
  const LOBBY_SYNC_INTERVAL_MS = 4000;
  function error(message) { $('error').textContent = message || ''; }
  function player(id) { return roster.find((p) => p.id === id); }
  function nameOf(id) { const p = player(id); return p ? p.name : '不明な参加者'; }
  function publicRoster() { return roster.map(({ id, name, joinOrder }) => ({ id, name, joinOrder })); }
  function colorClass(p) { return 'p' + Math.min(4, Math.max(1, p.joinOrder || 1)); }
  function broadcastRoster() { net.broadcast({ type: 'roster', players: publicRoster() }); }
  function enter(which) { ['setup', 'lobby', 'game', 'result'].forEach((id) => $(id).classList.toggle('hidden', id !== which)); }
  function stopLobbySync() { if (lobbySyncTimer) { clearInterval(lobbySyncTimer); lobbySyncTimer = null; } }
  function startLobbySync() {
    stopLobbySync();
    lobbySyncTimer = setInterval(() => {
      if (isHost || phase !== 'lobby' || !conn || !conn.open) { stopLobbySync(); return; }
      conn.send({ type: 'sync-request' });
    }, LOBBY_SYNC_INTERVAL_MS);
  }
  function showSetup() { isHost = false; net = null; conn = null; stopLobbySync(); $('host').disabled = false; $('join').disabled = false; enter('setup'); }
  function renderRoster() {
    $('roster').innerHTML = '';
    roster.forEach((p) => { const li = document.createElement('li'); li.className = colorClass(p); li.textContent = 'P' + p.joinOrder + '　' + p.name + (p.id === myId ? '（あなた）' : ''); $('roster').appendChild(li); });
    $('start').disabled = !isHost || !MinesweeperRushLogic.hasMinPlayers(roster);
    $('again').disabled = !isHost || !MinesweeperRushLogic.hasMinPlayers(roster);
    $('difficulty').disabled = !isHost;
  }
  function renderScores() {
    $('scores').innerHTML = '';
    roster.slice().sort((a, b) => a.joinOrder - b.joinOrder).forEach((p) => { const div = document.createElement('div'); div.className = 'score ' + colorClass(p); div.textContent = 'P' + p.joinOrder + ' ' + p.name + '：' + (scores[p.id] || 0); $('scores').appendChild(div); });
  }
  function isMine(cell) { return cell && cell.opened && cell.owner === 'mine'; }
  function cellKey(r, c) { return r + ':' + c; }
  function ensureFlagControls() {
    if ($('flag-mode')) return;
    const controls = document.createElement('div'); controls.className = 'flag-controls';
    const button = document.createElement('button'); button.id = 'flag-mode'; button.className = 'secondary-btn'; button.type = 'button'; button.setAttribute('aria-pressed', 'false');
    const count = document.createElement('span'); count.id = 'flag-count';
    const note = document.createElement('p'); note.className = 'flag-note'; note.textContent = '\u53F3\u30AF\u30EA\u30C3\u30AF\u3001\u307E\u305F\u306F\u65D7\u30E2\u30FC\u30C9\u3067\u8A2D\u7F6E\u3002\u65D7\u306F\u3042\u306A\u305F\u306B\u3060\u3051\u8868\u793A\u3055\u308C\u307E\u3059\u3002';
    controls.append(button, count); const boardScroll = $('game').querySelector('.board-scroll'); boardScroll.before(controls, note);
  }
  function updateFlagControls() {
    $('flag-mode').setAttribute('aria-pressed', String(flagMode));
    $('flag-mode').textContent = '\u{1F6A9} \u65D7\u30E2\u30FC\u30C9: ' + (flagMode ? 'ON' : 'OFF');
    $('flag-count').textContent = '\u65D7 ' + localFlags.size + '\u500B';
  }
  function toggleLocalFlag(r, c) {
    const cell = viewBoard && viewBoard[r] && viewBoard[r][c];
    if (!cell || cell.opened || phase !== 'playing' || (frozen[myId] || 0) > Date.now()) return;
    const key = cellKey(r, c);
    if (localFlags.has(key)) localFlags.delete(key); else localFlags.add(key);
    updateFlagControls(); renderBoard();
  }
  function nearestBoardCell(x, y) {
    let nearest = null, nearestDistance = Infinity;
    Array.from($('board').children).forEach((button) => {
      const rect = button.getBoundingClientRect();
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) { nearest = button; nearestDistance = distance; }
    });
    return nearest;
  }
  function boardCellFromEvent(event) {
    const directCell = event.target.closest ? event.target.closest('.cell') : null;
    return directCell || nearestBoardCell(event.clientX, event.clientY);
  }
  function setBoardHighlight(button) {
    if (highlightedCell === button) return;
    if (highlightedCell) highlightedCell.classList.remove('targeted');
    highlightedCell = button;
    if (highlightedCell) highlightedCell.classList.add('targeted');
  }
  function handleBoardPointerMove(event) {
    if (!$('board').contains(event.target)) { clearBoardHighlight(); return; }
    boardPointer = { x: event.clientX, y: event.clientY };
    setBoardHighlight(boardCellFromEvent(event));
  }
  function clearBoardHighlight() { boardPointer = null; setBoardHighlight(null); }
  function handleBoardClick(event) {
    const button = boardCellFromEvent(event);
    if (!button) return;
    const r = Number(button.dataset.row), c = Number(button.dataset.col);
    if (flagMode) toggleLocalFlag(r, c); else if (!localFlags.has(cellKey(r, c))) reveal(r, c);
  }
  function handleBoardContextMenu(event) {
    event.preventDefault();
    const button = boardCellFromEvent(event);
    if (!button) return;
    toggleLocalFlag(Number(button.dataset.row), Number(button.dataset.col));
  }
  function renderBoard() {
    const board = viewBoard; if (!board) return;
    highlightedCell = null; $('board').innerHTML = ''; $('board').style.gridTemplateColumns = 'repeat(' + board[0].length + ', var(--cell-size))';
    const frozenNow = (frozen[myId] || 0) > Date.now(); $('board').classList.toggle('is-frozen', frozenNow);
    lastFreezeState = frozenNow;
    board.forEach((row, r) => row.forEach((cell, c) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'cell'; button.dataset.row = r; button.dataset.col = c;
      if (cell.opened) button.classList.add('opened');
      if (cell.owner && cell.owner !== 'mine') { const p = player(cell.owner); if (p) button.classList.add(colorClass(p)); }
      if (isMine(cell)) { button.classList.add('mine'); button.textContent = '💣'; }
      else if (cell.opened && cell.adjacent) { button.textContent = cell.adjacent; button.classList.add('number-' + cell.adjacent); }
      else if (localFlags.has(cellKey(r, c))) { button.classList.add('flagged'); button.textContent = '\u{1F6A9}'; }
      button.disabled = cell.opened || phase !== 'playing' || frozenNow;
      button.setAttribute('aria-label', (r + 1) + '行' + (c + 1) + '列、' + (!cell.opened ? '未開放' : isMine(cell) ? '地雷' : nameOf(cell.owner) + 'さんの陣地、周囲' + cell.adjacent + '個'));
      if (!cell.opened && localFlags.has(cellKey(r, c))) button.setAttribute('aria-label', (r + 1) + '\u884C' + (c + 1) + '\u5217\u3001\u65D7');
      $('board').appendChild(button);
    }));
    if (boardPointer) setBoardHighlight(nearestBoardCell(boardPointer.x, boardPointer.y));
  }
  function updateFreezeStatus() {
    const remain = Math.max(0, (frozen[myId] || 0) - Date.now());
    $('freeze-status').textContent = remain ? '💣 地雷を踏みました。あと' + Math.ceil(remain / 1000) + '秒操作できません。' : '安全マスを早押しで自分の陣地にしよう！';
    const frozenNow = remain > 0;
    if (viewBoard && frozenNow !== lastFreezeState) {
      lastFreezeState = frozenNow;
      $('board').classList.toggle('is-frozen', frozenNow);
      Array.from($('board').children).forEach((button) => { button.disabled = button.classList.contains('opened') || phase !== 'playing' || frozenNow; });
    }
  }
  function startFreezeTimer() { if (freezeTimer) clearInterval(freezeTimer); freezeTimer = setInterval(updateFreezeStatus, 500); updateFreezeStatus(); }
  function sanitizedCell(cell) { const result = { opened: !!cell.opened, owner: cell.owner || null }; if (cell.opened && cell.owner !== 'mine') result.adjacent = cell.adjacent; return result; }
  function publicBoard(board) { return board.map((row) => row.map(sanitizedCell)); }
  function applyChanges(changes) { if (!viewBoard || !Array.isArray(changes)) return; changes.forEach((change) => { if (viewBoard[change.r] && viewBoard[change.r][change.c]) { viewBoard[change.r][change.c] = { ...viewBoard[change.r][change.c], ...change }; if (change.opened) localFlags.delete(cellKey(change.r, change.c)); } }); updateFlagControls(); }
  function compactFrozen() { Object.keys(frozen).forEach((id) => { if (frozen[id] <= Date.now()) delete frozen[id]; }); }
  function makeUpdate(changes) { compactFrozen(); return { type: 'board-update', gameId, revision: ++revision, changes, scores: { ...scores }, frozen: { ...frozen } }; }
  function applyUpdate(data, allowEqual) {
    if (data.gameId !== gameId || !Number.isInteger(data.revision) || (!allowEqual && data.revision <= lastRevision) || (allowEqual && data.revision < lastRevision)) return;
    lastRevision = data.revision; applyChanges(data.changes); scores = data.scores || {}; frozen = data.frozen || {}; renderScores(); renderBoard(); updateFreezeStatus();
  }
  function broadcastUpdate(changes) { const data = makeUpdate(changes); net.broadcast(data); applyUpdate(data); }
  function startPayload() { const d = MinesweeperRushLogic.DIFFICULTIES[difficultyKey]; return { type: 'start-game', gameId, revision, difficultyKey, rows: d.rows, cols: d.cols, roster: publicRoster(), scores: { ...scores } }; }
  function hostStartGame() {
    if (!isHost) return;
    if (net && net.peerIds) {
      const connected = new Set([HOST_ID].concat(net.peerIds()));
      const before = roster.length;
      roster = roster.filter((p) => connected.has(p.id));
      if (roster.length !== before) { renderRoster(); broadcastRoster(); }
    }
    if (!MinesweeperRushLogic.hasMinPlayers(roster)) return;
    clearPending(); gameId += 1; revision = 0; lastRevision = 0; phase = 'playing'; difficultyKey = $('difficulty').value;
    const d = MinesweeperRushLogic.DIFFICULTIES[difficultyKey]; canonicalBoard = MinesweeperRushLogic.generateBoard(d.rows, d.cols, d.mines, [Math.floor(d.rows / 2), Math.floor(d.cols / 2)]); viewBoard = MinesweeperRushLogic.createEmptyBoard(d.rows, d.cols); scores = {}; frozen = {}; roster.forEach((p) => { scores[p.id] = 0; });
    const data = startPayload(); net.broadcast(data); applyStart(data); enter('game');
  }
  function applyStart(data) {
    if (!Number.isInteger(data.gameId) || !Number.isInteger(data.rows) || !Number.isInteger(data.cols)) return;
    if (!isHost && (data.gameId < gameId || (data.gameId === gameId && data.revision <= lastRevision))) return;
    stopLobbySync();
    gameId = data.gameId; revision = data.revision || 0; lastRevision = revision; phase = 'playing'; difficultyKey = data.difficultyKey;
    if (!isHost) roster = data.roster || roster;
    scores = data.scores || {}; frozen = {}; localFlags.clear(); flagMode = false; viewBoard = MinesweeperRushLogic.createEmptyBoard(data.rows, data.cols); renderRoster(); renderScores(); updateFlagControls(); enter('game'); renderBoard(); startFreezeTimer();
    if (!isHost) RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName });
  }
  function hostHandleReveal(fromId, data) {
    if (phase !== 'playing' || data.gameId !== gameId || !player(fromId) || !Number.isInteger(data.r) || !Number.isInteger(data.c) || (frozen[fromId] || 0) > Date.now()) return;
    const cell = canonicalBoard[data.r] && canonicalBoard[data.r][data.c]; if (!cell || cell.opened) return;
    const result = MinesweeperRushLogic.claimCell(canonicalBoard, data.r, data.c, fromId);
    let changes;
    if (result.hitMine) { frozen[fromId] = Date.now() + MinesweeperRushLogic.FREEZE_MS; changes = [{ r: data.r, c: data.c, opened: true, owner: 'mine' }]; }
    else { scores[fromId] = (scores[fromId] || 0) + result.newlyOwned.length; changes = result.newlyOwned.map(({ r, c }) => ({ r, c, opened: true, owner: fromId, adjacent: canonicalBoard[r][c].adjacent })); }
    broadcastUpdate(changes);
    if (!result.hitMine && MinesweeperRushLogic.isBoardCleared(canonicalBoard)) hostEndGame();
  }
  function reveal(r, c) { if (phase !== 'playing') return; if (isHost) hostHandleReveal(myId, { gameId, r, c }); else if (conn) conn.send({ type: 'reveal', gameId, r, c }); }
  function hostEndGame() {
    if (phase !== 'playing') return;
    phase = 'result'; clearPending();
    const data = { type: 'game-over', gameId, revision: ++revision, scoreboard: MinesweeperRushLogic.buildScoreboard(scores, roster) };
    net.broadcast(data); showResult(data);
    if (net && net.peerIds) {
      const connected = new Set([HOST_ID].concat(net.peerIds()));
      roster = roster.filter((p) => connected.has(p.id));
      renderRoster(); broadcastRoster();
    }
  }
  function showResult(data) {
    if (data.gameId !== gameId || data.revision <= lastRevision) return; lastRevision = data.revision; phase = 'result'; if (freezeTimer) clearInterval(freezeTimer);
    const winners = MinesweeperRushLogic.getWinners(data.scoreboard); $('result-winner').textContent = winners.length > 1 ? '🎉 同点優勝！' : '🎉 ' + winners[0].name + 'さんの勝ち！';
    const mine = data.scoreboard.find((p) => p.id === myId); $('result-my-rank').textContent = mine ? 'あなたは' + mine.rank + '位（' + mine.score + 'マス）でした。' : '';
    $('result-scores').innerHTML = '';
    data.scoreboard.forEach((p) => { const li = document.createElement('li'); li.className = colorClass(p); li.textContent = p.rank + '位　' + p.name + '：' + p.score + 'マス'; $('result-scores').appendChild(li); }); $('again').classList.toggle('hidden', !isHost); enter('result');
  }
  function replaceId(oldId, newId) {
    if (oldId === newId) return; roster.forEach((p) => { if (p.id === oldId) p.id = newId; });
    if (Object.prototype.hasOwnProperty.call(scores, oldId)) { scores[newId] = scores[oldId]; delete scores[oldId]; }
    if (Object.prototype.hasOwnProperty.call(frozen, oldId)) { frozen[newId] = frozen[oldId]; delete frozen[oldId]; }
    [canonicalBoard, viewBoard].filter(Boolean).forEach((board) => board.forEach((row) => row.forEach((cell) => { if (cell.owner === oldId) cell.owner = newId; })));
  }
  function snapshot() { return { type: 'state-snapshot', snapshotVersion: 1, gameId, revision, phase, difficultyKey, roster: publicRoster(), scores: { ...scores }, frozen: { ...frozen }, board: publicBoard(canonicalBoard) }; }
  function applySnapshot(data) {
    if (data.snapshotVersion !== 1 || !Array.isArray(data.board) || !Number.isInteger(data.gameId) || !Number.isInteger(data.revision) || data.gameId < gameId || (data.gameId === gameId && data.revision < lastRevision)) return;
    stopLobbySync();
    gameId = data.gameId; lastRevision = data.revision; revision = Math.max(revision, data.revision); phase = data.phase; difficultyKey = data.difficultyKey; roster = data.roster || []; scores = data.scores || {}; frozen = data.frozen || {}; localFlags.clear(); flagMode = false; viewBoard = data.board; renderRoster(); renderScores(); updateFlagControls(); enter(phase === 'playing' ? 'game' : 'result'); renderBoard(); startFreezeTimer();
  }
  function clearPending() { pendingRejoins.forEach((value) => clearTimeout(value.timer)); pendingRejoins.clear(); }
  function deferDisconnect(id) {
    const p = player(id); if (!p || !p.token) return; const old = pendingRejoins.get(p.token); if (old) clearTimeout(old.timer);
    pendingRejoins.set(p.token, { oldPeerId: id, timer: setTimeout(() => { pendingRejoins.delete(p.token); $('disconnect').textContent = p.name + 'さんが切断しました。残りの参加者でゲームを続けます。'; }, REJOIN_GRACE_MS) }); $('disconnect').textContent = p.name + 'さんの再接続を30秒待っています。';
  }
  function handleRejoin(id, data) {
    const p = roster.find((x) => x.token === data.token);
    if (phase !== 'playing' || !p || !data.rejoinRequestId) { net.sendTo(id, { type: 'rejoin-rejected' }); return; }
    const pending = pendingRejoins.get(data.token); if (pending && pending.timer) clearTimeout(pending.timer); pendingRejoins.delete(data.token);
    const oldId = p.id;
    if (oldId !== id) {
      // tokenは本人とホストだけが持つため、一致する新Peer IDを先に復帰させ、旧IDはrosterガードで無効化する。
      replaceId(oldId, id); const event = { type: 'peer-id-changed', gameId, revision: ++revision, oldId, newId: id }; net.broadcast(event); broadcastRoster();
    }
    net.sendTo(id, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode }); net.sendTo(id, snapshot()); renderRoster(); renderScores(); renderBoard();
  }
  function receive(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'roster') { roster = data.players || []; renderRoster(); renderScores(); }
    else if (data.type === 'join-ack' && data.joinRequestId === joinRequestId) { RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName }); }
    else if (data.type === 'rejoin-ack' && data.rejoinRequestId === rejoinRequestId) RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName });
    else if (data.type === 'room-full' || data.type === 'game-in-progress') { const message = data.type === 'room-full' ? 'この部屋は満員です。' : 'ゲームはすでに始まっています。'; if (net && net.destroy) net.destroy(); showSetup(); error(message); }
    else if (data.type === 'rejoin-rejected') { RejoinStorage.clear(GAME_KEY); if (net && net.destroy) net.destroy(); showSetup(); error('再参加できませんでした。もう一度参加してください。'); }
    else if (data.type === 'start-game') applyStart(data);
    else if (data.type === 'board-update') applyUpdate(data);
    else if (data.type === 'peer-id-changed' && data.gameId === gameId && data.revision > lastRevision) { lastRevision = data.revision; replaceId(data.oldId, data.newId); renderRoster(); renderScores(); renderBoard(); }
    else if (data.type === 'state-snapshot') applySnapshot(data);
    else if (data.type === 'game-over') showResult(data);
  }
  function connectGuest(session) {
    const rejoining = !!session; myName = rejoining ? session.name : myName; roomCode = (rejoining ? session.roomCode : roomCode).toUpperCase(); guestToken = rejoining ? session.token : RejoinStorage.newToken(); joinRequestId = rejoining ? null : RejoinStorage.newToken(); rejoinRequestId = rejoining ? RejoinStorage.newToken() : null;
    $('host').disabled = true; $('join').disabled = true; net = MinesweeperRushNet.joinRoom(roomCode, { onOwnId(id) { myId = id; }, onConnected(connection) { conn = connection; conn.send(rejoining ? { type: 'rejoin', token: guestToken, name: myName, rejoinRequestId } : { type: 'join', name: myName, token: guestToken, joinRequestId }); if (!rejoining) { enter('lobby'); $('status').textContent = 'ホストの開始を待っています。'; startLobbySync(); } }, onMessage: receive, onDisconnected() { if (phase === 'lobby') error('ホストとの接続が切れました。'); else $('disconnect').textContent = 'ホストとの接続が切れました。ページを再読み込みすると再接続を試みます。'; }, onError(err) { if (rejoining && err && err.type === 'peer-unavailable') { RejoinStorage.clear(GAME_KEY); if (net && net.destroy) net.destroy(); showSetup(); } error(PeerErrors.describe(err)); }, onConnectionHealthChange(healthy) { $('connection-health').classList.toggle('hidden', healthy); } });
  }
  $('host').addEventListener('click', () => {
    myName = $('name').value.trim().slice(0, 10); if (!myName) return error('ニックネームを入力してください。'); isHost = true; myId = HOST_ID; roster = [{ id: HOST_ID, name: myName, token: null, joinOrder: 1 }];
    net = MinesweeperRushNet.hostRoom({ onCode(code) { roomCode = code; WakeLockHelper.enable(); $('room-code').textContent = code; $('host-code').classList.remove('hidden'); $('status').textContent = '参加者を待っています。'; enter('lobby'); renderRoster(); }, onPeerMessage(id, data) { if (!data || typeof data !== 'object') return; if (data.type === 'join') { if (phase !== 'lobby') return net.sendTo(id, { type: 'game-in-progress' }); if (MinesweeperRushLogic.hasMaxPlayers(roster)) return net.sendTo(id, { type: 'room-full' }); const name = String(data.name || '').trim().slice(0, 10); if (!name || typeof data.token !== 'string' || !data.token || typeof data.joinRequestId !== 'string' || roster.some((p) => p.token === data.token)) return net.sendTo(id, { type: 'rejoin-rejected' }); roster = MinesweeperRushLogic.addPlayer(roster, { id, name, token: data.token, joinOrder: roster.length + 1 }); renderRoster(); broadcastRoster(); net.sendTo(id, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode }); } else if (data.type === 'rejoin') handleRejoin(id, data); else if (data.type === 'reveal') hostHandleReveal(id, data); else if (data.type === 'sync-request') { if (phase === 'lobby') net.sendTo(id, { type: 'roster', players: publicRoster() }); else if (player(id)) net.sendTo(id, snapshot()); } }, onPeerDisconnected(id) { if (phase === 'lobby' || phase === 'result') { roster = MinesweeperRushLogic.removePlayer(roster, id); renderRoster(); broadcastRoster(); } else if (phase === 'playing') deferDisconnect(id); }, onError(err) { error(PeerErrors.describe(err)); }, onConnectionHealthChange(id, healthy) { $('connection-health').classList.toggle('hidden', healthy); } });
  });
  $('join').addEventListener('click', () => { myName = $('name').value.trim().slice(0, 10); roomCode = $('code').value.trim(); if (!myName) return error('ニックネームを入力してください。'); if (roomCode.length !== 6) return error('6桁のルームコードを入力してください。'); connectGuest(null); });
  ensureFlagControls(); updateFlagControls(); document.addEventListener('pointermove', handleBoardPointerMove); $('board').addEventListener('pointerleave', clearBoardHighlight); $('board').addEventListener('click', handleBoardClick); $('board').addEventListener('contextmenu', handleBoardContextMenu);
  $('copy').addEventListener('click', () => navigator.clipboard && navigator.clipboard.writeText(roomCode)); $('start').addEventListener('click', hostStartGame); $('again').addEventListener('click', hostStartGame); $('flag-mode').addEventListener('click', () => { if (phase !== 'playing') return; flagMode = !flagMode; updateFlagControls(); }); $('quit').addEventListener('click', () => { clearPending(); if (freezeTimer) clearInterval(freezeTimer); WakeLockHelper.disable(); RejoinStorage.clear(GAME_KEY); location.reload(); });
  const saved = RejoinStorage.load(GAME_KEY); if (saved && saved.roomCode && saved.token && saved.name) connectGuest(saved);
})();
