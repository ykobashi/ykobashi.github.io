// BMI計算ロジック(純粋関数のみ、DOM操作禁止)

/**
 * BMIを計算する
 * @param {number} heightCm 身長(cm)
 * @param {number} weightKg 体重(kg)
 * @returns {number} BMI値
 */
function calcBMI(heightCm, weightKg) {
  const heightM = heightCm / 100;
  if (heightM <= 0 || weightKg <= 0 || !isFinite(heightM) || !isFinite(weightKg)) {
    return NaN;
  }
  return weightKg / (heightM * heightM);
}

/**
 * 日本肥満学会(JASSO)基準でBMIを分類する
 * @param {number} bmi
 * @returns {string} 分類名
 */
function classifyBMI(bmi) {
  if (typeof bmi !== "number" || isNaN(bmi)) return "不明";
  if (bmi < 18.5) return "低体重";
  if (bmi < 25) return "普通体重";
  if (bmi < 30) return "肥満(1度)";
  if (bmi < 35) return "肥満(2度)";
  if (bmi < 40) return "肥満(3度)";
  return "肥満(4度)";
}

/**
 * 適正体重(BMI=22時点の体重)を計算する
 * @param {number} heightCm 身長(cm)
 * @returns {number} 適正体重(kg)
 */
function calcIdealWeight(heightCm) {
  const heightM = heightCm / 100;
  if (heightM <= 0 || !isFinite(heightM)) return NaN;
  return 22 * heightM * heightM;
}

/**
 * BMI値を小数点第1位に丸める
 * @param {number} value
 * @returns {number}
 */
function round1(value) {
  return Math.round(value * 10) / 10;
}

if (typeof module !== "undefined") {
  module.exports = { calcBMI, classifyBMI, calcIdealWeight, round1 };
}
