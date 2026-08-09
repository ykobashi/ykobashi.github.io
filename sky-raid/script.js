(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const shipImg = new Image(); shipImg.src = 'assets/ship.png';
  const enemyImg = new Image(); enemyImg.src = 'assets/enemy.png';
  const enemyBImg = new Image(); enemyBImg.src = 'assets/enemy-b.png';
  const bossImg = new Image(); bossImg.src = 'assets/boss.png';
  const bigbossImg = new Image(); bigbossImg.src = 'assets/bigboss.png';
  const itemImg = new Image(); itemImg.src = 'assets/item.png';
  const bgImg = new Image(); bgImg.src = 'assets/background.png';
  const tintedShipCanvases = new Map();
  function imgReady(img) { return img.complete && img.naturalWidth > 0; }
  function tintedShipCanvas(color) {
    if (tintedShipCanvases.has(color)) return tintedShipCanvases.get(color);
    const size = 36;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(shipImg, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    tintedShipCanvases.set(color, canvas);
    return canvas;
  }
  const HOST_ID = 'host', GAME_KEY = 'sky-raid', REJOIN_GRACE_MS = 30000, LOBBY_SYNC_INTERVAL_MS = 4000;
  const POSITION_SYNC_INTERVAL_MS = 100, STARTUP_DELAY_MS = 300, HUD_RENDER_INTERVAL_MS = 150;
  const ITEM_PICKUP_PENDING_MS = 250, PICKUP_FX_MS = 160, SNAPSHOT_VERSION = 2;
  let isHost = false, myId = null, myName = '', roomCode = '', net = null, conn = null, soloMode = false;
  let roster = [], phase = 'lobby';
  let gameId = 0, guestToken = null, joinRequestId = null, rejoinRequestId = null;
  let lobbySyncTimer = null;
  const pendingRejoins = new Map();

  // ゲーム進行(全クライアント共通)。敵/ボスの位置は computeEnemies/computeBosses が
  // (seed, elapsedMs) だけから毎フレーム計算し直すので、ここでは保持しない。
  let seed = 0, startedAt = 0, lastFrameAt = 0, rafId = null, hudLastAt = 0;
  let myFireState = SkyRaidLogic.createFireState();
  let myBullets = [];
  let myShipStatus = SkyRaidLogic.createShipStatus();
  let myDeadEnemies = new Map(), myDeadBosses = new Map(); // id -> deathElapsedMs (死亡前に撃った弾を残すために時刻を持つ)
  let myPowerState = SkyRaidLogic.createPowerState();
  let myCollectedItems = new Set();
  const pendingItemPickups = new Map();
  const pickupEffects = new Map();
  let knownBossHp = {};
  let remotePositions = {}, remoteShipStatus = {};
  let myLocalX = 0, myLocalY = 0, dragging = false;
  let positionSyncTimer = null;

  // ホストのみが持つ権威データ(敵/ボスのHP台帳とスコア、各自の最新ライフ)
  let ledger = null;
  let latestLivesById = {};

  function error(message) { $('error').textContent = message || ''; }
  function player(id) { return roster.find((p) => p.id === id); }
  function publicRoster() { return roster.map(({ id, name, joinOrder }) => ({ id, name, joinOrder })); }
  function enter(which) { ['setup', 'lobby', 'game', 'result'].forEach((id) => $(id).classList.toggle('hidden', id !== which)); }
  function elapsedNow(now) { return Math.max(0, now - startedAt); }
  function validPower(power) {
    if (!power || !Number.isSafeInteger(power.itemCount) || power.itemCount < 0
      || !Number.isSafeInteger(power.level) || power.level < 0 || power.level > SkyRaidLogic.MAX_POWER_LEVEL) return false;
    return power.level === Math.min(SkyRaidLogic.MAX_POWER_LEVEL, Math.floor(power.itemCount / SkyRaidLogic.ITEMS_PER_LEVEL));
  }
  function safeShipPosition(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x: SkyRaidLogic.clamp(x, SkyRaidLogic.SHIP_R, SkyRaidLogic.ARENA_W - SkyRaidLogic.SHIP_R),
      y: SkyRaidLogic.clamp(y, SkyRaidLogic.SHIP_R, SkyRaidLogic.ARENA_H - SkyRaidLogic.SHIP_R),
    };
  }
  function stopLobbySync() { if (lobbySyncTimer) { clearInterval(lobbySyncTimer); lobbySyncTimer = null; } }
  function startLobbySync() {
    stopLobbySync();
    lobbySyncTimer = setInterval(() => {
      if (isHost || phase !== 'lobby' || !conn || !conn.open) { stopLobbySync(); return; }
      conn.send({ type: 'sync-request' });
    }, LOBBY_SYNC_INTERVAL_MS);
  }
  function showSetup() { isHost = false; net = null; conn = null; soloMode = false; stopLobbySync(); stopRenderLoop(); stopPositionSync(); $('host').disabled = false; $('join').disabled = false; enter('setup'); }
  function broadcastRoster() { if (net) net.broadcast({ type: 'roster', players: publicRoster() }); }
  function renderRoster() {
    const ul = $('roster'); if (!ul) return;
    ul.innerHTML = '';
    roster.forEach((p) => {
      const li = document.createElement('li');
      li.className = SkyRaidLogic.colorClass(p.joinOrder);
      li.textContent = 'P' + p.joinOrder + '　' + p.name + (p.id === myId ? '（あなた）' : '');
      ul.appendChild(li);
    });
    $('start').disabled = !isHost || (!soloMode && !SkyRaidLogic.hasMinPlayers(roster));
    $('again').disabled = !isHost || (!soloMode && !SkyRaidLogic.hasMinPlayers(roster));
  }
  function livesOf(id) { return id === myId ? myShipStatus.lives : (remoteShipStatus[id] ? remoteShipStatus[id].lives : SkyRaidLogic.SHIP_LIVES); }
  function renderHud(now) {
    const elapsedMs = elapsedNow(now);
    const currentCycle = Math.floor(elapsedMs / SkyRaidLogic.WAVE_INTERVAL_MS);
    $('sky-wave-label').textContent = currentCycle >= SkyRaidLogic.BIGBOSS_CYCLE
      ? '固定進行　大ボス戦'
      : '固定進行　WAVE ' + Math.max(1, currentCycle) + '/10';
    $('sky-power-label').textContent = 'みんなの強化 Lv.' + myPowerState.level;
    const bosses = SkyRaidLogic.computeBosses(seed, elapsedMs, myDeadBosses, roster.length);
    const bossWrap = $('sky-boss-bar-wrap');
    if (bosses.length) {
      const boss = bosses.find((entry) => entry.kind === 'bigboss') || bosses[0];
      const hp = knownBossHp[boss.id] != null ? knownBossHp[boss.id] : boss.maxHp;
      bossWrap.classList.remove('hidden');
      $('sky-boss-bar-fill').style.width = Math.max(0, (hp / boss.maxHp) * 100) + '%';
      $('sky-boss-label').textContent = boss.kind === 'bigboss' ? '大ボス' : '中ボス';
    } else {
      bossWrap.classList.add('hidden');
      $('sky-boss-label').textContent = '';
    }
    const container = $('sky-lives'); container.innerHTML = '';
    roster.slice().sort((a, b) => a.joinOrder - b.joinOrder).forEach((rp) => {
      const lives = livesOf(rp.id);
      const div = document.createElement('div');
      div.className = 'sky-life ' + SkyRaidLogic.colorClass(rp.joinOrder) + (lives <= 0 ? ' is-down' : '');
      div.textContent = rp.name + '：' + '❤'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, SkyRaidLogic.SHIP_LIVES - lives));
      container.appendChild(div);
    });
  }

  // --- 入力(ドラッグ操作)。ネットワークへの送信はここではなく定期タイマーで行う ---
  function canvasPoint(evt) {
    const canvas = $('sky-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
  }
  function handleMove(x, y) {
    myLocalX = SkyRaidLogic.clamp(x, SkyRaidLogic.SHIP_R, SkyRaidLogic.ARENA_W - SkyRaidLogic.SHIP_R);
    myLocalY = SkyRaidLogic.clamp(y, SkyRaidLogic.SHIP_R, SkyRaidLogic.ARENA_H - SkyRaidLogic.SHIP_R);
  }
  $('sky-canvas').addEventListener('pointerdown', (e) => {
    if (phase !== 'playing') return;
    e.preventDefault(); dragging = true;
    const p = canvasPoint(e); handleMove(p.x, p.y);
    try { $('sky-canvas').setPointerCapture(e.pointerId); } catch (err) { /* 指がcanvas外に出た場合の追従はあきらめる。移動自体は既に反映済み */ }
  });
  $('sky-canvas').addEventListener('pointermove', (e) => {
    if (!dragging || phase !== 'playing') return;
    e.preventDefault();
    const p = canvasPoint(e); handleMove(p.x, p.y);
  });
  ['pointerup', 'pointercancel'].forEach((evt) => $('sky-canvas').addEventListener(evt, () => { dragging = false; }));

  function stopPositionSync() { if (positionSyncTimer) clearInterval(positionSyncTimer); positionSyncTimer = null; }
  function startPositionSync() {
    stopPositionSync();
    positionSyncTimer = setInterval(() => {
      if (phase !== 'playing') { stopPositionSync(); return; }
      if (isHost) { if (net) net.broadcast({ type: 'ship-pos', id: myId, x: myLocalX, y: myLocalY }); }
      else if (conn) conn.send({ type: 'ship-pos', x: myLocalX, y: myLocalY });
    }, POSITION_SYNC_INTERVAL_MS);
  }

  // --- 被弾・撃破の報告(自分の弾・自機についてのみ自己判定してホストへ送る) ---
  function reportHitEnemy(enemyId) {
    const maxHp = SkyRaidLogic.enemyMaxHpFromId(seed, enemyId, roster.length);
    if (!Number.isFinite(maxHp) || maxHp <= 0) return;
    if (isHost) {
      const result = SkyRaidLogic.applyEnemyHit(ledger, enemyId, myId, maxHp, elapsedNow(Date.now()));
      if (net) net.broadcast({ type: 'enemy-hit', enemyId, byId: myId, killed: result.killed, deathElapsedMs: result.deathElapsedMs });
      if (result.killed) myDeadEnemies.set(enemyId, result.deathElapsedMs);
    } else if (conn) {
      conn.send({ type: 'hit-enemy', enemyId });
    }
  }
  function reportHitBoss(bossId) {
    const cycle = SkyRaidLogic.bossCycleFromId(bossId);
    if (!Number.isFinite(cycle) || !SkyRaidLogic.cycleKind(cycle).endsWith('boss')) return;
    if (isHost) {
      const maxHp = SkyRaidLogic.bossMaxHp(cycle, roster.length);
      const result = SkyRaidLogic.applyBossHit(ledger, bossId, myId, maxHp, elapsedNow(Date.now()));
      if (net) net.broadcast({ type: 'boss-hit', bossId, byId: myId, killed: result.killed, hp: result.hp, deathElapsedMs: result.deathElapsedMs });
      knownBossHp[bossId] = result.hp;
      if (result.killed) { myDeadBosses.set(bossId, result.deathElapsedMs); delete knownBossHp[bossId]; }
    } else if (conn) {
      conn.send({ type: 'hit-boss', bossId });
    }
  }
  function reportShipStatus() {
    if (isHost) {
      latestLivesById[myId] = myShipStatus.lives;
      if (net) net.broadcast({ type: 'ship-status', id: myId, lives: myShipStatus.lives, invulnUntil: myShipStatus.invulnUntil });
    } else if (conn) {
      conn.send({ type: 'ship-status', lives: myShipStatus.lives, invulnUntil: myShipStatus.invulnUntil });
    }
  }

  function resetItemState() {
    myPowerState = SkyRaidLogic.createPowerState();
    myCollectedItems = new Set();
    pendingItemPickups.clear();
    pickupEffects.clear();
  }
  function addPickupEffect(item, byId, now) {
    if (!item) return;
    const target = positionOf(byId);
    if (!target) return;
    pickupEffects.set(item.id, {
      fromX: item.x, fromY: item.y,
      toX: target.x, toY: target.y,
      startedAt: now, until: now + PICKUP_FX_MS,
    });
  }
  function prunePickupState(now) {
    pendingItemPickups.forEach((until, itemId) => { if (until <= now) pendingItemPickups.delete(itemId); });
    pickupEffects.forEach((effect, itemId) => { if (effect.until <= now) pickupEffects.delete(itemId); });
  }
  function currentItem(itemId, now, collectedItems, deadEnemies, deadBosses) {
    const items = SkyRaidLogic.computeItems(seed, elapsedNow(now), deadEnemies || myDeadEnemies, deadBosses || myDeadBosses, collectedItems || myCollectedItems);
    return items.find((item) => item.id === itemId) || null;
  }
  function positionOf(id) {
    return id === myId ? { x: myLocalX, y: myLocalY } : remotePositions[id];
  }
  function commitItemPickup(item, byId, now) {
    if (!ledger || !item || ledger.collectedItems.has(item.id)) return false;
    const pos = positionOf(byId);
    const lives = byId === myId ? myShipStatus.lives : latestLivesById[byId];
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(lives) || lives <= 0) return false;
    if (!SkyRaidLogic.hitTest(item.x, item.y, SkyRaidLogic.ITEM_R, pos.x, pos.y, SkyRaidLogic.ITEM_MAGNET_R)) return false;
    const result = SkyRaidLogic.claimItem(ledger, item.id);
    if (!result.claimed) return false;
    myCollectedItems.add(item.id);
    myPowerState = { ...result.power };
    pendingItemPickups.delete(item.id);
    addPickupEffect(item, byId, now);
    if (net) net.broadcast({ type: 'item-picked', itemId: item.id, byId, power: { ...result.power } });
    return true;
  }
  function detectItemPickup(item, now) {
    if (!item || myCollectedItems.has(item.id) || pendingItemPickups.has(item.id)) return;
    if (isHost) {
      commitItemPickup(item, myId, now);
    } else if (conn && conn.open) {
      pendingItemPickups.set(item.id, now + ITEM_PICKUP_PENDING_MS);
      conn.send({ type: 'pickup-item', itemId: item.id });
    }
  }

  // --- 描画 ---
  function getCssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v && v.trim() ? v.trim() : fallback;
  }
  function drawShip(ctx, x, y, ship, now) {
    const rp = player(ship.id);
    const joinOrder = rp ? rp.joinOrder : 1;
    const stateAlpha = ship.lives <= 0 ? 0.25
      : (ship.invuln && Math.floor(now / 100) % 2 === 0 ? 0.35 : 1);
    const color = getCssVar('--' + SkyRaidLogic.colorClass(joinOrder) + '-color', '#60a5fa');
    if (imgReady(shipImg)) {
      const size = 36;
      ctx.save();
      ctx.globalAlpha = stateAlpha;
      ctx.drawImage(tintedShipCanvas(color), x - size / 2, y - size / 2, size, size);
      ctx.restore();
    } else {
      ctx.globalAlpha = stateAlpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y - SkyRaidLogic.SHIP_R);
      ctx.lineTo(x - SkyRaidLogic.SHIP_R, y + SkyRaidLogic.SHIP_R);
      ctx.lineTo(x + SkyRaidLogic.SHIP_R, y + SkyRaidLogic.SHIP_R);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (rp) {
      ctx.fillStyle = getCssVar('--text', '#eef0fb');
      ctx.font = '10px "Hiragino Sans","Yu Gothic",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rp.name, x, y + SkyRaidLogic.SHIP_R + 12);
    }
  }
  function drawEnemy(ctx, enemy) {
    const image = enemy.kind === 'b' ? enemyBImg : enemyImg;
    if (imgReady(image)) {
      const size = 40;
      ctx.drawImage(image, enemy.x - size / 2, enemy.y - size / 2, size, size);
    } else {
      ctx.fillStyle = enemy.kind === 'b' ? '#84cc16' : '#f43f5e'; ctx.beginPath(); ctx.arc(enemy.x, enemy.y, SkyRaidLogic.ENEMY_R, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawBoss(ctx, boss) {
    const isBig = boss.kind === 'bigboss';
    const image = isBig ? bigbossImg : bossImg;
    if (imgReady(image)) {
      const size = isBig ? 140 : 120;
      ctx.drawImage(image, boss.x - size / 2, boss.y - size / 2, size, size);
    } else {
      const cycle = SkyRaidLogic.bossCycleFromId(boss.id);
      ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.arc(boss.x, boss.y, SkyRaidLogic.bossRadiusFor(cycle), 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawItem(ctx, x, y) {
    if (imgReady(itemImg)) {
      const size = 24;
      ctx.drawImage(itemImg, x - size / 2, y - size / 2, size, size);
    } else {
      ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.arc(x, y, SkyRaidLogic.ITEM_R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  function drawPickupEffects(ctx, now) {
    pickupEffects.forEach((effect) => {
      const progress = Math.min(1, Math.max(0, (now - effect.startedAt) / PICKUP_FX_MS));
      const eased = 1 - Math.pow(1 - progress, 3);
      const x = effect.fromX + (effect.toX - effect.fromX) * eased;
      const y = effect.fromY + (effect.toY - effect.fromY) * eased;
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      drawItem(ctx, x, y);
      ctx.restore();
    });
  }
  function renderCanvas(now, enemies, bosses, enemyBullets, items) {
    const canvas = $('sky-canvas'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (imgReady(bgImg)) {
      const scrollY = Math.floor(now / 30) % h;
      ctx.drawImage(bgImg, 0, scrollY - h, w, h);
      ctx.drawImage(bgImg, 0, scrollY, w, h);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      for (let i = 0; i < 40; i += 1) {
        const sx = (i * 53 + Math.floor(now / 20)) % w;
        const sy = (i * 97) % h;
        ctx.fillRect(sx, sy, 2, 2);
      }
    }
    enemyBullets.forEach((b) => { ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(b.x, b.y, SkyRaidLogic.ENEMY_BULLET_R, 0, Math.PI * 2); ctx.fill(); });
    myBullets.forEach((b) => { ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(b.x, b.y, SkyRaidLogic.BULLET_R, 0, Math.PI * 2); ctx.fill(); });
    items.forEach((item) => {
      const attracted = myShipStatus.lives > 0 && SkyRaidLogic.hitTest(item.x, item.y, SkyRaidLogic.ITEM_R, myLocalX, myLocalY, SkyRaidLogic.ITEM_MAGNET_R);
      const x = attracted ? item.x + (myLocalX - item.x) * 0.5 : item.x;
      const y = attracted ? item.y + (myLocalY - item.y) * 0.5 : item.y;
      drawItem(ctx, x, y);
    });
    drawPickupEffects(ctx, now);
    enemies.forEach((enemy) => drawEnemy(ctx, enemy));
    bosses.forEach((boss) => drawBoss(ctx, boss));
    const ordered = roster.slice().sort((a, b) => a.joinOrder - b.joinOrder);
    ordered.forEach((rp) => {
      const isMe = rp.id === myId;
      const pos = isMe ? { x: myLocalX, y: myLocalY } : (remotePositions[rp.id] || SkyRaidLogic.spawnPosition(rp.joinOrder, ordered.length));
      const status = isMe ? myShipStatus : (remoteShipStatus[rp.id] || { lives: SkyRaidLogic.SHIP_LIVES, invulnUntil: 0 });
      drawShip(ctx, pos.x, pos.y, { id: rp.id, lives: status.lives, invuln: status.invulnUntil > now }, now);
    });
  }
  function stopRenderLoop() { if (rafId) cancelAnimationFrame(rafId); rafId = null; }
  function startRenderLoop() {
    stopRenderLoop();
    lastFrameAt = Date.now(); hudLastAt = 0;
    const step = () => {
      if (phase !== 'playing') { rafId = null; return; }
      frameUpdate(Date.now());
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }

  // --- 毎フレームの更新(全クライアント共通で実行するローカルシミュレーション) ---
  function frameUpdate(now) {
    const dt = Math.max(0, now - lastFrameAt);
    lastFrameAt = now;
    prunePickupState(now);
    const elapsedMs = elapsedNow(now);
    const enemies = SkyRaidLogic.computeEnemies(seed, elapsedMs, myDeadEnemies, roster.length);
    const bosses = SkyRaidLogic.computeBosses(seed, elapsedMs, myDeadBosses, roster.length);
    const enemyBullets = SkyRaidLogic.computeEnemyBullets(seed, elapsedMs, myDeadEnemies)
      .concat(SkyRaidLogic.computeBossBullets(seed, elapsedMs, myDeadBosses, roster.length));

    const canFire = myShipStatus.lives > 0;
    const newBullets = SkyRaidLogic.advanceFire(myFireState, dt, myLocalX, myLocalY, canFire, myPowerState.level);
    if (newBullets.length) myBullets = myBullets.concat(newBullets);
    myBullets = SkyRaidLogic.advanceBullets(myBullets, dt);

    const enemyHitResult = SkyRaidLogic.checkBulletsVsEnemies(myBullets, enemies);
    myBullets = enemyHitResult.survivors;
    enemyHitResult.hits.forEach((h) => reportHitEnemy(h.enemyId));

    const bossHitResult = SkyRaidLogic.checkBulletsVsBosses(myBullets, bosses);
    myBullets = bossHitResult.survivors;
    bossHitResult.hits.forEach((h) => reportHitBoss(h.bossId));

    if (canFire && SkyRaidLogic.isShipHit(enemyBullets, myLocalX, myLocalY)) {
      const before = myShipStatus;
      myShipStatus = SkyRaidLogic.applySelfHit(myShipStatus, now);
      if (myShipStatus.lives !== before.lives) reportShipStatus();
    }

    const items = SkyRaidLogic.computeItems(seed, elapsedMs, myDeadEnemies, myDeadBosses, myCollectedItems);
    if (myShipStatus.lives > 0) detectItemPickup(SkyRaidLogic.findAbsorbableItem(items, myLocalX, myLocalY), now);
    renderCanvas(now, enemies, bosses, enemyBullets, items);
    if (now - hudLastAt >= HUD_RENDER_INTERVAL_MS) { renderHud(now); hudLastAt = now; }
    if (isHost) hostCheckOutcome();
  }
  function hostCheckOutcome() {
    if (phase !== 'playing') return;
    const outcome = SkyRaidLogic.checkOutcome(latestLivesById, roster.map((p) => p.id), ledger.deadBosses.has('boss:' + SkyRaidLogic.BIGBOSS_CYCLE));
    if (outcome) endRun(outcome);
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
    if (!soloMode && !SkyRaidLogic.hasMinPlayers(roster)) return;
    clearPending();
    gameId += 1;
    seed = SkyRaidLogic.generateSeed();
    startedAt = Date.now() + STARTUP_DELAY_MS;
    ledger = SkyRaidLogic.createLedger();
    latestLivesById = {};
    roster.forEach((p) => { latestLivesById[p.id] = SkyRaidLogic.SHIP_LIVES; });
    const data = { type: 'start-game', gameId, roster: publicRoster(), seed, startedAt };
    if (net) net.broadcast(data);
    applyStart(data);
  }
  function applyStart(data) {
    if (data.gameId == null) return;
    stopLobbySync();
    gameId = data.gameId; phase = 'playing';
    if (!isHost) roster = data.roster || roster;
    seed = data.seed; startedAt = data.startedAt;
    myDeadEnemies = new Map(); myDeadBosses = new Map(); knownBossHp = {};
    myFireState = SkyRaidLogic.createFireState(); myBullets = [];
    myShipStatus = SkyRaidLogic.createShipStatus();
    resetItemState();
    remoteShipStatus = {}; remotePositions = {};
    roster.forEach((p) => { remotePositions[p.id] = SkyRaidLogic.spawnPosition(p.joinOrder, roster.length); });
    const mySpawn = remotePositions[myId] || SkyRaidLogic.spawnPosition(1, roster.length);
    myLocalX = mySpawn.x; myLocalY = mySpawn.y; dragging = false;
    renderRoster(); renderHud(Date.now()); enter('game');
    startRenderLoop(); startPositionSync();
    if (!isHost) RejoinStorage.save(GAME_KEY, { roomCode, token: guestToken, name: myName });
  }
  function endRun(outcome) {
    phase = 'result'; clearPending();
    const data = { type: 'run-end', gameId, outcome, scores: { ...ledger.scores } };
    if (net) net.broadcast(data);
    showResult(data);
    if (net && net.peerIds) {
      const connected = new Set([HOST_ID].concat(net.peerIds()));
      roster = roster.filter((p) => connected.has(p.id));
      renderRoster(); broadcastRoster();
    }
  }
  function showResult(data) {
    if (data.gameId !== gameId) return;
    phase = 'result'; stopRenderLoop(); stopPositionSync();
    const scoreboard = SkyRaidLogic.buildScoreboard(data.scores || {}, roster);
    $('result-outcome').textContent = data.outcome === 'clear' ? '🎉 ボスを撃破してクリア！' : '💥 全滅…応戦むなしく力尽きた';
    const mine = scoreboard.find((p) => p.id === myId);
    const aliveMine = myShipStatus.lives > 0;
    $('result-my-status').textContent = mine ? 'あなたは' + (aliveMine ? '生還' : '途中で脱落') + '・スコア' + mine.score + '点（' + mine.rank + '位）' : '';
    $('result-summary').innerHTML = '';
    scoreboard.forEach((p) => {
      const li = document.createElement('li');
      li.className = SkyRaidLogic.colorClass(p.joinOrder);
      li.textContent = p.rank + '位　' + p.name + '：' + p.score + '点';
      $('result-summary').appendChild(li);
    });
    $('again').classList.toggle('hidden', !isHost);
    enter('result');
  }

  // --- 再接続 ---
  function replaceId(oldId, newId) {
    if (oldId === newId) return;
    roster.forEach((p) => { if (p.id === oldId) p.id = newId; });
    if (isHost && ledger && Object.prototype.hasOwnProperty.call(ledger.scores, oldId)) { ledger.scores[newId] = ledger.scores[oldId]; delete ledger.scores[oldId]; }
    if (Object.prototype.hasOwnProperty.call(latestLivesById, oldId)) { latestLivesById[newId] = latestLivesById[oldId]; delete latestLivesById[oldId]; }
    if (remotePositions[oldId]) { remotePositions[newId] = remotePositions[oldId]; delete remotePositions[oldId]; }
    if (remoteShipStatus[oldId]) { remoteShipStatus[newId] = remoteShipStatus[oldId]; delete remoteShipStatus[oldId]; }
  }
  function snapshot() {
    return {
      type: 'state-snapshot', snapshotVersion: SNAPSHOT_VERSION, gameId, phase, roster: publicRoster(),
      seed, startedAt,
      deadEnemies: ledger ? Array.from(ledger.deadEnemies) : [],
      deadBosses: ledger ? Array.from(ledger.deadBosses) : [],
      bossHp: ledger ? { ...ledger.bossHp } : {},
      collectedItems: ledger ? Array.from(ledger.collectedItems) : [],
      power: ledger ? { ...ledger.power } : SkyRaidLogic.createPowerState(),
      scores: ledger ? { ...ledger.scores } : {},
      livesById: { ...latestLivesById },
    };
  }
  function applySnapshot(data) {
    if (data.snapshotVersion !== SNAPSHOT_VERSION || data.gameId == null) return;
    stopLobbySync();
    gameId = data.gameId; roster = data.roster || [];
    renderRoster();
    if (data.phase === 'playing') {
      phase = 'playing';
      seed = data.seed; startedAt = data.startedAt;
      myDeadEnemies = new Map(data.deadEnemies || []); myDeadBosses = new Map(data.deadBosses || []); knownBossHp = { ...(data.bossHp || {}) };
      myFireState = SkyRaidLogic.createFireState(); myBullets = [];
      myShipStatus = { lives: (data.livesById && data.livesById[myId] != null) ? data.livesById[myId] : SkyRaidLogic.SHIP_LIVES, invulnUntil: 0, hits: 0 };
      myCollectedItems = new Set(data.collectedItems || []);
      myPowerState = validPower(data.power) ? { ...data.power } : SkyRaidLogic.createPowerState();
      pendingItemPickups.clear(); pickupEffects.clear();
      remoteShipStatus = {}; remotePositions = {};
      roster.forEach((p) => { remotePositions[p.id] = SkyRaidLogic.spawnPosition(p.joinOrder, roster.length); });
      const mySpawn = remotePositions[myId] || SkyRaidLogic.spawnPosition(1, roster.length);
      myLocalX = mySpawn.x; myLocalY = mySpawn.y; dragging = false;
      renderHud(Date.now()); enter('game'); startRenderLoop(); startPositionSync();
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
    else if (data.type === 'ship-pos') {
      if (data.id === myId) return;
      const pos = safeShipPosition(data.x, data.y);
      if (pos) remotePositions[data.id] = pos;
    }
    else if (data.type === 'ship-status') { if (data.id === myId) return; remoteShipStatus[data.id] = { lives: data.lives, invulnUntil: data.invulnUntil }; }
    else if (data.type === 'enemy-hit') { if (data.killed) myDeadEnemies.set(data.enemyId, data.deathElapsedMs); }
    else if (data.type === 'boss-hit') { knownBossHp[data.bossId] = data.hp; if (data.killed) { myDeadBosses.set(data.bossId, data.deathElapsedMs); delete knownBossHp[data.bossId]; } }
    else if (data.type === 'item-picked') {
      if (typeof data.itemId !== 'string' || !validPower(data.power)) return;
      const item = currentItem(data.itemId, Date.now());
      myCollectedItems.add(data.itemId);
      if (data.power.itemCount >= myPowerState.itemCount) myPowerState = { ...data.power };
      pendingItemPickups.delete(data.itemId);
      addPickupEffect(item, data.byId, Date.now());
    }
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
    net = SkyRaidNet.joinRoom(roomCode, {
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
    net = SkyRaidNet.hostRoom({
      onCode(code) { roomCode = code; WakeLockHelper.enable(); $('room-code').textContent = code; $('host-code').classList.remove('hidden'); $('status').textContent = '参加者を待っています。'; enter('lobby'); renderRoster(); },
      onPeerMessage(id, data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'join') {
          if (phase !== 'lobby') return net.sendTo(id, { type: 'game-in-progress' });
          if (SkyRaidLogic.hasMaxPlayers(roster)) return net.sendTo(id, { type: 'room-full' });
          const name = String(data.name || '').trim().slice(0, 10);
          if (!name || typeof data.token !== 'string' || !data.token || typeof data.joinRequestId !== 'string' || roster.some((p) => p.token === data.token)) return net.sendTo(id, { type: 'rejoin-rejected' });
          roster = SkyRaidLogic.addPlayer(roster, { id, name, token: data.token, joinOrder: roster.length + 1 });
          renderRoster(); broadcastRoster();
          net.sendTo(id, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode });
        } else if (data.type === 'rejoin') handleRejoin(id, data);
        else if (data.type === 'ship-pos') {
          if (phase !== 'playing' || !player(id)) return;
          const pos = safeShipPosition(data.x, data.y);
          if (!pos) return;
          remotePositions[id] = pos;
          net.broadcast({ type: 'ship-pos', id, x: pos.x, y: pos.y });
        } else if (data.type === 'ship-status') {
          if (phase !== 'playing' || !player(id) || typeof data.lives !== 'number') return;
          latestLivesById[id] = data.lives;
          net.broadcast({ type: 'ship-status', id, lives: data.lives, invulnUntil: data.invulnUntil });
        } else if (data.type === 'hit-enemy') {
          if (phase !== 'playing' || !player(id) || typeof data.enemyId !== 'string') return;
          const maxHp = SkyRaidLogic.enemyMaxHpFromId(seed, data.enemyId, roster.length);
          if (!Number.isFinite(maxHp) || maxHp <= 0) return;
          const nowElapsedMs = elapsedNow(Date.now());
          if (!SkyRaidLogic.computeEnemies(seed, nowElapsedMs, ledger.deadEnemies, roster.length).some((enemy) => enemy.id === data.enemyId)) return;
          const result = SkyRaidLogic.applyEnemyHit(ledger, data.enemyId, id, maxHp, nowElapsedMs);
          if (result.killed) myDeadEnemies.set(data.enemyId, result.deathElapsedMs);
          net.broadcast({ type: 'enemy-hit', enemyId: data.enemyId, byId: id, killed: result.killed, deathElapsedMs: result.deathElapsedMs });
        } else if (data.type === 'hit-boss') {
          if (phase !== 'playing' || !player(id) || typeof data.bossId !== 'string') return;
          const cycle = SkyRaidLogic.bossCycleFromId(data.bossId);
          if (!Number.isFinite(cycle) || !SkyRaidLogic.cycleKind(cycle).endsWith('boss')) return;
          const maxHp = SkyRaidLogic.bossMaxHp(cycle, roster.length);
          const nowElapsedMs = elapsedNow(Date.now());
          if (!SkyRaidLogic.computeBosses(seed, nowElapsedMs, ledger.deadBosses, roster.length).some((boss) => boss.id === data.bossId)) return;
          const result = SkyRaidLogic.applyBossHit(ledger, data.bossId, id, maxHp, nowElapsedMs);
          knownBossHp[data.bossId] = result.hp;
          if (result.killed) { myDeadBosses.set(data.bossId, result.deathElapsedMs); delete knownBossHp[data.bossId]; }
          net.broadcast({ type: 'boss-hit', bossId: data.bossId, byId: id, killed: result.killed, hp: result.hp, deathElapsedMs: result.deathElapsedMs });
        } else if (data.type === 'pickup-item') {
          if (phase !== 'playing' || !player(id) || typeof data.itemId !== 'string' || !ledger) return;
          const now = Date.now();
          const item = currentItem(data.itemId, now, ledger.collectedItems, ledger.deadEnemies, ledger.deadBosses);
          commitItemPickup(item, id, now);
        } else if (data.type === 'sync-request') { if (phase === 'lobby') net.sendTo(id, { type: 'roster', players: publicRoster() }); else if (player(id)) net.sendTo(id, snapshot()); }
      },
      onPeerDisconnected(id) { if (phase === 'lobby' || phase === 'result') { roster = SkyRaidLogic.removePlayer(roster, id); renderRoster(); broadcastRoster(); } else if (phase === 'playing') deferDisconnect(id); },
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
  $('solo').addEventListener('click', () => {
    myName = $('name').value.trim().slice(0, 10) || 'あなた';
    isHost = true; myId = HOST_ID; net = null; conn = null; roomCode = ''; soloMode = true;
    roster = [{ id: HOST_ID, name: myName, token: null, joinOrder: 1 }];
    WakeLockHelper.enable();
    hostStartGame();
  });

  $('copy').addEventListener('click', () => navigator.clipboard && navigator.clipboard.writeText(roomCode));
  $('start').addEventListener('click', hostStartGame);
  $('again').addEventListener('click', hostStartGame);
  $('quit').addEventListener('click', () => {
    clearPending(); stopRenderLoop(); stopPositionSync(); stopLobbySync(); WakeLockHelper.disable(); RejoinStorage.clear(GAME_KEY);
    location.reload();
  });

  const saved = RejoinStorage.load(GAME_KEY);
  if (saved && saved.roomCode && saved.token && saved.name) connectGuest(saved);
})();
