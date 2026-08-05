// お絵描きクイズ: DOM に依存しないゲームロジック
const MIN_PLAYERS = 2;
const ROUNDS = 3;
const TOPIC_BANK = ['りんご','バナナ','傘','雪だるま','自転車','飛行機','ロケット','おにぎり','金魚','ペンギン','サボテン','花火','ハンバーガー','恐竜','幽霊','宇宙人','くじら','虹','タコ','カニ','ロボット','時計','眼鏡','ギター','パンダ','忍者','灯台','観覧車','カタツムリ','猫','犬','電車','ケーキ','ピザ','富士山','桜','海','カメラ','王冠','ドラゴン'];
// 漢字表記のお題は、ひらがな回答でも正解にできるよう読みをここに登録する(normalizeAnswerは漢字→ひらがな変換はしないため)。
const ANSWER_ALIASES = { '傘':['かさ'], '雪だるま':['ゆきだるま'], '自転車':['じてんしゃ'], '飛行機':['ひこうき'], '金魚':['きんぎょ'], '花火':['はなび'], '恐竜':['きょうりゅう'], '幽霊':['ゆうれい'], '宇宙人':['うちゅうじん'], '虹':['にじ'], '時計':['とけい'], '眼鏡':['めがね'], '忍者':['にんじゃ'], '灯台':['とうだい'], '観覧車':['かんらんしゃ'], '猫':['ねこ'], '犬':['いぬ'], '電車':['でんしゃ'], '富士山':['ふじさん'], '桜':['さくら'], '海':['うみ'], '王冠':['おうかん'] };
function shuffle(array, rng = Math.random) { const result = array.slice(); for (let i = result.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rng() * (i + 1))); [result[i], result[j]] = [result[j], result[i]]; } return result; }
function selectRoundTopic(rng = Math.random, bank = TOPIC_BANK, usedTopics = []) { if (!bank.length) return { topic: null, usedTopics: [] }; const used = new Set(usedTopics); const pool = bank.filter((topic) => !used.has(topic)); const choices = pool.length ? pool : bank; const topic = choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))]; return { topic, usedTopics: (pool.length ? usedTopics : []).concat(topic) }; }
function buildTurnOrder(playerIds, rng = Math.random) { return shuffle(playerIds, rng); }
function totalTurns(turnOrder, rounds = ROUNDS) { return Array.isArray(turnOrder) ? turnOrder.length * rounds : 0; }
function currentTurnInfo(turnOrder, turnIndex, rounds = ROUNDS) { if (!Array.isArray(turnOrder) || !turnOrder.length || !Number.isInteger(turnIndex) || turnIndex < 0 || turnIndex >= totalTurns(turnOrder, rounds)) return null; const n = turnOrder.length; return { playerId: turnOrder[turnIndex % n], round: Math.floor(turnIndex / n) + 1, turnInRound: (turnIndex % n) + 1, isLastTurn: turnIndex === totalTurns(turnOrder, rounds) - 1 }; }
function normalizeAnswer(value) { return String(value == null ? '' : value).normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s\-‐‑‒–—―ー・、】【「」『』（）()]/g, ''); }
function isCorrectGuess(guess, topic) { const normalized = normalizeAnswer(guess); if (!normalized.length) return false; const candidates = [topic].concat(ANSWER_ALIASES[topic] || []); return candidates.some((candidate) => normalized === normalizeAnswer(candidate)); }
function undoLastStroke(segments) { if (!Array.isArray(segments) || !segments.length) return Array.isArray(segments) ? segments.slice() : []; const id = segments[segments.length - 1].strokeId; let end = segments.length; while (end > 0 && segments[end - 1].strokeId === id) end--; return segments.slice(0, end); }
function applyScoreDeltas(scores, deltas) { const result = Object.assign({}, scores); Object.keys(deltas || {}).forEach((id) => { result[id] = (result[id] || 0) + (Number(deltas[id]) || 0); }); return result; }
function buildScoreboard(scores, roster) { const rows = (roster || []).map((p) => ({ id:p.id, name:p.name, score:(scores && scores[p.id]) || 0 })).sort((a,b) => b.score - a.score || a.name.localeCompare(b.name, 'ja')); let previous; let rank = 0; rows.forEach((row, i) => { if (row.score !== previous) { rank = i + 1; previous = row.score; } row.rank = rank; }); return rows; }
function getWinners(scoreboard) { return (scoreboard || []).filter((row) => row.rank === 1); }
function addPlayer(roster, player) { return (roster || []).some((p) => p.id === player.id) ? roster : (roster || []).concat([player]); }
function removePlayer(roster, id) { return (roster || []).filter((p) => p.id !== id); }
function hasMinPlayers(roster, min = MIN_PLAYERS) { return (roster || []).length >= min; }
const api = { MIN_PLAYERS, ROUNDS, TOPIC_BANK, ANSWER_ALIASES, shuffle, selectRoundTopic, buildTurnOrder, totalTurns, currentTurnInfo, normalizeAnswer, isCorrectGuess, undoLastStroke, applyScoreDeltas, buildScoreboard, getWinners, addPlayer, removePlayer, hasMinPlayers };
if (typeof module !== 'undefined') module.exports = api;
if (typeof window !== 'undefined') window.DrawingQuizLogic = api;
