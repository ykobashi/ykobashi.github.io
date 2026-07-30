(function () {
  'use strict';
  const $ = (id) => document.getElementById(id); const L = AccompliceDrawingLogic; const HOST_ID = 'host';
  const canvas = $('drawing-canvas'); const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#222'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let isHost = false, myId = null, myName = '', net = null, conn = null, drawing = null;
  let roster = [], phase = 'lobby', gameId = 0, round = 0, topic = '', allSegments = [], currentRoundSegments = [], latestDrawings = {}, submitted = false, selectedCandidateIds = [], voted = false, strokeSeq = 0;
  let turnAttempt = null, voteAttempt = null;
  const processedActions = new Set();
  const hostState = { roster: [], accomplicePair: [], topics: null, drawings: new Map(), roundSubmissions: new Map(), votes: new Map() };
  const REJOIN_GRACE_MS=30000,GAME_KEY='accomplice-drawing'; const pendingRejoins=new Map();
  let guestToken=null,roomCode='',joinRequestId=null,rejoinRequestId=null,lastResult=null;

  function showError(message) { $('error').textContent = message || ''; }
  function playerName(id) { const player = roster.find((item) => item.id === id); return player ? player.name : '不明な参加者'; }
  function showSection(next) {
    ['setup', 'lobby', 'game', 'reveal', 'vote', 'result'].forEach((id) => $(id).classList.add('hidden'));
    if (next === 'drawing') $('game').classList.remove('hidden'); else if (next === 'voting') $('vote').classList.remove('hidden'); else if (next === 'aborted') $('game').classList.remove('hidden'); else $(next).classList.remove('hidden');
  }
  function renderRoster() { $('roster').textContent = ''; roster.forEach((p) => { const li = document.createElement('li'); li.textContent = p.name + (p.id === myId ? '（あなた）' : ''); $('roster').appendChild(li); }); $('start').disabled = !isHost || phase !== 'lobby' || !L.hasMinPlayers(roster); }
  function publicRoster() { return roster.map((p)=>({id:p.id,name:p.name})); }
  function broadcastRoster() { if (net) net.broadcast({ type: 'roster', players: publicRoster() }); }
  function clearCanvas() { ctx.clearRect(0, 0, 320, 320); }
  function drawSegment(context, segment) { context.beginPath(); context.moveTo(segment.x0, segment.y0); context.lineTo(segment.x1, segment.y1); context.stroke(); }
  function redraw() { clearCanvas(); allSegments.forEach((segment) => drawSegment(ctx, segment)); }
  function validSegment(segment) { return !!segment && typeof segment === 'object' && !Array.isArray(segment) && ['x0', 'y0', 'x1', 'y1'].every((key) => Number.isFinite(segment[key]) && segment[key] >= 0 && segment[key] <= 320); }
  function validSegments(segments, accumulated, maxPayload = 5000) { return Array.isArray(segments) && segments.length <= maxPayload && accumulated + segments.length <= 15000 && segments.every(validSegment); }
  function currentMessage(data, expectedPhase, withRound) { return data && typeof data === 'object' && data.gameId === gameId && phase === expectedPhase && (!withRound || data.round === round); }
  function rosterHas(id) { return roster.some((p) => p.id === id); }
  function peerError(err) { console.error(err); showError(PeerErrors.describe(err)); }
  function connectionHealthChanged(a,b){const healthy=typeof b==='boolean'?b:a;$('connection-health').classList.toggle('hidden',healthy);}

  function applyTopic(data) { if (!data || !Number.isInteger(data.gameId) || typeof data.topic !== 'string') return; gameId = data.gameId; topic = data.topic; allSegments = []; currentRoundSegments = []; latestDrawings = {}; selectedCandidateIds = []; submitted = false; voted = false; clearCanvas(); $('topic').textContent = topic; }
  function enterTopicReveal() {
    phase = 'topic-reveal'; $('round-label').textContent = 'まもなく開始します'; $('submit-status').textContent = isHost ? 'お題を確認したら「描き始める」を押してください。' : 'ホストが開始するのを待っています。'; $('drawing-controls').classList.add('hidden'); $('topic-reveal-controls').classList.toggle('hidden', !isHost); showSection('drawing');
  }
  function refreshUndoButton() { $('undo-stroke').disabled = currentRoundSegments.length === 0; }
  function applyRoundStart(data) {
    if (!data || data.gameId !== gameId || !Number.isInteger(data.round) || data.round < 1 || data.round > L.ROUNDS) return;
    phase = 'drawing'; round = data.round; currentRoundSegments = []; submitted = false; drawing = null; $('topic-reveal-controls').classList.add('hidden'); $('drawing-controls').classList.remove('hidden'); $('round-label').textContent = `第${round}ターン / ${L.ROUNDS}`; $('submit-status').textContent = '他の人には、全員が提出するまで見えません。'; $('reset-turn').disabled = false; $('turn-done').disabled = false; canvas.style.cursor = 'crosshair'; showSection('drawing'); redraw(); refreshUndoButton();
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
    const drawings = {}; roster.forEach((p) => { drawings[p.id] = hostState.drawings.get(p.id); });
    const data = { type:'reveal', gameId, round, drawings }; applyReveal(data); net.broadcast(data);
  }
  function submitMine() {
    if (phase !== 'drawing' || submitted) return; submitted = true; $('reset-turn').disabled = true; $('turn-done').disabled = true; $('undo-stroke').disabled = true; canvas.style.cursor = 'not-allowed'; $('submit-status').textContent = '提出済みです。全員の提出を待っています。';
    const data = { type:'turn-done', gameId, round, segments:currentRoundSegments };
    if (isHost) { if (saveSubmission(HOST_ID, data.segments)) revealWhenReady(); } else {
      const actionId=RejoinStorage.newToken(),scopeId=gameId+':'+round;
      Object.assign(data,{actionId,scopeId});
      const attempt=AckSend.attempt({send(){conn.send(data);},onPending(){$('submit-status').textContent='提出を送信中です…';},onConfirmed(){$('submit-status').textContent='提出しました。全員の提出を待っています。';},onFailed(){turnAttempt=null;submitted=false;$('turn-done').disabled=false;$('reset-turn').disabled=false;$('submit-status').textContent='提出を確認できませんでした。もう一度お試しください。';}});
      turnAttempt={actionId,scopeId,attempt};
    }
  }
  function applyReveal(data) {
    if (!currentMessage(data, 'drawing', true) || !data.drawings || typeof data.drawings !== 'object') return;
    latestDrawings = data.drawings;
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
    roster.forEach((p) => { const segments=latestDrawings[p.id]; if(!validSegments(segments,0,15000))return; const button=document.createElement('button'); button.type='button'; button.dataset.id=p.id; button.setAttribute('aria-pressed','false'); button.setAttribute('aria-label',`${p.name}${p.id===myId?'（あなた）':''}の絵を選ぶ`); const mini=document.createElement('canvas'); mini.width=320; mini.height=320; const miniCtx=mini.getContext('2d'); miniCtx.strokeStyle='#222'; miniCtx.lineWidth=5; miniCtx.lineCap='round'; segments.forEach((segment)=>drawSegment(miniCtx,segment)); const name=document.createElement('span'); name.textContent=p.name+(p.id===myId?'（あなた）':''); button.append(mini,name); button.addEventListener('click',()=>toggleCandidate(p.id)); $('candidates').appendChild(button); });
    $('send-vote').disabled=true; $('vote-status').textContent='2人を選んでください。'; $('progress').classList.toggle('hidden',!isHost); updateProgress(); showSection('voting');
  }
  function toggleCandidate(id) { if (phase!=='voting'||voted) return; const at=selectedCandidateIds.indexOf(id); if(at>=0) selectedCandidateIds.splice(at,1); else { if(selectedCandidateIds.length===2) selectedCandidateIds.shift(); selectedCandidateIds.push(id); } Array.from($('candidates').children).forEach((b)=>{ const selected=selectedCandidateIds.includes(b.dataset.id); b.classList.toggle('selected',selected); b.setAttribute('aria-pressed',String(selected)); }); $('send-vote').disabled=selectedCandidateIds.length!==2; }
  function saveVote(senderId,target) { if(phase!=='voting'||!rosterHas(senderId)||hostState.votes.has(senderId)||!Array.isArray(target)||target.length!==2||target[0]===target[1]||target.some((id)=>typeof id!=='string'||!rosterHas(id))) return false; hostState.votes.set(senderId,target.slice()); updateProgress(); if(hostState.votes.size===roster.length)finishVoting(); return true; }
  function sendVote() { if(phase!=='voting'||voted||selectedCandidateIds.length!==2) return; voted=true; $('send-vote').disabled=true; Array.from($('candidates').children).forEach((b)=>{b.disabled=true;}); $('vote-status').textContent='投票しました。全員の投票を待っています。'; const data={type:'vote',gameId,target:selectedCandidateIds.slice()}; if(isHost) saveVote(HOST_ID,data.target); else {const actionId=RejoinStorage.newToken(),scopeId=gameId+':voting';Object.assign(data,{actionId,scopeId});const attempt=AckSend.attempt({send(){conn.send(data);},onPending(){$('vote-status').textContent='投票を送信中です…';},onConfirmed(){$('vote-status').textContent='投票しました。集計を待っています。';},onFailed(){voteAttempt=null;voted=false;Array.from($('candidates').children).forEach((b)=>{b.disabled=false;});$('vote-status').textContent='投票を確認できませんでした。もう一度お試しください。';}});voteAttempt={actionId,scopeId,attempt};} }
  function updateProgress() { if(!isHost) return; $('progress').textContent=`投票: ${hostState.votes.size}/${roster.length}人`; }
  function finishVoting() { if(!isHost||phase!=='voting'||hostState.votes.size!==roster.length) return; const tally=L.tallyPairVotes(hostState.votes); const citizenTally=L.tallyPairVotes(hostState.votes,hostState.accomplicePair); const trueKey=L.pairKey(hostState.accomplicePair[0],hostState.accomplicePair[1]); const allyFound=L.checkAllyFound(hostState.accomplicePair,hostState.votes); const caught=L.checkCaught(citizenTally,trueKey); const data={type:'result',gameId,accomplicePair:hostState.accomplicePair.slice(),tally,allyFound,caught,winner:L.determineWinner({allyFound,caught})}; lastResult=data; net.broadcast(data); showResult(data); }
  function showResult(data) { if(!currentMessage(data,'voting',false)||!Array.isArray(data.accomplicePair)||!data.tally) return; phase='result';lastResult=data;RejoinStorage.clear(GAME_KEY); $('result-title').textContent=data.winner==='accomplice'?'🕵️ 共犯チームの勝ち！':'🎉 非共犯チームの勝ち！'; $('true-pair').textContent=`${playerName(data.accomplicePair[0])}さん ＆ ${playerName(data.accomplicePair[1])}さん`; $('result-ally').textContent=`相方発見：${data.allyFound?'成功':'失敗'}`; $('result-ally').classList.toggle('success',data.allyFound); $('result-ally').classList.toggle('fail',!data.allyFound); $('result-caught').textContent=`非共犯側による特定：${data.caught?'成功':'失敗'}`; $('result-caught').classList.toggle('success',data.caught); $('result-caught').classList.toggle('fail',!data.caught); $('counts').textContent=''; Object.keys(data.tally.counts||{}).forEach((key)=>{ let pair; try{pair=L.parsePairKey(key);}catch(_){return;} const li=document.createElement('li'); li.textContent=`${playerName(pair[0])}さんと${playerName(pair[1])}さん：${data.tally.counts[key]}票`; $('counts').appendChild(li); }); $('again').classList.toggle('hidden',!isHost); showSection('result'); }
  function abortGame(message) { if(phase==='lobby'||phase==='result'||phase==='aborted') return; phase='aborted'; $('disconnect').textContent=message||'参加者が切断しました。モード選択に戻ってください。'; $('reset-turn').disabled=true; $('turn-done').disabled=true; $('undo-stroke').disabled=true; showSection('aborted'); }

  function resetCurrentTurn() { if (phase !== 'drawing' || submitted) return; currentRoundSegments = []; drawing = null; redraw(); refreshUndoButton(); }
  function undoLastStrokeLocal() {
    if (phase !== 'drawing' || submitted) return;
    const updated = L.undoLastStroke(currentRoundSegments);
    if (updated.length === currentRoundSegments.length) return;
    currentRoundSegments = updated; drawing = null;
    redraw(); currentRoundSegments.forEach((segment) => drawSegment(ctx, segment));
    refreshUndoButton();
  }

  function hostRerollTopics() {
    hostState.topics = L.distributeTopics(roster.map((p) => p.id), hostState.accomplicePair);
    roster.forEach((p) => { const data = { type: 'topic', gameId, topic: hostState.topics[p.id] }; if (p.id === HOST_ID) applyTopic(data); else net.sendTo(p.id, data); });
    enterTopicReveal();
    net.broadcast({ type: 'phase', phase: 'topic-reveal', gameId });
  }
  function hostBeginDrawing() {
    if (!isHost || phase !== 'topic-reveal') return;
    const data = { type: 'round-start', gameId, round: 1 };
    applyRoundStart(data); net.broadcast(data);
  }
  function startGame() {
    if(!isHost||(phase!=='lobby'&&phase!=='result')||!L.hasMinPlayers(roster)) return; gameId+=1; round=1; lastResult=null; processedActions.clear(); hostState.roster=roster.map((p)=>({id:p.id,name:p.name,token:p.token||null})); roster=hostState.roster; hostState.accomplicePair=L.assignAccomplicePair(roster.map((p)=>p.id)); hostState.drawings=new Map(roster.map((p)=>[p.id,[]])); hostState.roundSubmissions=new Map(); hostState.votes=new Map();
    hostRerollTopics();
  }
  function receive(data) { if(!data||typeof data!=='object'||typeof data.type!=='string') return; if(data.type==='roster'&&phase==='lobby'&&Array.isArray(data.players)){roster=data.players;renderRoster();} else if(data.type==='join-ack'&&data.joinRequestId===joinRequestId)RejoinStorage.save(GAME_KEY,{roomCode,token:guestToken,name:myName}); else if(data.type==='rejoin-ack'&&data.rejoinRequestId===rejoinRequestId)RejoinStorage.save(GAME_KEY,{roomCode,token:guestToken,name:myName}); else if(data.type==='rejoin-rejected'){RejoinStorage.clear(GAME_KEY);if(net&&net.destroy)net.destroy();showError('再参加できませんでした。もう一度ルームへ参加してください。');showSection('setup');$('host').disabled=false;$('join').disabled=false;} else if(data.type==='state-snapshot')applySnapshot(data); else if(data.type==='peer-id-changed'&&typeof data.oldId==='string'&&typeof data.newId==='string'){replaceId(data.oldId,data.newId);renderRoster();if(phase==='reveal'){phase='drawing';applyReveal({type:'reveal',gameId,round,drawings:latestDrawings});}else if(phase==='voting'){phase='reveal';applyVotePhase({type:'vote-phase',gameId,round});}} else if(data.type==='topic'&&(phase==='lobby'||phase==='result'||phase==='topic-reveal'))applyTopic(data); else if(data.type==='phase'&&data.phase==='topic-reveal'&&data.gameId===gameId)enterTopicReveal(); else if(data.type==='round-start'&&(phase==='lobby'||phase==='reveal'||phase==='result'||phase==='topic-reveal'))applyRoundStart(data); else if(data.type==='reveal')applyReveal(data); else if(data.type==='vote-phase')applyVotePhase(data); else if(data.type==='turn-done-ack'&&turnAttempt&&data.actionId===turnAttempt.actionId&&data.scopeId===turnAttempt.scopeId){turnAttempt.attempt.confirm();turnAttempt=null;} else if(data.type==='vote-ack'&&voteAttempt&&data.actionId===voteAttempt.actionId&&data.scopeId===voteAttempt.scopeId){voteAttempt.attempt.confirm();voteAttempt=null;} else if(data.type==='result')showResult(data); else if(data.type==='aborted')abortGame(data.message); }
  function moveMap(map,oldId,newId,transform){if(!map.has(oldId))return;const value=map.get(oldId);map.delete(oldId);map.set(newId,transform?transform(value):value);}
  function replaceId(oldId,newId){
    roster.forEach((p)=>{if(p.id===oldId)p.id=newId;}); hostState.roster=roster;
    hostState.accomplicePair=hostState.accomplicePair.map((id)=>id===oldId?newId:id);
    if(hostState.topics&&Object.prototype.hasOwnProperty.call(hostState.topics,oldId)){hostState.topics[newId]=hostState.topics[oldId];delete hostState.topics[oldId];}
    moveMap(hostState.drawings,oldId,newId); moveMap(hostState.roundSubmissions,oldId,newId);
    const nextVotes=new Map(); hostState.votes.forEach((targets,id)=>{nextVotes.set(id===oldId?newId:id,targets.map((target)=>target===oldId?newId:target));}); hostState.votes=nextVotes;
    selectedCandidateIds=selectedCandidateIds.map((id)=>id===oldId?newId:id);
    if(Object.prototype.hasOwnProperty.call(latestDrawings,oldId)){latestDrawings[newId]=latestDrawings[oldId];delete latestDrawings[oldId];}
    Array.from(processedActions).forEach((key)=>{if(key.indexOf(oldId+':')===0){processedActions.delete(key);processedActions.add(newId+key.slice(oldId.length));}});
  }
  function snapshotFor(id){const drawings={};roster.forEach((p)=>{drawings[p.id]=(hostState.drawings.get(p.id)||[]).slice();});const ownPending=hostState.roundSubmissions.get(id)||[];const privateTopic=hostState.topics?hostState.topics[id]:'';return{type:'state-snapshot',snapshotVersion:1,phase,gameId,round,roster:publicRoster(),topic:privateTopic,drawings,ownPending,submitted:hostState.roundSubmissions.has(id),latestDrawings,result:lastResult};}
  function applySnapshot(data){if(data.snapshotVersion!==1||!Array.isArray(data.roster)||!data.drawings||typeof data.drawings!=='object')return;roster=data.roster;gameId=data.gameId;round=data.round;topic=data.topic;allSegments=Array.isArray(data.drawings[myId])?data.drawings[myId].slice():[];currentRoundSegments=Array.isArray(data.ownPending)?data.ownPending.slice():[];latestDrawings=data.latestDrawings||data.drawings;renderRoster();$('topic').textContent=topic;redraw();if(data.phase==='topic-reveal')enterTopicReveal();else if(data.phase==='drawing'){applyRoundStart({gameId,round});currentRoundSegments=Array.isArray(data.ownPending)?data.ownPending.slice():[];submitted=!!data.submitted;if(submitted){$('turn-done').disabled=true;$('reset-turn').disabled=true;$('submit-status').textContent='提出済みです。全員の提出を待っています。';}redraw();currentRoundSegments.forEach((s)=>drawSegment(ctx,s));}else if(data.phase==='reveal'){phase='drawing';applyReveal({type:'reveal',gameId,round,drawings:latestDrawings});}else if(data.phase==='voting'){phase='reveal';applyVotePhase({type:'vote-phase',gameId,round});}else if(data.phase==='result'&&data.result){phase='voting';showResult(data.result);}$('disconnect').textContent='';}
  function handleRejoin(id,data){const existing=roster.find((p)=>p.token===data.token);const pending=existing&&pendingRejoins.get(data.token);if(!pending||pending.oldPeerId!==existing.id||!data.rejoinRequestId||phase==='result'||phase==='aborted'){net.sendTo(id,{type:'rejoin-rejected'});return;}if(pending.timer)clearTimeout(pending.timer);pendingRejoins.delete(data.token);replaceId(pending.oldPeerId,id);net.broadcast({type:'peer-id-changed',oldId:pending.oldPeerId,newId:id});broadcastRoster();net.sendTo(id,{type:'rejoin-ack',rejoinRequestId:data.rejoinRequestId,roomCode});net.sendTo(id,snapshotFor(id));}
  function deferDisconnect(id){const player=roster.find((p)=>p.id===id);if(!player||!player.token)return;const previous=pendingRejoins.get(player.token);if(previous)clearTimeout(previous.timer);const timer=setTimeout(()=>{pendingRejoins.delete(player.token);abortGame('参加者が切断したためゲームを中断しました。モード選択に戻ってください。');net.broadcast({type:'aborted',message:'参加者が切断したためゲームを中断しました。'});},REJOIN_GRACE_MS);pendingRejoins.set(player.token,{oldPeerId:id,timer});$('disconnect').textContent=player.name+'さんとの接続が不安定です。再接続を待っています。';}
  function onPeerMessage(id,data) { if(!data||typeof data!=='object'||typeof data.type!=='string') return; if(data.type==='join'&&phase==='lobby'&&typeof data.token==='string'&&data.token&&typeof data.joinRequestId==='string'){const name=String(data.name||'参加者').trim().slice(0,10)||'参加者';if(!roster.some((p)=>p.token===data.token))roster=L.addPlayer(roster,{id,name,token:data.token});renderRoster();broadcastRoster();net.sendTo(id,{type:'join-ack',joinRequestId:data.joinRequestId,roomCode});} else if(data.type==='rejoin')handleRejoin(id,data); else if(data.type==='turn-done'&&data.actionId&&data.scopeId===data.gameId+':'+data.round){const key=id+':turn-done:'+data.scopeId+':'+data.actionId;if(processedActions.has(key)){net.sendTo(id,{type:'turn-done-ack',actionId:data.actionId,scopeId:data.scopeId});return;}if(!currentMessage(data,'drawing',true)||!saveSubmission(id,data.segments))return;processedActions.add(key);revealWhenReady();net.sendTo(id,{type:'turn-done-ack',actionId:data.actionId,scopeId:data.scopeId});} else if(data.type==='vote'&&data.actionId&&data.scopeId===data.gameId+':voting'){const key=id+':vote:'+data.scopeId+':'+data.actionId;if(processedActions.has(key)){net.sendTo(id,{type:'vote-ack',actionId:data.actionId,scopeId:data.scopeId});return;}if(!currentMessage(data,'voting',false)||!saveVote(id,data.target))return;processedActions.add(key);net.sendTo(id,{type:'vote-ack',actionId:data.actionId,scopeId:data.scopeId});} }
  function connectGuest(session){const rejoining=!!session;myName=rejoining?session.name:myName;roomCode=rejoining?session.roomCode:roomCode;guestToken=rejoining?session.token:RejoinStorage.newToken();joinRequestId=rejoining?null:RejoinStorage.newToken();rejoinRequestId=rejoining?RejoinStorage.newToken():null;$('host').disabled=true;$('join').disabled=true;net=AccompliceDrawingNet.joinRoom(roomCode,{onOwnId(id){myId=id;},onConnected(connection){conn=connection;conn.send(rejoining?{type:'rejoin',token:guestToken,name:myName,rejoinRequestId}:{type:'join',name:myName,token:guestToken,joinRequestId});if(!rejoining){$('status').textContent='ホストからの開始を待っています';showSection('lobby');}},onMessage:receive,onDisconnected(){$('disconnect').textContent='ホストとの接続が切れました。再接続してください。';},onError(err){if(rejoining&&err&&err.type==='peer-unavailable'){RejoinStorage.clear(GAME_KEY);showSection('setup');$('host').disabled=false;$('join').disabled=false;}peerError(err);},onConnectionHealthChange:connectionHealthChanged});}
  $('host').addEventListener('click',()=>{myName=$('name').value.trim().slice(0,10);if(!myName)return showError('ニックネームを入力してください。');isHost=true;myId=HOST_ID;roster=[{id:HOST_ID,name:myName,token:null}];hostState.roster=roster;$('host').disabled=true;$('join').disabled=true;net=AccompliceDrawingNet.hostRoom({onCode(code){roomCode=code;WakeLockHelper.enable();$('room-code').textContent=code;$('host-code').classList.remove('hidden');$('status').textContent='参加者を待っています';showSection('lobby');renderRoster();},onPeerConnected(){},onPeerMessage,onPeerDisconnected(id){if(phase==='lobby'){roster=L.removePlayer(roster,id);renderRoster();broadcastRoster();}else deferDisconnect(id);},onError:peerError,onConnectionHealthChange:connectionHealthChanged});});
  $('join').addEventListener('click',()=>{myName=$('name').value.trim().slice(0,10);const code=$('code').value.trim();if(!myName)return showError('ニックネームを入力してください。');if(code.length!==6)return showError('6桁のルームコードを入力してください。');roomCode=code.toUpperCase();connectGuest(null);});
  $('copy').addEventListener('click',()=>{if(navigator.clipboard)navigator.clipboard.writeText($('room-code').textContent);}); $('start').addEventListener('click',startGame); $('reroll-topic').addEventListener('click',()=>{if(!isHost||phase!=='topic-reveal')return;hostRerollTopics();}); $('begin-drawing').addEventListener('click',hostBeginDrawing); $('undo-stroke').addEventListener('click',undoLastStrokeLocal); $('reset-turn').addEventListener('click',resetCurrentTurn); $('turn-done').addEventListener('click',submitMine); $('next-round').addEventListener('click',hostAdvance); $('send-vote').addEventListener('click',sendVote); $('again').addEventListener('click',startGame); $('quit').addEventListener('click',()=>{WakeLockHelper.disable();RejoinStorage.clear('accomplice-drawing');location.reload();});
  function point(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*320/rect.width,y:(event.clientY-rect.top)*320/rect.height};}
  canvas.addEventListener('pointerdown',(event)=>{if(phase!=='drawing'||submitted)return;canvas.setPointerCapture(event.pointerId);strokeSeq+=1;drawing={pointerId:event.pointerId,point:point(event),strokeId:strokeSeq};}); canvas.addEventListener('pointermove',(event)=>{if(!drawing||drawing.pointerId!==event.pointerId||phase!=='drawing'||submitted)return;const next=point(event);const segment={x0:drawing.point.x,y0:drawing.point.y,x1:next.x,y1:next.y,strokeId:drawing.strokeId};if(validSegment(segment)&&currentRoundSegments.length<5000&&allSegments.length+currentRoundSegments.length<15000){currentRoundSegments.push(segment);drawSegment(ctx,segment);refreshUndoButton();}drawing.point=next;}); function stop(event){if(drawing&&drawing.pointerId===event.pointerId)drawing=null;} canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
  const savedSession=RejoinStorage.load(GAME_KEY);if(savedSession&&savedSession.roomCode&&savedSession.token&&savedSession.name)connectGuest(savedSession);
}());
