const assert = require('node:assert');
const L = require('./logic.js');
const { CHARACTER_BANK } = require('./characters.js');
assert.deepStrictEqual(L.shuffle([1,2,3], () => 0), [2,3,1]);
const bank = [{id:1},{id:2},{id:3}];
assert.strictEqual(L.pickCharacterEntry(() => 0, bank), bank[0]);
assert.strictEqual(L.pickCharacterEntry(() => .5, bank), bank[1]);
assert.strictEqual(L.pickCharacterEntry(() => .999, bank), bank[2]);
assert.strictEqual(L.pickNickname(['A','B','C'], () => 0), 'A');
assert.strictEqual(L.pickNickname(['A','B','C'], () => .999), 'C');
const entries = L.buildEntryList('本物', [{authorId:'a',text:'偽1'},{authorId:'b',text:'偽2'}], () => .99);
assert.strictEqual(entries.length, 3); assert.strictEqual(new Set(entries.map(e=>e.id)).size, 3);
const realId = entries.find(e=>e.authorId===L.REAL_AUTHOR).id;
const fakeA = entries.find(e=>e.authorId==='a');
const tally = L.tallyNicknameVotes({a:realId,b:fakeA.id,c:fakeA.id}, entries);
assert.deepStrictEqual(tally.correctVoterIds, ['a']); assert.strictEqual(tally.mostDeceptiveAuthorId, 'a');
assert.strictEqual(L.isSelfVote(entries, fakeA.id, 'a'), true); assert.strictEqual(L.isSelfVote(entries, realId, 'a'), false);
const deltas = L.computeRoundScoreDeltas(tally, entries);
assert.strictEqual(deltas.a, 2000); assert.deepStrictEqual(L.applyScoreDeltas({a:500}, deltas), {a:2500});
assert.deepStrictEqual(L.buildScoreboard({b:10}, [{id:'a',name:'A'},{id:'b',name:'B'}]).map(x=>x.id), ['b','a']);

// buildScoreboard: 同点は同順位(1,1,3)になる。getWinnersは1位(同率含む)を全員返す
{
  const board = L.buildScoreboard({ a: 2, b: 2, c: 1 }, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]);
  assert.deepStrictEqual(board.map((r) => r.rank), [1, 1, 3]);
  const winners = L.getWinners(board);
  assert.strictEqual(winners.length, 2);
  assert.deepStrictEqual(winners.map((w) => w.id).sort(), ['a', 'b']);
}

// selectRoundCharacter: usedにない語だけが候補になる
{
  const charBank = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }];
  const used = ['c1', 'c2'];
  for (const r of [0, 0.4, 0.9]) {
    const result = L.selectRoundCharacter(() => r, charBank, used);
    assert.ok(['c3', 'c4'].includes(result.entry.id));
    assert.deepStrictEqual(result.used, used.concat([result.entry.id]));
  }
}

// selectRoundCharacter: プールが尽きたら履歴がリセットされて1件になる
{
  const charBank = [{ id: 'c1' }, { id: 'c2' }];
  const used = ['c1', 'c2'];
  const result = L.selectRoundCharacter(() => 0.5, charBank, used);
  assert.ok(charBank.some((c) => c.id === result.entry.id));
  assert.strictEqual(result.used.length, 1);
}

// selectRoundCharacter: 返り値のusedの長さは呼ぶたびに1ずつ増える
{
  let used = [];
  for (let i = 0; i < CHARACTER_BANK.length; i++) {
    const result = L.selectRoundCharacter(Math.random, CHARACTER_BANK, used);
    assert.strictEqual(result.used.length, i + 1);
    used = result.used;
  }
}
assert.strictEqual(L.normalizeNickname(' 1234567890123456 '), '12345678901234');
let roster=[]; roster=L.addPlayer(roster,{id:'a',name:'A'}); roster=L.addPlayer(roster,{id:'a',name:'A'});
assert.strictEqual(roster.length,1); assert.strictEqual(L.hasMinPlayers(roster),false); assert.deepStrictEqual(L.removePlayer(roster,'a'),[]);
assert.ok(CHARACTER_BANK.length >= 40);
CHARACTER_BANK.forEach(c=>{ assert.ok(c.id&&c.image); assert.ok(Array.isArray(c.aiNicknames)&&c.aiNicknames.length>=3); assert.ok(c.aiNicknames.every(n=>typeof n==='string'&&n)); assert.ok(c.tags.length>=3&&c.tags.length<=5); });
assert.strictEqual(new Set(CHARACTER_BANK.map(c=>c.id)).size, CHARACTER_BANK.length);
const allNicknames=CHARACTER_BANK.flatMap(c=>c.aiNicknames);
assert.strictEqual(new Set(allNicknames).size, allNicknames.length);
console.log('All tests passed');
