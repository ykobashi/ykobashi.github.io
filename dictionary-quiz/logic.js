// logic.js - 辞書定義当てクイズ 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 2;
const ROUND_TOTAL = 8;
const CHOICE_COUNT = 4;
const CORRECT_POINTS = 1000;

// 単語バンク。日本語の難読語・マイナー語を中心に、見出し語(word)・読み仮名(reading)・
// 簡潔な意味説明(meaning、辞書的な一文)を持つ。意味説明はオリジナルの言葉で作成している。
// 二字熟語だけでなく、四字熟語・三字熟語・カタカナ語・ひらがなの和語も混ぜてバリエーションを持たせている。
// type(語種)ごとにグループ化しているのは、誤答の選択肢を同じ語種から選んで
// 「見た目の字数や種類が違うから消去法で当てられる」状態を避けるため(buildChoicesが参照する)。
const WORD_BANK_BY_TYPE = [
  {
    type: '二字熟語',
    entries: [
      { word: '忌憚', reading: 'きたん', meaning: '遠慮すること。「忌憚なく」の形で、遠慮せず率直に述べる際によく使われる。' },
      { word: '杞憂', reading: 'きゆう', meaning: '起こりもしない先のことをあれこれ心配しすぎること。' },
      { word: '逡巡', reading: 'しゅんじゅん', meaning: '決心がつかず、ぐずぐずとためらい続けること。' },
      { word: '反故', reading: 'ほご', meaning: '書き損じて不要になった紙。転じて、約束や取り決めを無効にすること。' },
      { word: '掉尾', reading: 'とうび', meaning: '物事や文章の終わり、最後の締めくくりの部分。' },
      { word: '慙愧', reading: 'ざんき', meaning: '自分の行いを深く恥じ入ること。' },
      { word: '忖度', reading: 'そんたく', meaning: '口に出されていない相手の心情を推し量ること。' },
      { word: '邂逅', reading: 'かいこう', meaning: '思いがけず人とめぐり会うこと。' },
      { word: '慟哭', reading: 'どうこく', meaning: '声をあげて激しく泣き悲しむこと。' },
      { word: '韜晦', reading: 'とうかい', meaning: '自分の才能や本心をわざとくらまして隠すこと。' },
      { word: '慧眼', reading: 'けいがん', meaning: '物事の本質を鋭く見抜く優れた眼力。' },
      { word: '恬淡', reading: 'てんたん', meaning: '物事に執着せず、あっさりとしている様子。' },
      { word: '瞠目', reading: 'どうもく', meaning: '驚きや感心のあまり目を見張ること。' },
      { word: '忸怩', reading: 'じくじ', meaning: '自分の行いを恥じて、心の中でひそかに悔いること。' },
      { word: '蒙昧', reading: 'もうまい', meaning: '知識が乏しく、物事の道理に暗いこと。' },
      { word: '慫慂', reading: 'しょうよう', meaning: 'それとなく勧めて、ある行動をするよう仕向けること。' },
      { word: '揺籃', reading: 'ようらん', meaning: '赤ん坊を寝かせるゆりかご。転じて、物事が生まれ育つ初期の場所。' },
      { word: '桎梏', reading: 'しっこく', meaning: '自由な行動を厳しく縛りつけるもの。' },
      { word: '木鐸', reading: 'ぼくたく', meaning: '世の人々を教え導く役割を果たす人。' },
      { word: '齟齬', reading: 'そご', meaning: '物事の食い違いや行き違いが生じること。' },
      { word: '蓋然', reading: 'がいぜん', meaning: '確実ではないが、ある程度起こりそうな見込み。' },
      { word: '呵責', reading: 'かしゃく', meaning: '自分の過ちを厳しく責めさいなまれること。' },
      { word: '佇立', reading: 'ちょりつ', meaning: 'しばらくの間、じっと立ち止まっていること。' },
      { word: '憔悴', reading: 'しょうすい', meaning: '心労や疲労のためにやつれ弱ること。' },
      { word: '邁進', reading: 'まいしん', meaning: '目標に向かってひたすら突き進むこと。' },
      { word: '訥弁', reading: 'とつべん', meaning: '話し方がたどたどしく、すらすら話せないこと。' },
      { word: '剽窃', reading: 'ひょうせつ', meaning: '他人の作品や考えを無断で盗み、自分のものとして使うこと。' },
      { word: '造詣', reading: 'ぞうけい', meaning: 'ある分野について深く広い知識や理解を持っていること。' },
      { word: '忽然', reading: 'こつぜん', meaning: '前触れもなく、突然に物事が起こる様子。' },
      { word: '弛緩', reading: 'しかん', meaning: '張りつめていたものがゆるみ、たるむこと。' },
      { word: '稀有', reading: 'けう', meaning: 'めったに例がないほど珍しいこと。' },
      { word: '頓挫', reading: 'とんざ', meaning: '進行していた物事が途中で行き詰まって止まること。' },
      { word: '怪訝', reading: 'けげん', meaning: '納得がいかず、不思議そうな顔つきをすること。' },
      { word: '呆然', reading: 'ぼうぜん', meaning: '驚きや衝撃で我を忘れ、ぼんやりすること。' },
      { word: '阿諛', reading: 'あゆ', meaning: '相手に気に入られようとおもねりへつらうこと。' },
      { word: '狷介', reading: 'けんかい', meaning: '自分の意志を固く守り、他人と妥協しないこと。' },
      { word: '頑迷', reading: 'がんめい', meaning: '頑固で物の道理がわからず、考えを変えないこと。' },
      { word: '迂遠', reading: 'うえん', meaning: '実際の目的から遠回りで、まわりくどいこと。' },
      { word: '頓知', reading: 'とんち', meaning: 'その場に応じてとっさに働く気の利いた知恵。' },
      { word: '老獪', reading: 'ろうかい', meaning: '経験を積んで悪賢く、駆け引きに長けていること。' },
      { word: '狡猾', reading: 'こうかつ', meaning: 'ずる賢く人をだまそうとする様子。' },
      { word: '憫笑', reading: 'びんしょう', meaning: '相手を気の毒に思いながら笑うこと。' },
      { word: '慨嘆', reading: 'がいたん', meaning: '物事の現状を嘆き悲しむこと。' },
      { word: '泰然', reading: 'たいぜん', meaning: '落ち着き払って物事に動じない様子。' },
      { word: '沽券', reading: 'こけん', meaning: '人としての体面や品位。' },
      { word: '矜持', reading: 'きょうじ', meaning: '自分の能力や品位に対する誇り。' },
      { word: '姑息', reading: 'こそく', meaning: 'その場しのぎで、根本的な解決になっていないこと。' },
      { word: '杜撰', reading: 'ずさん', meaning: '仕事や計画がいい加減で誤りが多いこと。' },
      { word: '迂闊', reading: 'うかつ', meaning: '注意が足りず、うっかりしていること。' },
      { word: '詭弁', reading: 'きべん', meaning: '道理に合わないのに、こじつけて言いくるめる弁論。' },
      { word: '揶揄', reading: 'やゆ', meaning: '相手をからかい、馬鹿にすること。' },
      { word: '阿吽', reading: 'あうん', meaning: '互いの微妙な調子や気持ちがぴったり合うこと。' },
      { word: '逼迫', reading: 'ひっぱく', meaning: '事態が余裕なく差し迫った状態になること。' },
      { word: '払拭', reading: 'ふっしょく', meaning: '悪い印象や疑念などをすっかり取り除くこと。' },
      { word: '瓦解', reading: 'がかい', meaning: '組織や体制が崩れてばらばらになること。' },
      { word: '割愛', reading: 'かつあい', meaning: '惜しいと思いながらも省略すること。' },
      { word: '汎用', reading: 'はんよう', meaning: '一つに限らず、広く様々な用途に使えること。' },
      { word: '折衷', reading: 'せっちゅう', meaning: '異なる立場や方法のよいところを取り合わせること。' },
      { word: '相殺', reading: 'そうさい', meaning: '差し引きして互いの影響を打ち消し合うこと。' },
      { word: '遡及', reading: 'そきゅう', meaning: '過去にさかのぼって影響や効力を及ぼすこと。' },
      { word: '逓減', reading: 'ていげん', meaning: '数量が段階を追って少しずつ減っていくこと。' },
      { word: '拘泥', reading: 'こうでい', meaning: '些細なことに必要以上にこだわること。' },
      { word: '会得', reading: 'えとく', meaning: '物事の道理や技術を十分に理解して身につけること。' },
      { word: '陶冶', reading: 'とうや', meaning: '人の素質や才能を鍛え育て上げること。' },
      { word: '薫陶', reading: 'くんとう', meaning: 'すぐれた人格で人を感化し、よい方向へ育てること。' },
      { word: '汲々', reading: 'きゅうきゅう', meaning: '一つのことに追われ、余裕なくあくせくする様子。' },
      { word: '剣呑', reading: 'けんのん', meaning: '危険な感じがして油断できない様子。' },
    ],
  },
  {
    type: '四字熟語',
    entries: [
      { word: '温故知新', reading: 'おんこちしん', meaning: '昔のことを研究して、そこから新しい知識や見解を得ること。' },
      { word: '一期一会', reading: 'いちごいちえ', meaning: '一生に一度だけの出会いだと考え、その機会を大切にすること。' },
      { word: '森羅万象', reading: 'しんらばんしょう', meaning: '宇宙に存在する、ありとあらゆる物事や現象。' },
      { word: '単刀直入', reading: 'たんとうちょくにゅう', meaning: '前置きなしに、いきなり本題に入ること。' },
      { word: '五里霧中', reading: 'ごりむちゅう', meaning: '物事の手がかりがつかめず、判断や方針に迷うこと。' },
      { word: '我田引水', reading: 'がでんいんすい', meaning: '自分の都合のいいように物事を考えたり行動したりすること。' },
      { word: '竜頭蛇尾', reading: 'りゅうとうだび', meaning: '初めは勢いが盛んだが、終わりには衰えてしまうこと。' },
      { word: '呉越同舟', reading: 'ごえつどうしゅう', meaning: '仲の悪い者同士が、同じ場所や境遇に居合わせること。' },
      { word: '起死回生', reading: 'きしかいせい', meaning: '絶望的な状況を、一気に良い方向へ立て直すこと。' },
      { word: '花鳥風月', reading: 'かちょうふうげつ', meaning: '自然の美しい景物、またそれを愛でる風流な心。' },
      { word: '空前絶後', reading: 'くうぜんぜつご', meaning: '過去にも未来にも例がないほど、非常に珍しいこと。' },
      { word: '大器晩成', reading: 'たいきばんせい', meaning: '大人物は普通の人より遅れて能力や実力を現すということ。' },
      { word: '付和雷同', reading: 'ふわらいどう', meaning: '自分の考えを持たず、他人の意見にすぐ同調すること。' },
      { word: '針小棒大', reading: 'しんしょうぼうだい', meaning: '小さなことを大げさに誇張して言うこと。' },
      { word: '電光石火', reading: 'でんこうせっか', meaning: '動作が非常に素早いこと。' },
      { word: '抱腹絶倒', reading: 'ほうふくぜつとう', meaning: 'お腹を抱えて転げ回るほど、激しく笑うこと。' },
      { word: '岡目八目', reading: 'おかめはちもく', meaning: '当事者よりも第三者の方が、物事を的確に判断できるということ。' },
      { word: '温厚篤実', reading: 'おんこうとくじつ', meaning: '性格が穏やかで、情に厚く誠実なこと。' },
    ],
  },
  {
    type: '三字熟語',
    entries: [
      { word: '破天荒', reading: 'はてんこう', meaning: '今まで誰も成し得なかったことを初めて行うこと。' },
      { word: '生半可', reading: 'なまはんか', meaning: '知識や態度が中途半端で、不十分な様子。' },
      { word: '二枚舌', reading: 'にまいじた', meaning: '都合によって前後で違うことを言うこと。' },
      { word: '天邪鬼', reading: 'あまのじゃく', meaning: 'わざと人の言うことに逆らったり、意地悪な態度を取る人。' },
      { word: '一枚岩', reading: 'いちまいいわ', meaning: '組織や集団が、内部の対立なく固く団結していること。' },
      { word: '白眼視', reading: 'はくがんし', meaning: '冷たい態度で人を見ること、冷淡に扱うこと。' },
      { word: '助太刀', reading: 'すけだち', meaning: '困っている人に力を貸して助けること。' },
      { word: '十八番', reading: 'おはこ', meaning: 'その人が最も得意とする芸や技。' },
    ],
  },
  {
    type: 'カタカナ語',
    entries: [
      { word: 'セレンディピティ', reading: 'せれんでぃぴてぃ', meaning: '思いがけない偶然の出来事から、幸運な発見をする能力や才能。' },
      { word: 'パラダイム', reading: 'ぱらだいむ', meaning: 'ある時代や分野の人々に共有される、物の見方や考え方の枠組み。' },
      { word: 'コンセンサス', reading: 'こんせんさす', meaning: '複数の人の間で得られる意見の一致。' },
      { word: 'デジャブ', reading: 'でじゃぶ', meaning: '実際には初めての体験なのに、以前どこかで経験したように感じる感覚。' },
      { word: 'カタルシス', reading: 'かたるしす', meaning: '心の中にたまっていた不安や緊張が解放されて、気持ちがすっきりすること。' },
      { word: 'ジレンマ', reading: 'じれんま', meaning: '二つの相反する事柄の板挟みになり、どちらを選んでも困る状態。' },
      { word: 'アイデンティティ', reading: 'あいでんてぃてぃ', meaning: '自分が何者であるかという、確固たる自己認識。' },
      { word: 'イノベーション', reading: 'いのべーしょん', meaning: '新しい価値を生み出す、技術や仕組みの革新。' },
      { word: 'インフラストラクチャー', reading: 'いんふらすとらくちゃー', meaning: '社会や経済活動を支える、道路や電気などの基盤設備。' },
      { word: 'エビデンス', reading: 'えびでんす', meaning: '主張や判断の裏付けとなる、客観的な証拠。' },
      { word: 'オブセッション', reading: 'おぶせっしょん', meaning: 'ある考えや物事に取りつかれて、頭から離れないこと。' },
      { word: 'カリスマ', reading: 'かりすま', meaning: '人々を惹きつけ、心酔させる特別な魅力や資質。' },
      { word: 'グローバリゼーション', reading: 'ぐろーばりぜーしょん', meaning: '経済や文化が、国境を越えて世界規模で結びつくこと。' },
      { word: 'コミットメント', reading: 'こみっとめんと', meaning: 'ある物事に対する、責任を伴った関わりや約束。' },
      { word: 'サステナビリティ', reading: 'さすてなびりてぃ', meaning: '環境や資源を損なわずに、将来にわたって持続できること。' },
      { word: 'スキーム', reading: 'すきーむ', meaning: '物事を進めるための、体系立てられた計画や仕組み。' },
    ],
  },
  {
    type: 'ひらがなの和語',
    entries: [
      { word: 'やぶさか', reading: 'やぶさか', meaning: '(「~にやぶさかでない」の形で)喜んでそうする、努力を惜しまない様子。' },
      { word: 'したたか', reading: 'したたか', meaning: '意志や力が強く、簡単には屈しない様子。' },
      { word: 'おもむろ', reading: 'おもむろ', meaning: '動作が落ち着いていて、ゆっくりとしている様子。' },
      { word: 'つつがない', reading: 'つつがない', meaning: '病気や事故もなく、無事である様子。' },
      { word: 'おざなり', reading: 'おざなり', meaning: 'その場逃れの、いい加減な対応をすること。' },
      { word: 'なおざり', reading: 'なおざり', meaning: '物事をいい加減にして、真剣に取り組まないこと。' },
      { word: 'いみじくも', reading: 'いみじくも', meaning: 'まさに、実に的確に言い表している様子。「~とはいみじくも言ったものだ」のように使う。' },
      { word: 'あからさま', reading: 'あからさま', meaning: '隠さず、はっきりと表に出ている様子。' },
      { word: 'いたいけ', reading: 'いたいけ', meaning: '幼くて、痛々しいほど可愛らしい様子。' },
      { word: 'やおら', reading: 'やおら', meaning: '落ち着いてゆっくりと、動作を始める様子。' },
    ],
  },
];

