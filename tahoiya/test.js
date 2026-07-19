// test.js - logic.js の単体テスト(Node.js組み込み assert のみ使用)
const assert = require('assert');
const {
  MIN_PLAYERS,
  REAL_AUTHOR,
  WORD_BANK,
  shuffle,
  pickWordEntry,
  buildEntryList,
  tallyTahoiyaVotes,
  addPlayer,
  removePlayer,
  hasMinPlayers,
} = require('./logic.js');

// 決定論的な擬似乱数(テスト用)。常に同じシーケンスを返す
function makeSeededRng(seedSeq) {
  let i = 0;
  return () => seedSeq[i++ % seedSeq.length];
}

// WORD_BANK: 十分な件数があり、word/definitionともに非空の文字列であること
assert.ok(WORD_BANK.length >= 15, 'WORD_BANK should have at least 15 entries');
WORD_BANK.forEach((entry) => {
  assert.strictEqual(typeof entry.word, 'string');
  assert.strictEqual(typeof entry.definition, 'string');
  assert.ok(entry.word.length > 0, 'word should not be empty');
  // オリジナルの説明文であることの簡易チェック(単語の丸写しではなく、ある程度の長さの文章であること)
  assert.ok(entry.definition.length > 10, 'definition should be a reasonably long original sentence');
});

// pickWordEntry: 常にbank内のエントリを返す
{
  const bank = WORD_BANK;
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    const entry = pickWordEntry(() => r, bank);
    assert.ok(bank.includes(entry));
  }
}

// buildEntryList: 本物の定義が1つだけ含まれ、全体の件数が 1 + フェイクの数 になる
{
  const real = '本物の定義文です。';
  const fakes = [
    { authorId: 'p1', text: 'フェイク定義1' },
    { authorId: 'p2', text: 'フェイク定義2' },
    { authorId: 'p3', text: 'フェイク定義3' },
  ];
  const entries = buildEntryList(real, fakes, makeSeededRng([0.9, 0.1, 0.5, 0.3, 0.7, 0.6]));

  assert.strictEqual(entries.length, 1 + fakes.length);

  const realEntries = entries.filter((e) => e.authorId === REAL_AUTHOR);
  assert.strictEqual(realEntries.length, 1);
  assert.strictEqual(realEntries[0].text, real);

  // 各フェイクのテキストがちょうど1回ずつ出現する(順序は問わない)
  fakes.forEach((f) => {
    const matches = entries.filter((e) => e.text === f.text && e.authorId === f.authorId);
    assert.strictEqual(matches.length, 1, 'each fake definition should appear exactly once');
  });

  // idがすべてユニークであること
  const ids = entries.map((e) => e.id);
  assert.strictEqual(new Set(ids).size, ids.length);
}

// buildEntryList: フェイクが0件でも本物1件のリストになる
{
  const entries = buildEntryList('本物のみ', [], Math.random);
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].authorId, REAL_AUTHOR);
}

// tallyTahoiyaVotes: realEntryId / correctVoterIds / voteCounts / mostDeceptiveAuthorId を正しく計算する
{
  const entries = [
    { id: 'entry-0', text: '本物', authorId: REAL_AUTHOR },
    { id: 'entry-1', text: 'フェイクA', authorId: 'p1' },
    { id: 'entry-2', text: 'フェイクB', authorId: 'p2' },
  ];
  const votes = {
    voterA: 'entry-0', // 正解
    voterB: 'entry-1',
    voterC: 'entry-1',
    voterD: 'entry-0', // 正解
  };
  const result = tallyTahoiyaVotes(votes, entries);

  assert.strictEqual(result.realEntryId, 'entry-0');
  assert.deepStrictEqual(result.correctVoterIds.sort(), ['voterA', 'voterD']);
  assert.deepStrictEqual(result.voteCounts, { 'entry-0': 2, 'entry-1': 2, 'entry-2': 0 });
  assert.strictEqual(result.mostDeceptiveAuthorId, 'p1'); // entry-1が最多得票のフェイク
}

// tallyTahoiyaVotes: どのフェイクにも票が入らなかった場合 mostDeceptiveAuthorId は null
{
  const entries = [
    { id: 'entry-0', text: '本物', authorId: REAL_AUTHOR },
    { id: 'entry-1', text: 'フェイクA', authorId: 'p1' },
    { id: 'entry-2', text: 'フェイクB', authorId: 'p2' },
  ];
  const votes = {
    voterA: 'entry-0',
    voterB: 'entry-0',
  };
  const result = tallyTahoiyaVotes(votes, entries);

  assert.strictEqual(result.realEntryId, 'entry-0');
  assert.deepStrictEqual(result.correctVoterIds.sort(), ['voterA', 'voterB']);
  assert.strictEqual(result.mostDeceptiveAuthorId, null);
}

// ロビー名簿: addPlayer/removePlayer/hasMinPlayers
{
  let roster = [];
  roster = addPlayer(roster, { id: 'host', name: 'ホスト' });
  assert.strictEqual(roster.length, 1);
  assert.strictEqual(hasMinPlayers(roster, MIN_PLAYERS), false); // 1人ではまだ足りない(MIN=2)

  roster = addPlayer(roster, { id: 'p1', name: 'ゲスト1' });
  assert.strictEqual(roster.length, 2);

  // 同じidを重複追加しない
  roster = addPlayer(roster, { id: 'p1', name: '別名前' });
  assert.strictEqual(roster.length, 2);
  assert.strictEqual(roster.find((p) => p.id === 'p1').name, 'ゲスト1');

  assert.strictEqual(hasMinPlayers(roster, MIN_PLAYERS), true); // 2人で開始可能

  roster = addPlayer(roster, { id: 'p2', name: 'ゲスト2' });
  assert.strictEqual(hasMinPlayers(roster, MIN_PLAYERS), true);

  roster = removePlayer(roster, 'p1');
  assert.strictEqual(roster.length, 2);
  assert.strictEqual(hasMinPlayers(roster, MIN_PLAYERS), true);

  roster = removePlayer(roster, 'p2');
  assert.strictEqual(roster.length, 1);
  assert.strictEqual(hasMinPlayers(roster, MIN_PLAYERS), false);
}

console.log('All tests passed');
