// logic.js のテスト(Node.js組み込み assert のみ使用)
const assert = require("assert");
const {
  hashString,
  formatDateLocal,
  OVERALL_WEIGHTED,
  CATEGORY_LABELS,
  getDailyFortune,
} = require("./logic.js");

// hashString: 決定性
assert.strictEqual(hashString("abc"), hashString("abc"));
assert.notStrictEqual(hashString("abc"), hashString("abd"));

// formatDateLocal
assert.strictEqual(formatDateLocal(new Date(2026, 0, 5)), "2026-01-05");
assert.strictEqual(formatDateLocal(new Date(2026, 11, 31)), "2026-12-31");

// getDailyFortune: 同じ名前・同じ日付なら常に同じ結果
const r1 = getDailyFortune("太郎", "2026-07-15");
const r2 = getDailyFortune("太郎", "2026-07-15");
assert.deepStrictEqual(r1, r2, "同じ入力は常に同じ結果になるべき");

// getDailyFortune: 名前が空でも動作する(ゲスト扱い)
const rGuest = getDailyFortune("", "2026-07-15");
assert.strictEqual(rGuest.name, "ゲスト");

// getDailyFortune: 返り値の構造チェック
assert.ok(OVERALL_WEIGHTED.includes(r1.overall), "総合運はOVERALL_WEIGHTEDに含まれる値であるべき");
assert.ok(typeof r1.overallComment === "string" && r1.overallComment.length > 0);
for (const key of Object.keys(CATEGORY_LABELS)) {
  assert.ok(r1.categories[key], `${key} の結果が存在するべき`);
  assert.ok(typeof r1.categories[key].level === "string" && r1.categories[key].level.length > 0);
  assert.ok(typeof r1.categories[key].comment === "string" && r1.categories[key].comment.length > 0);
}

// getDailyFortune: 日付が変われば結果も変わる(1か月分の日付で診断し、全て同一にならないことを確認)
const days = [];
for (let d = 1; d <= 28; d++) {
  days.push(`2026-01-${String(d).padStart(2, "0")}`);
}
const serialized = days.map((d) => JSON.stringify(getDailyFortune("太郎", d)));
const uniqueResults = new Set(serialized);
assert.ok(uniqueResults.size > 1, "日付が変われば診断結果も変わるはず(28日分試して全て同一は不自然)");

// getDailyFortune: 名前が変われば結果も変わりうる(シードが変わるため)
const rOtherName = getDailyFortune("花子", "2026-07-15");
assert.notStrictEqual(
  JSON.stringify({ ...rOtherName, name: "" }),
  JSON.stringify({ ...r1, name: "" }),
  "名前が異なれば診断結果も変わりうる"
);

console.log("All tests passed");
