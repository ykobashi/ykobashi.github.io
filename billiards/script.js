(function () {
  'use strict';

  const L = window.BilliardsLogic;
  const $ = (id) => document.getElementById(id);
  const HOST_ID = 'host';
  const GAME_KEY = 'billiards';
  const REJOIN_GRACE_MS = 30000;
  const CPU_THINK_MS = 650;
  const TABLE_W = Number(L.TABLE_W) || 1000;
  const TABLE_H = Number(L.TABLE_H) || 500;
  const BALL_R = Number(L.BALL_R) || 12;
  const FIXED_DT = Number(L.FIXED_DT) || 1 / 240;
  const MAX_POWER = Number(L.MAX_POWER) || 1000;

  const canvas = $('table-canvas');
  const ctx = canvas.getContext('2d');
  let mode = null;
  let matchState = null;
  let freeTable = null;
  let animation = null;
  let authorityAfterAnimation = null;
  let controlsLocked = false;
  let aimAngle = Math.PI;
  let aimPower = 55;
  let pointerDrag = null;
  let cpuTimer = null;
  let frameId = null;

  let isHost = false;
  let myId = null;
  let myName = '';
  let net = null;
  let conn = null;
  let roomCode = '';
  let roster = [];
  let onlineSeats = Array(4).fill(null);
  let guestToken = null;
  let joinRequestId = null;
  let savedSession = RejoinStorage.load(GAME_KEY);
  const pendingRejoins = new Map();

  let localCount = 2;
  let localSeats = [];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function showOnly(id) {
    ['setup-screen', 'seat-config-screen', 'lobby-panel', 'table-screen', 'final-result-screen'].forEach((screenId) => $(screenId).classList.toggle('hidden', screenId !== id));
  }
  function showError(id, text) { $(id).textContent = text || ''; }
  function peerError(err) {
    console.error(err);
    showError(mode === 'online' && !$('lobby-panel').classList.contains('hidden') ? 'lobby-error' : 'online-error', PeerErrors.describe(err));
  }
  function setHealth(healthy) { $('connection-health').classList.toggle('hidden', healthy); }
  function currentTable() { return animation ? animation.table : (matchState ? matchState.table : freeTable); }
  function cueBall(table) { return table && Array.isArray(table.balls) ? table.balls.find((b) => !b.pocketed && (b.id === 0 || b.id === 'cue')) : null; }
  function activeSeatIndex(state) { return state && Number.isInteger(state.activeSeatIndex) ? state.activeSeatIndex : 0; }
  function activeSeat(state) { return state && Array.isArray(state.seats) ? state.seats[activeSeatIndex(state)] : null; }
  function seatName(seat) { return seat ? (seat.name || (seat.kind === 'cpu' ? 'CPU' : 'プレイヤー')) : 'プレイヤー'; }
  function sideLabel(side) { return side === 'B' ? '陣営B' : '陣営A'; }
  function groupLabel(group) { return group === 'solid' || group === 'solids' ? 'ソリッド' : group === 'stripe' || group === 'stripes' ? 'ストライプ' : '未確定'; }
  function normalizeAngle(value) { const twoPi = Math.PI * 2; return ((value % twoPi) + twoPi) % twoPi; }

  function resetOnline() {
    if (net && typeof net.destroy === 'function') { try { net.destroy(); } catch (ignore) { /* noop */ } }
    if (conn) { try { conn.close(); } catch (ignore) { /* noop */ } }
    pendingRejoins.forEach((entry) => clearTimeout(entry.timer));
    pendingRejoins.clear(); net = null; conn = null; isHost = false; myId = null; roster = []; onlineSeats = Array(4).fill(null); roomCode = '';
    WakeLockHelper.disable(); setHealth(true);
  }
  function quitGame(clearSession) {
    clearTimeout(cpuTimer); cpuTimer = null; cancelPointerDrag(); controlsLocked = false; animation = null; authorityAfterAnimation = null;
    if (frameId !== null) cancelAnimationFrame(frameId); frameId = null;
    if (mode === 'online') resetOnline();
    if (clearSession) RejoinStorage.clear(GAME_KEY);
    mode = null; matchState = null; freeTable = null; showOnly('setup-screen');
    $('mode-select').classList.remove('hidden'); $('online-setup').classList.add('hidden');
  }

  let cpuIdCounter = 0;
  function makeSeat(kind, playerId, name, side) { return { kind, playerId: playerId || (kind === 'cpu' ? 'cpu-seat-' + (++cpuIdCounter) : null), name: String(name || (kind === 'cpu' ? 'CPU' : 'プレイヤー')).slice(0, 10), side: side === 'B' ? 'B' : 'A' }; }
  function assignSeatSafe(seats, index, seat) {
    if (typeof L.assignSeat === 'function') {
      try { return L.assignSeat(seats, index, seat.kind, seat.playerId, seat.name, seat.side); } catch (ignore) { /* fallback */ }
    }
    const next = seats.slice(); next[index] = seat; return next;
  }
  function autoSides(count) {
    if (typeof L.autoSplitTeams === 'function') {
      try {
        const split = L.autoSplitTeams(count);
        if (Array.isArray(split)) return Array.from({ length: count }, (_, i) => split[i] && split[i].side ? split[i].side : (i % 2 ? 'B' : 'A'));
      } catch (ignore) { /* fallback */ }
    }
    return Array.from({ length: count }, (_, i) => i % 2 ? 'B' : 'A');
  }
  function canStart(seats) {
    if (seats.length < 2 || !seats.some((s) => s.side === 'A') || !seats.some((s) => s.side === 'B')) return false;
    if (typeof L.canStartMatch === 'function') { try { return !!L.canStartMatch(seats); } catch (ignore) { /* fallback */ } }
    return seats.every((s) => s && (s.kind === 'cpu' || s.playerId));
  }

  function buildLocalSeats(count) {
    const sides = autoSides(count);
    localSeats = Array.from({ length: count }, (_, i) => makeSeat(i === 1 ? 'cpu' : 'human', 'local-' + i, i === 1 ? 'CPU' : 'プレイヤー' + (i + 1), sides[i]));
    renderLocalSeats();
  }
  function renderLocalSeats() {
    const root = $('local-seat-list'); root.innerHTML = '';
    localSeats.forEach((seat, index) => {
      const row = document.createElement('div'); row.className = 'seat-row';
      row.innerHTML = '<span class="seat-label">席' + (index + 1) + '</span><input class="seat-name" maxlength="10" aria-label="席' + (index + 1) + 'の名前"><select class="seat-kind" aria-label="席' + (index + 1) + 'の種類"><option value="human">人間</option><option value="cpu">CPU</option></select><select class="seat-side" aria-label="席' + (index + 1) + 'の陣営"><option value="A">陣営A</option><option value="B">陣営B</option></select>';
      const name = row.querySelector('.seat-name'); const kind = row.querySelector('.seat-kind'); const side = row.querySelector('.seat-side');
      name.value = seat.name; kind.value = seat.kind; side.value = seat.side;
      name.addEventListener('input', () => { seat.name = name.value.slice(0, 10); });
      kind.addEventListener('change', () => { seat.kind = kind.value; seat.playerId = kind.value === 'cpu' ? 'cpu-local-' + index : 'local-' + index; if (kind.value === 'cpu' && !name.value.trim()) { name.value = 'CPU'; seat.name = 'CPU'; } });
      side.addEventListener('change', () => { seat.side = side.value; }); root.appendChild(row);
    });
  }
  function applyLocalAutoTeams() { const sides = autoSides(localSeats.length); localSeats.forEach((seat, i) => { seat.side = sides[i]; }); renderLocalSeats(); }

  function publicRoster() { return roster.map((p) => ({ id: p.id, name: p.name })); }
  function publicSeats() { return onlineSeats.map((s) => s ? { kind: s.kind, playerId: s.playerId || null, name: s.name, side: s.side } : null); }
  function broadcastRoster() { if (isHost && net) net.broadcast({ type: 'roster', players: publicRoster(), seats: publicSeats(), hostId: HOST_ID }); }
  function addPlayerToSeat(player) {
    const index = onlineSeats.findIndex((seat) => !seat);
    if (index >= 0) onlineSeats = assignSeatSafe(onlineSeats, index, makeSeat('human', player.id, player.name, index % 2 ? 'B' : 'A'));
  }
  function renderRoster() {
    $('roster-list').innerHTML = '';
    roster.forEach((player) => { const li = document.createElement('li'); li.textContent = player.name + (player.id === myId ? '（あなた）' : ''); $('roster-list').appendChild(li); });
    $('online-seat-controls').classList.toggle('hidden', !isHost); $('start-online-btn').classList.toggle('hidden', !isHost);
    if (isHost) renderOnlineSeats();
  }
  function renderOnlineSeats() {
    const root = $('online-seat-list'); root.innerHTML = '';
    onlineSeats.forEach((seat, index) => {
      const row = document.createElement('div'); row.className = 'seat-row';
      const occupant = document.createElement('select'); occupant.className = 'seat-name'; occupant.setAttribute('aria-label', '席' + (index + 1) + 'の担当');
      occupant.appendChild(new Option('空席', 'empty')); occupant.appendChild(new Option('CPU', 'cpu'));
      roster.forEach((player) => occupant.appendChild(new Option(player.name, 'human:' + player.id)));
      occupant.value = seat ? (seat.kind === 'cpu' ? 'cpu' : 'human:' + seat.playerId) : 'empty';
      const side = document.createElement('select'); side.className = 'seat-side'; side.innerHTML = '<option value="A">陣営A</option><option value="B">陣営B</option>'; side.value = seat ? seat.side : (index % 2 ? 'B' : 'A');
      occupant.addEventListener('change', () => {
        if (occupant.value === 'empty') onlineSeats[index] = null;
        else if (occupant.value === 'cpu') onlineSeats = assignSeatSafe(onlineSeats, index, makeSeat('cpu', null, 'CPU ' + (index + 1), side.value));
        else { const id = occupant.value.slice(6); const player = roster.find((p) => p.id === id); onlineSeats = assignSeatSafe(onlineSeats, index, makeSeat('human', id, player ? player.name : 'ゲスト', side.value)); }
        broadcastRoster(); renderOnlineSeats(); updateOnlineStart();
      });
      side.addEventListener('change', () => { if (onlineSeats[index]) onlineSeats[index].side = side.value; broadcastRoster(); updateOnlineStart(); });
      const label = document.createElement('span'); label.className = 'seat-label'; label.textContent = '席' + (index + 1);
      const kind = document.createElement('span'); kind.className = 'status seat-kind'; kind.textContent = seat && seat.kind === 'cpu' ? 'CPU' : '担当';
      row.append(label, occupant, kind, side); root.appendChild(row);
    });
    updateOnlineStart();
  }
  function updateOnlineStart() {
    const active = onlineSeats.filter(Boolean);
    const humanIds = active.filter((s) => s.kind === 'human').map((s) => s.playerId);
    const assignedAll = roster.every((p) => humanIds.includes(p.id)) && new Set(humanIds).size === humanIds.length;
    $('start-online-btn').disabled = !assignedAll || !canStart(active);
  }

  function newRack() { return L.createBreakLayout(Math.random); }
  function createMatch(seats, oldScore) {
    const next = L.createMatchState(clone(seats), newRack());
    if (oldScore && next && next.racksWon) next.racksWon = clone(oldScore);
    return next;
  }
  function beginMatch(state) {
    matchState = clone(state); freeTable = null; animation = null; authorityAfterAnimation = null; controlsLocked = false;
    showOnly('table-screen'); $('rerack-btn').classList.add('hidden'); WakeLockHelper.enable(); startRenderLoop(); refreshGameUi();
  }
  function beginFreePlay() {
    mode = 'free'; matchState = null; freeTable = newRack(); animation = null; authorityAfterAnimation = null; controlsLocked = false;
    showOnly('table-screen'); $('rerack-btn').classList.remove('hidden'); WakeLockHelper.enable(); startRenderLoop(); refreshGameUi();
  }

  function isGameOver(state) {
    if (!state) return false;
    if (typeof L.isGameOver === 'function') { try { return !!L.isGameOver(state); } catch (ignore) { /* fallback */ } }
    return state.phase === 'game-over' || state.phase === 'rack-over' || state.phase === 'result';
  }
  function myTurn() {
    if (mode === 'free' || mode === 'local' || mode === 'cpu') return true;
    const seat = activeSeat(matchState); return !!seat && seat.kind === 'human' && seat.playerId === myId;
  }
  function inputAllowed() { return !controlsLocked && !animation && !isGameOver(matchState) && myTurn() && (!matchState || activeSeat(matchState).kind !== 'cpu'); }
  function refreshGameUi() {
    const seat = activeSeat(matchState);
    if (mode === 'free') { $('turn-text').textContent = 'フリープレイ'; $('group-text').textContent = '好きなショットを試せます'; }
    else if (seat) {
      const mine = mode === 'online' && seat.playerId === myId;
      $('turn-text').textContent = seat.kind === 'cpu' ? seatName(seat) + ' が考え中…' : (mine ? 'あなたの番です' : seatName(seat) + ' の番です');
      const groups = matchState.sideGroups || {}; $('group-text').textContent = sideLabel(seat.side) + '・' + groupLabel(groups[seat.side]);
    }
    const ballInHand = !!(matchState && matchState.ballInHand);
    $('foul-status').classList.toggle('hidden', !ballInHand);
    if (ballInHand) $('foul-status').textContent = 'ボールインハンド：台上の重ならない位置をクリックして手球を置いてください。';
    $('shoot-btn').disabled = !inputAllowed() || ballInHand;
    $('power-slider').disabled = !inputAllowed() || ballInHand;
    $('angle-left-btn').disabled = !inputAllowed() || ballInHand; $('angle-right-btn').disabled = !inputAllowed() || ballInHand;
    if (!animation && !isGameOver(matchState)) scheduleCpuIfNeeded();
  }

  function drawBall(ball, isTarget) {
    if (ball.pocketed) return;
    const id = Number(ball.id); const cue = ball.id === 'cue' || id === 0;
    const colors = ['#fff','#f0c419','#245ac4','#d52f2f','#6c3ba5','#e46c1a','#25854a','#7d271f','#111','#f0c419','#245ac4','#d52f2f','#6c3ba5','#e46c1a','#25854a','#7d271f'];
    const color = colors[id] || '#ddd';
    ctx.save(); ctx.translate(ball.x, ball.y);
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.fillStyle = cue || id >= 9 ? '#fff' : color; ctx.fill();
    if (id >= 9) {
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, BALL_R - .5, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = color; ctx.fillRect(-BALL_R, -BALL_R * .42, BALL_R * 2, BALL_R * .84); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.strokeStyle = '#111b'; ctx.lineWidth = 1.4; ctx.stroke();
    if (!cue) { ctx.beginPath(); ctx.arc(0, 0, BALL_R * .46, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.fillStyle = '#111'; ctx.font = 'bold ' + Math.max(8, BALL_R * .7) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(id), 0, .5); }
    if (isTarget) {
      ctx.beginPath(); ctx.arc(0, -BALL_R - 6, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd76a'; ctx.fill(); ctx.strokeStyle = '#5b4300'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
  function renderTable() {
    const sx = canvas.width / TABLE_W; const sy = canvas.height / TABLE_H;
    ctx.setTransform(sx, 0, 0, sy, 0, 0); ctx.clearRect(0, 0, TABLE_W, TABLE_H);
    const gradient = ctx.createRadialGradient(TABLE_W / 2, TABLE_H / 2, 10, TABLE_W / 2, TABLE_H / 2, TABLE_W * .7); gradient.addColorStop(0, '#16966d'); gradient.addColorStop(1, '#076347'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, TABLE_W, TABLE_H);
    ctx.strokeStyle = '#d8b36a55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(TABLE_W * .25, BALL_R * 2); ctx.lineTo(TABLE_W * .25, TABLE_H - BALL_R * 2); ctx.stroke();
    const pockets = Array.isArray(L.POCKETS) ? L.POCKETS : [{x:0,y:0},{x:TABLE_W/2,y:0},{x:TABLE_W,y:0},{x:0,y:TABLE_H},{x:TABLE_W/2,y:TABLE_H},{x:TABLE_W,y:TABLE_H}];
    pockets.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, Number(L.POCKET_R) || BALL_R * 2, 0, Math.PI * 2); ctx.fillStyle = '#0b0b0b'; ctx.fill(); });
    const table = currentTable();
    let targetIds = new Set();
    const seat = activeSeat(matchState);
    const assignedGroup = seat && matchState && matchState.sideGroups && matchState.sideGroups[seat.side];
    const isHumanView = seat && seat.kind === 'human' && (mode !== 'online' || seat.playerId === myId);
    if (!animation && isHumanView && assignedGroup && typeof L.legalTargetBallIds === 'function') {
      try { targetIds = new Set(L.legalTargetBallIds(matchState)); } catch (ignore) { /* no target markers */ }
    }
    if (table && Array.isArray(table.balls)) table.balls.forEach((ball) => drawBall(ball, targetIds.has(Number(ball.id))));
    const cue = cueBall(table);
    if (cue && inputAllowed() && !(matchState && matchState.ballInHand)) {
      const length = 145; ctx.setLineDash([10, 7]); ctx.strokeStyle = '#fff9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cue.x, cue.y); ctx.lineTo(cue.x + Math.cos(aimAngle) * length, cue.y + Math.sin(aimAngle) * length); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#d7b57b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cue.x - Math.cos(aimAngle) * (BALL_R + 10 + aimPower * .5), cue.y - Math.sin(aimAngle) * (BALL_R + 10 + aimPower * .5)); ctx.lineTo(cue.x - Math.cos(aimAngle) * (BALL_R + 75 + aimPower * .5), cue.y - Math.sin(aimAngle) * (BALL_R + 75 + aimPower * .5)); ctx.stroke();
    }
  }
  function startRenderLoop() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    function frame(now) {
      if (animation) advanceAnimation(now);
      renderTable(); frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);
  }
  function addEvents(target, events) { if (Array.isArray(events)) events.forEach((event) => target.push(event)); }
  function startShotAnimation(table, angle, power) {
    cancelPointerDrag(); controlsLocked = true; authorityAfterAnimation = null;
    animation = { table: L.applyCueInput(clone(table), angle, power), events: [], last: null, accumulator: 0 };
    refreshGameUi();
  }
  function advanceAnimation(now) {
    if (!animation.last) animation.last = now;
    const elapsed = Math.min(.1, Math.max(0, (now - animation.last) / 1000)); animation.last = now; animation.accumulator += elapsed;
    let steps = 0;
    while (animation.accumulator >= FIXED_DT && steps < 48) {
      const result = L.stepPhysics(animation.table, FIXED_DT); animation.table = result.tableState; addEvents(animation.events, result.events); animation.accumulator -= FIXED_DT; steps += 1;
    }
    if (L.isSettled(animation.table)) finishAnimation();
  }
  function finishAnimation() {
    const ended = animation; animation = null; controlsLocked = false;
    if (mode === 'free') freeTable = ended.table;
    else if (mode === 'online') {
      if (authorityAfterAnimation) { matchState = clone(authorityAfterAnimation); authorityAfterAnimation = null; }
    } else {
      try { matchState = L.applyShotOutcome(matchState, { events: ended.events, finalState: ended.table }); } catch (err) { console.error(err); showError('game-status', 'ルール判定に失敗しました。'); }
    }
    afterStateChange();
  }
  function afterStateChange() {
    refreshGameUi();
    if (matchState && isGameOver(matchState)) showFinalResult();
  }

  function hostAcceptShot(seatIndex, playerId, version, angle, power) {
    if (!isHost || mode !== 'online' || controlsLocked || animation || !matchState || isGameOver(matchState)) return;
    const seat = activeSeat(matchState); const currentVersion = Number(matchState.version) || 0;
    if (!seat || seatIndex !== activeSeatIndex(matchState) || playerId !== seat.playerId || version !== currentVersion || !finite(angle) || !finite(power) || power <= 0 || power > MAX_POWER) return;
    const preshot = clone(matchState.table); controlsLocked = true;
    const sim = L.simulateShot(preshot, angle, power); let next = L.applyShotOutcome(matchState, { events: sim.events, finalState: sim.finalState });
    if (!finite(Number(next.version)) || Number(next.version) <= currentVersion) next.version = currentVersion + 1;
    const shot = { type: 'shot-broadcast', version: currentVersion, seatIndex, angle, power, preshotTable: preshot };
    net.broadcast(shot); startShotAnimation(preshot, angle, power); authorityAfterAnimation = clone(next);
    net.broadcast({ type: 'shot-result', version: next.version, matchState: clone(next) });
  }
  function requestShot() {
    if (!inputAllowed() || (matchState && matchState.ballInHand)) return;
    const power = MAX_POWER * (aimPower / 100);
    if (mode === 'free') { startShotAnimation(freeTable, aimAngle, power); return; }
    const seatIndex = activeSeatIndex(matchState); const seat = activeSeat(matchState); const version = Number(matchState.version) || 0;
    if (mode === 'online') {
      if (isHost) hostAcceptShot(seatIndex, seat.playerId, version, aimAngle, power);
      else if (conn && conn.open) conn.send({ type: 'shot-attempt', seatIndex, playerId: myId, version, angle: aimAngle, power });
      return;
    }
    startShotAnimation(matchState.table, aimAngle, power);
  }
  function hostPlaceCue(seatIndex, playerId, version, x, y) {
    if (!isHost || !matchState || animation || !matchState.ballInHand || !finite(x) || !finite(y) || x < BALL_R || y < BALL_R || x > TABLE_W - BALL_R || y > TABLE_H - BALL_R) return;
    const seat = activeSeat(matchState); const currentVersion = Number(matchState.version) || 0;
    if (!seat || seatIndex !== activeSeatIndex(matchState) || playerId !== seat.playerId || version !== currentVersion) return;
    let next;
    try { next = L.placeCueBall(matchState, x, y); } catch (ignore) { return; }
    if (!next || next.ballInHand) return;
    if (!finite(Number(next.version)) || Number(next.version) <= currentVersion) next.version = currentVersion + 1;
    matchState = next; net.broadcast({ type: 'cue-placed', version: next.version, matchState: clone(next) }); afterStateChange();
  }
  function requestCuePlacement(x, y) {
    if (!matchState || !matchState.ballInHand || !myTurn() || controlsLocked) return;
    const index = activeSeatIndex(matchState); const seat = activeSeat(matchState); const version = Number(matchState.version) || 0;
    if (mode === 'online') {
      if (isHost) hostPlaceCue(index, seat.playerId, version, x, y);
      else if (conn && conn.open) conn.send({ type: 'place-cue-attempt', seatIndex: index, playerId: myId, version, x, y });
    } else {
      try { const next = L.placeCueBall(matchState, x, y); if (next && !next.ballInHand) { matchState = next; afterStateChange(); } } catch (ignore) { /* invalid placement */ }
    }
  }

  function scheduleCpuIfNeeded() {
    if (cpuTimer || animation || !matchState || isGameOver(matchState)) return;
    const seat = activeSeat(matchState); if (!seat) return;
    const pendingGuest = mode === 'online' && isHost && seat.kind === 'human' && Array.from(pendingRejoins.values()).some((p) => p.oldPeerId === seat.playerId);
    if (seat.kind !== 'cpu' && !pendingGuest) return;
    if (mode === 'online' && !isHost) return;
    controlsLocked = true; $('turn-text').textContent = seatName(seat) + (pendingGuest ? '（代打CPU）' : '') + ' が考え中…';
    cpuTimer = setTimeout(() => {
      cpuTimer = null; controlsLocked = false; if (!matchState || animation || isGameOver(matchState)) return;
      if (matchState.ballInHand) {
        const point = L.chooseCpuCuePlacement(matchState.table, matchState, Math.random());
        if (point && finite(point.x) && finite(point.y)) {
          if (mode === 'online') hostPlaceCue(activeSeatIndex(matchState), activeSeat(matchState).playerId, Number(matchState.version) || 0, point.x, point.y);
          else { try { matchState = L.placeCueBall(matchState, point.x, point.y); } catch (ignore) { /* noop */ } }
        }
      }
      const shot = L.chooseCpuShot(matchState.table, matchState, activeSeatIndex(matchState), Math.random());
      if (!shot || !finite(shot.angle) || !finite(shot.power)) { refreshGameUi(); return; }
      if (mode === 'online') hostAcceptShot(activeSeatIndex(matchState), activeSeat(matchState).playerId, Number(matchState.version) || 0, shot.angle, shot.power);
      else { aimAngle = shot.angle; startShotAnimation(matchState.table, shot.angle, shot.power); }
    }, CPU_THINK_MS);
  }

  function showFinalResult() {
    clearTimeout(cpuTimer); cpuTimer = null; controlsLocked = true;
    const winner = typeof L.winningSide === 'function' ? L.winningSide(matchState) : matchState.winner;
    $('final-winner-text').textContent = winner ? sideLabel(winner) + ' の勝利！' : 'ラック終了';
    $('scoreboard').innerHTML = '';
    let rows = [];
    try { rows = L.buildRackScoreboard(matchState.racksWon || { A: winner === 'A' ? 1 : 0, B: winner === 'B' ? 1 : 0 }, matchState.seats || []); } catch (ignore) { rows = ['A', 'B'].map((side) => ({ side, score: (matchState.racksWon || {})[side] || 0 })); }
    rows.forEach((row) => { const side = row.side || row.id || row.name; const score = row.score !== undefined ? row.score : row.wins; const div = document.createElement('div'); div.className = 'score-row' + (side === winner ? ' winner' : ''); div.innerHTML = '<span>' + sideLabel(side) + '</span><strong>' + (score || 0) + '勝</strong>'; $('scoreboard').appendChild(div); });
    $('play-again-btn').classList.toggle('hidden', mode === 'online' && !isHost); showOnly('final-result-screen');
  }
  function rematch() {
    if (!matchState) return;
    const next = createMatch(matchState.seats, matchState.racksWon);
    if (mode === 'online') { if (!isHost) return; net.broadcast({ type: 'rematch', matchState: clone(next) }); }
    beginMatch(next);
  }

  function canvasPoint(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * TABLE_W / rect.width, y: (event.clientY - rect.top) * TABLE_H / rect.height }; }
  function cancelPointerDrag() { pointerDrag = null; }
  canvas.addEventListener('pointerdown', (event) => {
    if (!inputAllowed()) return; canvas.focus(); const point = canvasPoint(event);
    if (matchState && matchState.ballInHand) { requestCuePlacement(point.x, point.y); return; }
    const cue = cueBall(currentTable()); if (!cue) return; canvas.setPointerCapture(event.pointerId);
    aimAngle = Math.atan2(point.y - cue.y, point.x - cue.x);
    aimPower = Math.max(5, Math.min(100, Math.hypot(point.x - cue.x, point.y - cue.y) / 3)); updatePowerUi();
    pointerDrag = { id: event.pointerId, lockedAngle: aimAngle };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!inputAllowed()) return; const point = canvasPoint(event); const cue = cueBall(currentTable()); if (!cue) return;
    if (!pointerDrag && !(event.buttons & 1)) aimAngle = Math.atan2(point.y - cue.y, point.x - cue.x);
    else if (pointerDrag && pointerDrag.id === event.pointerId) {
      aimPower = Math.max(5, Math.min(100, Math.hypot(point.x - cue.x, point.y - cue.y) / 3)); updatePowerUi();
    }
  });
  function releasePointer(event) {
    if (!pointerDrag || pointerDrag.id !== event.pointerId) return;
    aimAngle = pointerDrag.lockedAngle; cancelPointerDrag(); requestShot();
  }
  canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', cancelPointerDrag);
  canvas.addEventListener('keydown', (event) => {
    if (!inputAllowed()) return; const key = event.key;
    if (key === 'ArrowLeft' || key === 'ArrowRight') { aimAngle = normalizeAngle(aimAngle + (key === 'ArrowLeft' ? -.035 : .035)); event.preventDefault(); }
    else if (key === 'ArrowUp' || key === 'ArrowDown') { aimPower = Math.max(5, Math.min(100, aimPower + (key === 'ArrowUp' ? 5 : -5))); updatePowerUi(); event.preventDefault(); }
    else if (key === ' ' && !(matchState && matchState.ballInHand)) { event.preventDefault(); requestShot(); }
  });
  function updatePowerUi() { $('power-slider').value = String(Math.round(aimPower)); $('power-value').textContent = Math.round(aimPower) + '%'; }
  $('power-slider').addEventListener('input', () => { aimPower = Number($('power-slider').value); updatePowerUi(); });
  $('angle-left-btn').addEventListener('click', () => { aimAngle = normalizeAngle(aimAngle - .05); canvas.focus(); });
  $('angle-right-btn').addEventListener('click', () => { aimAngle = normalizeAngle(aimAngle + .05); canvas.focus(); });
  $('shoot-btn').addEventListener('click', requestShot);

  function replacePeerId(oldId, newId) {
    roster.forEach((p) => { if (p.id === oldId) p.id = newId; });
    onlineSeats.forEach((s) => { if (s && s.playerId === oldId) s.playerId = newId; });
    if (matchState && Array.isArray(matchState.seats)) matchState.seats.forEach((s) => { if (s.playerId === oldId) s.playerId = newId; });
    if (authorityAfterAnimation && Array.isArray(authorityAfterAnimation.seats)) authorityAfterAnimation.seats.forEach((s) => { if (s.playerId === oldId) s.playerId = newId; });
  }
  function snapshotFor(peerId) {
    const authoritative = authorityAfterAnimation || matchState;
    return { type: 'state-snapshot', snapshotVersion: 1, phase: isGameOver(authoritative) ? 'result' : 'game', matchState: clone(authoritative), seats: publicSeats(), players: publicRoster(), hostId: HOST_ID, peerId };
  }
  function handleRejoin(peerId, data) {
    const player = roster.find((p) => p.token === data.token); const pending = player && pendingRejoins.get(data.token);
    if (!player || !pending || pending.oldPeerId !== player.id || typeof data.rejoinRequestId !== 'string') { net.sendTo(peerId, { type: 'rejoin-rejected', rejoinRequestId: data.rejoinRequestId }); return; }
    clearTimeout(pending.timer); pendingRejoins.delete(data.token); const oldId = player.id; replacePeerId(oldId, peerId);
    net.broadcast({ type: 'peer-id-changed', oldId, newId: peerId }); broadcastRoster(); renderRoster();
    showError('game-status', '');
    net.sendTo(peerId, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode }); net.sendTo(peerId, snapshotFor(peerId));
  }
  function deferDisconnect(peerId) {
    const player = roster.find((p) => p.id === peerId); if (!player || !player.token) return;
    const previous = pendingRejoins.get(player.token); if (previous) clearTimeout(previous.timer);
    showError('game-status', player.name + 'さんの再接続を30秒待っています。手番はCPUが代打します。');
    const timer = setTimeout(() => {
      pendingRejoins.delete(player.token);
      const convert = (seats) => seats.forEach((seat) => { if (seat && seat.playerId === peerId) { seat.kind = 'cpu'; seat.playerId = null; seat.name = player.name + '（CPU）'; } });
      convert(onlineSeats); if (matchState) convert(matchState.seats); broadcastRoster(); refreshGameUi();
    }, REJOIN_GRACE_MS);
    pendingRejoins.set(player.token, { oldPeerId: peerId, timer }); refreshGameUi();
  }
  function hostMessage(peerId, data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join' && matchState === null && typeof data.token === 'string' && data.token && typeof data.joinRequestId === 'string') {
      if (roster.length >= 4 || roster.some((p) => p.token === data.token)) return;
      const player = { id: peerId, name: String(data.name || 'ゲスト').slice(0, 10), token: data.token }; roster.push(player); addPlayerToSeat(player); broadcastRoster(); renderRoster(); net.sendTo(peerId, { type: 'join-ack', joinRequestId: data.joinRequestId, id: peerId, roomCode }); return;
    }
    if (data.type === 'rejoin') { handleRejoin(peerId, data); return; }
    if (data.type === 'shot-attempt') { hostAcceptShot(data.seatIndex, peerId === data.playerId ? data.playerId : '', data.version, data.angle, data.power); return; }
    if (data.type === 'place-cue-attempt') hostPlaceCue(data.seatIndex, peerId === data.playerId ? data.playerId : '', data.version, data.x, data.y);
  }
  function receive(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join-ack' && data.joinRequestId === joinRequestId) { RejoinStorage.save(GAME_KEY, { roomCode: data.roomCode || roomCode, token: guestToken, name: myName }); return; }
    if (data.type === 'rejoin-ack' && data.rejoinRequestId === joinRequestId) { RejoinStorage.save(GAME_KEY, { roomCode: data.roomCode || roomCode, token: guestToken, name: myName }); return; }
    if (data.type === 'rejoin-rejected') { RejoinStorage.clear(GAME_KEY); savedSession = null; showError('online-error', '再参加の有効期限が切れました。通常参加してください。'); resetOnline(); showOnly('setup-screen'); return; }
    if (data.type === 'roster') { roster = Array.isArray(data.players) ? data.players : roster; onlineSeats = Array.isArray(data.seats) ? data.seats : onlineSeats; renderRoster(); return; }
    if (data.type === 'match-start' && data.matchState) { beginMatch(data.matchState); return; }
    if (data.type === 'shot-broadcast' && data.preshotTable && finite(data.angle) && finite(data.power)) { startShotAnimation(data.preshotTable, data.angle, data.power); return; }
    if (data.type === 'shot-result' && data.matchState) { if (animation) authorityAfterAnimation = clone(data.matchState); else { matchState = clone(data.matchState); afterStateChange(); } return; }
    if (data.type === 'cue-placed' && data.matchState) { matchState = clone(data.matchState); afterStateChange(); return; }
    if (data.type === 'rack-over' && data.matchState) { matchState = clone(data.matchState); showFinalResult(); return; }
    if (data.type === 'rematch' && data.matchState) { beginMatch(data.matchState); return; }
    if (data.type === 'peer-id-changed' && typeof data.oldId === 'string' && typeof data.newId === 'string') { replacePeerId(data.oldId, data.newId); renderRoster(); refreshGameUi(); return; }
    if (data.type === 'state-snapshot' && data.snapshotVersion === 1 && data.matchState) { animation = null; authorityAfterAnimation = null; roster = data.players || roster; onlineSeats = data.seats || onlineSeats; matchState = clone(data.matchState); if (data.peerId) myId = data.peerId; if (data.phase === 'result' || isGameOver(matchState)) showFinalResult(); else beginMatch(matchState); }
  }

  function connectGuest(session) {
    const rejoining = !!session; isHost = false; myName = rejoining ? session.name : myName; roomCode = (rejoining ? session.roomCode : roomCode).toUpperCase(); guestToken = rejoining ? session.token : RejoinStorage.newToken(); joinRequestId = RejoinStorage.newToken(); mode = 'online';
    $('host-btn').disabled = true; $('join-btn').disabled = true; $('join-code-input').disabled = true;
    net = BilliardsNet.joinRoom(roomCode, {
      onOwnId(id) { myId = id; },
      onConnected(connection) { conn = connection; conn.send(rejoining ? { type: 'rejoin', token: guestToken, name: myName, rejoinRequestId: joinRequestId } : { type: 'join', name: myName, token: guestToken, joinRequestId }); $('online-status').textContent = rejoining ? '対局へ再参加しています…' : 'ホストの設定を待っています…'; showOnly('lobby-panel'); },
      onMessage: receive,
      onDisconnected() { showError('game-status', 'ホストとの接続が切れました。ページを再読み込みすると30秒以内なら復帰できます。'); },
      onConnectionHealthChange: setHealth,
      onError(err) { if (rejoining && err && err.type === 'peer-unavailable') { RejoinStorage.clear(GAME_KEY); savedSession = null; } peerError(err); },
    });
  }

  $('mode-free-btn').addEventListener('click', beginFreePlay);
  $('mode-cpu-btn').addEventListener('click', () => { mode = 'cpu'; const seats = [makeSeat('human', 'local-0', 'あなた', 'A'), makeSeat('cpu', null, 'CPU', 'B')]; beginMatch(createMatch(seats)); });
  $('mode-local-btn').addEventListener('click', () => { mode = 'local'; localCount = 2; $('seat-count').value = '2'; buildLocalSeats(2); showOnly('seat-config-screen'); });
  $('mode-online-btn').addEventListener('click', () => { $('mode-select').classList.add('hidden'); $('online-setup').classList.remove('hidden'); });
  $('online-back-btn').addEventListener('click', () => { $('mode-select').classList.remove('hidden'); $('online-setup').classList.add('hidden'); showError('online-error', ''); });
  $('seat-count').addEventListener('change', () => { localCount = Number($('seat-count').value); buildLocalSeats(localCount); });
  $('auto-teams-btn').addEventListener('click', applyLocalAutoTeams);
  $('local-back-btn').addEventListener('click', () => quitGame(false));
  $('local-start-btn').addEventListener('click', () => { localSeats.forEach((s, i) => { s.name = s.name.trim() || (s.kind === 'cpu' ? 'CPU' : 'プレイヤー' + (i + 1)); }); if (!canStart(localSeats)) { showError('local-config-error', '陣営Aと陣営Bに1席以上を割り当ててください。'); return; } beginMatch(createMatch(localSeats)); });
  $('online-auto-teams-btn').addEventListener('click', () => { const occupied = onlineSeats.filter(Boolean); const sides = autoSides(occupied.length); occupied.forEach((seat, i) => { seat.side = sides[i]; }); broadcastRoster(); renderOnlineSeats(); });

  $('host-btn').addEventListener('click', () => {
    myName = $('name-input').value.trim(); if (!myName) { showError('online-error', 'ニックネームを入力してください。'); return; }
    mode = 'online'; isHost = true; myId = HOST_ID; roster = [{ id: HOST_ID, name: myName, token: 'host' }]; onlineSeats = [makeSeat('human', HOST_ID, myName, 'A'), null, null, null]; matchState = null;
    $('host-btn').disabled = true; $('join-btn').disabled = true; $('join-code-input').disabled = true;
    net = BilliardsNet.hostRoom({
      onCode(code) { roomCode = code; WakeLockHelper.enable(); $('room-code-text').textContent = code; $('host-wait').classList.remove('hidden'); $('online-status').textContent = '参加者を待っています…'; showOnly('lobby-panel'); renderRoster(); },
      onPeerConnected(peerId) { net.sendTo(peerId, { type: 'roster', players: publicRoster(), seats: publicSeats(), hostId: HOST_ID }); },
      onPeerMessage: hostMessage,
      onPeerDisconnected(peerId) { const player = roster.find((p) => p.id === peerId); if (!player) return; if (!matchState) { roster = roster.filter((p) => p.id !== peerId); onlineSeats = onlineSeats.map((s) => s && s.playerId === peerId ? null : s); broadcastRoster(); renderRoster(); } else deferDisconnect(peerId); },
      onConnectionHealthChange(peerId, healthy) { setHealth(healthy); }, onError: peerError,
    });
  });
  $('join-btn').addEventListener('click', () => { myName = $('name-input').value.trim(); roomCode = $('join-code-input').value.trim().toUpperCase(); if (!myName) { showError('online-error', 'ニックネームを入力してください。'); return; } if (roomCode.length !== 6) { showError('online-error', '6桁のルームコードを入力してください。'); return; } connectGuest(null); });
  $('copy-code-btn').addEventListener('click', () => { if (navigator.clipboard) navigator.clipboard.writeText(roomCode).then(() => { $('online-status').textContent = 'コードをコピーしました。'; }); });
  $('start-online-btn').addEventListener('click', () => { if (!isHost) return; const seats = onlineSeats.filter(Boolean); if (!canStart(seats)) return; matchState = createMatch(seats); net.broadcast({ type: 'match-start', matchState: clone(matchState) }); beginMatch(matchState); });
  $('leave-lobby-btn').addEventListener('click', () => quitGame(true));
  $('quit-game-btn').addEventListener('click', () => quitGame(true));
  $('rerack-btn').addEventListener('click', () => { if (mode !== 'free' || animation) return; freeTable = newRack(); aimAngle = Math.PI; });
  $('play-again-btn').addEventListener('click', rematch);

  updatePowerUi(); renderTable();
  if (savedSession && savedSession.roomCode && savedSession.token && savedSession.name) { $('name-input').value = savedSession.name; $('join-code-input').value = savedSession.roomCode; connectGuest(savedSession); }
})();
