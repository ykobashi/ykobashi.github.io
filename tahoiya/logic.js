// logic.js - たほいや(辞書ゲーム) 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 3;

// 本物の定義を示す authorId の目印(実在プレイヤーのidとは重複しない特別な値)
const REAL_AUTHOR = 'REAL';

// 難読語・あまり知られていない言葉と、その説明(オリジナルの文章)のバンク。
// definition は実在の辞書からの引用ではなく、この企画のために独自に書き下ろしたもの。
const WORD_BANK = [
  // 難読漢字系(読み自体が難しすぎるため少数精鋭に絞っている)
  { word: '逢魔が時', definition: '夕暮れ時、薄闇の中で人や物の輪郭が見分けにくくなり、不思議なことが起こりそうに感じられる時間帯のこと。' },
  { word: '幽玄', definition: '言葉では言い尽くせないほど奥深く、神秘的な趣や余韻を感じさせる美意識のこと。' },
  { word: '木菟', definition: '頭に耳のような羽毛の房を持つ、フクロウの仲間の鳥のこと。' },
  { word: '濫觴', definition: '大河も水源をたどれば杯に乗るほどの細流であることから転じて、物事の始まりや起源を指す言葉。' },
  { word: '東雲', definition: '夜が明けようとする頃、空がほのかに明るくなり始める時分のこと。' },
  { word: '蟄居', definition: '罰を受けたり自ら反省したりして、家に閉じこもって外出を控えること。' },

  { word: 'やおら', definition: 'それまで静止していた体を、ゆっくりとした動作で動かし始めるさま。' },
  { word: 'あまつさえ', definition: '悪いことが重なる際に、その上さらに、という意味を添える言葉。' },
  { word: 'こもごも', definition: '喜びと悲しみなど相反する感情や出来事が入り混じり、代わる代わる訪れるさま。' },
  { word: 'よしなに', definition: '深くは考えず、その場に応じてうまく取り計らうさま。' },
  { word: 'つとめて', definition: '夜が明けてからまもない、早朝の時分のこと。' },
  { word: 'ゆくりなく', definition: '思いがけず、前触れもなく突然に。' },
  { word: 'すべなく', definition: 'どうすることもできず、なすすべがなく途方に暮れるさま。' },
  { word: 'つれなく', definition: '相手に対して思いやりを見せず、そっけない態度を取るさま。' },
  { word: 'かまける', definition: '他のことに気を取られて、本来やるべき物事がおろそかになること。' },
  { word: 'うそぶく', definition: 'さも当然のことのように、大きなことや偉そうなことを平然と言うこと。' },
  { word: 'たゆたう', definition: '一つの場所に定まらず、ゆらゆらと揺れながら漂うこと。' },
  { word: 'すごすご', definition: '目的を果たせず気落ちして、元気なくその場を引き下がるさま。' },
  { word: 'やんごとない', definition: '家柄や身分がきわめて高く、並々ならず尊いこと。' },
  { word: 'つまびらか', definition: '細かい点まで、はっきりと明らかであるさま。' },
  { word: 'とみに', definition: '以前と比べて、物事の程度が急に著しく増していくさま。' },
  { word: 'けざやか', definition: '他のものとはっきり区別できるほど、際立って美しく鮮やかなさま。' },
  { word: 'よすが', definition: '心のよりどころとしてすがる、頼りとなる人や物事のこと。' },
  { word: 'たまさか', definition: '偶然に、たまたま。めったにないほどまれであるさま。' },
  { word: 'すべからく', definition: '当然のこととして、ぜひとも〜すべきである、という意味を表す言葉。' },
  { word: 'あまねく', definition: '隅々まで行き渡り、広く一様に及んでいるさま。' },
  { word: 'けだし', definition: '念のため断っておくが、というほどの確信を込めて意見を述べる際に添える言葉。' },
  { word: 'ゆめゆめ', definition: '決して、絶対に、という強い禁止や戒めの意味を込めて使う言葉。' },
  { word: 'いとど', definition: '以前にもまして、いっそう、ますます程度が進むさま。' },
  { word: 'ひねもす', definition: '朝から晩まで、一日中ずっと。' },
  { word: 'よもすがら', definition: '一晩中、夜通しずっと。' },
  { word: 'したためる', definition: '手紙や文章を書き記すこと。また、食事を済ませること。' },
  { word: 'はべる', definition: '貴人のそばに仕え、控えていること。' },
  { word: 'いみじくも', definition: '非常に、実にというほどの意味を込めて、後に続く言葉を強調する言葉。' },

  // 誤用されがちな言葉(世間で広まっている意味ではなく、本来の正しい意味を定義として採用)
  { word: '敷居が高い', definition: '義理を欠いたり相手に迷惑をかけたりしたことがあって、その人の家や店に行きにくく感じられること。' },
  { word: '姑息', definition: '根本的な解決ではなく、その場しのぎの一時的な手段で済ませること。' },
  { word: '煮詰まる', definition: '議論や検討が十分に進んで、結論を出せる段階に近づくこと。' },
  { word: '役不足', definition: '与えられた役目や仕事が、その人の実力に比べて軽すぎること。' },
  { word: '気が置けない', definition: '相手に対して遠慮や気遣いをする必要がなく、心から打ち解けて付き合えること。' },
  { word: '檄を飛ばす', definition: '自分の主張や考えを文書などにして広く人々に知らせ、同意や決起を求めること。' },
  { word: '憮然', definition: '失望してぼんやりしたり、驚きあきれたりしている様子。' },
  { word: '破天荒', definition: 'これまで誰も成し得なかった物事を、初めて成し遂げること。' },
  { word: 'なし崩し', definition: '物事を少しずつ、着実に片付けたり済ませたりしていくこと。' },
  { word: 'おもむろに', definition: '動作を落ち着いて、ゆっくりと始めるさま。' },
  { word: '流れに棹さす', definition: '物事が良い方向に進むよう、その勢いに乗じてうまく後押しをすること。' },
  { word: '確信犯', definition: '自分の行為が道徳的・思想的に正しいと信じて行う、犯罪や不法行為のこと。' },
  { word: '割愛', definition: '惜しいと思う気持ちがありながら、思い切って省略したり手放したりすること。' },
  { word: '失笑', definition: 'こらえきれずに、思わず吹き出して笑ってしまうこと。' },
  { word: '世間ずれ', definition: '世の中をいろいろ渡り歩くうちに、世慣れてずる賢くなっていること。' },
  { word: 'やぶさかでない', definition: '努力を惜しまず、喜んで物事を行おうとする気持ちがあること。' },
  { word: '天地無用', definition: '荷物などを運ぶ際、上下を逆さまにしてはいけないという注意書きの言葉。' },
  { word: '潮時', definition: '物事を行ったり、切り上げたりするのに、ちょうどよい時期のこと。' },
  { word: 'さわり', definition: '話や音楽などの中で、最も重要で聞かせどころとなる部分のこと。' },
  { word: '王道', definition: '近道や安易な方法に頼らない、正統で本格的なやり方のこと。' },
  { word: '号泣', definition: '大きな声をあげて、激しく泣くこと。' },

  // 伝統色の名前
  { word: '瓶覗', definition: '藍染めで、瓶にほんの少しだけ浸した程度の、ごく薄い水色のこと。' },
  { word: '消炭色', definition: '燃えさしの炭のような、黒みを帯びた薄墨色のこと。' },
  { word: '憲法色', definition: '黒みを帯びた、渋い茶色のこと。' },
  { word: '一斤染', definition: '紅花で薄く染めた、ごく淡い桜色のこと。' },
  { word: '利休鼠', definition: '緑がかった、渋みのある鼠色のこと。' },
  { word: '苅安色', definition: '苅安という植物から取れる染料で染めた、明るい黄色のこと。' },
  { word: '鴇色', definition: 'トキという鳥の風切り羽のような、淡い桃色のこと。' },
  { word: '山鳩色', definition: 'ヤマバトの羽のような、灰色がかった緑色のこと。' },

  // 季節を表す古語
  { word: '山笑う', definition: '春になり、山の木々が一斉に芽吹いて明るい若葉に彩られる様子を表す言葉。' },
  { word: '山滴る', definition: '夏、山の木々が生い茂り、みずみずしい緑がしたたり落ちそうなほど濃く茂っている様子を表す言葉。' },
  { word: '山粧う', definition: '秋、山全体が紅葉によって美しく色づき、着飾ったように見える様子を表す言葉。' },
  { word: '山眠る', definition: '冬、木々の葉が落ち、山全体が静まりかえって眠っているように見える様子を表す言葉。' },
  { word: '送り梅雨', definition: '梅雨の終わりごろに降る、雷を伴う激しい雨のこと。' },
  { word: '走り梅雨', definition: '梅雨入り前に、一時的に梅雨のような天気が続くこと。' },
  { word: '冬ざれ', definition: '草木が枯れ果て、荒涼として物寂しい冬の景色のこと。' },
  { word: '麦秋', definition: '麦が実り、収穫を迎える初夏の頃のこと。' },
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
