// logic.js - 偽物鑑定ゲーム 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 2;
const ROUND_TOTAL = 5;
const CORRECT_POINTS = 1000;

// realImage: 実写(パブリックドメイン)。fakeImage: AI生成の偽物。
// credit: 実写側の出典情報。出題中は一切送信せず、結果発表時のみ表示する。
const PAIR_BANK = [
  {
    id: 'pair-01',
    realImage: 'assets/real/01_ugly-fish-thing-monster.jpg',
    fakeImage: 'assets/fake/01_ugly-fish-thing-monster.jpg',
    credit: { title: 'Ugly fish-thing-monster', creator: 'mnsc', license: 'cc0', source: 'https://www.flickr.com/photos/49976053@N00/164150543' },
  },
  {
    id: 'pair-02',
    realImage: 'assets/real/02_serrivomer-deepsea-fish.jpg',
    fakeImage: 'assets/fake/02_serrivomer-deepsea-fish.jpg',
    credit: { title: '3000px PNG cutout of a full-page scientific plate showing the deep sea fish Serrivomer brevidentatus, adult specimen. Public Domain.', creator: 'Futurilla', license: 'cc0', source: 'https://www.flickr.com/photos/52067454@N00/32287773981' },
  },
  {
    id: 'pair-03',
    realImage: 'assets/real/03_jellyfish-background.jpg',
    fakeImage: 'assets/fake/03_jellyfish-background.jpg',
    credit: { title: 'Jellyfish Background', creator: 'FOCA Stock', license: 'cc0', source: 'https://stocksnap.io/photo/jellyfish-background-800NIUJGD0' },
  },
  {
    id: 'pair-04',
    realImage: 'assets/real/04_electric-color-creature.jpg',
    fakeImage: 'assets/fake/04_electric-color-creature.jpg',
    credit: { title: 'Electric Color Creature', creator: 'cogdogblog', license: 'cc0', source: 'https://www.flickr.com/photos/37996646802@N01/4434682768' },
  },
  {
    id: 'pair-05',
    realImage: 'assets/real/05_free-jellyfish-image.jpg',
    fakeImage: 'assets/fake/05_free-jellyfish-image.jpg',
    credit: { title: 'Free jelly fishes image', creator: null, license: 'cc0', source: 'https://www.rawpixel.com/image/5921710/photo-image-wallpaper-light-public-domain' },
  },
  { id: 'pair-06', realImage: 'assets/real/06_largescale-lanternfish.jpg', fakeImage: 'assets/fake/06_largescale-lanternfish.jpg', credit: { title: 'NMNH-EO 400383 Largescale Lanternfish Symbolophorus veranyi 005 (cropped)', creator: 'Smithsonian Institute', license: 'cc0', source: 'https://commons.wikimedia.org/w/index.php?curid=130345799' } },
  { id: 'pair-07', realImage: 'assets/real/07_ophidiid-fish.jpg', fakeImage: 'assets/fake/07_ophidiid-fish.jpg', credit: { title: 'Ophidiid Fish off Salmon Bank in the Northwestern Hawaiian Islands.', creator: 'Papahānaumokuākea Marine National Monument', license: 'pdm', source: 'https://www.flickr.com/photos/93641120@N05/25191314703' } },
  { id: 'pair-08', realImage: 'assets/real/08_insect-macro.jpg', fakeImage: 'assets/fake/08_insect-macro.jpg', credit: { title: 'Insect macro', creator: 'C.Frayle', license: 'cc0', source: 'https://www.flickr.com/photos/51195133@N03/36301512526' } },
  { id: 'pair-09', realImage: 'assets/real/09_praying-mantis.jpg', fakeImage: 'assets/fake/09_praying-mantis.jpg', credit: { title: 'Macro Shot of Praying Mantis', creator: 'Image Catalog', license: 'cc0', source: 'https://www.flickr.com/photos/132795455@N08/16711766504' } },
  { id: 'pair-10', realImage: 'assets/real/10_dragonfly-macro.jpg', fakeImage: 'assets/fake/10_dragonfly-macro.jpg', credit: { title: 'Dragonfly, insects macro photography', creator: 'U.S. Department of Agriculture', license: 'cc0', source: 'https://www.rawpixel.com/image/8732074/photo-image-flower-public-domain-animal' } },
  { id: 'pair-11', realImage: 'assets/real/11_mushroom-underneath.jpg', fakeImage: 'assets/fake/11_mushroom-underneath.jpg', credit: { title: 'Mushroom, underneath_2012-09-21-14.51.00 ZS PMax', creator: 'Sam Droege', license: 'pdm', source: 'https://www.flickr.com/photos/54563451@N08/8016189217' } },
  { id: 'pair-12', realImage: 'assets/real/12_little-brown-mushrooms.jpg', fakeImage: 'assets/fake/12_little-brown-mushrooms.jpg', credit: { title: 'Little Brown Mushrooms', creator: 'GlacierNPS', license: 'pdm', source: 'https://www.flickr.com/photos/43288043@N04/52129861618' } },
  { id: 'pair-13', realImage: 'assets/real/13_mushroom-family.jpg', fakeImage: 'assets/fake/13_mushroom-family.jpg', credit: { title: 'a mushroom Family', creator: 'planes, space, nature', license: 'pdm', source: 'https://www.flickr.com/photos/158350039@N03/44573605254' } },
  { id: 'pair-14', realImage: 'assets/real/14_mineral-crystals.jpg', fakeImage: 'assets/fake/14_mineral-crystals.jpg', credit: { title: 'Mineral Crystals', creator: 'Gary Lee Todd, Ph.D.', license: 'pdm', source: 'https://www.flickr.com/photos/101561334@N08/53896323525' } },
  { id: 'pair-15', realImage: 'assets/real/15_garnet-crystals.jpg', fakeImage: 'assets/fake/15_garnet-crystals.jpg', credit: { title: 'Garnet babies2_2015-08-07-20.33', creator: 'Sam Droege', license: 'pdm', source: 'https://www.flickr.com/photos/54563451@N08/20282238198' } },
  { id: 'pair-16', realImage: 'assets/real/16_fluorite-crystal.jpg', fakeImage: 'assets/fake/16_fluorite-crystal.jpg', credit: { title: 'Fluorite, Helen Folger, with foil_2015-08-07-17.50.41 ZS PMax UDR', creator: 'Sam Droege', license: 'pdm', source: 'https://www.flickr.com/photos/54563451@N08/20371218106' } },
  { id: 'pair-17', realImage: 'assets/real/17_minnetonka-cave.jpg', fakeImage: 'assets/fake/17_minnetonka-cave.jpg', credit: { title: 'Minnetonka Cave Formations', creator: 'Intermountain Region US Forest Service', license: 'pdm', source: 'https://www.flickr.com/photos/107640324@N05/14151279233' } },
  { id: 'pair-18', realImage: 'assets/real/18_tongass-cave.jpg', fakeImage: 'assets/fake/18_tongass-cave.jpg', credit: { title: 'cave formations POWI June 2022 - Tongass-SAJ-003', creator: 'Forest Service Alaska Region, USDA', license: 'cc0', source: 'https://www.flickr.com/photos/58184989@N07/52503265513' } },
  { id: 'pair-19', realImage: 'assets/real/19_pitcher-plant-bee.jpg', fakeImage: 'assets/fake/19_pitcher-plant-bee.jpg', credit: { title: 'The Pitcher Plant and the Bee', creator: 'Kaitlin Bellamy', license: 'cc0', source: 'https://www.flickr.com/photos/143158739@N03/27242127462' } },
  { id: 'pair-20', realImage: 'assets/real/20_carnivorous-plants.jpg', fakeImage: 'assets/fake/20_carnivorous-plants.jpg', credit: { title: 'carnivorous plants', creator: 'lisafree54', license: 'cc0', source: 'https://www.flickr.com/photos/136594255@N06/27714120334' } },
  { id: 'pair-21', realImage: 'assets/real/21_romanesco.jpg', fakeImage: 'assets/fake/21_romanesco.jpg', credit: { title: 'chou romanesco', creator: 'didier.camus', license: 'pdm', source: 'https://www.flickr.com/photos/131830853@N05/50686315828' } },
  { id: 'pair-22', realImage: 'assets/real/22_dragon-fruit.jpg', fakeImage: 'assets/fake/22_dragon-fruit.jpg', credit: { title: 'A dragon fruit', creator: 'Helga Kattinger', license: 'cc0', source: 'https://commons.wikimedia.org/w/index.php?curid=106664700' } },
  { id: 'pair-23', realImage: 'assets/real/23_fallacirripectes-xray.jpg', fakeImage: 'assets/fake/23_fallacirripectes-xray.jpg', credit: { title: 'Fallacirripectes wellsi Schultz & Chapman', creator: 'Earl S. Herald', license: 'cc0', source: 'https://n2t.net/ark:/65665/384bfeff3-974d-4358-8462-6ccc02e19609' } },
  { id: 'pair-24', realImage: 'assets/real/24_omobranchus-xray.jpg', fakeImage: 'assets/fake/24_omobranchus-xray.jpg', credit: { title: 'Omobranchus meniscus Springer & Gomon', creator: 'Nai Mah', license: 'cc0', source: 'https://n2t.net/ark:/65665/318528bba-4bd4-4239-8309-10ec70042d99' } },
  { id: 'pair-25', realImage: 'assets/real/25_lenticular-cloud-dunes.jpg', fakeImage: 'assets/fake/25_lenticular-cloud-dunes.jpg', credit: { title: 'Lenticular Cloud over Great Sand Dunes and Mount Herard', creator: 'Great Sand Dunes National Park and Preserve', license: 'pdm', source: 'https://www.flickr.com/photos/94707653@N06/40566035845' } },
  { id: 'pair-26', realImage: 'assets/real/26_lenticular-clouds.jpg', fakeImage: 'assets/fake/26_lenticular-clouds.jpg', credit: { title: 'Lenticular clouds', creator: 'YellowstoneNPS', license: 'pdm', source: 'https://www.flickr.com/photos/80223459@N05/15685914817' } },
  { id: 'pair-27', realImage: 'assets/real/27_bull-frog.jpg', fakeImage: 'assets/fake/27_bull-frog.jpg', credit: { title: 'Bull Frog', creator: 'U. S. Fish and Wildlife Service - Northeast Region', license: 'pdm', source: 'https://www.flickr.com/photos/43322816@N08/5278271076' } },
  { id: 'pair-28', realImage: 'assets/real/28_boreal-chorus-frog.jpg', fakeImage: 'assets/fake/28_boreal-chorus-frog.jpg', credit: { title: 'Boreal Chorus Frog', creator: 'YellowstoneNPS', license: 'pdm', source: 'https://www.flickr.com/photos/80223459@N05/14098240918' } },
  { id: 'pair-29', realImage: 'assets/real/29_tuatara.jpg', fakeImage: 'assets/fake/29_tuatara.jpg', credit: { title: 'Tuatara.', creator: 'Bernard Spragg', license: 'cc0', source: 'https://www.flickr.com/photos/88123769@N02/8686980163' } },
  { id: 'pair-30', realImage: 'assets/real/30_curious-reptile.jpg', fakeImage: 'assets/fake/30_curious-reptile.jpg', credit: { title: 'Curious Reptile', creator: 'pasukaru76', license: 'cc0', source: 'https://www.flickr.com/photos/38451115@N04/8408104864' } },
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

// バンクから未出題(usedIds に含まれない)の1件を選ぶ。
// 候補が尽きた場合は出題履歴をリセットしてバンク全体から選び直す。
function selectRoundPair(rng = Math.random, bank = PAIR_BANK, usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = bank.filter((entry) => !usedSet.has(entry.id));

  if (pool.length > 0) {
    const entry = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    return { entry, usedIds: usedIds.concat([entry.id]) };
  }

  const entry = bank[Math.min(bank.length - 1, Math.floor(rng() * bank.length))];
  return { entry, usedIds: [entry.id] };
}

// 実写/偽物のどちらを左(index 0)に置くかをラウンドごとに決める。
// correctIndex はホストのみが保持し、question payload には含めない。
function buildRoundPayload(pair, rng = Math.random) {
  const correctIndex = rng() < 0.5 ? 0 : 1;
  const images = correctIndex === 0 ? [pair.realImage, pair.fakeImage] : [pair.fakeImage, pair.realImage];
  return { images, correctIndex };
}

function judgeAnswer(selectedIndex, correctIndex) {
  return selectedIndex === correctIndex;
}

// すべての画像パス(既知バンクに実在するかの検証に使う。setImage の allowlist 用)
function allImagePaths(bank = PAIR_BANK) {
  const paths = [];
  bank.forEach((p) => { paths.push(p.realImage, p.fakeImage); });
  return paths;
}

// 回答マップ({playerId: selectedIndex})から正解者のIDリストを求める
function tallyRoundAnswers(answers, correctIndex) {
  const correctIds = Object.keys(answers).filter((id) => judgeAnswer(answers[id], correctIndex));
  return { correctIds };
}

function computeRoundScoreDeltas(tally, points = CORRECT_POINTS) {
  const deltas = {};
  tally.correctIds.forEach((id) => { deltas[id] = points; });
  return deltas;
}

function applyScoreDeltas(scores, deltas) {
  const result = Object.assign({}, scores);
  Object.keys(deltas).forEach((id) => { result[id] = (result[id] || 0) + deltas[id]; });
  return result;
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

// ================= ロビー名簿(純粋関数) =================

function addPlayer(roster, player) {
  return roster.some((p) => p.id === player.id) ? roster : roster.concat([player]);
}

function removePlayer(roster, id) {
  return roster.filter((p) => p.id !== id);
}

function hasMinPlayers(roster, min = MIN_PLAYERS) {
  return roster.length >= min;
}

const RealOrFakePhotoLogicExports = {
  MIN_PLAYERS,
  ROUND_TOTAL,
  CORRECT_POINTS,
  PAIR_BANK,
  shuffle,
  selectRoundPair,
  buildRoundPayload,
  judgeAnswer,
  allImagePaths,
  tallyRoundAnswers,
  computeRoundScoreDeltas,
  applyScoreDeltas,
  buildScoreboard,
  getWinners,
  addPlayer,
  removePlayer,
  hasMinPlayers,
};

if (typeof module !== 'undefined') module.exports = RealOrFakePhotoLogicExports;
if (typeof window !== 'undefined') window.RealOrFakePhotoLogic = RealOrFakePhotoLogicExports;
