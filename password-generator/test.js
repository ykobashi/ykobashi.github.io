const assert = require("assert");
const {
  CHARSETS,
  buildCharPool,
  calcPoolSize,
  calcEntropy,
  classifyStrength,
  generatePasswordFromRandomInts,
  generatePassword,
} = require("./logic.js");

// buildCharPool
assert.strictEqual(buildCharPool({}), "", "何も選択しなければ空文字");
assert.strictEqual(buildCharPool({ lowercase: true }), CHARSETS.lowercase);
assert.strictEqual(
  buildCharPool({ lowercase: true, uppercase: true }),
  CHARSETS.lowercase + CHARSETS.uppercase
);
assert.strictEqual(
  buildCharPool({ lowercase: true, uppercase: true, numbers: true, symbols: true }).length,
  CHARSETS.lowercase.length + CHARSETS.uppercase.length + CHARSETS.numbers.length + CHARSETS.symbols.length
);

// calcPoolSize
assert.strictEqual(calcPoolSize({}), 0);
assert.strictEqual(calcPoolSize({ numbers: true }), 10);
assert.strictEqual(calcPoolSize({ lowercase: true, numbers: true }), 26 + 10);

// calcEntropy
assert.strictEqual(calcEntropy(0, 10), 0, "プールサイズ0はエントロピー0");
assert.strictEqual(calcEntropy(10, 0), 0, "長さ0はエントロピー0");
assert.strictEqual(calcEntropy(2, 8), 8, "2文字種×8桁 = log2(2)*8 = 8bit");
assert.ok(Math.abs(calcEntropy(62, 12) - 12 * Math.log2(62)) < 1e-9);

// classifyStrength 境界値
assert.strictEqual(classifyStrength(0), "弱い");
assert.strictEqual(classifyStrength(27.9), "弱い");
assert.strictEqual(classifyStrength(28), "普通");
assert.strictEqual(classifyStrength(59.9), "普通");
assert.strictEqual(classifyStrength(60), "強い");
assert.strictEqual(classifyStrength(79.9), "強い");
assert.strictEqual(classifyStrength(80), "非常に強い");
assert.strictEqual(classifyStrength(128), "非常に強い");

// generatePasswordFromRandomInts (決定的な乱数配列でテスト)
assert.strictEqual(generatePasswordFromRandomInts("", [1, 2, 3]), "");
assert.strictEqual(generatePasswordFromRandomInts("abc", []), "");
assert.strictEqual(generatePasswordFromRandomInts("abc", [0, 1, 2]), "abc");
assert.strictEqual(generatePasswordFromRandomInts("abc", [3, 4, 5]), "abc", "modで循環する");
assert.strictEqual(generatePasswordFromRandomInts("xy", [0, 1, 2, 3]), "xyxy");

// generatePassword (実際のcrypto.getRandomValuesを使用)
let pw = generatePassword(16, { lowercase: true, uppercase: true, numbers: true, symbols: true });
assert.strictEqual(pw.length, 16, "指定した長さで生成される");
const fullPool = buildCharPool({ lowercase: true, uppercase: true, numbers: true, symbols: true });
for (const ch of pw) {
  assert.ok(fullPool.includes(ch), `生成された文字'${ch}'は指定した文字種プールに含まれる`);
}

// オプションを絞った場合、指定した文字種以外は含まれないことを確認
pw = generatePassword(50, { numbers: true });
assert.strictEqual(pw.length, 50);
assert.ok(/^[0-9]+$/.test(pw), "数字のみのオプションでは数字だけで構成される");

// 長さ0やプール空の場合は空文字
assert.strictEqual(generatePassword(0, { numbers: true }), "");
assert.strictEqual(generatePassword(10, {}), "");

// 生成のたびに異なる結果になりうることを確認(乱数なので必ずではないが、十分な長さなら極めて高確率で異なる)
const pwA = generatePassword(20, { lowercase: true, uppercase: true, numbers: true, symbols: true });
const pwB = generatePassword(20, { lowercase: true, uppercase: true, numbers: true, symbols: true });
assert.notStrictEqual(pwA, pwB, "十分な長さなら2回連続で同じ結果にはならない(乱数生成の健全性確認)");

console.log("All tests passed");
