(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const setup = $('setup'), lobby = $('lobby'), game = $('game'), result = $('result'), guess = $('guess');
  const nameInput = $('name'), codeInput = $('code'), error = $('error'), rosterEl = $('roster');
  let isHost = false, myId = 'host', myName = '', conn = null, net = null, roster = [], round = null, myWord = '', votes = {}, voted = false, speakingOrder = [], scopeId = '', pendingVote = null;
  const processedActions = new Set();
  const rejoinTimers = new Map();
  let roomCode = '', playerToken = '', joinRequestId = '', savedSession = RejoinStorage.load('word-wolf');
  const HOST_ID = 'host';
  const REJOIN_GRACE_MS = 30000;
  let usedPairs = [];
  let amWolfGuesser = false;

  function showError(message) { error.textContent = message || ''; }
  function publicRoster() { return roster.map((p) => ({ id: p.id, name: p.name })); }
  function renderRoster() { rosterEl.innerHTML = ''; roster.forEach((p) => { const li = document.createElement('li'); li.textContent = p.name + (p.id === myId ? '（あなた）' : ''); rosterEl.appendChild(li); }); $('start').disabled = !WordWolfLogic.hasMinPlayers(roster); }
  function nameFor(id, list = roster) { const player = list.find((p) => p.id === id); return player ? player.name : '不明な参加者'; }
  function broadcastRoster() { if (net) net.broadcast({ type: 'roster', players: publicRoster() }); }
  function currentPhase() { return result.classList.contains('hidden') ? (guess.classList.contains('hidden') ? (game.classList.contains('hidden') ? 'lobby' : ($('vote').classList.contains('hidden') ? 'playing' : 'vote')) : 'guess') : 'result'; }
  function snapshotFor(id) { const phase = currentPhase(); return { type: 'state-snapshot', snapshotVersion: 1, phase, scopeId, roster: publicRoster(), word: round && round.words[id], speakingOrder, guessData: round && (phase === 'guess' || phase === 'result') ? { wolfId: round.wolfId, wolfName: nameFor(round.wolfId), tally: WordWolfLogic.tallyVotes(votes) } : null }; }
  function replaceId(oldId, newId) { roster.forEach((p) => { if (p.id === oldId) p.id = newId; }); if (round) { if (round.wolfId === oldId) round.wolfId = newId; if (round.words[oldId] !== undefined) { round.words[newId] = round.words[oldId]; delete round.words[oldId]; } } speakingOrder = speakingOrder.map((id) => id === oldId ? newId : id); if (votes[oldId] !== undefined) { votes[newId] = votes[oldId]; delete votes[oldId]; } Object.keys(votes).forEach((id) => { if (votes[id] === oldId) votes[id] = newId; }); }
  function receive(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'roster') { roster = data.players; renderRoster(); }
    if (data.type === 'word') { myWord = data.word; speakingOrder = data.speakingOrder || []; scopeId = data.scopeId || scopeId; WakeLockHelper.enable(); enterGame(); }
    if (data.type === 'vote-phase') enterVote();
    if (data.type === 'guess-phase') enterGuess(data);
    if (data.type === 'result') showResult(data);
    if (data.type === 'join-ack' && data.joinRequestId === joinRequestId) { roomCode = data.roomCode; RejoinStorage.save('word-wolf', { roomCode, token: playerToken, name: myName }); }
    if (data.type === 'rejoin-ack' && data.rejoinRequestId === joinRequestId) { roomCode = data.roomCode; RejoinStorage.save('word-wolf', { roomCode, token: playerToken, name: myName }); }
    if (data.type === 'rejoin-rejected') { RejoinStorage.clear('word-wolf'); showError('再参加の有効期限が切れました。通常参加してください。'); }
    if (data.type === 'state-snapshot' && data.snapshotVersion === 1) { scopeId = data.scopeId || ''; roster = data.roster || []; myWord = data.word || ''; speakingOrder = data.speakingOrder || []; renderRoster(); if (data.phase === 'playing') enterGame(); else if (data.phase === 'vote') { enterGame(); enterVote(); } else if (data.phase === 'guess' && data.guessData) enterGuess(data.guessData); else { lobby.classList.remove('hidden'); setup.classList.add('hidden'); } }
    if (data.type === 'vote-ack' && pendingVote && data.actionId === pendingVote.actionId && data.scopeId === scopeId) { pendingVote.attempt.confirm(); pendingVote = null; }
    if (data.type === 'peer-id-changed' && typeof data.oldId === 'string' && typeof data.newId === 'string') { roster.forEach((p) => { if (p.id === data.oldId) p.id = data.newId; }); speakingOrder = speakingOrder.map((id) => id === data.oldId ? data.newId : id); renderRoster(); if (!game.classList.contains('hidden')) renderSpeakingOrder(); }
  }
