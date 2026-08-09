// logic.js - 画像記憶ビンゴ 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 2;
const ROUND_TOTAL = 20;
const GRID_SIZE = 9;
const BINGO_BONUS = 5;

const ROUND_BANK = [
  {
    id: 'round-01',
    image: 'images/round1.jpg',
    imageAlt: '本や小物であふれる、魔法の図書館のひみつコーナー',
    statements: [
      { text: '白い猫が本の上で眠っている', isTrue: true },
      { text: 'ランタンの近くに、火のついていないロウソクが3本ある', isTrue: true },
      { text: '鉢植えの観葉植物の隣に赤い毛糸玉がある', isTrue: true },
      { text: 'フクロウが2羽とまっている', isTrue: false },
      { text: '地球儀の隣に巻物が3本重なっている', isTrue: true },
      { text: '窓はステンドグラスになっている', isTrue: false },
      { text: 'はしごは赤色をしている', isTrue: false },
      { text: '鳥かごの中に鳥が入っている', isTrue: false },
      { text: '机の上に光る青い玉が浮かんでいる', isTrue: true },
    ],
  },
  {
    id: 'round-02',
    image: 'images/round2.jpg',
    imageAlt: '小物と装飾でぎっしり埋まった、おばけ屋敷のキッチン',
    statements: [
      { text: '猫は白色をしている', isTrue: false },
      { text: '天井から3匹のコウモリがぶら下がっている', isTrue: true },
      { text: 'カウンターの上にティーカップが4つ積まれている', isTrue: true },
      { text: '小さな青い幽霊が鍋の後ろに隠れている', isTrue: true },
      { text: '時計はちょうど真夜中(12時)を指している', isTrue: true },
      { text: '蜘蛛の巣は2つだけある', isTrue: false },
      { text: 'かぼちゃは緑色をしている', isTrue: false },
      { text: '窓辺のロウソクの隣にネズミの頭蓋骨の飾りがある', isTrue: true },
      { text: 'ガイコツはフライパンを持っている', isTrue: false },
    ],
  },
  {
    id: 'round-03',
    image: 'images/round3.jpg',
    imageAlt: 'ネオンと看板であふれる、未来都市のラーメン屋台',
    statements: [
      { text: 'ロボット店員がラーメンの器を持っている', isTrue: true },
      { text: '看板の下に「24H」と光る小さな表示がある', isTrue: true },
      { text: '手前のドローンが運ぶ箱は赤色をしている', isTrue: false },
      { text: '猫は屋台の右側に座っている', isTrue: false },
      { text: 'ラーメンの器はちょうど2つ並んでいる', isTrue: true },
      { text: '提灯は4つぶら下がっている', isTrue: false },
      { text: '奥を飛ぶ大きいドローンの箱は赤色をしている', isTrue: true },
      { text: '屋根の提灯は赤色に光っている', isTrue: false },
      { text: '猫の隣にロボット犬がいる', isTrue: true },
    ],
  },
  {
    id: 'round-04',
    image: 'images/round4.jpg',
    imageAlt: '配線や貼り紙で散らかった、宇宙飛行士のデスク',
    statements: [
      { text: 'ヘルメットのバイザーが開いている', isTrue: true },
      { text: '観葉植物は3鉢だけ並んでいる', isTrue: false },
      { text: 'タブレットの画面は音楽プレイヤーを表示している', isTrue: false },
      { text: 'チェックリストは3冊重なっている', isTrue: true },
      { text: 'マグカップはふつうに机に置かれている', isTrue: false },
      { text: '天井から模型の人工衛星が吊るされている', isTrue: true },
      { text: '下段の棚に赤い工具箱がある', isTrue: true },
      { text: '星図のポスターが丸めて置かれている', isTrue: true },
      { text: '家族写真が壁に貼られている', isTrue: false },
    ],
  },
  {
    id: 'round-05',
    image: 'images/round5.jpg',
    imageAlt: '瓶や巻物であふれる、魔法使いの錬金術ラボ',
    statements: [
      { text: 'ほうきは銀色をしている', isTrue: false },
      { text: '木のとまり木でフクロウが眠っている', isTrue: true },
      { text: '棚にガラス瓶が並んで光っている', isTrue: true },
      { text: 'カラスは窓辺の右側にいる', isTrue: false },
      { text: '呪文書の2冊目の上に小さなカエルが乗っている', isTrue: true },
      { text: '床の魔法陣は赤色をしている', isTrue: false },
      { text: '緑の薬がフラスコの中で泡立っている', isTrue: true },
      { text: '呪文書は1冊だけ置かれている', isTrue: false },
      { text: '紫色の鱗を持つ小さなドラゴンが眠っている', isTrue: true },
    ],
  },
  {
    id: 'round-06',
    image: 'images/round6.jpg',
    imageAlt: '計器や工具でぎっしりの、深海探査艇の操縦室',
    statements: [
      { text: '丸い計器は4つ取り付けられている', isTrue: true },
      { text: '酸素タンクは壁に3本固定されている', isTrue: false },
      { text: '天井のハンドルにタコのぬいぐるみがぶら下がっている', isTrue: true },
      { text: '窓の外にクラゲが2匹漂っている', isTrue: false },
      { text: '窓の外に大きなチョウチンアンコウがいる', isTrue: true },
      { text: 'ソナー画面には警告マークが表示されている', isTrue: true },
      { text: '折りたたみトレイの上に半分食べたサンドイッチがある', isTrue: true },
      { text: '窓の外に潜水士が見える', isTrue: false },
      { text: 'パイロットのヘッドセットの隣にダイブ用のチェックリストがある', isTrue: true },
    ],
  },
  {
    id: 'round-07',
    image: 'images/round7.jpg',
    imageAlt: '歯車や工具で埋まった、からくり時計職人の工房',
    statements: [
      { text: '作業台に歯車が5個散らばっている', isTrue: true },
      { text: '時計の上に本物の鳥がとまっている', isTrue: false },
      { text: '棚に懐中時計が3つ吊るされている', isTrue: true },
      { text: 'ノートの隣のお茶からは湯気が立っている', isTrue: false },
      { text: '壁の太陽型の時計は3時を指している', isTrue: true },
      { text: '歯車の近くにコイルばねが置かれている', isTrue: true },
      { text: 'かごの中に予備の真鍮部品があふれている', isTrue: true },
      { text: '作業台の近くに電球が置かれている', isTrue: false },
      { text: 'ルーペは閉じたノートの上に置かれている', isTrue: false },
    ],
  },
  {
    id: 'round-08',
    image: 'images/round8.jpg',
    imageAlt: 'お菓子と焼き菓子であふれる、お菓子の国のパン屋',
    statements: [
      { text: 'オーブンから取り出されたカップケーキはちょうど6個ある', isTrue: true },
      { text: 'ケーキスタンドにケーキが2段だけ載っている', isTrue: false },
      { text: '猫はキャンディケイン柄をしている', isTrue: true },
      { text: '窓の外にグミの家が見える', isTrue: true },
      { text: '黒板のメニューは「TODAY\'S SPECIAL」と書かれている', isTrue: true },
      { text: '棚の飴の瓶からロリポップがあふれている', isTrue: true },
      { text: 'カウンターの端にプレッツェルのかごがある', isTrue: true },
      { text: '普通のパンの塊がいくつか置かれている', isTrue: false },
      { text: 'ピンクのドーナツの箱はカウンターの下に置かれている', isTrue: false },
    ],
  },
  {
    id: 'round-09',
    image: 'images/round9.jpg',
    imageAlt: '金貨や宝物が山積みの、海賊船の宝物庫',
    statements: [
      { text: '金の杯は2つだけ重ねられている', isTrue: false },
      { text: 'オウムは宝箱の上にとまっている', isTrue: false },
      { text: '地図は短剣で壁に留められている', isTrue: true },
      { text: '大砲の弾は2つだけ積まれている', isTrue: false },
      { text: '舵は取っ手が1本欠けている', isTrue: true },
      { text: 'ガイコツの手はルビーを1つ握っている', isTrue: true },
      { text: '床にロープが絡まっている', isTrue: true },
      { text: '空のラム酒の瓶がロープの近くにある', isTrue: true },
      { text: '床に懐中電灯が落ちている', isTrue: false },
    ],
  },
  {
    id: 'round-10',
    image: 'images/round10.jpg',
    imageAlt: 'おもちゃと駄菓子でぎっしりの、昭和レトロな駄菓子屋の店先',
    statements: [
      { text: '値札のついた瓶は3つだけある', isTrue: false },
      { text: '猫は漫画雑誌の上で寝ている', isTrue: true },
      { text: '暖簾はビーズでできている', isTrue: true },
      { text: '風鈴には金魚の絵が描かれている', isTrue: true },
      { text: '段ボール箱にはおもちゃの兵隊とゴムのお面が入っている', isTrue: true },
      { text: '手書きの看板には「10円」と書かれている', isTrue: true },
      { text: '入り口の外に自転車が立てかけられている', isTrue: true },
      { text: '入り口の横に色あせたマスコットの看板が立っている', isTrue: true },
      { text: '店内に自動販売機が置かれている', isTrue: false },
    ],
  },
  {
    id: 'round-11',
    image: 'images/round11.jpg',
    imageAlt: '武器や道具が壁を埋め尽くす、忍者の隠れ家道具部屋',
    statements: [
      { text: '的に手裏剣が2本刺さっている', isTrue: false },
      { text: '巻物の四隅には苦無が置かれている', isTrue: true },
      { text: '天井のランタンは2つ吊るされている', isTrue: false },
      { text: '棚に酒瓶が3本並んでいる', isTrue: true },
      { text: '床の落とし戸は少し開いている', isTrue: true },
      { text: '低い机にお面とおにぎりが置かれている', isTrue: true },
      { text: '隅に黒い猫が座っている', isTrue: true },
      { text: '巻き上げロープに鉤爪がついている', isTrue: true },
      { text: '部屋に懐中電灯が置かれている', isTrue: false },
    ],
  },
  {
    id: 'round-12',
    image: 'images/round12.jpg',
    imageAlt: '道具と旗であふれる、恐竜博物館の発掘現場',
    statements: [
      { text: '目印の旗は6本立てられている', isTrue: true },
      { text: '頭蓋骨の近くにブラシとピックが交差して置かれている', isTrue: true },
      { text: '手押し車には砂利がいっぱいに入っている', isTrue: false },
      { text: '折りたたみテーブルに水筒と帽子が置かれている', isTrue: true },
      { text: 'トレイの化石片は3つある', isTrue: false },
      { text: '隅に丸められたシートが岩で押さえられている', isTrue: true },
      { text: 'テント越しにトラックが見える', isTrue: true },
      { text: '岩の上でトカゲが日向ぼっこしている', isTrue: true },
      { text: '発掘現場に大型の掘削機がある', isTrue: false },
    ],
  },
  {
    id: 'round-13',
    image: 'images/round13.jpg',
    imageAlt: '妖精の小物で飾り立てられた、庭園のガーデンパーティー',
    statements: [
      { text: 'テーブルにドングリのカップが3つ置かれている', isTrue: true },
      { text: 'てんとう虫にはサドルが付けられている', isTrue: true },
      { text: 'カタツムリの家には歓迎マットがある', isTrue: true },
      { text: 'ケーキは一口も欠けていない', isTrue: false },
      { text: '眠っている妖精の羽は銀色をしている', isTrue: false },
      { text: 'しずくのシャンデリアは虹色の光を反射している', isTrue: true },
      { text: 'トンボは1匹だけ飛んでいる', isTrue: false },
      { text: '池のそばにカエルが座っている', isTrue: true },
      { text: 'パーティー会場に人間サイズの物が置かれている', isTrue: false },
    ],
  },
  {
    id: 'round-14',
    image: 'images/round14.jpg',
    imageAlt: '衣装や道具でぎっしりの、サーカスの舞台裏',
    statements: [
      { text: '衣装ラックには衣装が3着だけ掛かっている', isTrue: false },
      { text: '道化師はボールを2つでジャグリングしている', isTrue: false },
      { text: '犬はフリルの首輪をつけている', isTrue: true },
      { text: '鏡の周りの電球は全て点灯している', isTrue: false },
      { text: '一輪車はテントの支柱に立てかけられている', isTrue: true },
      { text: 'メイク道具のケースからフェイスペイントの容器があふれている', isTrue: true },
      { text: 'ポスターには「THE AMAZING FLYING TRIO」と書かれている', isTrue: true },
      { text: '檻の中の動物は虎である', isTrue: false },
      { text: '舞台裏にスマートフォンが置かれている', isTrue: false },
    ],
  },
  {
    id: 'round-15',
    image: 'images/round15.jpg',
    imageAlt: '書類や小物でぎっしりの、探偵事務所の証拠デスク',
    statements: [
      { text: 'コルクボードに写真が5枚ピン留めされている', isTrue: true },
      { text: 'コーヒーカップの下のフォルダは2冊重なっている', isTrue: false },
      { text: 'フェドーラ帽はドアのフックに掛けられている', isTrue: true },
      { text: 'レターオープナーは拳銃の形をしている', isTrue: true },
      { text: 'ブラインド越しに縞模様の影が机に落ちている', isTrue: true },
      { text: '机の隅の写真立てはまっすぐ正面を向いている', isTrue: false },
      { text: 'ゴミ箱には紙くずがあふれている', isTrue: true },
      { text: '机にノートパソコンが置かれている', isTrue: false },
      { text: '虫眼鏡はケースファイルの上に置かれている', isTrue: true },
    ],
  },
  {
    id: 'round-16',
    image: 'images/round16.jpg',
    imageAlt: '筐体やネオンでぎっしりの、レトロゲームセンター',
    statements: [
      { text: 'アーケード筐体は3台並んでいる', isTrue: false },
      { text: '筐体の上のカップからコインがあふれている', isTrue: true },
      { text: 'クレーンゲームの中にぬいぐるみが3体見える', isTrue: false },
      { text: '一番高い筐体の前のスツールには誰も座っていない', isTrue: true },
      { text: 'ネオンサインの文字は1文字だけ点滅している', isTrue: true },
      { text: 'ゴミ箱には空のカップとポップコーンの袋があふれている', isTrue: true },
      { text: 'ハイスコア表の一番上の名前は「AAA」である', isTrue: true },
      { text: '床のカーペットは無地である', isTrue: false },
      { text: 'アーケードに現代的な薄型テレビが置かれている', isTrue: false },
    ],
  },
  {
    id: 'round-17',
    image: 'images/round17.jpg',
    imageAlt: '植物と道具であふれる、温室植物園の秘密の一角',
    statements: [
      { text: 'モンステラの葉は4枚しかない', isTrue: false },
      { text: '作業台に空の植木鉢が3つ積まれている', isTrue: true },
      { text: '鉢の近くでカメが落ち葉を食べている', isTrue: true },
      { text: '天井から吊るされた鳥の餌台は2つとも空である', isTrue: true },
      { text: '作業台に手袋と種の袋が置かれている', isTrue: true },
      { text: '種の袋には「トマト」と書かれている', isTrue: true },
      { text: '蝶はオレンジと黒の羽をしている', isTrue: true },
      { text: '温度計はちょうど28度を示している', isTrue: true },
      { text: '温室内に電動の園芸道具が置かれている', isTrue: false },
    ],
  },
  {
    id: 'round-18',
    image: 'images/round18.jpg',
    imageAlt: '道具と装飾でぎっしりの、雪だるま職人の工房',
    statements: [
      { text: 'にんじんの予備はかごに3本しかない', isTrue: false },
      { text: '壁のペグにマフラーが2本掛かっている', isTrue: false },
      { text: 'コマドリは雪だるまの上にとまっている', isTrue: false },
      { text: 'ココアのマグにはマシュマロが浮いている', isTrue: true },
      { text: '石炭の箱からいくつかこぼれている', isTrue: true },
      { text: 'ミトンはストーブのそばで乾かされている', isTrue: true },
      { text: '天井の梁からつららが下がっている', isTrue: true },
      { text: '工房に電気ストーブが置かれている', isTrue: false },
      { text: '雪だるまの上部は別の作業台に置かれている', isTrue: true },
    ],
  },
  {
    id: 'round-19',
    image: 'images/round19.jpg',
    imageAlt: '骨董品でぎっしりの、商店街の屋根裏骨董品店',
    statements: [
      { text: '大時計は7時で止まっている', isTrue: true },
      { text: '棚に磁器の人形が2体並んでいる', isTrue: false },
      { text: 'ガラスドームのフクロウの下に本が1冊だけある', isTrue: false },
      { text: '蓄音機のレコードは回転している', isTrue: true },
      { text: '天井の隅にクモの巣が張られている', isTrue: true },
      { text: '銀のティーセットのカップは1つ取っ手が欠けている', isTrue: true },
      { text: '揺り木馬は塗装が剥げている', isTrue: true },
      { text: 'ドアのそばの箱には「SOLD」と書かれている', isTrue: true },
      { text: '店内に電子レジが置かれている', isTrue: false },
    ],
  },
  {
    id: 'round-20',
    image: 'images/round20.jpg',
    imageAlt: '設備と小物でぎっしりの、月面基地の食堂',
    statements: [
      { text: 'テーブルには食事トレイが3つだけ置かれている', isTrue: false },
      { text: '自動販売機には「OUT OF ORDER」の張り紙がある', isTrue: true },
      { text: '植物実験のポットには「Exp. 12B」と書かれている', isTrue: true },
      { text: 'ヘルメットは両方ともバイザーが割れていない', isTrue: false },
      { text: '壁の画面には「CLEAR, -150C」と表示されている', isTrue: true },
      { text: '天井付近に水滴が1つだけ浮かんでいる', isTrue: false },
      { text: 'チェス盤は磁石の駒で対局中である', isTrue: true },
      { text: 'ディスペンサーの近くに携行食が2つだけ置かれている', isTrue: false },
      { text: '覆いのない植物がそのまま置かれている', isTrue: false },
    ],
  },
];

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

