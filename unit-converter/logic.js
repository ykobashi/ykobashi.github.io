// 単位変換ロジック(純粋関数のみ、DOM操作禁止)

const LENGTH_UNITS = {
  m: 1,
  cm: 0.01,
  km: 1000,
  inch: 0.0254,
  feet: 0.3048,
  mile: 1609.344,
};

const WEIGHT_UNITS = {
  kg: 1,
  g: 0.001,
  lb: 0.45359237,
  oz: 0.028349523125,
};

const LENGTH_LABELS = { m: "メートル", cm: "センチメートル", km: "キロメートル", inch: "インチ", feet: "フィート", mile: "マイル" };
const WEIGHT_LABELS = { kg: "キログラム", g: "グラム", lb: "ポンド", oz: "オンス" };
const TEMPERATURE_LABELS = { celsius: "摂氏(℃)", fahrenheit: "華氏(℉)", kelvin: "ケルビン(K)" };

/**
 * 長さの単位変換
 * @param {number} value
 * @param {string} fromUnit
 * @param {string} toUnit
 * @returns {number}
 */
function convertLength(value, fromUnit, toUnit) {
  if (!Number.isFinite(value) || !(fromUnit in LENGTH_UNITS) || !(toUnit in LENGTH_UNITS)) {
    return NaN;
  }
  const meters = value * LENGTH_UNITS[fromUnit];
  return meters / LENGTH_UNITS[toUnit];
}

/**
 * 重さの単位変換
 * @param {number} value
 * @param {string} fromUnit
 * @param {string} toUnit
 * @returns {number}
 */
function convertWeight(value, fromUnit, toUnit) {
  if (!Number.isFinite(value) || !(fromUnit in WEIGHT_UNITS) || !(toUnit in WEIGHT_UNITS)) {
    return NaN;
  }
  const kg = value * WEIGHT_UNITS[fromUnit];
  return kg / WEIGHT_UNITS[toUnit];
}

/**
 * 温度を摂氏に変換する
 * @param {number} value
 * @param {string} unit "celsius" | "fahrenheit" | "kelvin"
 * @returns {number}
 */
function toCelsius(value, unit) {
  switch (unit) {
    case "celsius": return value;
    case "fahrenheit": return (value - 32) * 5 / 9;
    case "kelvin": return value - 273.15;
    default: return NaN;
  }
}

/**
 * 摂氏から指定単位に変換する
 * @param {number} celsius
 * @param {string} unit "celsius" | "fahrenheit" | "kelvin"
 * @returns {number}
 */
function fromCelsius(celsius, unit) {
  switch (unit) {
    case "celsius": return celsius;
    case "fahrenheit": return celsius * 9 / 5 + 32;
    case "kelvin": return celsius + 273.15;
    default: return NaN;
  }
}

/**
 * 温度の単位変換(係数ではなく変換式を使用)
 * @param {number} value
 * @param {string} fromUnit
 * @param {string} toUnit
 * @returns {number}
 */
function convertTemperature(value, fromUnit, toUnit) {
  if (!Number.isFinite(value)) return NaN;
  const celsius = toCelsius(value, fromUnit);
  if (isNaN(celsius)) return NaN;
  return fromCelsius(celsius, toUnit);
}

if (typeof module !== "undefined") {
  module.exports = {
    LENGTH_UNITS,
    WEIGHT_UNITS,
    LENGTH_LABELS,
    WEIGHT_LABELS,
    TEMPERATURE_LABELS,
    convertLength,
    convertWeight,
    convertTemperature,
    toCelsius,
    fromCelsius,
  };
}
