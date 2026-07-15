// 文字数カウントロジック(純粋関数のみ、DOM操作禁止)

/**
 * 文字数をカウントする(サロゲートペア=絵文字なども1文字として数える)
 * @param {string} text
 * @param {boolean} [includeSpaces=true] スペースを含めるか
 * @returns {number}
 */
function countChars(text, includeSpaces = true) {
  if (typeof text !== "string") return 0;
  const target = includeSpaces ? text : text.replace(/[ 　]/g, "");
  return Array.from(target).length;
}

/**
 * 行数をカウントする(改行コードCRLF/LF/CRいずれにも対応)
 * @param {string} text
 * @returns {number}
 */
function countLines(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

/**
 * UTF-8でのバイト数を計算する(TextEncoder非依存の純粋実装)
 * @param {string} text
 * @returns {number}
 */
function utf8ByteLength(text) {
  if (typeof text !== "string") return 0;
  let bytes = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/**
 * 原稿用紙(400字詰め)換算枚数を計算する(切り上げ)
 * @param {string} text
 * @param {number} [charsPerPage=400]
 * @returns {number}
 */
function manuscriptPages(text, charsPerPage = 400) {
  const count = countChars(text, true);
  if (count === 0) return 0;
  return Math.ceil(count / charsPerPage);
}

/**
 * X(Twitter)の文字数制限に対する残り文字数を計算する
 * @param {string} text
 * @param {number} [limit=140]
 * @returns {number}
 */
function twitterRemaining(text, limit = 140) {
  return limit - countChars(text, true);
}

if (typeof module !== "undefined") {
  module.exports = { countChars, countLines, utf8ByteLength, manuscriptPages, twitterRemaining };
}
