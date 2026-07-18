(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const setup = $('setup'), lobby = $('lobby'), game = $('game'), result = $('result'), guess = $('guess');
  const nameInput = $('name'), codeInput = $('code'), error = $('error'), rosterEl = $('roster');
  let isHost = false, myId = 'host', myName = '', conn = null, net = null, roster = [], round = null, myWord = '', votes = {}, voted = false;
  const HOST_ID = 'host';

  function showError(message) { error.textContent = message || ''; }
  function renderRoster() { rosterEl.innerHTML = ''; roster.forEach((p) => { const li = document.createElement('li'); li.textContent = p.name + (p.id === myId ? '（あなた）' : ''); rosterEl.appendChild(li); }); $('start').disabled = !WordWolfLogic.hasMinPlayers(roster); }
  function nameFor(id, list = roster) { const player = list.find((p) => p.id === id); return player ? player.name : '不明な参加者'; }
  function broadcastRoster() { if (net) net.broadcast({ type: 'roster', players: roster }); }
  function receive(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'roster') { roster = data.players; renderRoster(); }
    if (data.type === 'word') { myWord = data.word; enterGame(); }
    if (data.type === 'vote-phase') enterVote();
    if (data.type === 'guess-phase') enterGuess(data);
    if (data.type === 'result') showResult(data);
  }
  function peerError(err) { showError('接続できませんでした。ルームコードや通信状態を確認してください。'); console.error(err); }

  $('host').addEventListener('click', () => {
    myName = nameInput.value.trim(); if (!myName) return showError('ニックネームを入力してください。');
    isHost = true; myId = HOST_ID; roster = [{ id: HOST_ID, name: myName }]; $('host').disabled = true; $('join').disabled = true;
    net = WordWolfNet.hostRoom({
      onCode(code) { $('room-code').textContent = code; $('host-code').classList.remove('hidden'); $('status').textContent = '参加者を待っています'; lobby.classList.remove('hidden'); renderRoster(); },
      onPeerConnected() {}, onPeerMessage(id, data) { if (data.type === 'join') { roster = WordWolfLogic.addPlayer(roster, { id, name: String(data.name || '参加者').slice(0, 10) }); renderRoster(); broadcastRoster(); } else if (data.type === 'vote') { votes[id] = data.target; updateProgress(); } else if (data.type === 'guess') finishGuess(String(data.answer || '')); },
      onPeerDisconnected(id) { roster = WordWolfLogic.removePlayer(roster, id); renderRoster(); broadcastRoster(); }, onError: peerError,
    });
  });
  $('join').addEventListener('click', () => {
    myName = nameInput.value.trim(); const code = codeInput.value.trim();
    if (!myName) return showError('ニックネームを入力してください。'); if (code.length !== 6) return showError('6桁のルームコードを入力してください。');
    $('host').disabled = true; $('join').disabled = true;
    net = WordWolfNet.joinRoom(code, { onOwnId(id) { myId = id; }, onConnected(c) { conn = c; c.send({ type: 'join', name: myName }); lobby.classList.remove('hidden'); $('status').textContent = 'ホストからの開始を待っています'; }, onMessage: receive, onDisconnected() { $('disconnect').textContent = 'ホストとの接続が切れました。'; }, onError: peerError });
  });
  $('copy').addEventListener('click', () => navigator.clipboard && navigator.clipboard.writeText($('room-code').textContent));

  function startRound() {
    round = WordWolfLogic.createRound(roster.map((p) => p.id)); votes = {};
    roster.forEach((p) => { const data = { type: 'word', word: round.words[p.id] }; if (p.id === HOST_ID) { myWord = data.word; } else net.sendTo(p.id, data); });
    enterGame();
  }
  $('start').addEventListener('click', () => { if (isHost && WordWolfLogic.hasMinPlayers(roster)) startRound(); });
  function enterGame() { setup.classList.add('hidden'); lobby.classList.add('hidden'); result.classList.add('hidden'); guess.classList.add('hidden'); game.classList.remove('hidden'); $('word').textContent = myWord; $('instruction').textContent = '順番に特徴を一言ずつ話し、全員で3周したらホストが投票を始めてください。'; $('start-vote').classList.toggle('hidden', !isHost); $('vote').classList.add('hidden'); }
  $('start-vote').addEventListener('click', () => { if (!isHost) return; net.broadcast({ type: 'vote-phase' }); enterVote(); });
  function enterVote() { voted = false; $('start-vote').classList.add('hidden'); $('vote').classList.remove('hidden'); $('vote-status').textContent = ''; $('candidates').innerHTML = ''; roster.filter((p) => p.id !== myId).forEach((p) => { const button = document.createElement('button'); button.textContent = p.name; button.addEventListener('click', () => castVote(p.id, button)); $('candidates').appendChild(button); }); $('tally-box').classList.toggle('hidden', !isHost); updateProgress(); }
  function castVote(target, button) { if (voted) return; voted = true; [...$('candidates').children].forEach((b) => b.disabled = true); button.classList.add('selected'); $('vote-status').textContent = '投票しました。'; if (isHost) { votes[myId] = target; updateProgress(); } else conn.send({ type: 'vote', target }); }
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
    $('guess-message').textContent = amWolf ? 'ワードウルフだと見破られました。市民側のお題を当てれば、逆転勝ちです。' : data.wolfName + ' をワードウルフとして見破りました。市民側のお題を予想中です。';
    $('guess-input').classList.toggle('hidden', !amWolf); $('guess-btn').classList.toggle('hidden', !amWolf);
  }
  $('guess-btn').addEventListener('click', () => { const answer = $('guess-input').value.trim(); if (!answer) return; if (isHost) finishGuess(answer); else conn.send({ type: 'guess', answer }); });
  function finishGuess(answer) {
    const correct = WordWolfLogic.isCorrectAnswer(answer, round.citizenWord);
    finish({ winner: correct ? 'wolf' : 'citizen', reason: correct ? 'ワードウルフが市民側のお題を当てました！' : 'ワードウルフは市民側のお題を当てられませんでした。', tally: WordWolfLogic.tallyVotes(votes), answer });
  }
  function finish(data) { const payload = { type: 'result', winner: data.winner, reason: data.reason, citizenWord: round.citizenWord, wolfWord: round.wolfWord, wolfName: nameFor(round.wolfId), counts: data.tally.counts }; net.broadcast(payload); showResult(payload); }
  function showResult(data) { game.classList.add('hidden'); guess.classList.add('hidden'); $('disconnect').classList.add('hidden'); result.classList.remove('hidden'); $('result-title').textContent = data.winner === 'wolf' ? '🐺 ワードウルフの勝ち！' : '🎉 市民の勝ち！'; $('result-detail').textContent = data.reason + ' ワードウルフは「' + data.wolfName + '」でした。'; $('citizen-word').textContent = data.citizenWord; $('wolf-word').textContent = data.wolfWord; $('counts').innerHTML = ''; Object.keys(data.counts || {}).forEach((id) => { const li = document.createElement('li'); li.textContent = nameFor(id) + '：' + data.counts[id] + '票'; $('counts').appendChild(li); }); $('again').classList.toggle('hidden', !isHost); }
  $('again').addEventListener('click', startRound); $('quit').addEventListener('click', () => location.reload());
})();
