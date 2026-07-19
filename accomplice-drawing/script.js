(function () {
  'use strict';
  const $ = (id) => document.getElementById(id); const L = AccompliceDrawingLogic; const HOST_ID = 'host';
  const canvas = $('drawing-canvas'); const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#222'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let isHost = false, myId = null, myName = '', net = null, conn = null, drawing = null;
  let roster = [], phase = 'lobby', gameId = 0, round = 0, topic = '', allSegments = [], currentRoundSegments = [], submitted = false, selectedCandidateIds = [], voted = false;
  const hostState = { roster: [], accomplicePair: [], topics: null, drawings: new Map(), roundSubmissions: new Map(), votes: new Map() };

  function showError(message) { $('error').textContent = message || ''; }
  function playerName(id) { const player = roster.find((item) => item.id === id); return player ? player.name : '不明な参加者'; }
  function showSection(next) {
    ['setup', 'lobby', 'game', 'reveal', 'vote', 'result'].forEach((id) => $(id).classList.add('hidden'));
    if (next === 'drawing') $('game').classList.remove('hidden'); else if (next === 'voting') $('vote').classList.remove('hidden'); else if (next === 'aborted') $('game').classList.remove('hidden'); else $(next).classList.remove('hidden');
  }
  function renderRoster() { $('roster').textContent = ''; roster.forEach((p) => { const li = document.createElement('li'); li.textContent = p.name + (p.id === myId ? '（あなた）' : ''); $('roster').appendChild(li); }); $('start').disabled = !isHost || phase !== 'lobby' || !L.hasMinPlayers(roster); }
  function broadcastRoster() { if (net) net.broadcast({ type: 'roster', players: roster }); }
  function clearCanvas() { ctx.clearRect(0, 0, 320, 320); }
  function drawSegment(context, segment) { context.beginPath(); context.moveTo(segment.x0, segment.y0); context.lineTo(segment.x1, segment.y1); context.stroke(); }
  function redraw() { clearCanvas(); allSegments.forEach((segment) => drawSegment(ctx, segment)); }
  function validSegment(segment) { return !!segment && Object.getPrototypeOf(segment) === Object.prototype && ['x0', 'y0', 'x1', 'y1'].every((key) => Number.isFinite(segment[key]) && segment[key] >= 0 && segment[key] <= 320); }
  function validSegments(segments, accumulated, maxPayload = 5000) { return Array.isArray(segments) && segments.length <= maxPayload && accumulated + segments.length <= 15000 && segments.every(validSegment); }
  function currentMessage(data, expectedPhase, withRound) { return data && typeof data === 'object' && data.gameId === gameId && phase === expectedPhase && (!withRound || data.round === round); }
  function rosterHas(id) { return roster.some((p) => p.id === id); }
  function peerError(err) { console.error(err); showError('接続できませんでした。通信状態を確認してください。'); }

  function applyTopic(data) { if (!data || !Number.isInteger(data.gameId) || typeof data.topic !== 'string') return; gameId = data.gameId; topic = data.topic; allSegments = []; currentRoundSegments = []; selectedCandidateIds = []; submitted = false; voted = false; clearCanvas(); $('topic').textContent = topic; }
  function applyRoundStart(data) {
    if (!data || data.gameId !== gameId || !Number.isInteger(data.round) || data.round < 1 || data.round > L.ROUNDS) return;
    phase = 'drawing'; round = data.round; currentRoundSegments = []; submitted = false; drawing = null; $('round-label').textContent = `第${round}ターン / ${L.ROUNDS}`; $('submit-status').textContent = '他の人には、全員が提出するまで見えません。'; $('turn-done').disabled = false; canvas.style.cursor = 'crosshair'; showSection('drawing'); redraw();
  }
  function saveSubmission(senderId, segments) {
    if (phase !== 'drawing' || !rosterHas(senderId) || hostState.roundSubmissions.has(senderId)) return false;
    const accumulated = (hostState.drawings.get(senderId) || []).length;
    if (!validSegments(segments, accumulated)) return false;
    hostState.roundSubmissions.set(senderId, segments.map((s) => ({ x0:s.x0, y0:s.y0, x1:s.x1, y1:s.y1 })));
    return true;
  }
  function revealWhenReady() {
    if (hostState.roundSubmissions.size !== roster.length) return;
    roster.forEach((p) => { const merged = (hostState.drawings.get(p.id) || []).concat(hostState.roundSubmissions.get(p.id)); hostState.drawings.set(p.id, merged); });
    const drawings = Object.create(null); roster.forEach((p) => { drawings[p.id] = hostState.drawings.get(p.id); });
    const data = { type:'reveal', gameId, round, drawings }; applyReveal(data); net.broadcast(data);
  }
  function submitMine() {
    if (phase !== 'drawing' || submitted) return; submitted = true; $('turn-done').disabled = true; canvas.style.cursor = 'not-allowed'; $('submit-status').textContent = '提出済みです。全員の提出を待っています。';
    const data = { type:'turn-done', gameId, round, segments:currentRoundSegments };
    if (isHost) { if (saveSubmission(HOST_ID, data.segments)) revealWhenReady(); } else conn.send(data);
  }
  function applyReveal(data) {
    if (!currentMessage(data, 'drawing', true) || !data.drawings || typeof data.drawings !== 'object') return;
    phase = 'reveal'; const mine = data.drawings[myId]; if (Array.isArray(mine) && validSegments(mine, 0, 15000)) allSegments = mine.slice();
    $('reveal-title').textContent = `第${round}ターン：みんなの絵`; $('reveal-grid').textContent = '';
    roster.forEach((p) => { const segments = data.drawings[p.id]; if (!validSegments(segments, 0, 15000)) return; const card = document.createElement('div'); card.className = 'drawing-card'; const title = document.createElement('h3'); title.textContent = p.name; const mini = document.createElement('canvas'); mini.width = 320; mini.height = 320; const miniCtx = mini.getContext('2d'); miniCtx.strokeStyle='#222'; miniCtx.lineWidth=5; miniCtx.lineCap='round'; segments.forEach((s) => drawSegment(miniCtx, s)); card.append(title, mini); $('reveal-grid').appendChild(card); });
    $('reveal-status').textContent = isHost ? '全員の絵が揃いました。確認したら進めてください。' : 'ホストが次へ進めるまでお待ちください。'; $('next-round').classList.toggle('hidden', !isHost); $('next-round').textContent = round === L.ROUNDS ? '投票へ進む' : '次のターンへ'; showSection('reveal');
  }
  function hostAdvance() {
    if (!isHost || phase !== 'reveal') return;
    if (round < L.ROUNDS) { hostState.roundSubmissions = new Map(); const data={type:'round-start',gameId,round:round+1}; applyRoundStart(data); net.broadcast(data); }
    else { const data={type:'vote-phase',gameId,round}; applyVotePhase(data); net.broadcast(data); }
  }
  function applyVotePhase(data) {
    if (!currentMessage(data, 'reveal', true)) return; phase='voting'; selectedCandidateIds=[]; voted=false; $('candidates').textContent='';
    roster.forEach((p) => { const button=document.createElement('button'); button.type='button'; button.textContent=p.name+(p.id===myId?'（あなた）':''); button.dataset.id=p.id; button.setAttribute('aria-pressed','false'); button.addEventListener('click',()=>toggleCandidate(p.id)); $('candidates').appendChild(button); });
    $('send-vote').disabled=true; $('vote-status').textContent='2人を選んでください。'; $('tally-box').classList.toggle('hidden',!isHost); updateProgress(); showSection('voting');
  }
  function toggleCandidate(id) { if (phase!=='voting'||voted) return; const at=selectedCandidateIds.indexOf(id); if(at>=0) selectedCandidateIds.splice(at,1); else { if(selectedCandidateIds.length===2) selectedCandidateIds.shift(); selectedCandidateIds.push(id); } Array.from($('candidates').children).forEach((b)=>{ const selected=selectedCandidateIds.includes(b.dataset.id); b.classList.toggle('selected',selected); b.setAttribute('aria-pressed',String(selected)); }); $('send-vote').disabled=selectedCandidateIds.length!==2; }
  function saveVote(senderId,target) { if(phase!=='voting'||!rosterHas(senderId)||hostState.votes.has(senderId)||!Array.isArray(target)||target.length!==2||target[0]===target[1]||target.some((id)=>typeof id!=='string'||!rosterHas(id))) return false; hostState.votes.set(senderId,target.slice()); updateProgress(); return true; }
  function sendVote() { if(phase!=='voting'||voted||selectedCandidateIds.length!==2) return; voted=true; $('send-vote').disabled=true; Array.from($('candidates').children).forEach((b)=>{b.disabled=true;}); $('vote-status').textContent='投票しました。全員の投票を待っています。'; const data={type:'vote',gameId,target:selectedCandidateIds.slice()}; if(isHost) saveVote(HOST_ID,data.target); else conn.send(data); }
  function updateProgress() { if(!isHost) return; $('progress').textContent=`投票: ${hostState.votes.size}/${roster.length}人`; $('tally').disabled=phase!=='voting'||hostState.votes.size!==roster.length; }
  function tallyVotes() { if(!isHost||phase!=='voting'||hostState.votes.size!==roster.length) return; const tally=L.tallyPairVotes(hostState.votes); const trueKey=L.pairKey(hostState.accomplicePair[0],hostState.accomplicePair[1]); const allyFound=L.checkAllyFound(hostState.accomplicePair,hostState.votes); const caught=L.checkCaught(tally,trueKey); const data={type:'result',gameId,accomplicePair:hostState.accomplicePair.slice(),tally,allyFound,caught,winner:L.determineWinner({allyFound,caught})}; applyResult(data); net.broadcast(data); }
  function applyResult(data) { if(!currentMessage(data,'voting',false)||!Array.isArray(data.accomplicePair)||!data.tally) return; phase='result'; $('result-title').textContent=data.winner==='accomplice'?'🕵️ 共犯チームの勝ち！':'🎉 非共犯チームの勝ち！'; $('true-pair').textContent=`${playerName(data.accomplicePair[0])}さん ＆ ${playerName(data.accomplicePair[1])}さん`; $('result-detail').textContent=`相方発見：${data.allyFound?'成功':'失敗'} ／ 全体投票での特定：${data.caught?'成功':'失敗'}${data.tally.isTie?'（同率首位）':''}`; $('counts').textContent=''; Object.keys(data.tally.counts||{}).forEach((key)=>{ let pair; try{pair=L.parsePairKey(key);}catch(_){return;} const li=document.createElement('li'); li.textContent=`${playerName(pair[0])}さんと${playerName(pair[1])}さん：${data.tally.counts[key]}票`; $('counts').appendChild(li); }); $('again').classList.toggle('hidden',!isHost); showSection('result'); }
  function abortGame(message) { if(phase==='lobby'||phase==='result'||phase==='aborted') return; phase='aborted'; $('disconnect').textContent=message||'参加者が切断しました。モード選択に戻ってください。'; $('turn-done').disabled=true; showSection('aborted'); }

  function startGame() {
    if(!isHost||(phase!=='lobby'&&phase!=='result')||!L.hasMinPlayers(roster)) return; gameId+=1; round=1; hostState.roster=roster.map((p)=>({id:p.id,name:p.name})); roster=hostState.roster; hostState.accomplicePair=L.assignAccomplicePair(roster.map((p)=>p.id)); hostState.topics=L.distributeTopics(roster.map((p)=>p.id),hostState.accomplicePair); hostState.drawings=new Map(roster.map((p)=>[p.id,[]])); hostState.roundSubmissions=new Map(); hostState.votes=new Map();
    roster.forEach((p)=>{const data={type:'topic',gameId,topic:hostState.topics[p.id]}; if(p.id===HOST_ID) applyTopic(data); else net.sendTo(p.id,data);}); const data={type:'round-start',gameId,round:1}; applyRoundStart(data); net.broadcast(data);
  }
  function receive(data) { if(!data||typeof data!=='object'||typeof data.type!=='string') return; if(data.type==='roster'&&phase==='lobby'&&Array.isArray(data.players)){roster=data.players;renderRoster();} else if(data.type==='topic'&&(phase==='lobby'||phase==='result'))applyTopic(data); else if(data.type==='round-start'&&(phase==='lobby'||phase==='reveal'||phase==='result'))applyRoundStart(data); else if(data.type==='reveal')applyReveal(data); else if(data.type==='vote-phase')applyVotePhase(data); else if(data.type==='result')applyResult(data); else if(data.type==='aborted')abortGame(data.message); }
  function onPeerMessage(id,data) { if(!data||typeof data!=='object'||typeof data.type!=='string') return; if(data.type==='join'&&phase==='lobby'){const name=String(data.name||'参加者').trim().slice(0,10)||'参加者';roster=L.addPlayer(roster,{id,name});renderRoster();broadcastRoster();} else if(data.type==='turn-done'&&currentMessage(data,'drawing',true)&&saveSubmission(id,data.segments))revealWhenReady(); else if(data.type==='vote'&&currentMessage(data,'voting',false))saveVote(id,data.target); }
  $('host').addEventListener('click',()=>{myName=$('name').value.trim().slice(0,10);if(!myName)return showError('ニックネームを入力してください。');isHost=true;myId=HOST_ID;roster=[{id:HOST_ID,name:myName}];hostState.roster=roster;$('host').disabled=true;$('join').disabled=true;net=AccompliceDrawingNet.hostRoom({onCode(code){$('room-code').textContent=code;$('host-code').classList.remove('hidden');$('status').textContent='参加者を待っています';showSection('lobby');renderRoster();},onPeerConnected(){},onPeerMessage,onPeerDisconnected(id){if(phase==='lobby'){roster=L.removePlayer(roster,id);renderRoster();broadcastRoster();}else{abortGame('参加者が切断したためゲームを中断しました。モード選択に戻ってください。');net.broadcast({type:'aborted',message:'参加者が切断したためゲームを中断しました。'});}},onError:peerError});});
  $('join').addEventListener('click',()=>{myName=$('name').value.trim().slice(0,10);const code=$('code').value.trim();if(!myName)return showError('ニックネームを入力してください。');if(code.length!==6)return showError('6桁のルームコードを入力してください。');$('host').disabled=true;$('join').disabled=true;net=AccompliceDrawingNet.joinRoom(code,{onOwnId(id){myId=id;},onConnected(connection){conn=connection;conn.send({type:'join',name:myName});$('status').textContent='ホストからの開始を待っています';showSection('lobby');},onMessage:receive,onDisconnected(){abortGame('ホストとの接続が切れました。モード選択に戻ってください。');},onError:peerError});});
  $('copy').addEventListener('click',()=>{if(navigator.clipboard)navigator.clipboard.writeText($('room-code').textContent);}); $('start').addEventListener('click',startGame); $('turn-done').addEventListener('click',submitMine); $('next-round').addEventListener('click',hostAdvance); $('send-vote').addEventListener('click',sendVote); $('tally').addEventListener('click',tallyVotes); $('again').addEventListener('click',startGame); $('quit').addEventListener('click',()=>location.reload());
  function point(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*320/rect.width,y:(event.clientY-rect.top)*320/rect.height};}
  canvas.addEventListener('pointerdown',(event)=>{if(phase!=='drawing'||submitted)return;canvas.setPointerCapture(event.pointerId);drawing={pointerId:event.pointerId,point:point(event)};}); canvas.addEventListener('pointermove',(event)=>{if(!drawing||drawing.pointerId!==event.pointerId||phase!=='drawing'||submitted)return;const next=point(event);const segment={x0:drawing.point.x,y0:drawing.point.y,x1:next.x,y1:next.y};if(validSegment(segment)&&currentRoundSegments.length<5000&&allSegments.length+currentRoundSegments.length<15000){currentRoundSegments.push(segment);drawSegment(ctx,segment);}drawing.point=next;}); function stop(event){if(drawing&&drawing.pointerId===event.pointerId)drawing=null;} canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
}());


