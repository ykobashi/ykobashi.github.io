// logic.js のテスト(Node.js組み込み assert のみ使用)
const assert = require("assert");
const { hashString, PAST_LIVES, diagnosePastLife } = require("./logic.js");

// hashString: 同じ入力なら同じ結果
assert.strictEqual(hashString("test"), hashString("test"), "同じ文字列は同じハッシュになるべき");
// hashString: 異なる入力なら基本的に異なる結果
assert.notStrictEqual(hashString("test"), hashString("test2"), "異なる文字列は異なるハッシュになるべき");
// hashString: 常に0以上の整数
assert.ok(hashString("あいうえお") >= 0, "ハッシュは0以上");
assert.ok(Number.isInteger(hashString("あいうえお")), "ハッシュは整数");

// diagnosePastLife: 同じ名前+生年月日なら常に同じ結果
const resultA1 = diagnosePastLife("山田太郎", "1990-04-01");
const resultA2 = diagnosePastLife("山田太郎", "1990-04-01");
assert.deepStrictEqual(resultA1, resultA2, "同じ入力は常に同じ前世結果になるべき");

// diagnosePastLife: 名前が違えば結果が変わりうる(インデックスの範囲チェック)
const resultB = diagnosePastLife("鈴木花子", "1990-04-01");
assert.ok(resultB.index >= 0 && resultB.index < PAST_LIVES.length, "インデックスはPAST_LIVESの範囲内");
assert.ok(resultA1.index >= 0 && resultA1.index < PAST_LIVES.length, "インデックスはPAST_LIVESの範囲内");

// diagnosePastLife: 返り値の構造チェック
assert.ok(typeof resultA1.job === "string" && resultA1.job.length > 0, "jobは文字列");
assert.ok(typeof resultA1.era === "string" && resultA1.era.length > 0, "eraは文字列");
assert.ok(typeof resultA1.flavor === "string" && resultA1.flavor.length > 0, "flavorは文字列");

// diagnosePastLife: 生年月日が違えば結果が変わりうることの確認(複数サンプルで少なくとも1件は違う)
let foundDifferent = false;
for (let i = 1; i <= 31; i++) {
  const d = `1990-04-${String(i).padStart(2, "0")}`;
  const r = diagnosePastLife("山田太郎", d);
  if (r.index !== resultA1.index) {
    foundDifferent = true;
    break;
  }
}
assert.ok(foundDifferent, "生年月日が変われば結果も変わることがある");

// PAST_LIVESの件数チェック(20〜30種程度)
assert.ok(PAST_LIVES.length >= 20 && PAST_LIVES.length <= 30, "前世キャラは20〜30種程度であるべき");

console.log("All tests passed");