const WORD_BANK = WORD_BANK_BY_TYPE.reduce(
  (acc, group) => acc.concat(group.entries.map((entry) => Object.assign({ type: group.type }, entry))),
  []
);

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

// バンクから未出題(usedWords に含まれない)の1語を選ぶ。
// 語種(type)の内訳がバンク全体では二字熟語に偏っている(二字熟語が過半数)ため、
// 単純にバンク全体から一様ランダムに選ぶと出題も二字熟語ばかりになってしまう。
// これを避けるため、まず「語種」を一様ランダムに選び、次にその語種の中から未出題の1語を選ぶ
// 2段階選択にしている。これにより語種ごとの単語数に関わらず、毎ラウンドどの語種も
// ほぼ均等な確率で出題される。
// 候補が尽きた場合は出題履歴をリセットしてバンク全体から選び直す。
// 返り値の usedWords を次回呼び出しに渡すことで、部屋内での重複出題を防ぐ。
function selectRoundWord(rng = Math.random, bank = WORD_BANK, usedWords = []) {
  const usedSet = new Set(usedWords);
  const allTypes = Array.from(new Set(bank.map((entry) => entry.type)));
  const availableTypes = allTypes.filter((type) => bank.some((entry) => entry.type === type && !usedSet.has(entry.word)));
  const resetting = availableTypes.length === 0;
  const types = resetting ? allTypes : availableTypes;
  const chosenType = types[Math.min(types.length - 1, Math.floor(rng() * types.length))];
  const poolForType = bank.filter((entry) => entry.type === chosenType && (resetting || !usedSet.has(entry.word)));
  const entry = poolForType[Math.min(poolForType.length - 1, Math.floor(rng() * poolForType.length))];
  return { entry, usedWords: resetting ? [entry.word] : usedWords.concat([entry.word]) };
}

