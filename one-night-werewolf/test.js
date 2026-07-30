// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  MIN_PLAYERS,
  MAX_PLAYERS,
  shuffle,
  roleCountsForPlayerCount,
  assignRoles,
  checkSeerResult,
  tallyVotes,
  determineWinner,
  addPlayer,
  removePlayer,
  hasMinPlayers,
} = require('./logic.js');

// 決定論的な擬似乱数(テスト用)。常に同じシーケンスを返す
function makeSeededRng(seedSeq) {
  let i = 0;
  return () => seedSeq[i++ % seedSeq.length];
}

// roleCountsForPlayerCount: n=3..8 で合計がnと一致し、占い師は必ず1人、人狼は1人以上
{
  const expected = {
    3: { wolf: 1, seer: 1, villager: 1 },
    4: { wolf: 1, seer: 1, villager: 2 },
    5: { wolf: 1, seer: 1, villager: 3 },
    6: { wolf: 2, seer: 1, villager: 3 },
    7: { wolf: 2, seer: 1, villager: 4 },
    8: { wolf: 2, seer: 1, villager: 5 },
  };
  for (let n = 3; n <= 8; n++) {
    const counts = roleCountsForPlayerCount(n);
    assert.deepStrictEqual(counts, expected[n], `n=${n} should match expected table`);
    assert.strictEqual(counts.wolf + counts.seer + counts.villager, n, `n=${n} counts should sum to n`);
    assert.strictEqual(counts.seer, 1, `n=${n} should have exactly 1 seer`);
    assert.ok(counts.wolf >= 1, `n=${n} should have at least 1 wolf`);
  }
}

// roleCountsForPlayerCount: 範囲外はクランプする
{
  const under = roleCountsForPlayerCount(2);
  assert.deepStrictEqual(under, roleCountsForPlayerCount(3), 'n=2 should clamp to n=3 table');
  assert.strictEqual(under.wolf + under.seer + under.villager, MIN_PLAYERS);

  const over = roleCountsForPlayerCount(10);
  assert.deepStrictEqual(over, roleCountsForPlayerCount(8), 'n=10 should clamp to n=8 table');
  assert.strictEqual(over.wolf + over.seer + over.villager, MAX_PLAYERS);
}

