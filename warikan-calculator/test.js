const assert = require("assert");
const { distributeEven, calcWarikan } = require("./logic.js");

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }

// distributeEven: 割り切れるケース
assert.deepStrictEqual(distributeEven(9000, 3), [3000, 3000, 3000]);

// distributeEven: 割り切れないケース(端数を先頭に+1円ずつ)
assert.deepStrictEqual(distributeEven(10000, 3), [3334, 3333, 3333]);
assert.strictEqual(sum(distributeEven(10000, 3)), 10000);

assert.deepStrictEqual(distributeEven(1000, 7), [143, 143, 143, 143, 143, 143, 142]);
assert.strictEqual(sum(distributeEven(1000, 7)), 1000);

// distributeEven: 不正入力
assert.deepStrictEqual(distributeEven(1000, 0), []);
assert.deepStrictEqual(distributeEven(1000, -1), []);

// calcWarikan: 基本(幹事なし)
let r = calcWarikan(10000, 3);
assert.strictEqual(r.ok, true);
assert.deepStrictEqual(r.amounts, [3334, 3333, 3333]);
assert.strictEqual(sum(r.amounts), 10000);

// calcWarikan: 幹事1名が500円多く払う
r = calcWarikan(10000, 3, 500, 1);
assert.strictEqual(r.ok, true);
assert.strictEqual(sum(r.amounts), 10000);
assert.strictEqual(r.amounts[0], 3667);
assert.strictEqual(r.amounts[1], 3167);
assert.strictEqual(r.amounts[2], 3166);

// calcWarikan: 端数なしのケース
r = calcWarikan(9000, 3);
assert.deepStrictEqual(r.amounts, [3000, 3000, 3000]);

// calcWarikan: 不正な入力
assert.strictEqual(calcWarikan(-100, 3).ok, false);
assert.strictEqual(calcWarikan(1000, 0).ok, false);
assert.strictEqual(calcWarikan(1000, 3.5).ok, false);
assert.strictEqual(calcWarikan(1000, 3, -1).ok, false);
assert.strictEqual(calcWarikan(1000, 3, 0, 5).ok, false, "幹事人数が総人数を超える");
assert.strictEqual(calcWarikan(1000, 2, 600, 2).ok, false, "幹事負担合計が総額を超える");

console.log("All tests passed");
