const assert = require("assert");
const { convertLength, convertWeight, convertTemperature } = require("./logic.js");

function closeTo(actual, expected, epsilon, msg) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${msg}: expected ${expected}, got ${actual}`);
}

// --- 長さ ---
assert.strictEqual(convertLength(1, "m", "cm"), 100);
assert.strictEqual(convertLength(1, "km", "m"), 1000);
closeTo(convertLength(1, "m", "inch"), 39.3701, 0.001, "1m = 約39.37インチ");
closeTo(convertLength(1, "feet", "inch"), 12, 0.0001, "1フィート = 12インチ");
closeTo(convertLength(1, "mile", "km"), 1.609344, 0.0001, "1マイル = 約1.609km");
closeTo(convertLength(100, "cm", "m"), 1, 0.0001);
assert.ok(isNaN(convertLength(1, "m", "xyz")), "不明な単位はNaN");
assert.ok(isNaN(convertLength(NaN, "m", "cm")), "NaN値の入力はNaN");

// --- 重さ ---
assert.strictEqual(convertWeight(1, "kg", "g"), 1000);
closeTo(convertWeight(1, "kg", "lb"), 2.20462, 0.001, "1kg = 約2.2046lb");
closeTo(convertWeight(1, "lb", "oz"), 16, 0.0001, "1lb = 16oz");
closeTo(convertWeight(1000, "g", "kg"), 1, 0.0001);
assert.ok(isNaN(convertWeight(1, "kg", "xyz")));

// --- 温度(境界値) ---
assert.strictEqual(convertTemperature(0, "celsius", "fahrenheit"), 32, "0℃ = 32℉");
closeTo(convertTemperature(0, "celsius", "kelvin"), 273.15, 0.0001, "0℃ = 273.15K");
assert.strictEqual(convertTemperature(100, "celsius", "fahrenheit"), 212, "100℃ = 212℉");
closeTo(convertTemperature(100, "celsius", "kelvin"), 373.15, 0.0001, "100℃ = 373.15K");
assert.strictEqual(convertTemperature(-40, "celsius", "fahrenheit"), -40, "-40℃ = -40℉");
closeTo(convertTemperature(32, "fahrenheit", "celsius"), 0, 0.0001, "32℉ = 0℃");
closeTo(convertTemperature(273.15, "kelvin", "celsius"), 0, 0.0001, "273.15K = 0℃");
closeTo(convertTemperature(212, "fahrenheit", "kelvin"), 373.15, 0.0001, "212℉ = 373.15K");
assert.ok(isNaN(convertTemperature(0, "celsius", "xyz")), "不明な単位はNaN");
assert.ok(isNaN(convertTemperature(0, "xyz", "celsius")), "不明な単位はNaN");

console.log("All tests passed");