// 正解の見出し語 + バンクから選んだ他の見出し語(count-1個)をシャッフルして返す。
// 誤答は「見た目の字数や語種(二字熟語/四字熟語/カタカナ語など)が違うから消去法で当てられる」
// 状態を避けるため、可能な限り正解と同じ語種(type)から優先して選ぶ。
// 同じ語種の候補が足りない場合のみ、他の語種から補う。
function buildChoices(correctEntry, bank = WORD_BANK, rng = Math.random, count = CHOICE_COUNT) {
  const pool = bank.filter((entry) => entry.word !== correctEntry.word);
  const sameType = correctEntry.type ? pool.filter((entry) => entry.type === correctEntry.type) : [];
  const otherType = pool.filter((entry) => !sameType.includes(entry));
  const needed = count - 1;
  const fromSame = shuffle(sameType, rng).slice(0, needed);
  const fromOther = shuffle(otherType, rng).slice(0, needed - fromSame.length);
  const others = fromSame.concat(fromOther);
  return shuffle([correctEntry.word].concat(others.map((entry) => entry.word)), rng);
}

function judgeAnswer(selectedWord, correctWord) {
  return !!selectedWord && selectedWord === correctWord;
}

// 回答マップ({playerId: selectedWord})から正解者のIDリストを求める
function tallyRoundAnswers(answers, correctWord) {
  const correctIds = Object.keys(answers).filter((id) => judgeAnswer(answers[id], correctWord));
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

const DictionaryQuizLogicExports = {
  MIN_PLAYERS,
  ROUND_TOTAL,
  CHOICE_COUNT,
  CORRECT_POINTS,
  WORD_BANK,
  WORD_BANK_BY_TYPE,
  shuffle,
  selectRoundWord,
  buildChoices,
  judgeAnswer,
  tallyRoundAnswers,
  computeRoundScoreDeltas,
  applyScoreDeltas,
  buildScoreboard,
  getWinners,
  addPlayer,
  removePlayer,
  hasMinPlayers,
};

if (typeof module !== 'undefined') module.exports = DictionaryQuizLogicExports;
if (typeof window !== 'undefined') window.DictionaryQuizLogic = DictionaryQuizLogicExports;
