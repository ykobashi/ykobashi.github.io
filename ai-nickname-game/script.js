(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const HOST_ID = 'host';
  const GAME_KEY = 'ai-nickname-game';
  const REJOIN_GRACE_MS = 30000;
  const L = AiNicknameGameLogic;
  const el = {};
  ['setup-screen','name-input','host-btn','join-code-input','join-btn','online-error','lobby-panel','host-wait','room-code-text','copy-code-btn','online-status','roster-list','start-btn','game-area','round-status','character-image','character-tags-list','submit-phase','guest-submit-box','nickname-input','submit-nickname-btn','fake-submitted-status','host-collect-box','collection-list','collect-next-btn','voting-phase','guest-vote-box','entries-list','vote-submitted-status','host-vote-box','vote-progress-text','tally-btn','game-connection-status','quit-btn','result-overlay','result-character-image','result-round-label','result-real-nickname','result-correct-voters','result-most-deceptive','result-tally-list','result-round-delta-list','result-scoreboard-list','result-next-btn','result-home-link'].forEach((id) => { el[id] = $(id); });

  let isHost = false, myId = null, myName = '', net = null, conn = null, roster = [];
  let currentCharacter = null, currentRealNickname = '', currentRound = 0;
  let fakes = [], entries = null, votes = {}, scores = {}, myEntryId = null;
  let submitted = false, voted = false, phase = 'lobby', roomCode = '', playerToken = '', joinRequestId = '';
  let currentCharacterPayload = null, currentResultPayload = null;
  let usedCharacterIds = [];
  const processedActions = new Set();
  const pendingRejoins = new Map();
  let savedSession = RejoinStorage.load(GAME_KEY);
  let pendingAction = null;

  function showError(text) { el['online-error'].textContent = text; el['online-error'].classList.remove('hidden'); el['host-btn'].disabled = false; el['join-btn'].disabled = false; }
  function nameFor(id, list) { const p = (list || roster).find((x) => x.id === id); return p ? p.name : id; }
  function publicRoster() { return roster.map((p) => ({ id: p.id, name: p.name })); }
  function publicScores() { const result = {}; roster.forEach((p) => { result[p.id] = scores[p.token] || 0; }); return result; }
  function tokenForId(id) { const p = roster.find((x) => x.id === id); return p ? p.token : null; }
  function renderRoster() {
    el['roster-list'].innerHTML = '';
    roster.forEach((p) => { const li = document.createElement('li'); li.className = 'roster-item'; li.textContent = p.name + (p.id === myId ? '（あなた）' : ''); el['roster-list'].appendChild(li); });
    if (isHost) { el['start-btn'].classList.remove('hidden'); el['start-btn'].disabled = !L.hasMinPlayers(roster); }
  }
  function broadcastRoster() { net.broadcast({ type: 'roster', players: publicRoster() }); }
  function enterLobby() { phase = 'lobby'; el['setup-screen'].classList.add('hidden'); el['lobby-panel'].classList.remove('hidden'); renderRoster(); }
  function setHealth(a, b) { const healthy = typeof b === 'boolean' ? b : a; el['game-connection-status'].textContent = healthy ? '' : '通信が不安定です。再接続を試みています…'; el['game-connection-status'].classList.toggle('hidden', healthy); }

  function replacePlayerId(oldId, newId) {
    const player = roster.find((p) => p.id === oldId);
    if (player) player.id = newId;
    fakes.forEach((fake) => { if (fake.authorId === oldId) fake.authorId = newId; });
    if (entries) entries.forEach((entry) => { if (entry.authorId === oldId) entry.authorId = newId; });
    if (Object.prototype.hasOwnProperty.call(votes, oldId)) { votes[newId] = votes[oldId]; delete votes[oldId]; }
    Object.keys(votes).forEach((id) => { if (votes[id] === oldId) votes[id] = newId; });
    if (currentResultPayload) {
      const replace = (ids) => (ids || []).map((id) => id === oldId ? newId : id);
      currentResultPayload.correctVoterIds = replace(currentResultPayload.correctVoterIds);
      if (currentResultPayload.mostDeceptiveAuthorId === oldId) currentResultPayload.mostDeceptiveAuthorId = newId;
      if (currentResultPayload.roundScoreDelta && Object.prototype.hasOwnProperty.call(currentResultPayload.roundScoreDelta, oldId)) {
        currentResultPayload.roundScoreDelta[newId] = currentResultPayload.roundScoreDelta[oldId];
        delete currentResultPayload.roundScoreDelta[oldId];
      }
      currentResultPayload.entries.forEach((entry) => { if (entry.authorId === oldId) entry.authorId = newId; });
      currentResultPayload.roster = publicRoster();
      currentResultPayload.totalScores = publicScores();
    }
  }

  function snapshotFor(id) {
    const base = { type: 'state-snapshot', snapshotVersion: 1, phase, roster: publicRoster() };
    if (phase === 'submit' && currentCharacterPayload) return Object.assign(base, { character: currentCharacterPayload, submittedIds: fakes.map((f) => f.authorId), submitted: fakes.some((f) => f.authorId === id) });
    if (phase === 'vote' && currentCharacterPayload && entries) {
      const own = entries.find((e) => e.authorId === id);
      return Object.assign(base, { character: currentCharacterPayload, entries: entries.map((e) => ({ id: e.id, text: e.text })), myEntryId: own ? own.id : null, voterIds: Object.keys(votes), votedEntryId: votes[id] || null });
    }
    if (phase === 'result' && currentResultPayload) return Object.assign(base, { result: currentResultPayload });
    return base;
  }

  el['host-btn'].onclick = () => {
    const name = el['name-input'].value.trim();
    if (!name) return showError('名前を入力してください。');
    myName = name; myId = HOST_ID; isHost = true; roster = [{ id: myId, name, token: 'host' }];
    el['host-btn'].disabled = true; el['join-btn'].disabled = true;
    net = AiNicknameGameNet.hostRoom({
      onCode(code) { roomCode = code; WakeLockHelper.enable(); el['room-code-text'].textContent = code; el['host-wait'].classList.remove('hidden'); el['online-status'].textContent = '参加を待っています…'; enterLobby(); },
      onPeerConnected(peerId) { net.sendTo(peerId, { type: 'roster', players: publicRoster() }); },
      onPeerMessage: handleHostMessage,
      onPeerDisconnected(id) {
        const player = roster.find((p) => p.id === id);
        if (!player) return;
        if (phase === 'lobby') { roster = L.removePlayer(roster, id); broadcastRoster(); renderRoster(); return; }
        const timer = setTimeout(() => {
          pendingRejoins.delete(player.token);
          roster = L.removePlayer(roster, id);
          fakes = fakes.filter((f) => f.authorId !== id);
          delete votes[id];
          broadcastRoster(); renderRoster();
          el['game-connection-status'].textContent = player.name + 'さんが戻らなかったため、ゲームを終了してください。';
        }, REJOIN_GRACE_MS);
        pendingRejoins.set(player.token, { oldId: id, timer });
        el['game-connection-status'].textContent = player.name + 'さんの再参加を30秒待っています…';
        el['game-connection-status'].classList.remove('hidden');
      },
      onConnectionHealthChange: setHealth,
      onError(err) { showError(PeerErrors.describe(err)); },
    });
  };

  el['join-btn'].onclick = () => {
    const name = el['name-input'].value.trim();
    const code = el['join-code-input'].value.trim().toUpperCase();
    if (!name || code.length !== 6) return showError('名前と6桁コードを入力してください。');
    myName = name; roomCode = code; el['join-btn'].disabled = true; el['host-btn'].disabled = true;
    playerToken = savedSession && savedSession.roomCode === code ? savedSession.token : RejoinStorage.newToken();
    joinRequestId = RejoinStorage.newToken();
    net = AiNicknameGameNet.joinRoom(code, {
      onOwnId(id) { myId = id; },
      onConnected(c) {
        conn = c;
        if (savedSession && savedSession.roomCode === code) c.send({ type: 'rejoin', token: playerToken, name: myName, rejoinRequestId: joinRequestId });
        else c.send({ type: 'join', name: myName, token: playerToken, joinRequestId });
        el['online-status'].textContent = '接続しました'; enterLobby();
      },
      onMessage: handleClientMessage,
      onDisconnected: connectionLost,
      onConnectionHealthChange: setHealth,
      onError(err) {
        if (savedSession && savedSession.roomCode === code && err && err.type === 'peer-unavailable') {
          RejoinStorage.clear(GAME_KEY);
          savedSession = null;
          el['setup-screen'].classList.remove('hidden');
          el['lobby-panel'].classList.add('hidden');
        }
        showError(PeerErrors.describe(err));
      },
    });
  };

  el['copy-code-btn'].onclick = () => navigator.clipboard && navigator.clipboard.writeText(el['room-code-text'].textContent);
  el['quit-btn'].onclick = () => { WakeLockHelper.disable(); RejoinStorage.clear(GAME_KEY); location.reload(); };

  function handleHostMessage(peerId, data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join') {
      if (phase !== 'lobby' || !data.token || roster.some((p) => p.token === data.token)) return;
      roster = L.addPlayer(roster, { id: peerId, name: String(data.name || 'ゲスト').slice(0, 10), token: data.token });
      broadcastRoster(); renderRoster();
      net.sendTo(peerId, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode });
      return;
    }
    if (data.type === 'rejoin') {
      const player = roster.find((p) => p.token === data.token);
      const pending = player && pendingRejoins.get(data.token);
      if (!player || !pending) { net.sendTo(peerId, { type: 'rejoin-rejected', rejoinRequestId: data.rejoinRequestId }); return; }
      clearTimeout(pending.timer); pendingRejoins.delete(data.token);
      replacePlayerId(player.id, peerId); broadcastRoster(); renderRoster();
      net.sendTo(peerId, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode });
      net.sendTo(peerId, snapshotFor(peerId));
      return;
    }
    if ((data.type === 'fake' || data.type === 'vote') && data.scopeId === String(currentRound) && data.actionId) {
      const key = peerId + ':' + data.type + ':' + data.scopeId + ':' + data.actionId;
      if (!processedActions.has(key)) {
        processedActions.add(key);
        if (data.type === 'fake' && phase === 'submit') acceptFake(peerId, data.text);
        if (data.type === 'vote' && phase === 'vote') acceptVote(peerId, data.votedEntryId);
      }
      net.sendTo(peerId, { type: data.type + '-ack', actionId: data.actionId, scopeId: data.scopeId });
    }
  }

  function handleClientMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'join-ack' && data.joinRequestId === joinRequestId) { RejoinStorage.save(GAME_KEY, { roomCode: data.roomCode, token: playerToken, name: myName }); return; }
    if (data.type === 'rejoin-ack' && data.rejoinRequestId === joinRequestId) { RejoinStorage.save(GAME_KEY, { roomCode: data.roomCode, token: playerToken, name: myName }); return; }
    if (data.type === 'rejoin-rejected') { RejoinStorage.clear(GAME_KEY); showError('再参加の有効期限が切れました。通常参加してください。'); return; }
    if (data.type === 'state-snapshot' && data.snapshotVersion === 1) {
      roster = data.roster || []; renderRoster();
      if (data.phase === 'submit' && data.character) { enterSubmit(data.character); if (data.submitted) markFakeSubmitted(); renderCollection(data.submittedIds || []); }
      else if (data.phase === 'vote' && data.character) { currentCharacterPayload = data.character; showCharacter(data.character); myEntryId = data.myEntryId; enterVoting(data.entries || []); if (data.votedEntryId) markVoted(data.votedEntryId); renderVoteProgress(data.voterIds || []); }
      else if (data.phase === 'result' && data.result) showResult(data.result);
      else enterLobby();
      return;
    }
    if ((data.type === 'fake-ack' || data.type === 'vote-ack') && pendingAction && data.actionId === pendingAction.id && data.scopeId === String(currentRound)) { pendingAction.attempt.confirm(); pendingAction = null; return; }
    if (data.type === 'roster') { roster = data.players; renderRoster(); return; }
    if (data.type === 'character') { myEntryId = null; enterSubmit(data); return; }
    if (data.type === 'progress') { renderCollection(data.submittedIds); return; }
    if (data.type === 'your-entry') { myEntryId = data.entryId; return; }
    if (data.type === 'entries') { enterVoting(data.entries); return; }
    if (data.type === 'vote-progress') { renderVoteProgress(data.voterIds); return; }
    if (data.type === 'result') showResult(data);
  }

  function connectionLost() { el['game-connection-status'].textContent = 'ホストとの接続が切れました。ページを再読み込みすると再参加を試みます。'; el['game-connection-status'].classList.remove('hidden'); }
  function sendAction(type, data, statusEl) {
    if (pendingAction) pendingAction.attempt.cancel();
    const id = RejoinStorage.newToken();
    const payload = Object.assign({ type, actionId: id, scopeId: String(currentRound) }, data);
    const attempt = AckSend.attempt({
      send() { conn.send(payload); },
      onPending() { statusEl.textContent = '送信中…'; statusEl.classList.remove('hidden'); },
      onConfirmed() { statusEl.textContent = type === 'vote' ? '投票しました（変更できません）' : '送信しました'; },
      onFailed() { statusEl.textContent = '送信を確認できませんでした。もう一度お試しください。'; if (type === 'fake') { submitted = false; el['nickname-input'].disabled = false; el['submit-nickname-btn'].disabled = false; } },
      timeoutMs: 10000,
    });
    pendingAction = { id, attempt };
  }

  el['start-btn'].onclick = () => { WakeLockHelper.enable(); scores = {}; currentRound = 0; roster.forEach((p) => { scores[p.token] = 0; }); startRound(); };
  function startRound() {
    if (!isHost) return;
    el['result-overlay'].classList.add('hidden'); currentResultPayload = null; currentRound++;
    const sel = L.selectRoundCharacter(Math.random, AiNicknameCharacters.CHARACTER_BANK, usedCharacterIds);
    currentCharacter = sel.entry; usedCharacterIds = sel.used;
    currentRealNickname = L.pickNickname(currentCharacter.aiNicknames); fakes = []; entries = null; votes = {}; myEntryId = null; processedActions.clear();
    currentCharacterPayload = { type: 'character', round: currentRound, totalRounds: L.ROUND_TOTAL, id: next.id, image: next.image, tags: next.tags };
    net.broadcast(currentCharacterPayload); enterSubmit(currentCharacterPayload);
  }
  function enterSubmit(data) {
    phase = 'submit'; currentRound = data.round; currentCharacterPayload = data;
    el['result-overlay'].classList.add('hidden'); el['lobby-panel'].classList.add('hidden'); el['game-area'].classList.remove('hidden'); el['submit-phase'].classList.remove('hidden'); el['voting-phase'].classList.add('hidden');
    submitted = false; voted = false; el['nickname-input'].value = ''; el['nickname-input'].disabled = false; el['submit-nickname-btn'].disabled = false; el['fake-submitted-status'].classList.add('hidden');
    showCharacter(data); el['host-collect-box'].classList.toggle('hidden', !isHost); renderCollection([]);
  }
  function setCharacterImage(img, character) {
    const image = character && typeof character === 'object' ? character.image : null;
    const allowed = typeof image === 'string' && AiNicknameCharacters.CHARACTER_BANK.some((entry) => entry.image === image);
    if (allowed) {
      img.src = image;
      img.classList.remove('hidden');
    } else {
      img.removeAttribute('src');
      img.classList.add('hidden');
    }
  }
  function showCharacter(data) { el['round-status'].textContent = 'ラウンド ' + data.round + ' / ' + data.totalRounds; setCharacterImage(el['character-image'], data); el['character-tags-list'].innerHTML = ''; data.tags.forEach((tag) => { const li = document.createElement('li'); li.textContent = tag; el['character-tags-list'].appendChild(li); }); }
  function markFakeSubmitted() { submitted = true; el['nickname-input'].disabled = true; el['submit-nickname-btn'].disabled = true; el['fake-submitted-status'].classList.remove('hidden'); el['fake-submitted-status'].textContent = '送信しました'; }
  el['submit-nickname-btn'].onclick = () => { if (submitted) return; const text = L.normalizeNickname(el['nickname-input'].value); if (!text) return; markFakeSubmitted(); if (isHost) acceptFake(myId, text); else sendAction('fake', { text }, el['fake-submitted-status']); };
  function acceptFake(authorId, text) { if (!isHost || fakes.some((x) => x.authorId === authorId)) return; const clean = L.normalizeNickname(text); if (!clean) return; fakes.push({ authorId, text: clean }); const ids = fakes.map((x) => x.authorId); net.broadcast({ type: 'progress', submittedIds: ids }); renderCollection(ids); }
  function renderCollection(ids) { el['collection-list'].innerHTML = ''; roster.forEach((p) => { const li = document.createElement('li'); li.className = 'roster-item'; li.textContent = (ids.includes(p.id) ? '✓ ' : '… ') + p.name; el['collection-list'].appendChild(li); }); el['collect-next-btn'].disabled = !isHost || !roster.every((p) => ids.includes(p.id)); }
  el['collect-next-btn'].onclick = () => {
    if (!isHost || !roster.every((p) => fakes.some((f) => f.authorId === p.id))) return;
    entries = L.buildEntryList(currentRealNickname, fakes);
    entries.forEach((entry) => { if (entry.authorId === L.REAL_AUTHOR) return; if (entry.authorId === myId) myEntryId = entry.id; else net.sendTo(entry.authorId, { type: 'your-entry', entryId: entry.id }); });
    const anon = entries.map((e) => ({ id: e.id, text: e.text })); net.broadcast({ type: 'entries', entries: anon }); enterVoting(anon);
  };
  function enterVoting(list) { phase = 'vote'; el['submit-phase'].classList.add('hidden'); el['voting-phase'].classList.remove('hidden'); voted = false; el['vote-submitted-status'].classList.add('hidden'); el['host-vote-box'].classList.toggle('hidden', !isHost); renderEntries(list); renderVoteProgress([]); }
  function markVoted(entryId) { voted = true; Array.prototype.forEach.call(el['entries-list'].children, (b) => { b.disabled = true; if (b.dataset.entryId === entryId) b.classList.add('selected'); }); el['vote-submitted-status'].classList.remove('hidden'); el['vote-submitted-status'].textContent = '投票しました'; }
  function renderEntries(list) {
    el['entries-list'].innerHTML = '';
    list.filter((e) => e.id !== myEntryId).forEach((entry) => {
      const b = document.createElement('button'); b.className = 'mode-btn entry-btn'; b.textContent = entry.text; b.dataset.entryId = entry.id;
      b.onclick = () => { if (voted) return; markVoted(entry.id); if (isHost) acceptVote(myId, entry.id); else sendAction('vote', { votedEntryId: entry.id }, el['vote-submitted-status']); };
      el['entries-list'].appendChild(b);
    });
  }
  function acceptVote(voterId, entryId) { if (!isHost || !entries.some((e) => e.id === entryId) || L.isSelfVote(entries, entryId, voterId)) return; votes[voterId] = entryId; const ids = Object.keys(votes); net.broadcast({ type: 'vote-progress', voterIds: ids }); renderVoteProgress(ids); }
  function renderVoteProgress(ids) { el['vote-progress-text'].textContent = ids.length + ' / ' + roster.length + '人が投票済み'; el['tally-btn'].disabled = !isHost || !roster.every((p) => ids.includes(p.id)); }
  el['tally-btn'].onclick = () => {
    if (!isHost || !entries) return;
    const tally = L.tallyNicknameVotes(votes, entries);
    const idDeltas = L.computeRoundScoreDeltas(tally, entries);
    const tokenDeltas = {};
    Object.keys(idDeltas).forEach((id) => { const token = tokenForId(id); if (token) tokenDeltas[token] = (tokenDeltas[token] || 0) + idDeltas[id]; });
    scores = L.applyScoreDeltas(scores, tokenDeltas);
    currentResultPayload = Object.assign({ type: 'result', round: currentRound, totalRounds: L.ROUND_TOTAL, character: currentCharacter, entries, roundScoreDelta: idDeltas, totalScores: publicScores(), isFinalRound: currentRound >= L.ROUND_TOTAL, roster: publicRoster() }, tally);
    net.broadcast(currentResultPayload); showResult(currentResultPayload);
  };
  function showResult(data) {
    phase = 'result'; currentRound = data.round; currentResultPayload = data;
    el['result-overlay'].classList.remove('hidden'); setCharacterImage(el['result-character-image'], data.character); el['result-round-label'].textContent = 'ラウンド ' + data.round + ' / ' + data.totalRounds;
    const real = data.entries.find((e) => e.authorId === L.REAL_AUTHOR); el['result-real-nickname'].textContent = real ? real.text : '—';
    el['result-correct-voters'].textContent = '正解: ' + (data.correctVoterIds.length ? data.correctVoterIds.map((id) => nameFor(id, data.roster)).join('、') : 'なし');
    el['result-most-deceptive'].textContent = '最も騙した人: ' + (data.mostDeceptiveAuthorId ? nameFor(data.mostDeceptiveAuthorId, data.roster) : 'なし');
    el['result-tally-list'].innerHTML = '';
    data.entries.forEach((entry) => { const li = document.createElement('li'); li.className = 'result-tally-item' + (entry.authorId === L.REAL_AUTHOR ? ' result-tally-real' : ''); li.textContent = entry.text + ' — ' + (entry.authorId === L.REAL_AUTHOR ? '本物' : nameFor(entry.authorId, data.roster)) + ' / ' + (data.voteCounts[entry.id] || 0) + '票'; el['result-tally-list'].appendChild(li); });
    el['result-round-delta-list'].innerHTML = ''; const deltaIds = Object.keys(data.roundScoreDelta);
    (deltaIds.length ? deltaIds : ['']).forEach((id) => { const li = document.createElement('li'); li.className = 'result-tally-item'; li.textContent = id ? nameFor(id, data.roster) + ' : +' + data.roundScoreDelta[id] + '点' : '加点なし'; el['result-round-delta-list'].appendChild(li); });
    el['result-scoreboard-list'].innerHTML = ''; L.buildScoreboard(data.totalScores, data.roster).forEach((row) => { const li = document.createElement('li'); li.textContent = row.rank + '位　' + row.name + ' — ' + row.score + '点'; el['result-scoreboard-list'].appendChild(li); });
    el['result-next-btn'].classList.toggle('hidden', !isHost); el['result-next-btn'].textContent = data.isFinalRound ? 'ゲーム終了・もう一度遊ぶ' : '次のキャラへ';
    el['result-next-btn'].onclick = () => { if (!isHost) return; if (data.isFinalRound) { scores = {}; currentRound = 0; roster.forEach((p) => { scores[p.token] = 0; }); } startRound(); };
    el['result-home-link'].onclick = () => RejoinStorage.clear(GAME_KEY);
  }

  if (savedSession && savedSession.roomCode && savedSession.token && savedSession.name) {
    el['name-input'].value = savedSession.name;
    el['join-code-input'].value = savedSession.roomCode;
    el['join-btn'].click();
  }
})();
