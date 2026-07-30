const assert = require("assert");
const { calcBMI, classifyBMI, calcIdealWeight, round1 } = require("./logic.js");

// calcBMI
assert.strictEqual(round1(calcBMI(170, 63.58)), 22.0, "170cm/63.58kgでBMI約22");
assert.strictEqual(calcBMI(100, 18.5), 18.5, "100cm/18.5kgでBMI=18.5");
assert.ok(isNaN(calcBMI(0, 60)), "身長0はNaN");
assert.ok(isNaN(calcBMI(170, -1)), "体重が負はNaN");
assert.ok(isNaN(calcBMI(170, 0)), "体重0はNaN");

// classifyBMI 境界値テスト(JASSO基準)
assert.strictEqual(classifyBMI(18.4), "低体重");
assert.strictEqual(classifyBMI(18.5), "普通体重");
assert.strictEqual(classifyBMI(24.9), "普通体重");
assert.strictEqual(classifyBMI(25), "肥満(1度)");
assert.strictEqual(classifyBMI(29.9), "肥満(1度)");
assert.strictEqual(classifyBMI(30), "肥満(2度)");
assert.strictEqual(classifyBMI(34.9), "肥満(2度)");
assert.strictEqual(classifyBMI(35), "肥満(3度)");
assert.strictEqual(classifyBMI(39.9), "肥満(3度)");
assert.strictEqual(classifyBMI(40), "肥満(4度)");
assert.strictEqual(classifyBMI(50), "肥満(4度)");
assert.strictEqual(classifyBMI(NaN), "不明");

// calcIdealWeight
assert.strictEqual(round1(calcIdealWeight(170)), 63.6, "170cmの適正体重");
assert.strictEqual(calcIdealWeight(100), 22, "100cmの適正体重は22kg");
assert.ok(isNaN(calcIdealWeight(0)), "身長0はNaN");

// round1
assert.strictEqual(round1(22.049), 22.0);
assert.strictEqual(round1(22.05), 22.1);

console.log("All tests passed");