function peerError(err) { showError(PeerErrors.describe(err)); $('host').disabled = false; $('join').disabled = false; console.error(err); }

  $('host').addEventListener('click', () => {
    myName = nameInput.value.trim(); if (!myName) return showError('ニックネームを入力してください。');
    isHost = true; myId = HOST_ID; roster = [{ id: HOST_ID, name: myName, token: 'host' }]; $('host').disabled = true; $('join').disabled = true;
    net = WordWolfNet.hostRoom({
      onCode(code) { roomCode = code; $('room-code').textContent = code; $('host-code').classList.remove('hidden'); $('status').textContent = '参加者を待っています'; lobby.classList.remove('hidden'); renderRoster(); WakeLockHelper.enable(); },
      onPeerConnected() {}, onPeerMessage(id, data) { if (!data || typeof data !== 'object' || Array.isArray(data)) return; if (data.type === 'join') { const existing = roster.find((p) => p.token === data.token); if (!existing) roster.push({ id, name: String(data.name || '参加者').slice(0, 10), token: data.token }); renderRoster(); broadcastRoster(); net.sendTo(id, { type: 'join-ack', joinRequestId: data.joinRequestId, roomCode }); } else if (data.type === 'rejoin') { const player = roster.find((p) => p.token === data.token); const pending = player && rejoinTimers.get(data.token); if (!player || !pending) { net.sendTo(id, { type: 'rejoin-rejected', rejoinRequestId: data.rejoinRequestId }); return; } clearTimeout(pending.timer); rejoinTimers.delete(data.token); const oldId = player.id; replaceId(oldId, id); renderRoster(); net.broadcast({ type: 'peer-id-changed', oldId, newId: id }); broadcastRoster(); net.sendTo(id, { type: 'rejoin-ack', rejoinRequestId: data.rejoinRequestId, roomCode }); net.sendTo(id, snapshotFor(id)); } else if (data.type === 'vote' && data.scopeId === scopeId && data.actionId) { const key = id + ':vote:' + data.scopeId + ':' + data.actionId; if (!processedActions.has(key)) { processedActions.add(key); votes[id] = data.target; updateProgress(); } net.sendTo(id, { type: 'vote-ack', actionId: data.actionId, scopeId: data.scopeId }); } else if (data.type === 'guess' && round && id === round.wolfId && currentPhase() === 'guess' && data.scopeId === scopeId && data.actionId) { const key = id + ':guess:' + data.scopeId + ':' + data.actionId; if (!processedActions.has(key)) { processedActions.add(key); finishGuess(String(data.answer || '')); } net.sendTo(id, { type: 'guess-ack', actionId: data.actionId, scopeId: data.scopeId }); } },
      onPeerDisconnected(id) { const player = roster.find((p) => p.id === id); if (!player) return; if (game.classList.contains('hidden') && guess.classList.contains('hidden')) { roster = WordWolfLogic.removePlayer(roster, id); renderRoster(); broadcastRoster(); return; } const timer = setTimeout(() => { rejoinTimers.delete(player.token); roster = WordWolfLogic.removePlayer(roster, id); broadcastRoster(); $('disconnect').textContent = player.name + 'さんが戻らなかったため、ゲームを終了してください。'; }, REJOIN_GRACE_MS); rejoinTimers.set(player.token, { oldPeerId: id, timer, disconnectedAt: Date.now() }); $('disconnect').textContent = player.name + 'さんの再接続を30秒待っています…'; },
      onConnectionHealthChange(id, healthy) { $('disconnect').textContent = healthy ? '' : '通信が不安定です。再接続を試みています…'; },
      onError: peerError,
    });
  });
  $('join').addEventListener('click', () => {
    myName = nameInput.value.trim(); const code = codeInput.value.trim();
    if (!myName) return showError('ニックネームを入力してください。'); if (code.length !== 6) return showError('6桁のルームコードを入力してください。');
    $('host').disabled = true; $('join').disabled = true; roomCode = code; playerToken = savedSession && savedSession.roomCode === code ? savedSession.token : RejoinStorage.newToken(); joinRequestId = RejoinStorage.newToken();
    net = WordWolfNet.joinRoom(code, { onOwnId(id) { myId = id; }, onConnected(c) { conn = c; if (savedSession && savedSession.roomCode === code) c.send({ type: 'rejoin', token: playerToken, name: myName, rejoinRequestId: joinRequestId }); else c.send({ type: 'join', name: myName, token: playerToken, joinRequestId }); lobby.classList.remove('hidden'); $('status').textContent = 'ホストからの開始を待っています'; }, onMessage: receive, onDisconnected() { $('disconnect').textContent = 'ホストとの接続が切れました。'; }, onConnectionHealthChange(healthy) { $('disconnect').textContent = healthy ? '' : '通信が不安定です。再接続を試みています…'; }, onError(err) { if (savedSession && savedSession.roomCode === code && err && err.type === 'peer-unavailable') { RejoinStorage.clear('word-wolf'); savedSession = null; } peerError(err); } });
  });
  $('copy').addEventListener('click', () => navigator.clipboard && navigator.clipboard.writeText($('room-code').textContent));

  function startRound() {
    round = WordWolfLogic.createRound(roster.map((p) => p.id), Math.random, WordWolfLogic.WORD_PAIRS, usedPairs);
    usedPairs = round.usedPairs;
    votes = {}; scopeId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    speakingOrder = WordWolfLogic.buildSpeakingOrder(roster.map((p) => p.id));
    roster.forEach((p) => { const data = { type: 'word', word: round.words[p.id], speakingOrder: speakingOrder, scopeId }; if (p.id === HOST_ID) { myWord = data.word; } else net.sendTo(p.id, data); });
    enterGame();
  }
  $('start').addEventListener('click', () => { if (isHost && WordWolfLogic.hasMinPlayers(roster)) startRound(); });
  function renderSpeakingOrder() { const listEl = $('speaking-order'); listEl.innerHTML = ''; speakingOrder.forEach((id) => { const li = document.createElement('li'); li.textContent = nameFor(id) + (id === myId ? '（あなた）' : ''); listEl.appendChild(li); }); }
  function enterGame() { setup.classList.add('hidden'); lobby.classList.add('hidden'); result.classList.add('hidden'); guess.classList.add('hidden'); game.classList.remove('hidden'); $('word').textContent = myWord; renderSpeakingOrder(); $('instruction').textContent = '発言順の通りに特徴を一言ずつ話し、全員で3周したらホストが投票を始めてください。'; $('start-vote').classList.toggle('hidden', !isHost); $('reroll-word-btn').classList.toggle('hidden', !isHost); $('vote').classList.add('hidden'); }
  $('start-vote').addEventListener('click', () => { if (!isHost) return; $('reroll-word-btn').classList.add('hidden'); net.broadcast({ type: 'vote-phase' }); enterVote(); });
  function hostRerollWord() {
    if (!isHost || !round) return;
    const sel = WordWolfLogic.selectWordPair(Math.random, WordWolfLogic.WORD_PAIRS, usedPairs);
    usedPairs = sel.used;
    const pair = sel.pair;
    const citizenWord = pair[0], wolfWord = pair[1], words = {};
    roster.forEach((p) => { words[p.id] = p.id === round.wolfId ? wolfWord : citizenWord; });
    round = { wolfId: round.wolfId, citizenWord, wolfWord, words };
    roster.forEach((p) => { const data = { type: 'word', word: round.words[p.id], speakingOrder }; if (p.id === HOST_ID) myWord = data.word; else net.sendTo(p.id, data); });
    enterGame();
  }
  $('reroll-word-btn').addEventListener('click', hostRerollWord);
  function enterVote() { voted = false; $('start-vote').classList.add('hidden'); $('vote').classList.remove('hidden'); $('vote-status').textContent = ''; $('candidates').innerHTML = ''; roster.filter((p) => p.id !== myId).forEach((p) => { const button = document.createElement('button'); button.textContent = p.name; button.addEventListener('click', () => castVote(p.id, button)); $('candidates').appendChild(button); }); $('tally-box').classList.toggle('hidden', !isHost); updateProgress(); }
  function castVote(target, button) { voted = true; [...$('candidates').children].forEach((b) => b.classList.remove('selected')); button.classList.add('selected'); if (isHost) { $('vote-status').textContent = '投票しました。（集計開始まで変更できます）'; votes[myId] = target; updateProgress(); } else { if (pendingVote) pendingVote.attempt.cancel(); const actionId = Date.now().toString(36) + Math.random().toString(36).slice(2); const payload = { type: 'vote', target, actionId, scopeId }; const attempt = AckSend.attempt({ send() { conn.send(payload); }, onPending() { [...$('candidates').children].forEach((b) => { b.disabled = true; }); $('vote-status').textContent = '投票を送信中です…'; }, onConfirmed() { [...$('candidates').children].forEach((b) => { b.disabled = false; }); $('vote-status').textContent = '投票しました。（集計開始まで変更できます）'; }, onFailed() { pendingVote = null; voted = false; [...$('candidates').children].forEach((b) => { b.disabled = false; }); $('vote-status').textContent = '投票を確認できませんでした。もう一度選んでください。'; }, timeoutMs: 10000 }); pendingVote = { actionId, attempt }; } }
  function updateProgress() { if (isHost) $('progress').textContent = '投票: ' + Object.keys(votes).length + '/' + roster.length + '人'; }
  $('tally').addEventListener('click', () => {
    if (!isHost || !round) return;
    if (Object.keys(votes).length < roster.length) { $('progress').textContent = '全員の投票を待っています（' + Object.keys(votes).length + '/' + roster.length + '人）'; return; }
    const tally = WordWolfLogic.tallyVotes(votes); const wolfSelected = !tally.isTie && tally.selectedIds[0] === round.wolfId;
    if (!wolfSelected) return finish({ winner: 'wolf', reason: tally.isTie ? '投票が同数でした。' : '市民が選ばれました。', tally });
    const data = { type: 'guess-phase', wolfId: round.wolfId, wolfName: nameFor(round.wolfId), tally }; net.broadcast(data); enterGuess(data);
  });
  function enterGuess(data) {
    game.classList.add('hidden'); guess.classList.remove('hidden');
    const amWolf = myId === data.wolfId;
    amWolfGuesser = amWolf;
    $('guess-message').textContent = amWolf ? 'ワードウルフだと見破られました。市民側のお題を当てれば、逆転勝ちです。' : data.wolfName + ' をワードウルフとして見破りました。市民側のお題を予想中です。';
    $('guess-input').classList.toggle('hidden', !amWolf); $('guess-btn').classList.toggle('hidden', !amWolf);
  }
  $('guess-btn').addEventListener('click', () => { const answer = $('guess-input').value.trim(); if (!answer || currentPhase() !== 'guess' || !amWolfGuesser) return; if (isHost) finishGuess(answer); else conn.send({ type: 'guess', answer, scopeId, actionId: RejoinStorage.newToken() }); });
  function finishGuess(answer) {
    const correct = WordWolfLogic.isCorrectAnswer(answer, round.citizenWord);
    finish({ winner: correct ? 'wolf' : 'citizen', reason: correct ? 'ワードウルフが市民側のお題を当てました！' : 'ワードウルフは市民側のお題を当てられませんでした。', tally: WordWolfLogic.tallyVotes(votes), answer });
  }
  function finish(data) { const payload = { type: 'result', winner: data.winner, reason: data.reason, citizenWord: round.citizenWord, wolfWord: round.wolfWord, wolfName: nameFor(round.wolfId), counts: data.tally.counts }; net.broadcast(payload); showResult(payload); }
  function showResult(data) { game.classList.add('hidden'); guess.classList.add('hidden'); $('disconnect').classList.add('hidden'); result.classList.remove('hidden'); $('result-title').textContent = data.winner === 'wolf' ? '🐺 ワードウルフの勝ち！' : '🎉 市民の勝ち！'; $('result-detail').textContent = data.reason + ' ワードウルフは「' + data.wolfName + '」でした。'; $('citizen-word').textContent = data.citizenWord; $('wolf-word').textContent = data.wolfWord; $('counts').innerHTML = ''; Object.keys(data.counts || {}).forEach((id) => { const li = document.createElement('li'); li.textContent = nameFor(id) + '：' + data.counts[id] + '票'; $('counts').appendChild(li); }); $('again').classList.toggle('hidden', !isHost); }
  $('again').addEventListener('click', startRound); $('quit').addEventListener('click', () => { WakeLockHelper.disable(); RejoinStorage.clear('word-wolf'); location.reload(); });
  if (savedSession && savedSession.roomCode && savedSession.name) { nameInput.value = savedSession.name; codeInput.value = savedSession.roomCode; setTimeout(() => $('join').click(), 0); }
})();
