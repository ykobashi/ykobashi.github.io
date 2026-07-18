// logic.js - ito(数字順ならべゲーム) 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 2;
const NUMBER_RANGE = 100;

const THEME_BANK = [
  { title: '辛い食べ物ランキング', low: '全然辛くない', high: 'ものすごく辛い' },
  { title: '朝が苦手な度', low: '朝は得意', high: '重度の朝弱' },
  { title: '人生で驚いた出来事の衝撃度', low: 'ちょっと驚いた', high: '一生忘れられない衝撃' },
  { title: '高級だと感じるものランキング', low: '全然高級じゃない', high: 'かなり高級' },
  { title: '虫の苦手度', low: '平気', high: '見るのも無理' },
  { title: 'カラオケで盛り上がる曲度', low: '静かに聴く曲', high: '全員総立ちの曲' },
  { title: '運動神経の良さ', low: '運動音痴', high: '全国レベル' },
  { title: '寒がりな度合い', low: '真冬でも半袖', high: '夏でも震えるくらい寒がり' },
  { title: '猫舌の度合い', low: '熱々でも平気', high: '常温でも猫舌' },
  { title: '子供の頃の将来の夢の壮大さ', low: '現実的な夢', high: '壮大すぎる夢' },
  { title: '旅行先として憧れる度', low: '近所でも満足', high: '一生に一度は行きたい秘境' },
  { title: '怖い話の怖さ', low: '全然怖くない', high: '眠れなくなるほど怖い' },
  { title: '朝ごはんの豪華さ', low: '簡素', high: 'フルコース級' },
  { title: '緊張しやすさ', low: '全く緊張しない', high: '極度のあがり症' },
  { title: '甘いものへの欲求度', low: '甘いものは苦手', high: '甘党の中の甘党' },
  { title: '整理整頓の得意さ', low: '片付けが苦手', high: '整理整頓の達人' },
];

// Fisher-Yates シャッフル。rng は 0以上1未満の乱数を返す関数(テスト時に差し替え可能)
function shuffle(array, rng = Math.random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

// お題バンクから1つランダムに選ぶ
function pickTheme(rng = Math.random, bank = THEME_BANK) {
  const index = Math.floor(rng() * bank.length);
  return bank[index];
}

// playerIds それぞれに 1〜100 の重複しない数字を割り当てる
function assignNumbers(playerIds, rng = Math.random) {
  const pool = [];
  for (let n = 1; n <= NUMBER_RANGE; n++) pool.push(n);
  const shuffled = shuffle(pool, rng);
  const numbers = {};
  playerIds.forEach((id, i) => {
    numbers[id] = shuffled[i];
  });
  return numbers;
}

// numberMap から数字の昇順の正しいプレイヤー順(id配列)を求める
function correctOrder(numberMap) {
  return Object.keys(numberMap).sort((a, b) => numberMap[a] - numberMap[b]);
}

// ホストが確定した並び順(guessedOrderIds)が正しいか判定する
function checkOrder(guessedOrderIds, numberMap) {
  const correct = correctOrder(numberMap);
  const isCorrect =
    guessedOrderIds.length === correct.length &&
    guessedOrderIds.every((id, i) => id === correct[i]);
  return { isCorrect, correctOrderIds: correct };
}

// ================= ロビー名簿(純粋関数) =================

function addPlayer(roster, player) {
  if (roster.some((p) => p.id === player.id)) return roster;
  return roster.concat([player]);
}

function removePlayer(roster, id) {
  return roster.filter((p) => p.id !== id);
}

function hasMinPlayers(roster, min = MIN_PLAYERS) {
  return roster.length >= min;
}

const ItoLogicExports = {
  MIN_PLAYERS,
  NUMBER_RANGE,
  THEME_BANK,
  shuffle,
  pickTheme,
  assignNumbers,
  correctOrder,
  checkOrder,
  addPlayer,
  removePlayer,
  hasMinPlayers,
};

if (typeof module !== 'undefined') {
  module.exports = ItoLogicExports;
}
if (typeof window !== 'undefined') {
  window.ItoLogic = ItoLogicExports;
}
