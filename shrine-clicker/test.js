'use strict';

const assert = require('assert');
const logic = require('./logic.js');

const {
  BUILDINGS,
  SAVE_VERSION,
  createInitialState,
  calculateBuildingCost,
  calculateProductionRate,
  applyClick,
  purchaseBuilding,
  serializeState,
  deserializeState,
  formatNumber
} = logic;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// 施設価格
assert.strictEqual(calculateBuildingCost(15, 0), 15);
assert.strictEqual(calculateBuildingCost(15, 1), 18);
assert.strictEqual(calculateBuildingCost(100, 3), 153);
assert.strictEqual(calculateBuildingCost(0, 100000), 0);
assert.strictEqual(calculateBuildingCost(-1, -2), 0);
assert.strictEqual(calculateBuildingCost(NaN, '2'), 0);
assert.strictEqual(calculateBuildingCost(1, Infinity), 1);
assert.strictEqual(calculateBuildingCost(Number.MAX_VALUE, 10), Number.MAX_VALUE);

// 毎秒生産
const allOne = Object.fromEntries(BUILDINGS.map((building) => [building.id, 1]));
assert.strictEqual(calculateProductionRate(allOne), 53516.1);
assert.strictEqual(calculateProductionRate({ miko: 3.9, omikuji: 2 }), 2.3);
assert.strictEqual(calculateProductionRate({ miko: -1, omikuji: '5', unknown: 99 }), 0);
assert.strictEqual(calculateProductionRate(null), 0);
const rateInput = { miko: 2, unknown: 100 };
const rateBefore = clone(rateInput);
calculateProductionRate(rateInput);
assert.deepStrictEqual(rateInput, rateBefore);
assert.strictEqual(calculateProductionRate({ huge: Number.MAX_VALUE }, [{ id: 'huge', production: Number.MAX_VALUE }]), Number.MAX_VALUE);

// クリックと購入
const initial = createInitialState(1000);
const initialBefore = clone(initial);
const clicked = applyClick(initial);
assert.deepStrictEqual(initial, initialBefore);
assert.strictEqual(clicked.goriyaku, 1);
assert.strictEqual(clicked.totalEarned, 1);
assert.strictEqual(clicked.totalClicks, 1);
assert.strictEqual(applyClick(initial, 2.5).goriyaku, 2.5);
assert.strictEqual(applyClick(initial, -1).goriyaku, 1);

const wealthy = Object.assign({}, initial, { goriyaku: 100, totalEarned: 100 });
const wealthyBefore = clone(wealthy);
const bought = purchaseBuilding(wealthy, 'miko');
assert.strictEqual(bought.purchased, true);
assert.strictEqual(bought.cost, 15);
assert.strictEqual(bought.state.goriyaku, 85);
assert.strictEqual(bought.state.totalEarned, 100);
assert.strictEqual(bought.state.buildings.miko, 1);
assert.deepStrictEqual(wealthy, wealthyBefore);
const poor = purchaseBuilding(initial, 'miko');
assert.strictEqual(poor.purchased, false);
assert.strictEqual(poor.cost, 15);
assert.strictEqual(poor.state.buildings.miko, 0);
const unknownPurchase = purchaseBuilding(wealthy, 'missing');
assert.strictEqual(unknownPurchase.purchased, false);
assert.strictEqual(unknownPurchase.cost, 0);

// シリアライズ
const dirtyState = {
  version: 999,
  goriyaku: 20.5,
  totalEarned: 10,
  totalClicks: 4.8,
  buildings: { miko: 2.9, unknown: 88, torii: -2 },
  lastSaveTime: 1
};
const dirtyBefore = clone(dirtyState);
const serialized = serializeState(dirtyState, 5000);
const serializedObject = JSON.parse(serialized);
assert.deepStrictEqual(dirtyState, dirtyBefore);
assert.strictEqual(serializedObject.version, SAVE_VERSION);
assert.strictEqual(serializedObject.lastSaveTime, 5000);
assert.strictEqual(serializedObject.totalEarned, 20.5);
assert.strictEqual(serializedObject.totalClicks, 4);
assert.deepStrictEqual(Object.keys(serializedObject.buildings), BUILDINGS.map((building) => building.id));
assert.strictEqual(serializedObject.buildings.miko, 2);
assert.strictEqual(serializedObject.buildings.torii, 0);
assert.strictEqual(Object.hasOwn(serializedObject.buildings, 'unknown'), false);

// デシリアライズ
const roundTrip = deserializeState(serialized, 6000);
assert.strictEqual(roundTrip.goriyaku, 20.5);
assert.strictEqual(roundTrip.lastSaveTime, 5000);
['{bad', 'null', '[]', JSON.stringify({ version: 2 })].forEach((bad) => {
  assert.deepStrictEqual(deserializeState(bad, 7000), createInitialState(7000));
});
const damaged = deserializeState(JSON.stringify({
  version: 1,
  goriyaku: '50',
  totalEarned: -2,
  totalClicks: 2.9,
  buildings: { miko: 3.8, omikuji: '4', unknown: 9 },
  lastSaveTime: 99999
}), 8000);
assert.strictEqual(damaged.goriyaku, 0);
assert.strictEqual(damaged.totalEarned, 0);
assert.strictEqual(damaged.totalClicks, 2);
assert.strictEqual(damaged.buildings.miko, 3);
assert.strictEqual(damaged.buildings.omikuji, 0);
assert.strictEqual(Object.hasOwn(damaged.buildings, 'unknown'), false);
assert.strictEqual(damaged.lastSaveTime, 8000);
const missing = deserializeState(JSON.stringify({ version: 1 }), 9000);
assert.strictEqual(missing.lastSaveTime, 9000);
assert.deepStrictEqual(missing.buildings, createInitialState(9000).buildings);

// 数値表示
assert.strictEqual(formatNumber(0), '0');
assert.strictEqual(formatNumber(12.345), '12.35');
assert.strictEqual(formatNumber(9999), '9,999');
assert.strictEqual(formatNumber(10000), '1万');
assert.strictEqual(formatNumber(12345678), '1234.57万');
assert.strictEqual(formatNumber(123456789), '1.23億');
assert.strictEqual(formatNumber(1e12), '1兆');
assert.strictEqual(formatNumber(1.5e16), '1.5京');
assert.strictEqual(formatNumber(99999999), '1億');
assert.strictEqual(formatNumber(-123456789), '-1.23億');
assert.strictEqual(formatNumber(-0), '0');
assert.strictEqual(formatNumber(NaN), '0');
assert.strictEqual(formatNumber(Infinity), '0');

console.log('All tests passed');