function selectRounds(rng = Math.random, bank = ROUND_BANK) {
  return shuffle(bank, rng);
}

function computeBingoLines() {
  return [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
}

function assertRoundInput(statements, marks) {
  if (!Array.isArray(statements) || statements.length !== GRID_SIZE ||
      !statements.every((statement) => statement && typeof statement.text === 'string' && typeof statement.isTrue === 'boolean')) {
    throw new TypeError('statements must contain exactly 9 truth-valued entries');
  }
  if (!Array.isArray(marks) || marks.length !== GRID_SIZE || !marks.every((mark) => typeof mark === 'boolean')) {
    throw new TypeError('marks must be boolean[9]');
  }
}

function computeBingoScoreDelta(statements, marks) {
  assertRoundInput(statements, marks);
  let correctCount = 0;
  const incorrectIndexes = [];
  marks.forEach((marked, index) => {
    if (statements[index].isTrue === marked) correctCount += 1;
    else incorrectIndexes.push(index);
  });

  const bingoLineCount = computeBingoLines().filter((line) =>
    line.every((index) => statements[index].isTrue === marks[index])
  ).length;

  return {
    points: correctCount + bingoLineCount * BINGO_BONUS,
    correctCount,
    incorrectIndexes,
    bingoLineCount,
  };
}

function tallyRoundMarks(playerMarks, statements) {
  const result = {};
  Object.keys(playerMarks || {}).forEach((playerId) => {
    result[playerId] = computeBingoScoreDelta(statements, playerMarks[playerId]);
  });
  return result;
}

function applyScoreDeltas(scores, deltas) {
  const result = Object.assign({}, scores);
  Object.keys(deltas || {}).forEach((id) => {
    if (typeof deltas[id] !== 'number' || !Number.isFinite(deltas[id])) {
      throw new TypeError('score deltas must be finite numbers');
    }
    result[id] = (result[id] || 0) + deltas[id];
  });
  return result;
}

function buildScoreboard(scores, roster) {
  const rows = roster
    .map((player) => ({ id: player.id, name: player.name, score: scores[player.id] || 0 }))
    .sort((a, b) => b.score - a.score);
  let rank = 0;
  let previousScore = null;
  rows.forEach((row, index) => {
    if (row.score !== previousScore) {
      rank = index + 1;
      previousScore = row.score;
    }
    row.rank = rank;
  });
  return rows;
}

function getWinners(scoreboard) {
  return scoreboard.filter((row) => row.rank === 1);
}

function addPlayer(roster, player) {
  return roster.some((entry) => entry.id === player.id) ? roster : roster.concat([player]);
}

function removePlayer(roster, id) {
  return roster.filter((player) => player.id !== id);
}

function hasMinPlayers(roster, min = MIN_PLAYERS) {
  return roster.length >= min;
}

const PhotoMemoryBingoLogicExports = {
  MIN_PLAYERS,
  ROUND_TOTAL,
  GRID_SIZE,
  BINGO_BONUS,
  ROUND_BANK,
  shuffle,
  selectRounds,
  computeBingoLines,
  computeBingoScoreDelta,
  tallyRoundMarks,
  applyScoreDeltas,
  buildScoreboard,
  getWinners,
  addPlayer,
  removePlayer,
  hasMinPlayers,
};

if (typeof module !== 'undefined' && module.exports) module.exports = PhotoMemoryBingoLogicExports;
if (typeof window !== 'undefined') window.PhotoMemoryBingoLogic = PhotoMemoryBingoLogicExports;
