const assert = require('node:assert');
const L = require('./logic.js');

// --- 記事タイトルリスト ---
assert.ok(L.ARTICLE_LIST.length >= 80, 'ARTICLE_LIST should have at least 80 entries');
assert.strictEqual(new Set(L.ARTICLE_LIST).size, L.ARTICLE_LIST.length, 'ARTICLE_LIST should have no duplicates');
L.ARTICLE_LIST.forEach((t) => { assert.ok(typeof t === 'string' && t.trim().length > 0, 'title should be non-empty string: ' + t); });

// --- shuffle ---
assert.deepStrictEqual(L.shuffle([1, 2, 3], () => 0), [2, 3, 1]);
assert.deepStrictEqual(L.shuffle([1, 2, 3]).sort(), [1, 2, 3]);

// --- pickArticleCandidates ---
{
  const bank = ['A', 'B', 'C', 'D', 'E'];
  const candidates = L.pickArticleCandidates(['A', 'B'], () => 0.4, bank, 3);
  assert.strictEqual(candidates.length, 3);
  candidates.forEach((c) => assert.ok(!['A', 'B'].includes(c)));
  assert.strictEqual(new Set(candidates).size, candidates.length);

  // 全件出題済みの場合はリスト全体を使い回す
  const exhausted = L.pickArticleCandidates(bank, () => 0.1, bank, 2);
  assert.strictEqual(exhausted.length, 2);
  exhausted.forEach((c) => assert.ok(bank.includes(c)));
}

// --- buildChoices ---
{
  const bank = ['正解', 'B', 'C', 'D', 'E', 'F'];
  const choices = L.buildChoices('正解', () => 0.5, bank);
  assert.strictEqual(choices.length, L.CHOICE_COUNT);
  assert.ok(choices.includes('正解'));
  assert.strictEqual(new Set(choices).size, choices.length);
  choices.forEach((c) => assert.ok(bank.includes(c)));
}

// --- buildChoices: 誤答はまず同じ小分類(group)から優先して選ばれる ---
{
  // 「ライオン」は動物カテゴリの中の「陸上の哺乳類」グループ。同グループが6件(自分を除く)
  // あるので、誤答3件はすべて陸上の哺乳類グループから選ばれるはず(鳥類や爬虫類が混ざらない)。
  const choices = L.buildChoices('ライオン');
  assert.strictEqual(choices.length, L.CHOICE_COUNT);
  assert.ok(choices.includes('ライオン'));
  choices.filter((c) => c !== 'ライオン').forEach((c) => {
    assert.strictEqual(L.TITLE_GROUP[c], '動物:陸上の哺乳類', c + ' should be from the same group (動物:陸上の哺乳類)');
  });
}

// --- buildChoices: 「大阪城」の誤答は日本の城グループ(姫路城・名古屋城・熊本城)から選ばれ、
// ピラミッドやマチュ・ピチュ、東京タワーのような時代・地域の違う建造物が混ざらないことを
// 確認する回帰テスト(過去にカテゴリが粗すぎて全く似ていない建造物が選択肢に出ていた不具合) ---
{
  const choices = L.buildChoices('大阪城');
  assert.strictEqual(choices.length, L.CHOICE_COUNT);
  assert.ok(choices.includes('大阪城'));
  choices.filter((c) => c !== '大阪城').forEach((c) => {
    assert.strictEqual(L.TITLE_GROUP[c], '場所・建造物:日本の城', c + ' should be from the same group (場所・建造物:日本の城)');
  });
}

// --- buildChoices: 「恐竜」の誤答は動物カテゴリの爬虫類・恐竜グループから選ばれ、
// 忍者や火星のような無関係なジャンルが混ざらないことを確認する回帰テスト ---
{
  const choices = L.buildChoices('恐竜');
  assert.strictEqual(choices.length, L.CHOICE_COUNT);
  assert.ok(choices.includes('恐竜'));
  choices.filter((c) => c !== '恐竜').forEach((c) => {
    assert.strictEqual(L.TITLE_GROUP[c], '動物:爬虫類・恐竜', c + ' should be from the same group (動物:爬虫類・恐竜)');
  });
}

// --- buildChoices: 全ての小分類(group)が最低4件(=正解を除いても誤答3件を賄える数)持つことを
// 保証する。これが崩れると、また「小分類だけでは足りず全く違うジャンルが混ざる」不具合に戻る。 ---
{
  L.ARTICLE_CATEGORIES.forEach((c) => {
    c.groups.forEach((g) => {
      assert.ok(g.titles.length >= 4, '小分類「' + c.name + ':' + g.name + '」は4件以上必要: ' + g.titles.length);
    });
  });
}

