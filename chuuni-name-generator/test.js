// logic.js のテスト(Node.js組み込み assert のみ使用)
const assert = require("assert");
const {
  hashString,
  ADJECTIVES,
  NOUNS,
  SUFFIX_BANK,
  generateChuuniNames,
} = require("./logic.js");

// hashString: 決定性
assert.strictEqual(hashString("剣崎"), hashString("剣崎"));
assert.notStrictEqual(hashString("剣崎"), hashString("剣崎二世"));

// generateChuuniNames: 同じ名前なら常に同じ結果になる
const g1 = generateChuuniNames("山田太郎");
const g2 = generateChuuniNames("山田太郎");
assert.deepStrictEqual(g1, g2, "同じ名前は常に同じ二つ名候補になるべき");

// generateChuuniNames: デフォルトで3件
assert.strictEqual(g1.length, 3);

// generateChuuniNames: 各候補の形容詞・名詞がワードバンクの範囲内であること
g1.forEach((item) => {
  assert.ok(ADJECTIVES.includes(item.adj), "形容詞はADJECTIVESに含まれるべき");
  assert.ok(NOUNS.includes(item.noun), "名詞はNOUNSに含まれるべき");
  assert.ok(item.suffix === "" || SUFFIX_BANK.includes(item.suffix), "接尾語は空かSUFFIX_BANKに含まれるべき");
  assert.strictEqual(item.full, item.suffix ? `${item.adj}${item.noun}${item.suffix}` : `${item.adj}${item.noun}`, "full文字列は各要素の連結と一致するべき");
});

// generateChuuniNames: 名前が異なれば結果も変わりうる
const g3 = generateChuuniNames("鈴木花子");
assert.notDeepStrictEqual(g1, g3, "名前が異なれば二つ名候補も変わるはず");

// generateChuuniNames: count引数で件数を変更できる
const g4 = generateChuuniNames("山田太郎", 5);
assert.strictEqual(g4.length, 5);

// ワードバンクの件数チェック
assert.ok(ADJECTIVES.length >= 15, "形容詞は十分な件数があるべき");
assert.ok(NOUNS.length >= 15, "名詞は十分な件数があるべき");

console.log("All tests passed");
