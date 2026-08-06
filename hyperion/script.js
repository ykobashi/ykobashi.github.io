// script.js - ヒュペリオン UIロジック(DOM操作・入力ハンドリング・オンライン対戦の配線)
(function () {
  'use strict';

  const L = window.HyperionLogic;
  const $ = (id) => document.getElementById(id);
  const HOST_ID = 'host';
  const GAME_KEY = 'hyperion';
  const REJOIN_GRACE_MS = 30000;
  const CPU_THINK_MS = 650;
  const PIECE_GLYPH = { abrashimovich: '王', zafu: '座', hei: '兵' };

  const screens = ['setup-screen', 'seat-config-screen', 'lobby-panel', 'game-area'];
  function showOnly(id) { screens.forEach((s) => $(s).classList.toggle('hidden', s !== id)); }
  function showError(id, text) { $(id).textContent = text || ''; }
  function setGameStatus(text) { $('online-connection-status').textContent = text || ''; $('online-connection-status').classList.toggle('hidden', !text); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  let mode = null; // 'local' | 'online'
  let isHost = false;
  let myId = null;
  let myName = '';
  let net = null;
  let conn = null;
  let roomCode = '';
  let roster = []; // ホスト専用: [{id, name, token}]
  let onlineSeats = L.createEmptySeats();
  let localSeats = L.createDefaultSeats();
  let matchState = null;
  let matchesWon = { A: 0, B: 0 };
  let gameId = 0;
  let lastRevision = -1;
  let guestToken = null;
  let joinRequestId = null;
  let rejoinRequestId = null;
  let cpuTimer = null;
  let selectedFrom = null;
  let legalTargets = [];
  const pendingRejoins = new Map();
  const boardCells = [];
  const savedSession = RejoinStorage.load(GAME_KEY);

  function peerError(err) {
    const target = !$('lobby-panel').classList.contains('hidden') ? 'lobby-error' : 'online-error';
    showError(target, PeerErrors.describe(err));
  }
  function setHealth(healthy) { $('connection-health').classList.toggle('hidden', healthy); }
  function seatColorClass(seatIndex) { return 'p' + (seatIndex + 1); }
  function teamLabel(team) { return team === 'B' ? 'チームB' : 'チームA'; }
  function activeSeat() { return matchState ? matchState.seats[matchState.activeSeatIndex] : null; }
  function seatName(seatIndex) { const seat = matchState && matchState.seats[seatIndex]; return seat ? seat.name : 'プレイヤー' + (seatIndex + 1); }

  // ---------- ローカル対戦: 座席設定 ----------
  function renderLocalSeats() {
    const root = $('local-seat-list'); root.innerHTML = '';
    localSeats.forEach((seat, index) => {
      const row = document.createElement('div');
      row.className = 'seat-row ' + seatColorClass(index);
      row.innerHTML = '<span class="seat-label">席' + (index + 1) + '(' + teamLabel(seat.team) + ')</span>' +
        '<input class="seat-name" maxlength="10" aria-label="席' + (index + 1) + 'の名前">' +
        '<select class="seat-kind" aria-label="席' + (index + 1) + 'の種類"><option value="human">人間</option><option value="cpu">CPU</option></select>';
      const nameInput = row.querySelector('.seat-name');
      const kindSelect = row.querySelector('.seat-kind');
      nameInput.value = seat.name;
      nameInput.placeholder = seat.kind === 'cpu' ? 'CPU' + (index + 1) : 'プレイヤー' + (index + 1);
      kindSelect.value = seat.kind;
      nameInput.addEventListener('input', () => { seat.name = nameInput.value.slice(0, 10); });
      kindSelect.addEventListener('change', () => {
        seat.kind = kindSelect.value;
        seat.playerId = seat.kind === 'cpu' ? 'cpu-local-' + index : 'local-' + index;
        if (!seat.name.trim()) seat.name = seat.kind === 'cpu' ? 'CPU' + (index + 1) : 'プレイヤー' + (index + 1);
        renderLocalSeats();
      });
      root.appendChild(row);
    });
  }
  function startLocalMatch() {
    localSeats.forEach((s, i) => { if (!s.name.trim()) s.name = s.kind === 'cpu' ? 'CPU' + (i + 1) : 'プレイヤー' + (i + 1); });
    if (!L.canStartMatch(localSeats)) { showError('local-config-error', '設定を確認してください。'); return; }
    showError('local-config-error', '');
    mode = 'local';
    matchesWon = { A: 0, B: 0 };
    beginMatch(L.createMatchState(localSeats));
  }

  // ---------- オンライン: ロビー・座席割り当て ----------
  function publicRoster() { return roster.map((p) => ({ id: p.id, name: p.name })); }
  function broadcastRoster() { if (isHost && net) net.broadcast({ type: 'roster', players: publicRoster(), seats: onlineSeats }); }
  function addPlayerToSeat(player) {
    const index = onlineSeats.findIndex((s) => s.kind === 'empty');
    if (index >= 0) onlineSeats = L.assignSeat(onlineSeats, index, 'human', player.id, player.name);
  }
  function clearSeatByPlayerId(seats, peerId) {
    const index = seats.findIndex((s) => s.playerId === peerId);
    return index >= 0 ? L.assignSeat(seats, index, 'empty', null, '') : seats;
  }
  function renderRoster() {
    $('roster-list').innerHTML = '';
    roster.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p.name + (p.id === myId ? '(あなた)' : '');
      $('roster-list').appendChild(li);
    });
    $('online-seat-controls').classList.toggle('hidden', !isHost);
    $('start-online-btn').classList.toggle('hidden', !isHost);
    if (isHost) renderOnlineSeats();
  }
  function renderOnlineSeats() {
    const root = $('online-seat-list'); root.innerHTML = '';
    onlineSeats.forEach((seat, index) => {
      const row = document.createElement('div');
      row.className = 'seat-row ' + seatColorClass(index);
      const label = document.createElement('span');
      label.className = 'seat-label';
      label.textContent = '席' + (index + 1) + '(' + teamLabel(seat.team) + ')';
      const occupant = document.createElement('select');
      occupant.setAttribute('aria-label', '席' + (index + 1) + 'の担当');
      occupant.appendChild(new Option('空席', 'empty'));
      occupant.appendChild(new Option('CPU', 'cpu'));
      roster.forEach((player) => occupant.appendChild(new Option(player.name, 'human:' + player.id)));
      occupant.value = seat.kind === 'human' ? 'human:' + seat.playerId : seat.kind;
      occupant.addEventListener('change', () => {
        if (occupant.value === 'empty') onlineSeats = L.assignSeat(onlineSeats, index, 'empty', null, '');
        else if (occupant.value === 'cpu') onlineSeats = L.assignSeat(onlineSeats, index, 'cpu', null, 'CPU' + (index + 1));
        else {
          const id = occupant.value.slice(6);
          const player = roster.find((p) => p.id === id);
          onlineSeats = L.assignSeat(onlineSeats, index, 'human', id, player ? player.name : 'ゲスト');
        }
        broadcastRoster(); renderOnlineSeats();
      });
      row.append(label, occupant);
      root.appendChild(row);
    });
    updateOnlineStart();
  }
  function updateOnlineStart() {
    const humanIds = onlineSeats.filter((s) => s.kind === 'human').map((s) => s.playerId);
    const everyoneSeated = roster.every((p) => humanIds.includes(p.id)) && new Set(humanIds).size === humanIds.length;
    $('start-online-btn').disabled = !isHost || !everyoneSeated || !L.canStartMatch(L.fillEmptySeatsWithCpu(onlineSeats));
  }

  // ---------- 盤面表示 ----------
  function buildBoardCells() {
    const boardEl = $('board');
    boardEl.innerHTML = '';
    boardCells.length = 0;
    for (let r = 0; r < L.BOARD_SIZE; r += 1) {
      const rowEls = [];
      for (let c = 0; c < L.BOARD_SIZE; c += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        cell.dataset.row = r; cell.dataset.col = c;
        cell.addEventListener('click', () => onCellClick(r, c));
        boardEl.appendChild(cell);
        rowEls.push(cell);
      }
      boardCells.push(rowEls);
    }
  }
  function isMySeatTurn() {
    if (!matchState || matchState.phase !== 'playing') return false;
    const seat = activeSeat();
    if (!seat || seat.kind !== 'human') return false;
    if (mode === 'local') return true;
    return seat.playerId === myId;
  }
  function renderBoard() {
    if (!matchState) return;
    const board = matchState.board;
    const interactive = isMySeatTurn();
    const legalSet = new Set(legalTargets.map((m) => m.to.r + ':' + m.to.c));
    for (let r = 0; r < L.BOARD_SIZE; r += 1) {
      for (let c = 0; c < L.BOARD_SIZE; c += 1) {
        const cell = boardCells[r][c];
        const piece = board[r][c];
        const isLegal = legalSet.has(r + ':' + c);
        cell.classList.toggle('selected', !!selectedFrom && selectedFrom.r === r && selectedFrom.c === c);
        cell.classList.toggle('legal-move', isLegal);
        cell.classList.toggle('has-piece', isLegal && !!piece);
        cell.classList.remove('p1', 'p2', 'p3', 'p4');
        if (piece) {
          cell.classList.add(seatColorClass(piece.seat));
          cell.textContent = PIECE_GLYPH[piece.type] || '';
          cell.setAttribute('aria-label', (r + 1) + '行' + (c + 1) + '列: ' + seatName(piece.seat) + 'の駒');
        } else {
          cell.textContent = '';
          cell.setAttribute('aria-label', (r + 1) + '行' + (c + 1) + '列: 空きマス');
        }
        cell.disabled = !interactive;
      }
    }
  }
  function selectPiece(r, c) {
    selectedFrom = { r, c };
    legalTargets = L.generateMovesForPiece(matchState.board, r, c);
    renderBoard();
  }
  function onCellClick(r, c) {
    if (!isMySeatTurn()) return;
    const seatIndex = matchState.activeSeatIndex;
    const cell = matchState.board[r][c];
    if (selectedFrom) {
      const isTarget = legalTargets.some((m) => m.to.r === r && m.to.c === c);
      if (isTarget) { const from = selectedFrom; selectedFrom = null; legalTargets = []; dispatchMove(seatIndex, from, { r, c }); return; }
      if (cell && cell.seat === seatIndex) { selectPiece(r, c); return; }
      selectedFrom = null; legalTargets = []; renderBoard(); return;
    }
    if (cell && cell.seat === seatIndex) selectPiece(r, c);
  }
  function dispatchMove(seatIndex, from, to) {
    if (mode === 'local') { applyMoveLocally(seatIndex, from, to); return; }
    const seat = activeSeat();
    if (isHost) hostHandleMove(seatIndex, seat.playerId, matchState.version, from, to);
    else if (conn && conn.open) conn.send({ type: 'move-request', gameId, version: matchState.version, seatIndex, from, to });
  }
  function applyMoveLocally(seatIndex, from, to) {
    const result = L.applyMove(matchState, seatIndex, from, to);
    if (!result.applied) return;
    matchState = result.state;
    afterStateChange();
  }

  // ---------- 手番表示・結果 ----------
  function refreshTurnUi() {
    if (!matchState) return;
    const seat = activeSeat();
    const badge = $('turn-team-badge');
    if (seat) { badge.textContent = seat.team; badge.className = 'team-badge ' + (seat.team === 'B' ? 'team-b' : 'team-a'); }
    if (!seat) { $('turn-text').textContent = ''; return; }
    if (seat.kind === 'cpu') { $('turn-text').textContent = seat.name + '(CPU)が考え中…'; return; }
    if (mode === 'local') { $('turn-text').textContent = seat.name + 'さんの番です'; return; }
    $('turn-text').textContent = seat.playerId === myId ? 'あなたの番です' : seat.name + 'さんの番です';
  }
  function afterStateChange() {
    selectedFrom = null; legalTargets = [];
    refreshTurnUi();
    renderBoard();
    if (matchState && matchState.phase === 'result') onMatchEnd();
    else scheduleCpuIfNeeded();
  }
  function onMatchEnd() {
    clearTimeout(cpuTimer); cpuTimer = null;
    if (matchState.winner) matchesWon[matchState.winner] = (matchesWon[matchState.winner] || 0) + 1;
    showResult();
  }
  function showResult() {
    const winner = matchState.winner;
    $('result-title').textContent = matchState.drawn ? '引き分けです' : teamLabel(winner) + 'の勝利!';
    const lastMove = matchState.lastMove;
    if (!matchState.drawn && lastMove && Number.isInteger(lastMove.eliminatedSeat)) {
      $('result-meta').textContent = seatName(lastMove.eliminatedSeat) + 'さんのアブラシモビッチが取られ、' + teamLabel(matchState.seats[lastMove.eliminatedSeat].team) + 'が敗北しました。';
    } else if (matchState.drawn) {
      $('result-meta').textContent = '手数の上限に達したため、残り駒の点数で引き分けとなりました。';
    } else {
      $('result-meta').textContent = '手数の上限に達したため、残り駒の点数で決着しました。';
    }
    const rows = L.buildMatchScoreboard(matchesWon, matchState.seats);
    $('result-scoreboard').innerHTML = '';
    rows.forEach((row) => {
      const li = document.createElement('li');
      li.textContent = row.rank + '位 ' + teamLabel(row.team) + '(' + row.members.join('・') + ')：' + row.score + '勝';
      $('result-scoreboard').appendChild(li);
    });
    $('play-again-btn').classList.toggle('hidden', mode === 'online' && !isHost);
    $('result-overlay').classList.remove('hidden');
  }
  function rematch() {
    if (!matchState) return;
    const seats = matchState.seats;
    const nextState = L.createMatchState(seats);
    if (mode === 'online') {
      if (!isHost) return;
      gameId += 1; lastRevision = 0;
      net.broadcast({ type: 'match-start', gameId, revision: 0, matchesWon: clone(matchesWon), matchState: clone(nextState) });
    }
    beginMatch(nextState);
  }
  function beginMatch(state) {
    matchState = clone(state);
    selectedFrom = null; legalTargets = [];
    $('result-overlay').classList.add('hidden');
    WakeLockHelper.enable();
    buildBoardCells();
    showOnly('game-area');
    afterStateChange();
  }

  // ---------- CPU ----------
  function scheduleCpuIfNeeded() {
    if (cpuTimer || !matchState || matchState.phase !== 'playing') return;
    const seat = activeSeat();
    if (!seat) return;
    const pendingGuest = mode === 'online' && isHost && seat.kind === 'human' && Array.from(pendingRejoins.values()).some((p) => p.oldPeerId === seat.playerId);
    if (seat.kind !== 'cpu' && !pendingGuest) return;
    if (mode === 'online' && !isHost) return;
    cpuTimer = setTimeout(() => {
      cpuTimer = null;
      if (!matchState || matchState.phase !== 'playing') return;
      const currentSeat = matchState.seats[matchState.activeSeatIndex];
      if (!currentSeat) return;
      const stillPendingGuest = mode === 'online' && isHost && currentSeat.kind === 'human' && Array.from(pendingRejoins.values()).some((p) => p.oldPeerId === currentSeat.playerId);
      if (currentSeat.kind !== 'cpu' && !stillPendingGuest) { scheduleCpuIfNeeded(); return; }
      const move = L.chooseCpuMove(matchState, matchState.activeSeatIndex, Math.random);
      if (!move) return;
      if (mode === 'local') applyMoveLocally(matchState.activeSeatIndex, move.from, move.to);
      else hostHandleMove(matchState.activeSeatIndex, currentSeat.playerId, matchState.version, move.from, move.to);
    }, CPU_THINK_MS);
  }

  // ---------- ホスト権威: 手の受理 ----------
  function hostHandleMove(seatIndex, playerId, version, from, to) {
    if (!isHost || !matchState || matchState.phase !== 'playing') return;
    if (!Number.isInteger(version) || version !== matchState.version) { if (playerId !== HOST_ID) net.sendTo(playerId, { type: 'move-rejected', gameId, version: matchState.version, reason: 'stale-version' }); return; }
    const seat = matchState.seats[seatIndex];
    if (!seat || seat.playerId !== playerId) { if (playerId !== HOST_ID) net.sendTo(playerId, { type: 'move-rejected', gameId, version: matchState.version, reason: 'not-your-seat' }); return; }
    const result = L.applyMove(matchState, seatIndex, from, to);
    if (!result.applied) { if (playerId !== HOST_ID) net.sendTo(playerId, { type: 'move-rejected', gameId, version: matchState.version, reason: result.reason }); return; }
    matchState = result.state;
    net.broadcast({ type: 'move-result', gameId, revision: matchState.version, matchState: clone(matchState) });
    afterStateChange();
  }
  function hostMessage(peerId, data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join') {
      if (matchState) { net.sendTo(peerId, { type: 'game-in-progress' }); return; }
      if (roster.length >= 4 || roster.some((p) => p.token === data.token)) { net.sendTo(peerId, { type: 'room-full' }); return; }
      if (typeof data.token !== 'string' || !data.token || typeof data.joinRequestId !== 'string') return;
      const name = String(data.name || 'ゲスト').trim().slice(0, 10) || 'ゲスト';
      const player = { id: peerId, name, token: data.token };
      roster.push(player);
      addPlayerToSeat(player);
      broadcastRoster(); renderRoster();
      net.sendTo(peerId, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode });
      return;
    }
    if (data.type === 'rejoin') { handleRejoin(peerId, data); return; }
    if (data.type === 'move-request') { hostHandleMove(data.seatIndex, peerId, data.version, data.from, data.to); return; }
  }

  // ---------- 再接続(必須パターン) ----------
  function replacePeerId(oldId, newId) {
    roster.forEach((p) => { if (p.id === oldId) p.id = newId; });
    onlineSeats.forEach((s) => { if (s.playerId === oldId) s.playerId = newId; });
    if (matchState) matchState.seats.forEach((s) => { if (s.playerId === oldId) s.playerId = newId; });
  }
  function snapshotFor(peerId) {
    return {
      type: 'state-snapshot', snapshotVersion: 1, gameId, revision: matchState ? matchState.version : 0,
      phase: matchState ? matchState.phase : 'lobby', roster: publicRoster(), seats: onlineSeats,
      matchState: matchState ? clone(matchState) : null, matchesWon: clone(matchesWon), peerId,
    };
  }
  function handleRejoin(peerId, data) {
    const player = roster.find((p) => p.token === data.token);
    const pending = player && pendingRejoins.get(data.token);
    if (!player || !pending || pending.oldPeerId !== player.id || typeof data.rejoinRequestId !== 'string') { net.sendTo(peerId, { type: 'rejoin-rejected' }); return; }
    clearTimeout(pending.timer); pendingRejoins.delete(data.token);
    const oldId = player.id;
    replacePeerId(oldId, peerId);
    net.broadcast({ type: 'peer-id-changed', oldId, newId: peerId });
    broadcastRoster(); renderRoster(); setGameStatus('');
    net.sendTo(peerId, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode });
    net.sendTo(peerId, snapshotFor(peerId));
    refreshTurnUi(); renderBoard();
  }
  function deferDisconnect(peerId) {
    const player = roster.find((p) => p.id === peerId);
    if (!player || !player.token) return;
    const previous = pendingRejoins.get(player.token);
    if (previous) clearTimeout(previous.timer);
    setGameStatus(player.name + 'さんの再接続を30秒待っています。手番はCPUが代打します。');
    const timer = setTimeout(() => {
      pendingRejoins.delete(player.token);
      const convert = (seats) => seats.map((s) => (s.playerId === peerId ? { ...s, kind: 'cpu', playerId: null, name: player.name + '(CPU)' } : s));
      onlineSeats = convert(onlineSeats);
      if (matchState) matchState.seats = convert(matchState.seats);
      setGameStatus(player.name + 'さんが切断しました。CPUが代打します。');
      broadcastRoster();
      afterStateChange();
    }, REJOIN_GRACE_MS);
    pendingRejoins.set(player.token, { oldPeerId: peerId, timer });
  }
  function applySnapshot(data) {
    if (data.snapshotVersion !== 1) return;
    if (data.gameId < gameId || (data.gameId === gameId && data.revision < lastRevision)) return;
    gameId = data.gameId; lastRevision = data.revision;
    roster = data.roster || roster; onlineSeats = data.seats || onlineSeats; matchesWon = data.matchesWon || matchesWon;
    if (data.peerId) myId = data.peerId;
    setGameStatus('');
    if (data.matchState && (data.phase === 'playing' || data.phase === 'result')) {
      matchState = clone(data.matchState);
      buildBoardCells();
      showOnly('game-area');
      if (data.phase === 'result') { renderBoard(); refreshTurnUi(); showResult(); }
      else afterStateChange();
    } else {
      renderRoster();
      showOnly('lobby-panel');
    }
  }

  // ---------- ゲスト側メッセージ受信 ----------
  function receive(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join-ack' && data.joinRequestId === joinRequestId) { RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName }); return; }
    if (data.type === 'rejoin-ack' && data.rejoinRequestId === rejoinRequestId) { RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName }); return; }
    if (data.type === 'rejoin-rejected') { RejoinStorage.clear(GAME_KEY); if (net && net.destroy) net.destroy(); resetSetupScreen(); showOnly('setup-screen'); showError('online-error', '再参加できませんでした。もう一度参加してください。'); return; }
    if (data.type === 'room-full' || data.type === 'game-in-progress') {
      const message = data.type === 'room-full' ? 'この部屋は満員です。' : 'ゲームはすでに始まっています。';
      if (net && net.destroy) net.destroy(); resetSetupScreen(); showOnly('setup-screen'); showError('online-error', message); return;
    }
    if (data.type === 'roster') { roster = data.players || []; onlineSeats = data.seats || onlineSeats; renderRoster(); return; }
    if (data.type === 'match-start') { gameId = data.gameId; lastRevision = data.revision || 0; matchesWon = data.matchesWon || matchesWon; beginMatch(data.matchState); return; }
    if (data.type === 'move-result') {
      if (data.gameId !== gameId || data.revision <= lastRevision) return;
      lastRevision = data.revision; matchState = clone(data.matchState); afterStateChange(); return;
    }
    if (data.type === 'move-rejected') { return; }
    if (data.type === 'peer-id-changed') { replacePeerId(data.oldId, data.newId); renderRoster(); refreshTurnUi(); renderBoard(); return; }
    if (data.type === 'state-snapshot') { applySnapshot(data); return; }
  }

  // ---------- 画面遷移・接続管理 ----------
  function resetSetupScreen() {
    $('mode-select').classList.remove('hidden');
    $('online-panel').classList.add('hidden');
    showError('online-error', '');
    $('host-btn').disabled = false; $('join-btn').disabled = false; $('join-code-input').disabled = false;
    $('host-wait').classList.add('hidden');
  }
  function resetOnlineConnection() {
    if (net && net.destroy) { try { net.destroy(); } catch (ignore) { /* noop */ } }
    if (conn) { try { conn.close(); } catch (ignore) { /* noop */ } }
    pendingRejoins.forEach((p) => clearTimeout(p.timer)); pendingRejoins.clear();
    net = null; conn = null; isHost = false; myId = null; roster = []; onlineSeats = L.createEmptySeats(); roomCode = '';
    WakeLockHelper.disable(); setHealth(true);
  }
  function quitGame(clearSession) {
    clearTimeout(cpuTimer); cpuTimer = null;
    matchState = null; selectedFrom = null; legalTargets = [];
    if (mode === 'online') resetOnlineConnection();
    if (clearSession) RejoinStorage.clear(GAME_KEY);
    mode = null;
    $('result-overlay').classList.add('hidden');
    setGameStatus('');
    resetSetupScreen();
    showOnly('setup-screen');
  }
  function connectGuest(session) {
    const rejoining = !!session;
    isHost = false; mode = 'online';
    if (rejoining) {
      myName = session.name; roomCode = session.roomCode.toUpperCase(); guestToken = session.token;
      joinRequestId = null; rejoinRequestId = RejoinStorage.newToken();
    } else {
      myName = $('name-input').value.trim().slice(0, 10);
      if (!myName) { showError('online-error', 'ニックネームを入力してください。'); return; }
      roomCode = $('join-code-input').value.trim().toUpperCase();
      if (roomCode.length !== 6) { showError('online-error', '6桁のルームコードを入力してください。'); return; }
      guestToken = RejoinStorage.newToken(); joinRequestId = RejoinStorage.newToken(); rejoinRequestId = null;
    }
    $('host-btn').disabled = true; $('join-btn').disabled = true; $('join-code-input').disabled = true;
    net = HyperionNet.joinRoom(roomCode, {
      onOwnId(id) { myId = id; },
      onConnected(connection) {
        conn = connection;
        conn.send(rejoining ? { type: 'rejoin', token: guestToken, name: myName, rejoinRequestId } : { type: 'join', name: myName, token: guestToken, joinRequestId });
        $('online-status').textContent = rejoining ? '対局へ再参加しています…' : 'ホストの開始を待っています…';
        showOnly('lobby-panel');
      },
      onMessage: receive,
      onDisconnected() {
        if (!matchState) showError('lobby-error', 'ホストとの接続が切れました。');
        else setGameStatus('ホストとの接続が切れました。ページを再読み込みすると30秒以内なら復帰できます。');
      },
      onConnectionHealthChange: setHealth,
      onError(err) {
        if (rejoining && err && err.type === 'peer-unavailable') RejoinStorage.clear(GAME_KEY);
        peerError(err);
        resetSetupScreen(); showOnly('setup-screen');
      },
    });
  }

  // ---------- イベント登録 ----------
  $('mode-local-btn').addEventListener('click', () => { localSeats = L.createDefaultSeats(); renderLocalSeats(); showOnly('seat-config-screen'); });
  $('local-back-btn').addEventListener('click', () => showOnly('setup-screen'));
  $('local-start-btn').addEventListener('click', startLocalMatch);

  $('mode-online-btn').addEventListener('click', () => { $('mode-select').classList.add('hidden'); $('online-panel').classList.remove('hidden'); });
  $('online-back-btn').addEventListener('click', () => { $('mode-select').classList.remove('hidden'); $('online-panel').classList.add('hidden'); showError('online-error', ''); });

  $('host-btn').addEventListener('click', () => {
    myName = $('name-input').value.trim().slice(0, 10);
    if (!myName) { showError('online-error', 'ニックネームを入力してください。'); return; }
    mode = 'online'; isHost = true; myId = HOST_ID;
    roster = [{ id: HOST_ID, name: myName, token: 'host' }];
    onlineSeats = L.assignSeat(L.createEmptySeats(), 0, 'human', HOST_ID, myName);
    matchState = null; matchesWon = { A: 0, B: 0 };
    $('host-btn').disabled = true; $('join-btn').disabled = true; $('join-code-input').disabled = true;
    net = HyperionNet.hostRoom({
      onCode(code) {
        roomCode = code; WakeLockHelper.enable();
        $('room-code-text').textContent = code; $('host-wait').classList.remove('hidden');
        $('online-status').textContent = '参加者を待っています…';
        showOnly('lobby-panel'); renderRoster();
      },
      onPeerMessage: hostMessage,
      onPeerDisconnected(peerId) {
        const player = roster.find((p) => p.id === peerId);
        if (!player) return;
        if (!matchState) {
          roster = roster.filter((p) => p.id !== peerId);
          onlineSeats = clearSeatByPlayerId(onlineSeats, peerId);
          broadcastRoster(); renderRoster();
        } else deferDisconnect(peerId);
      },
      onConnectionHealthChange(peerId, healthy) { setHealth(healthy); },
      onError: peerError,
    });
  });
  $('join-btn').addEventListener('click', () => connectGuest(null));
  $('copy-code-btn').addEventListener('click', () => { if (navigator.clipboard) navigator.clipboard.writeText(roomCode).then(() => { $('online-status').textContent = 'コピーしました。'; }); });
  $('leave-lobby-btn').addEventListener('click', () => quitGame(true));
  $('quit-btn').addEventListener('click', () => quitGame(true));
  $('start-online-btn').addEventListener('click', () => {
    if (!isHost) return;
    const seats = L.fillEmptySeatsWithCpu(onlineSeats);
    if (!L.canStartMatch(seats)) return;
    onlineSeats = seats;
    matchesWon = { A: 0, B: 0 };
    gameId += 1; lastRevision = 0;
    const state = L.createMatchState(seats);
    net.broadcast({ type: 'match-start', gameId, revision: 0, matchesWon: clone(matchesWon), matchState: clone(state) });
    beginMatch(state);
  });
  $('play-again-btn').addEventListener('click', rematch);

  // ---------- 初期表示 ----------
  showOnly('setup-screen');
  if (savedSession && savedSession.roomCode && savedSession.token && savedSession.name) connectGuest(savedSession);
})();
