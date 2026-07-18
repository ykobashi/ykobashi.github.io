// logic.js - たほいや(辞書ゲーム) 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 3;

// 本物の定義を示す authorId の目印(実在プレイヤーのidとは重複しない特別な値)
const REAL_AUTHOR = 'REAL';

// 難読語・あまり知られていない言葉と、その説明(オリジナルの文章)のバンク。
// definition は実在の辞書からの引用ではなく、この企画のために独自に書き下ろしたもの。
const WORD_BANK = [
  { word: '逢魔が時', definition: '夕暮れ時、薄闇の中で人や物の輪郭が見分けにくくなり、不思議なことが起こりそうに感じられる時間帯のこと。' },
  { word: '幽玄', definition: '言葉では言い尽くせないほど奥深く、神秘的な趣や余韻を感じさせる美意識のこと。' },
  { word: '朧月', definition: '春先の夜、霞や靄がかかって輪郭がぼんやりとにじんで見える月のこと。' },
  { word: '陽炎', definition: '晴れた日に地面が強く熱せられ、空気が揺らめいて景色が歪んで見える現象のこと。' },
  { word: '罷り通る', definition: '本来なら許されないはずの物事が、堂々と通用してまかり通ってしまうこと。' },
  { word: '邂逅', definition: '思いがけず偶然に人と出会うこと。特に久しぶりの再会を指して使われることが多い。' },
  { word: '木枯らし', definition: '秋の終わりから冬の初めにかけて吹く、冷たく強い風のこと。' },
  { word: '忸怩たる', definition: '自分の言動を深く恥じ入り、心の中でひどく後ろめたく感じている様子。' },
  { word: '呵責', definition: '自分の犯した過ちについて、心が激しく責め立てられるような苦しい思いのこと。' },
  { word: '慟哭', definition: '深い悲しみのあまり我を忘れ、声をあげて激しく泣き叫ぶこと。' },
  { word: '忽然', definition: '前触れもなく、突然にその場から消えたり現れたりするさま。' },
  { word: '逡巡', definition: '決心がつかず、あれこれ迷ってなかなか行動に移せずにいること。' },
  { word: '諦観', definition: '物事の本質を見極め、執着を手放して静かに受け入れる心の境地のこと。' },
  { word: '杳として', definition: '手がかりが全くなく、行方や消息がまるでわからないままであるさま。' },
  { word: '刹那', definition: '瞬きする間もないほどの、極めて短い時間の単位のこと。' },
  { word: '蕭条', definition: '草木が枯れ、あたり一面が寂しく物悲しい様子であること。' },
  { word: '慙愧', definition: '自らの至らなさや過ちを深く恥じ、心を痛めること。' },
  { word: '天邪鬼', definition: 'わざと人の言うことに逆らったり、へそを曲げたりする性格の人、またはその性質のこと。' },
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

// 言葉バンクから1つランダムに選ぶ
function pickWordEntry(rng = Math.random, bank = WORD_BANK) {
  const index = Math.floor(rng() * bank.length);
  return bank[index];
}

// 本物の定義とニセの定義群を1つのリストにまとめ、シャッフルして返す。
// realDefinition: string
// fakeDefinitions: [{ authorId, text }]
// 戻り値: [{ id, text, authorId }] (authorIdはホストのみが使う集計用の情報)
function buildEntryList(realDefinition, fakeDefinitions, rng = Math.random) {
  const combined = [{ id: 'entry-0', text: realDefinition, authorId: REAL_AUTHOR }].concat(
    fakeDefinitions.map((f, i) => ({ id: 'entry-' + (i + 1), text: f.text, authorId: f.authorId }))
  );
  return shuffle(combined, rng);
}

// 投票結果を集計する(ホストのみが実行。entriesはauthorId込みのフルバージョン)
// votes: { voterId: votedEntryId }
// entries: [{ id, text, authorId }]
function tallyTahoiyaVotes(votes, entries) {
  const realEntry = entries.find((e) => e.authorId === REAL_AUTHOR);
  const realEntryId = realEntry ? realEntry.id : null;

  const correctVoterIds = Object.keys(votes).filter((voterId) => votes[voterId] === realEntryId);

  const voteCounts = {};
  entries.forEach((e) => {
    voteCounts[e.id] = 0;
  });
  Object.keys(votes).forEach((voterId) => {
    const votedId = votes[voterId];
    if (voteCounts[votedId] === undefined) voteCounts[votedId] = 0;
    voteCounts[votedId]++;
  });

  // 最も票を集めたニセ定義の作者を「最も騙した人」とする。
  // 同数の場合はentries配列で先に登場した方を採用する(厳密な同率優先度は重要でないため)。
  let mostDeceptiveAuthorId = null;
  let bestCount = 0;
  entries.forEach((e) => {
    if (e.authorId === REAL_AUTHOR) return;
    const count = voteCounts[e.id] || 0;
    if (count > bestCount) {
      bestCount = count;
      mostDeceptiveAuthorId = e.authorId;
    }
  });

  return { realEntryId, correctVoterIds, voteCounts, mostDeceptiveAuthorId };
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

const TahoiyaLogicExports = {
  MIN_PLAYERS,
  REAL_AUTHOR,
  WORD_BANK,
  shuffle,
  pickWordEntry,
  buildEntryList,
  tallyTahoiyaVotes,
  addPlayer,
  removePlayer,
  hasMinPlayers,
};

if (typeof module !== 'undefined') {
  module.exports = TahoiyaLogicExports;
}
if (typeof window !== 'undefined') {
  window.TahoiyaLogic = TahoiyaLogicExports;
}
