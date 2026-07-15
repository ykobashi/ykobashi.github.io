const assert = require("assert");
const { countChars, countLines, utf8ByteLength, manuscriptPages, twitterRemaining } = require("./logic.js");

// countChars
assert.strictEqual(countChars(""), 0);
assert.strictEqual(countChars("あいうえお"), 5);
assert.strictEqual(countChars("hello world"), 11);
assert.strictEqual(countChars("hello world", false), 10, "半角スペース除く");
assert.strictEqual(countChars("あ　い", false), 2, "全角スペース除く");
assert.strictEqual(countChars("😀😀"), 2, "サロゲートペア(絵文字)は1文字として数える");
assert.strictEqual("😀😀".length, 4, "参考: JSのstring.lengthはサロゲートペアで4になる(比較用)");
assert.notStrictEqual(countChars("😀😀"), "😀😀".length, "countCharsはlengthと異なり正しく2文字と数える");

// countLines
assert.strictEqual(countLines(""), 0);
assert.strictEqual(countLines("1行のみ"), 1);
assert.strictEqual(countLines("1行目\n2行目\n3行目"), 3);
assert.strictEqual(countLines("a\r\nb\r\nc"), 3, "CRLF対応");
assert.strictEqual(countLines("a\rb"), 2, "CR対応");
assert.strictEqual(countLines("末尾改行\n"), 2, "末尾改行で空行も1行と数える");

// utf8ByteLength
assert.strictEqual(utf8ByteLength(""), 0);
assert.strictEqual(utf8ByteLength("abc"), 3, "ASCIIは1バイト/文字");
assert.strictEqual(utf8ByteLength("あ"), 3, "日本語は3バイト/文字(UTF-8)");
assert.strictEqual(utf8ByteLength("あいう"), 9);
assert.strictEqual(utf8ByteLength("😀"), 4, "絵文字は4バイト(UTF-8)");
assert.strictEqual(utf8ByteLength("a あ😀"), 1 + 1 + 3 + 4);

// manuscriptPages (400字詰め、切り上げ)
assert.strictEqual(manuscriptPages(""), 0);
assert.strictEqual(manuscriptPages("あ".repeat(400)), 1, "ちょうど400字は1枚");
assert.strictEqual(manuscriptPages("あ".repeat(401)), 2, "401字は切り上げで2枚");
assert.strictEqual(manuscriptPages("あ".repeat(800)), 2);
assert.strictEqual(manuscriptPages("あ".repeat(1)), 1);

// twitterRemaining
assert.strictEqual(twitterRemaining(""), 140);
assert.strictEqual(twitterRemaining("あ".repeat(140)), 0);
assert.strictEqual(twitterRemaining("あ".repeat(141)), -1, "超過分はマイナス表示");
assert.strictEqual(twitterRemaining("abc", 10), 7);

console.log("All tests passed");