// --- buildChoices: 小分類の候補が足りない場合は大分類、それでも足りなければ全体から補う ---
{
  // 小分類ごと合成のテスト用データで、tier1(同じgroup)が2件しかない状況を作る。
  const bank = ['正解', 'group-a1', 'group-a2', 'cat-b1', 'cat-b2', 'other1', 'other2'];
  const titleGroup = { '正解': 'G1', 'group-a1': 'G1', 'group-a2': 'G1', 'cat-b1': 'G2', 'cat-b2': 'G2' };
  const titleCategory = { '正解': 'C1', 'group-a1': 'C1', 'group-a2': 'C1', 'cat-b1': 'C1', 'cat-b2': 'C1', other1: 'C2', other2: 'C2' };
  const choices = L.buildChoices('正解', () => 0.99, bank, titleGroup, titleCategory);
  assert.strictEqual(choices.length, L.CHOICE_COUNT);
  assert.ok(choices.includes('正解'));
  assert.ok(choices.includes('group-a1') && choices.includes('group-a2'), '同じ小分類の候補は必ず使われるべき');
  const others = choices.filter((c) => c !== '正解');
  others.forEach((c) => assert.strictEqual(titleCategory[c], 'C1', c + ' should still be from the same category (C1)'));
  assert.ok(others.some((c) => titleGroup[c] !== 'G1'), '小分類の候補が尽きたら大分類の別グループから補われるべき');
}

// --- ARTICLE_CATEGORIES: 各カテゴリの合計がARTICLE_LISTと一致する ---
{
  const flattened = L.ARTICLE_CATEGORIES.reduce((acc, c) => acc.concat(c.titles), []);
  assert.deepStrictEqual(flattened, L.ARTICLE_LIST);
}

// --- redactExtract ---
{
  const extract = '東京タワー（とうきょうタワー）は、東京都港区にある電波塔である。東京タワーは1958年に完成した。';
  const redacted = L.redactExtract(extract, '東京タワー');
  assert.ok(!redacted.includes('東京タワー'), 'title should be fully redacted');
  assert.ok(!redacted.includes('とうきょうタワー'), 'reading in parentheses should be redacted too');
  assert.ok(redacted.includes(L.MASK));
  assert.strictEqual(L.redactExtract('', '東京タワー'), '');
  assert.strictEqual(L.redactExtract('内容', ''), '内容');
}

// --- redactExtract: 回帰テスト。Wikipediaの人物記事は本文冒頭で姓と名の間にスペースを
// 入れる慣習があり(例:タイトル「坂本龍馬」だが本文は「坂本 龍馬」)、これを単純な文字列一致で
// 検出できず答えが丸見えになっていた実際の不具合を元にしたテスト。 ---
{
  const extract = '坂本 龍馬 は、日本の幕末の土佐藩士、志士、経営者。';
  const redacted = L.redactExtract(extract, '坂本龍馬');
  assert.ok(!redacted.includes('坂本 龍馬'), 'スペース入りの氏名も伏字にできるべき: ' + redacted);
  assert.ok(redacted.includes(L.MASK));
}

// --- redactExtract: 回帰テスト。外国人名は本文側にミドルネームが挿入されることがある
// (例:タイトル「チャールズ・ダーウィン」だが本文は「チャールズ・ロバート・ダーウィン」)。 ---
{
  const extract = 'チャールズ・ロバート・ダーウィン は、イギリスの自然科学者、生物学者、地質学者。';
  const redacted = L.redactExtract(extract, 'チャールズ・ダーウィン');
  assert.ok(!redacted.includes('チャールズ'), 'ミドルネーム入りの氏名も伏字にできるべき: ' + redacted);
  assert.ok(!redacted.includes('ダーウィン'));
  assert.ok(redacted.includes(L.MASK));

  // 3つ以上の余分なパーツが挿入されるケース(ミケランジェロの本名はフルネームが非常に長い)
  const extract2 = 'ミケランジェロ・ディ・ロドヴィーコ・ブオナローティ・シモーニ は、イタリア盛期ルネサンス期の彫刻家。';
  const redacted2 = L.redactExtract(extract2, 'ミケランジェロ・ブオナローティ');
  assert.ok(!redacted2.includes('ミケランジェロ'));
  assert.ok(!redacted2.includes('ブオナローティ'));
  assert.ok(!redacted2.includes('シモーニ'), '末尾に付く余分なパーツも伏字にできるべき: ' + redacted2);
}