// assignRoles: 人数ごとの役職構成表と一致し、全playerIdに重複なく役職が割り当てられる(複数シードで検証)
{
  const seeds = [
    [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    [0.99, 0.01, 0.5, 0.33, 0.66, 0.05, 0.95, 0.4],
    [0.0, 0.999, 0.25, 0.75, 0.6, 0.15, 0.85, 0.45],
  ];
  for (let n = 3; n <= 8; n++) {
    const playerIds = [];
    for (let i = 0; i < n; i++) playerIds.push('p' + i);
    const expectedCounts = roleCountsForPlayerCount(n);

    seeds.forEach((seedSeq) => {
      const rng = makeSeededRng(seedSeq);
      const roleMap = assignRoles(playerIds, rng);

      // 全員に役職が割り当てられている(重複・欠落なし)
      const assignedIds = Object.keys(roleMap).sort();
      assert.deepStrictEqual(assignedIds, playerIds.slice().sort(), `n=${n} every playerId should get exactly one role`);

      // 役職ごとの人数がテーブル通り
      const actualCounts = { wolf: 0, seer: 0, villager: 0 };
      Object.values(roleMap).forEach((role) => {
        actualCounts[role]++;
      });
      assert.deepStrictEqual(actualCounts, expectedCounts, `n=${n} role counts should match table`);
    });
  }
}

// checkSeerResult: 対象が人狼ならtrue、そうでなければfalse
{
  const roleMap = { a: 'wolf', b: 'seer', c: 'villager', d: 'villager' };
  assert.strictEqual(checkSeerResult(roleMap, 'a'), true);
  assert.strictEqual(checkSeerResult(roleMap, 'b'), false);
  assert.strictEqual(checkSeerResult(roleMap, 'c'), false);
}

// tallyVotes: 明確な最多得票の場合(タイなし)
{
  const votes = { p1: 'a', p2: 'a', p3: 'b', p4: 'a' };
  const result = tallyVotes(votes, Math.random);
  assert.deepStrictEqual(result.counts, { a: 3, b: 1 });
  assert.strictEqual(result.eliminatedId, 'a');
}

// tallyVotes: 同数タイの場合、rngで決定論的にタイブレークする(先頭やinsertion順で決め打ちしない)
{
  // a, b, c が1票ずつのタイ。candidateIds(Object.keys順)は ['a','b','c']
  const votes = { p1: 'a', p2: 'b', p3: 'c' };

  // rng()が0付近を返すとき: tied[0] = 'a' が選ばれるはず
  const resultLow = tallyVotes(votes, makeSeededRng([0.0]));
  assert.deepStrictEqual(resultLow.counts, { a: 1, b: 1, c: 1 });
  assert.strictEqual(resultLow.eliminatedId, 'a');

  // rng()が中間を返すとき: tied[1] = 'b' が選ばれるはず (floor(0.5*3)=1)
  const resultMid = tallyVotes(votes, makeSeededRng([0.5]));
  assert.strictEqual(resultMid.eliminatedId, 'b');

  // rng()が0.99付近を返すとき: tied[2] = 'c' が選ばれるはず (floor(0.99*3)=2)
  const resultHigh = tallyVotes(votes, makeSeededRng([0.99]));
  assert.strictEqual(resultHigh.eliminatedId, 'c');

  // 同じrngシーケンスを与えれば毎回同じ結果になる(決定論的)
  const resultRepeat = tallyVotes(votes, makeSeededRng([0.5]));
  assert.strictEqual(resultRepeat.eliminatedId, resultMid.eliminatedId);
}

// tallyVotes: 2人タイのケースでもrngで正しくタイブレークする
{
  const votes = { p1: 'x', p2: 'x', p3: 'y', p4: 'y', p5: 'z' };
  const resultLow = tallyVotes(votes, makeSeededRng([0.0]));
  assert.deepStrictEqual(resultLow.counts, { x: 2, y: 2, z: 1 });
  assert.strictEqual(resultLow.eliminatedId, 'x'); // tied=['x','y'], floor(0*2)=0

  const resultHigh = tallyVotes(votes, makeSeededRng([0.9]));
  assert.strictEqual(resultHigh.eliminatedId, 'y'); // floor(0.9*2)=1
}

// determineWinner: 追放されたのが人狼なら村人陣営の勝利
{
  const roleMap = { a: 'wolf', b: 'seer', c: 'villager' };
  assert.strictEqual(determineWinner(roleMap, 'a'), 'villagers');
}

// determineWinner: 追放されたのが人狼以外なら人狼陣営の勝利
{
  const roleMap = { a: 'wolf', b: 'seer', c: 'villager' };
  assert.strictEqual(determineWinner(roleMap, 'b'), 'wolves');
  assert.strictEqual(determineWinner(roleMap, 'c'), 'wolves');
}

// shuffle: 同じ要素数・同じ要素集合を保つ、元配列を破壊しない
{
  const original = [1, 2, 3, 4, 5];
  const shuffled = shuffle(original, makeSeededRng([0.9, 0.1, 0.5, 0.3, 0.7]));
  assert.strictEqual(shuffled.length, original.length);
  assert.deepStrictEqual(shuffled.slice().sort((a, b) => a - b), original);
  assert.deepStrictEqual(original, [1, 2, 3, 4, 5]);
}

// ロビー名簿: addPlayer/removePlayer/hasMinPlayers
{
  let roster = [];
  roster = addPlayer(roster, { id: 'host', name: 'ホスト' });
  roster = addPlayer(roster, { id: 'p1', name: 'ゲスト1' });
  roster = addPlayer(roster, { id: 'p2', name: 'ゲスト2' });
  assert.strictEqual(roster.length, 3);

  // 同じidを重複追加しない
  roster = addPlayer(roster, { id: 'p1', name: '別名前' });
  assert.strictEqual(roster.length, 3);
  assert.strictEqual(roster.find((p) => p.id === 'p1').name, 'ゲスト1');

  assert.strictEqual(hasMinPlayers(roster, MIN_PLAYERS), true);
  assert.strictEqual(hasMinPlayers(roster.slice(0, 2), MIN_PLAYERS), false);

  roster = removePlayer(roster, 'p1');
  assert.strictEqual(roster.length, 2);
  assert.ok(!roster.some((p) => p.id === 'p1'));
}

console.log('All tests passed');
