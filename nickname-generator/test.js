// logic.js のテスト(Node.js組み込み assert のみ使用)
const assert = require("assert");
const {
  hashString,
  seededShuffle,
  mulberry32,
  extractNameParts,
  generateNicknames,
} = require("./logic.js");

// hashString: 決定性
assert.strictEqual(hashString("たろう"), hashString("たろう"));
assert.notStrictEqual(hashString("たろう"), hashString("じろう"));

// seededShuffle: 同じ乱数列なら同じ結果、元配列は変更されない
const original = [1, 2, 3, 4, 5];
const rngA = mulberry32(42);
const shuffledA = seededShuffle(original, rngA);
assert.deepStrictEqual(original, [1, 2, 3, 4, 5], "元配列は変更されないべき");
assert.strictEqual(shuffledA.length, original.length);
assert.deepStrictEqual([...shuffledA].sort(), [...original].sort(), "要素の集合は変わらない");

const rngB = mulberry32(42);
const shuffledB = seededShuffle(original, rngB);
assert.deepStrictEqual(shuffledA, shuffledB, "同じシードなら同じシャッフル結果になるべき");

// extractNameParts: 空文字でも最低1件返す
assert.ok(extractNameParts("").length >= 1);
assert.ok(extractNameParts("太郎").includes("太"));
assert.ok(extractNameParts("太郎").includes("郎"));

// generateNicknames: 同じ名前なら常に同じ候補セットになる
const g1 = generateNicknames("山田太郎");
const g2 = generateNicknames("山田太郎");
assert.deepStrictEqual(g1, g2, "同じ名前は常に同じあだ名候補セットになるべき");

// generateNicknames: 指定件数(重複なし)返す
assert.strictEqual(g1.nicknames.length, 6, "デフォルトで6件のあだ名候補を返すべき");
assert.strictEqual(new Set(g1.nicknames).size, g1.nicknames.length, "あだ名候補は重複しないべき");

// generateNicknames: 名前が異なれば候補も異なりうる
const g3 = generateNicknames("鈴木花子");
assert.notDeepStrictEqual(g1.nicknames, g3.nicknames, "名前が異なればあだ名候補も変わるはず");

// generateNicknames: count引数で件数を変更できる
const g4 = generateNicknames("山田太郎", 3);
assert.strictEqual(g4.nicknames.length, 3);

console.log("All tests passed");