// --- redactExtract: 回帰テスト。REDACT_ALIASESで、タイトルと本文の語が違うケースを補う
// (例:タイトル「コロッセオ」だが本文は「コロッセウムは、ローマ帝政期に…」)。 ---
{
  const extract = 'コロッセウム は、ローマ帝政期の西暦80年に、ウェスパシアヌス帝とティトゥス帝によって造られた円形闘技場。';
  const redacted = L.redactExtract(extract, 'コロッセオ');
  assert.ok(!redacted.includes('コロッセウム'), 'エイリアス語も伏字にできるべき: ' + redacted);
  assert.ok(redacted.includes(L.MASK));
}

// --- limitSentences ---
{
  assert.strictEqual(L.limitSentences('A。B。C。D。', 3), 'A。B。C。');
  assert.strictEqual(L.limitSentences('A。B。', 3), 'A。B。');
  assert.strictEqual(L.limitSentences('', 3), '');
}

// --- truncateExtract ---
{
  assert.strictEqual(L.truncateExtract('short', 200), 'short');
  const long = 'あ'.repeat(300);
  const truncated = L.truncateExtract(long, 200);
  assert.strictEqual(truncated.length, 201); // 200文字 + '…'
  assert.ok(truncated.endsWith('…'));
}

// --- prepareExcerpt ---
{
  const extract = '東京タワー（とうきょうタワー）は、東京都港区にある電波塔である。1958年に完成した。周辺には多くの観光客が訪れる。さらに詳細な情報がここに続く。';
  const excerpt = L.prepareExcerpt(extract, '東京タワー');
  assert.ok(!excerpt.includes('東京タワー'));
  assert.ok(excerpt.length <= L.EXCERPT_MAX_LENGTH + 1);
}

// --- isCorrectAnswer / computeRoundScoreDeltas ---
{
  assert.strictEqual(L.isCorrectAnswer('東京タワー', '東京タワー'), true);
  assert.strictEqual(L.isCorrectAnswer('パリ', '東京タワー'), false);
  assert.strictEqual(L.isCorrectAnswer(null, '東京タワー'), false);

  const deltas = L.computeRoundScoreDeltas({ a: '東京タワー', b: 'パリ', c: '東京タワー' }, '東京タワー');
  assert.deepStrictEqual(deltas, { a: L.CORRECT_POINTS, c: L.CORRECT_POINTS });
}

// --- applyScoreDeltas / buildScoreboard ---
{
  assert.deepStrictEqual(L.applyScoreDeltas({ a: 500 }, { a: 1000, b: 1000 }), { a: 1500, b: 1000 });
  const roster = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const board = L.buildScoreboard({ a: 1000, b: 2000 }, roster);
  assert.deepStrictEqual(board.map((r) => r.id), ['b', 'a']);
  assert.deepStrictEqual(board.map((r) => r.rank), [1, 2]);

  // 同点は同順位になる(標準競技順位方式)
  const tiedRoster = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const tiedBoard = L.buildScoreboard({ a: 1000, b: 1000, c: 500 }, tiedRoster);
  assert.deepStrictEqual(tiedBoard.map((r) => r.rank), [1, 1, 3]);
  assert.deepStrictEqual(L.getWinners(tiedBoard).map((r) => r.id).sort(), ['a', 'b']);
}

// --- wikipediaSourceUrl ---
assert.strictEqual(L.wikipediaSourceUrl('東京タワー'), 'https://ja.wikipedia.org/wiki/' + encodeURIComponent('東京タワー'));

// --- lobby helpers ---
{
  let roster = [];
  roster = L.addPlayer(roster, { id: 'a', name: 'A' });
  roster = L.addPlayer(roster, { id: 'a', name: 'A' });
  assert.strictEqual(roster.length, 1);
  assert.strictEqual(L.hasMinPlayers(roster), false);
  roster = L.addPlayer(roster, { id: 'b', name: 'B' });
  assert.strictEqual(L.hasMinPlayers(roster), true);
  assert.deepStrictEqual(L.removePlayer(roster, 'a'), [{ id: 'b', name: 'B' }]);
}

console.log('All tests passed');
