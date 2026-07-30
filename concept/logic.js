const MIN_PLAYERS = 2;
const BOARD_CATEGORIES = [
  { id: 'main', label: '種類', icons: ['🧍','🐾','🏠','🚗','🍽️','🎭','⚙️','🌿','🎮','📚','💰','🎨'] },
  { id: 'color', label: '色', icons: ['🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🤍'] },
  { id: 'shape', label: '形', icons: ['⭐','🔺','🔻','⬛','⬜','🔷','🔶','🔸','🔹','⭕','💠','🔘'] },
  { id: 'size', label: '大きさ・数', icons: ['🔍','📏','🔢','➕','➖','∞','1️⃣','💯','🔟','↕️','↔️','🔼'] },
  { id: 'action', label: '動き', icons: ['🏃','🛑','🔄','⬆️','⬇️','💥','🌀','✨','➡️','⬅️','🔁','⏫'] },
  { id: 'feeling', label: '感情・性質', icons: ['😀','😢','😱','😴','🔥','❄️','💧','⚡','😡','😍','🤢','🌟'] },
  { id: 'place', label: '場所・時間', icons: ['🏙️','🏞️','🌊','🌌','☀️','🌙','⏳','📅','🏖️','🏔️','🌃','🎪'] }
];
const CONCEPT_TOPICS = ['カレーライス','消防士','雪だるま','花火大会','海賊船','宇宙飛行士','忍者','温泉旅行','サッカー選手','誕生日パーティー','雷雨','初日の出','図書館','遊園地のジェットコースター','猫カフェ','夜行列車','山登り','花見','恐竜','ロボット掃除機','幽霊屋敷','クリスマスツリー','寿司職人','雪合戦','夏祭り','電車通学','引っ越し','ラジオ体操','花束','虹','満員電車','キャンプファイヤー','水族館','スキー','夜景','朝ごはん','宝探し','ピクニック','運動会','入学式','初恋','徹夜','停電','地震訓練','お花見弁当','雪山遭難','深夜のコンビニ','満月の夜','海外旅行','秘密基地'];
function isValidPinKey(key) { const parts = String(key).split('-'); if (parts.length !== 2) return false; const category = BOARD_CATEGORIES.find((item) => item.id === parts[0]); const index = Number(parts[1]); return !!category && Number.isInteger(index) && index >= 0 && index < category.icons.length; }
function nextCluegiverIndex(index, players) { return players > 0 ? (index + 1) % players : 0; }

// バンクから未出題(usedにない)の1件を選ぶ。候補が尽きたら履歴をリセットしてバンク全体から選び直す。
// 返り値の used を次回呼び出しに渡すことで、部屋内での重複出題を防ぐ。
function selectRoundTopic(rng = Math.random, bank = CONCEPT_TOPICS, used = []) {
  const usedSet = new Set(used);
  const pool = bank.filter((t) => !usedSet.has(t));
  if (pool.length > 0) {
    const topic = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    return { topic, used: used.concat([topic]) };
  }
  const topic = bank[Math.min(bank.length - 1, Math.floor(rng() * bank.length))];
  return { topic, used: [topic] };
}

// スコア降順のスコアボードを作る。同点は同順位(1,1,3...)になる標準競技順位方式。
function buildScoreboard(scores, roster) {
  const rows = roster
    .map((p) => ({ id: p.id, name: p.name, score: scores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);
  let rank = 0;
  let prevScore = null;
  rows.forEach((row, i) => {
    if (row.score !== prevScore) {
      rank = i + 1;
      prevScore = row.score;
    }
    row.rank = rank;
  });
  return rows;
}

function getWinners(scoreboard) {
  return scoreboard.filter((row) => row.rank === 1);
}

const exportsObject = { MIN_PLAYERS, BOARD_CATEGORIES, CONCEPT_TOPICS, isValidPinKey, nextCluegiverIndex, selectRoundTopic, buildScoreboard, getWinners };
if (typeof module !== 'undefined') module.exports = exportsObject;
if (typeof window !== 'undefined') window.ConceptLogic = exportsObject;
