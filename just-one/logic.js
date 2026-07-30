const MIN_PLAYERS = 2;
const MAX_CLUE_LENGTH = 10;
const WORD_BANK = ['コーヒー','宇宙','猫','映画','音楽','海','山','時計','雨','学校','電車','花','鍵','星','パン','犬','本','火','雪','橋','王様','病院','カメラ','船','月','森','帽子','鏡','魚','空港','砂漠','公園','手紙','靴','太陽','雲','川','ロボット','祭り','地図','城','忍者','野球','料理','写真','電気','駅','宝石','ゲーム','風船','新聞','チョコレート','図書館','温泉','虹','自転車','電話','窓','庭','飛行機'];
function normalizeClue(text) { return String(text || '').normalize('NFKC').trim().toLowerCase().replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/[\s\-‐‑‒–—―ー・、】【「」『』（）()]/g, ''); }
function filterValidClues(clues) { const counts = new Map(); clues.forEach((item) => { const key = normalizeClue(item.text); counts.set(key, (counts.get(key) || 0) + 1); }); return clues.filter((item) => { const key = normalizeClue(item.text); return key.length > 0 && counts.get(key) === 1; }); }
function isCorrectGuess(guess, answer) { const left = normalizeClue(guess); return left.length > 0 && left === normalizeClue(answer); }
function shuffle(array, rng) { const out = array.slice(); const random = rng || Math.random; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }

// バンクから未出題(usedにない)の1語を選ぶ。候補が尽きたら履歴をリセットしてバンク全体から選び直す。
// 返り値の used を次回呼び出しに渡すことで、部屋内での重複出題を防ぐ。
function selectRoundWord(rng = Math.random, bank = WORD_BANK, used = []) {
  const usedSet = new Set(used);
  const pool = bank.filter((w) => !usedSet.has(w));
  if (pool.length > 0) {
    const word = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    return { word, used: used.concat([word]) };
  }
  const word = bank[Math.min(bank.length - 1, Math.floor(rng() * bank.length))];
  return { word, used: [word] };
}

const exportsObject = { MIN_PLAYERS, MAX_CLUE_LENGTH, WORD_BANK, normalizeClue, filterValidClues, isCorrectGuess, shuffle, selectRoundWord };
if (typeof module !== 'undefined') module.exports = exportsObject;
if (typeof window !== 'undefined') window.JustOneLogic = exportsObject;
