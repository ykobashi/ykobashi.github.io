// logic.js のテスト(Node.js組み込み assert のみ使用)
const assert = require("assert");
const {
  QUESTIONS,
  TYPE_RESULTS,
  calculateScores,
  classifyBucket,
  determineType,
  diagnosePersonality,
} = require("./logic.js");

// QUESTIONSの件数チェック(8〜10問)
assert.ok(QUESTIONS.length >= 8 && QUESTIONS.length <= 10, "質問数は8〜10問であるべき");
QUESTIONS.forEach((q) => {
  assert.ok(q.axis === "axis1" || q.axis === "axis2", "各質問はaxis1かaxis2を持つ");
  assert.strictEqual(q.options.length, 2, "各質問の選択肢は2つ");
});

// TYPE_RESULTSは16パターン
assert.strictEqual(TYPE_RESULTS.length, 16, "性格タイプは16パターンであるべき");
TYPE_RESULTS.forEach((t) => {
  assert.ok(typeof t.name === "string" && t.name.length > 0);
  assert.ok(typeof t.description === "string" && t.description.length > 0);
});
// 名前が全て重複していないこと
const names = TYPE_RESULTS.map((t) => t.name);
assert.strictEqual(new Set(names).size, names.length, "タイプ名は重複しないべき");

// calculateScores: 全て選択肢0(先導・閃き側)を選んだ場合
const allZero = QUESTIONS.map(() => 0);
const scoresAllZero = calculateScores(allZero);
assert.strictEqual(scoresAllZero.axis1, scoresAllZero.axis1Max, "全て0選択ならaxis1は満点");
assert.strictEqual(scoresAllZero.axis2, scoresAllZero.axis2Max, "全て0選択ならaxis2は満点");

// calculateScores: 全て選択肢1を選んだ場合はスコア0
const allOne = QUESTIONS.map(() => 1);
const scoresAllOne = calculateScores(allOne);
assert.strictEqual(scoresAllOne.axis1, 0);
assert.strictEqual(scoresAllOne.axis2, 0);

// axis1Max, axis2Maxがそれぞれ5であること(5問ずつの設計)
assert.strictEqual(scoresAllZero.axis1Max, 5);
assert.strictEqual(scoresAllZero.axis2Max, 5);

// classifyBucket: 境界値の確認
assert.strictEqual(classifyBucket(0), 0);
assert.strictEqual(classifyBucket(1), 0);
assert.strictEqual(classifyBucket(2), 1);
assert.strictEqual(classifyBucket(3), 2);
assert.strictEqual(classifyBucket(4), 3);
assert.strictEqual(classifyBucket(5), 3);

// determineType: 境界の組み合わせでインデックスが正しく計算される
assert.deepStrictEqual(determineType(0, 0).index, 0);
assert.deepStrictEqual(determineType(5, 5).index, 15);
assert.strictEqual(determineType(3, 2).index, 2 * 4 + 1); // bucket1=2, bucket2=1

// diagnosePersonality: 一貫性(同じ回答なら同じ結果)
const answers = [0, 1, 0, 0, 1, 1, 0, 1, 0, 1];
const d1 = diagnosePersonality(answers);
const d2 = diagnosePersonality(answers);
assert.deepStrictEqual(d1, d2, "同じ回答は常に同じ診断結果になるべき");
assert.ok(d1.index >= 0 && d1.index < 16);
assert.ok(typeof d1.name === "string" && d1.name.length > 0);

console.log("All tests passed");
