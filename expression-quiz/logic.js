// logic.js - はぁっていうゲーム風・表情当てクイズ 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 2;
const ROUND_TOTAL = 3;
const CORRECT_POINTS = 1000;

// 表面の感情は共通、裏にある感情の色が異なる4択(正解1件+誤答3件)。
// decoyScenarios はパターンごとに手作りで固定(グローバルな共有バンクからは抽出しない)。
const EXPRESSION_BANK = [
  {
    id: 'pattern-a',
    image: 'assets/faces/pattern-a.jpg',
    correctScenario: '虫が急に目の前に飛んできて驚いた',
    decoyScenarios: [
      '好きなアーティストの引退発表を見て驚いた',
      '宝くじの高額当選が判明して驚いた',
      '後ろから急に肩を叩かれて驚いた',
    ],
  },
  {
    id: 'pattern-b',
    image: 'assets/faces/pattern-b.jpg',
    correctScenario: '大切に育てていた植物が枯れているのに気づいて悲しい',
    decoyScenarios: [
      '楽しみにしていた旅行が土壇場でキャンセルになって悲しい',
      '友人と些細な喧嘩をしたまま仲直りできず別れて悲しい',
      '感動的な映画のラストシーンを見て悲しい',
    ],
  },
  {
    id: 'pattern-c',
    image: 'assets/faces/pattern-c.jpg',
    correctScenario: '好きな人にうっかり本音を言ってしまって恥ずかしい',
    decoyScenarios: [
      '大勢の前で盛大に転んでしまって恥ずかしい',
      '仕事のミスを上司の前で指摘されて気まずい',
      '誕生日を祝ってもらって照れくさい',
    ],
  },
  {
    id: 'pattern-04',
    image: 'assets/faces/pattern-04.jpg',
    correctScenario: '並んでいた行列に横から割り込まれて腹が立った',
    decoyScenarios: [
      '好きなチームが逆転負けして悔しくて腹が立った',
      '弟にお気に入りのゲームを壊されて腹が立った',
      '催促していた返信が既読無視されたままで腹が立った',
    ],
  },
  {
    id: 'pattern-05',
    image: 'assets/faces/pattern-05.jpg',
    correctScenario: '秘密にしていた話を友人に勝手に言いふらされて怒っている',
    decoyScenarios: [
      '大事な仕事の締め切りを土壇場で変更されて怒っている',
      '順番を守らない人に注意しても聞いてもらえず怒っている',
      '楽しみにしていた誕生日を家族に忘れられて怒っている',
    ],
  },
  {
    id: 'pattern-06',
    image: 'assets/faces/pattern-06.jpg',
    correctScenario: '何度も同じ間違いを繰り返す後輩についに堪忍袋の緒が切れた',
    decoyScenarios: [
      '隣の部屋の騒音が真夜中まで続いて我慢の限界だ',
      '大切にしていた本にジュースをこぼされて我慢できない',
      '何度言っても靴を脱ぎっぱなしにする家族についカッとなった',
    ],
  },
  {
    id: 'pattern-07',
    image: 'assets/faces/pattern-07.jpg',
    correctScenario: '何ヶ月も練習した曲をついに最後まで弾き切れて嬉しい',
    decoyScenarios: [
      '宝くじで思いがけず小当たりして嬉しい',
      '久しぶりに会った友人と話が弾んで嬉しい',
      '注文した新しい家具が届いて嬉しい',
    ],
  },
  {
    id: 'pattern-08',
    image: 'assets/faces/pattern-08.jpg',
    correctScenario: '作った料理を家族に美味しいと言ってもらえて嬉しい',
    decoyScenarios: [
      '探していた絶版の本をやっと手に入れて嬉しい',
      '道に迷っていた人を案内してお礼を言われて嬉しい',
      '飼っている犬が新しい芸を覚えて嬉しい',
    ],
  },
  {
    id: 'pattern-09',
    image: 'assets/faces/pattern-09.jpg',
    correctScenario: 'サプライズで誕生日会を開いてもらって嬉しい',
    decoyScenarios: [
      '憧れていた会社から内定の連絡が来て嬉しい',
      '長年欲しかった靴がセールで安く買えて嬉しい',
      '植えた種から初めて芽が出て嬉しい',
    ],
  },
  {
    id: 'pattern-10',
    image: 'assets/faces/pattern-10.jpg',
    correctScenario: '試験の合否発表を明日に控えて眠れないほど不安だ',
    decoyScenarios: [
      '初めての一人暮らしがうまくいくか不安だ',
      '大事な会議でうまく話せるか不安だ',
      '友人としばらく連絡が取れず何かあったのか不安だ',
    ],
  },
  {
    id: 'pattern-11',
    image: 'assets/faces/pattern-11.jpg',
    correctScenario: '電車が長時間止まっていて大事な約束に間に合うか不安だ',
    decoyScenarios: [
      '新しい職場に馴染めるか不安だ',
      '飼っている猫の食欲がないので体調が不安だ',
      '初めて挑戦する料理がうまく仕上がるか不安だ',
    ],
  },
  {
    id: 'pattern-12',
    image: 'assets/faces/pattern-12.jpg',
    correctScenario: '体調を崩した家族の検査結果が出るまで気が気でない',
    decoyScenarios: [
      '初めて子供を一人でお使いに行かせて心配だ',
      '送ったメッセージがずっと既読にならず心配だ',
      '天気予報で明日の遠足が雨になりそうで不安だ',
    ],
  },
  {
    id: 'pattern-13',
    image: 'assets/faces/pattern-13.jpg',
    correctScenario: '兄が何度注意しても部屋を片付けないので呆れている',
    decoyScenarios: [
      '同僚が毎回同じ言い訳で遅刻してくるので呆れている',
      '友人が突拍子もない思いつきを本気で実行しようとしていて呆れている',
      'セール品を見境なく買い込む自分に呆れている',
    ],
  },
  {
    id: 'pattern-14',
    image: 'assets/faces/pattern-14.jpg',
    correctScenario: '明らかに自分のミスを人のせいにする人を見て呆れている',
    decoyScenarios: [
      '渋滞の原因が些細な事故だと知って呆れている',
      '何年も同じ冗談を繰り返す上司に呆れている',
      '行列に並んだのに売り切れだったと知って呆れている',
    ],
  },
  {
    id: 'pattern-15',
    image: 'assets/faces/pattern-15.jpg',
    correctScenario: '同じ忘れ物を三日連続でしてしまい自分に呆れている',
    decoyScenarios: [
      '後輩の思いがけない失敗談を聞いて呆れている',
      '渾身のジョークが誰にも笑ってもらえず呆れている',
      'ペットが家中を散らかしているのを見て呆れている',
    ],
  },
  {
    id: 'pattern-16',
    image: 'assets/faces/pattern-16.jpg',
    correctScenario: '大勢の前でスピーチする直前で緊張している',
    decoyScenarios: [
      '初対面の相手と挨拶を交わす前で緊張している',
      'ジェットコースターの発車を待つ間緊張している',
      '面接の順番を待つ間緊張している',
    ],
  },
  {
    id: 'pattern-17',
    image: 'assets/faces/pattern-17.jpg',
    correctScenario: 'プロジェクトの結果発表を前に緊張している',
    decoyScenarios: [
      '初めてのデートで待ち合わせ場所に向かう途中で緊張している',
      '久しぶりに運転する車のエンジンをかける前で緊張している',
      '大事な試合のキックオフ直前で緊張している',
    ],
  },
  {
    id: 'pattern-18',
    image: 'assets/faces/pattern-18.jpg',
    correctScenario: 'サプライズパーティーの準備がばれないよう取り繕っていて緊張している',
    decoyScenarios: [
      '初めての一人での電車の乗り換えで緊張している',
      '大事な書類を提出する直前で緊張している',
      '憧れの人に話しかける勇気を出そうとして緊張している',
    ],
  },
  {
    id: 'pattern-19',
    image: 'assets/faces/pattern-19.jpg',
    correctScenario: '頼んでいない荷物が急に届いて困惑している',
    decoyScenarios: [
      '複雑な説明書を読んでも組み立て方が分からず困惑している',
      '知らない番号から突然電話がかかってきて困惑している',
      '道を聞かれたが自分もよく知らない場所で困惑している',
    ],
  },
  {
    id: 'pattern-20',
    image: 'assets/faces/pattern-20.jpg',
    correctScenario: '友人と話しているうちに話の前提がずれていたことに気づき困惑している',
    decoyScenarios: [
      '外国語の看板の意味が全く分からず困惑している',
      '約束の時間や場所を勘違いしていたと気づき困惑している',
      '同じ名前の人が二人いて話がこんがらがり困惑している',
    ],
  },
  {
    id: 'pattern-21',
    image: 'assets/faces/pattern-21.jpg',
    correctScenario: 'メニューの種類が多すぎて何を頼むか決められず困惑している',
    decoyScenarios: [
      '複数の予定が同じ日に重なってしまい困惑している',
      '操作方法が複雑な新しい家電の使い方が分からず困惑している',
      '二人から同時に別々の頼まれごとをされて困惑している',
    ],
  },
  {
    id: 'pattern-22',
    image: 'assets/faces/pattern-22.jpg',
    correctScenario: '発表資料の重大な誤りを本番直前に指摘されて動揺している',
    decoyScenarios: [
      '大事な待ち合わせに大幅に遅れそうで動揺している',
      'うっかり口を滑らせて秘密を話してしまい動揺している',
      'スマホを落として画面が割れてしまい動揺している',
    ],
  },
  {
    id: 'pattern-23',
    image: 'assets/faces/pattern-23.jpg',
    correctScenario: '別れた元恋人と偶然街で再会して動揺している',
    decoyScenarios: [
      '大事なデータを保存し忘れてパソコンが落ちてしまい動揺している',
      '憧れの有名人と偶然すれ違って動揺している',
      '上司に呼び出しの理由も告げられずに動揺している',
    ],
  },
  {
    id: 'pattern-24',
    image: 'assets/faces/pattern-24.jpg',
    correctScenario: '取引先へのメールを別の相手に誤送信してしまい動揺している',
    decoyScenarios: [
      '大事な約束をすっかり忘れていたことに気づき動揺している',
      '電車の中に大切な荷物を置き忘れたことに気づき動揺している',
      '知らないうちに服のタグを付けたまま外出していたと気づき動揺している',
    ],
  },
  {
    id: 'pattern-25',
    image: 'assets/faces/pattern-25.jpg',
    correctScenario: '土砂降りの中、傘を忘れたことに気づき濡れて帰るしかないと諦めている',
    decoyScenarios: [
      '何度挑戦しても解けないパズルを前に諦めかけている',
      '満席で予約が取れず今日は諦めるしかないと思っている',
      '言っても伝わらない相手との議論を諦めている',
    ],
  },
  {
    id: 'pattern-26',
    image: 'assets/faces/pattern-26.jpg',
    correctScenario: '長時間並んだ末に目当ての商品が売り切れていて諦めている',
    decoyScenarios: [
      '何時間もかけて作った資料が土壇場でボツになり諦めている',
      '大事な試合で実力を出し切れず負けを認めて諦めている',
      '探し物がどうしても見つからず探すのを諦めている',
    ],
  },
  {
    id: 'pattern-27',
    image: 'assets/faces/pattern-27.jpg',
    correctScenario: '締め切りに間に合わないと悟り開き直って諦めている',
    decoyScenarios: [
      '渋滞にはまり予定通りに着くのを諦めている',
      '苦手な食べ物をどうしても克服できず諦めている',
      '天気予報が外れて計画していた予定を諦めている',
    ],
  },
  {
    id: 'pattern-28',
    image: 'assets/faces/pattern-28.jpg',
    correctScenario: '久しく会っていない旧友が突然目の前に現れて驚いた',
    decoyScenarios: [
      '頼んでいた荷物が予定より大幅に早く届いて驚いた',
      '静かな部屋で急に大きな物音がして驚いた',
      '思っていたより会計金額が高くて驚いた',
    ],
  },
  {
    id: 'pattern-29',
    image: 'assets/faces/pattern-29.jpg',
    correctScenario: '長年一緒にいたペットを見送ることになり悲しい',
    decoyScenarios: [
      '引っ越しで慣れ親しんだ街を離れることになり悲しい',
      '大切にしていたものを誤って壊してしまい悲しい',
      '楽しかった旅行が終わり日常に戻ることに悲しい',
    ],
  },
  {
    id: 'pattern-30',
    image: 'assets/faces/pattern-30.jpg',
    correctScenario: '頑張って作った料理を思いがけず絶賛されて照れくさい',
    decoyScenarios: [
      '大勢の前で名前を呼ばれて注目を浴びて照れくさい',
      '好きな人とうっかり手が触れてしまい照れくさい',
      '懐かしい呼び方であだ名を呼ばれて照れくさい',
    ],
  },
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
function selectRoundEntry(rng = Math.random, bank = EXPRESSION_BANK, usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = bank.filter((entry) => !usedSet.has(entry.id));

  if (pool.length > 0) {
    const entry = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    return { entry, usedIds: usedIds.concat([entry.id]) };
  }

  const entry = bank[Math.min(bank.length - 1, Math.floor(rng() * bank.length))];
  return { entry, usedIds: [entry.id] };
}

// dictionary-quizのbuildChoicesは「グローバルバンクから正解以外を抽出する」設計だが、
// このゲームの誤答3つはパターンごとに固定(decoyScenarios)なので専用実装にする。
function buildChoices(entry, rng = Math.random) {
  return shuffle([entry.correctScenario].concat(entry.decoyScenarios), rng);
}

function judgeAnswer(selectedScenario, correctScenario) {
  return !!selectedScenario && selectedScenario === correctScenario;
}

// すべての画像パス(既知バンクに実在するかの検証に使う。setImage の allowlist 用)
function allImagePaths(bank = EXPRESSION_BANK) {
  return bank.map((entry) => entry.image);
}

// 回答マップ({playerId: selectedScenario})から正解者のIDリストを求める
function tallyRoundAnswers(answers, correctScenario) {
  const correctIds = Object.keys(answers).filter((id) => judgeAnswer(answers[id], correctScenario));
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

const ExpressionQuizLogicExports = {
  MIN_PLAYERS,
  ROUND_TOTAL,
  CORRECT_POINTS,
  EXPRESSION_BANK,
  shuffle,
  selectRoundEntry,
  buildChoices,
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

if (typeof module !== 'undefined') module.exports = ExpressionQuizLogicExports;
if (typeof window !== 'undefined') window.ExpressionQuizLogic = ExpressionQuizLogicExports;
