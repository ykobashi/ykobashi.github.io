// 割り勘計算ロジック(純粋関数のみ、DOM操作禁止)

/**
 * 金額(整数円)をnumPeople人に均等配分する。
 * 端数(割り切れない分)は先頭からremainder人に+1円ずつ配分し、
 * 合計が必ずamountYenと一致するようにする。
 * @param {number} amountYen 配分する合計金額(円、整数)
 * @param {number} numPeople 人数
 * @returns {number[]} 各人の負担額の配列(長さnumPeople)
 */
function distributeEven(amountYen, numPeople) {
  if (!Number.isFinite(amountYen) || !Number.isInteger(numPeople) || numPeople <= 0) {
    return [];
  }
  const base = Math.floor(amountYen / numPeople);
  const remainder = amountYen - base * numPeople;
  const result = new Array(numPeople).fill(base);
  for (let i = 0; i < remainder; i++) {
    result[i] += 1;
  }
  return result;
}

/**
 * 割り勘金額を計算する。幹事など多めに払う人がいる場合の調整に対応。
 * @param {number} totalAmount 合計金額(円)
 * @param {number} numPeople 人数
 * @param {number} [extraPerOrganizer=0] 幹事が追加で多く払う金額(円)
 * @param {number} [numOrganizers=0] 幹事の人数(先頭numOrganizers人に適用)
 * @returns {{ ok: boolean, amounts: number[], error: string|null }}
 */
function calcWarikan(totalAmount, numPeople, extraPerOrganizer = 0, numOrganizers = 0) {
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    return { ok: false, amounts: [], error: "合計金額には0以上の数値を入力してください。" };
  }
  if (!Number.isInteger(numPeople) || numPeople <= 0) {
    return { ok: false, amounts: [], error: "人数には1以上の整数を入力してください。" };
  }
  if (!Number.isFinite(extraPerOrganizer) || extraPerOrganizer < 0) {
    return { ok: false, amounts: [], error: "幹事の追加負担額には0以上の数値を入力してください。" };
  }
  if (!Number.isInteger(numOrganizers) || numOrganizers < 0 || numOrganizers > numPeople) {
    return { ok: false, amounts: [], error: "幹事の人数が不正です。" };
  }

  const totalYen = Math.round(totalAmount);
  const extraYen = Math.round(extraPerOrganizer);
  const adjustedTotal = totalYen - extraYen * numOrganizers;

  if (adjustedTotal < 0) {
    return { ok: false, amounts: [], error: "幹事の追加負担額の合計が合計金額を超えています。" };
  }

  const shares = distributeEven(adjustedTotal, numPeople);
  const amounts = shares.map((share, i) => (i < numOrganizers ? share + extraYen : share));

  return { ok: true, amounts, error: null };
}

if (typeof module !== "undefined") {
  module.exports = { distributeEven, calcWarikan };
}
