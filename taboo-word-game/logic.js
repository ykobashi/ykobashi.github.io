// logic.js - NGワードゲーム(タブー形式) 純粋関数ロジック(DOM操作なし)

const MIN_PLAYERS = 2;
const ROUND_WORD_COUNT = 10;

// お題バンク。word を、banned に含まれる3つの単語を使わずに説明する。
const TABOO_BANK = [
  { word: '寿司', banned: ['魚', 'ネタ', '回転'] },
  { word: '花火', banned: ['夏', '打ち上げ', '音'] },
  { word: '傘', banned: ['雨', '骨', '折りたたみ'] },
  { word: '冷蔵庫', banned: ['冷やす', 'キッチン', '電気'] },
  { word: '図書館', banned: ['本', '静か', '借りる'] },
  { word: '温泉', banned: ['お湯', '露天', '旅館'] },
  { word: '新幹線', banned: ['電車', '速い', '駅'] },
  { word: '桜', banned: ['花見', 'ピンク', '春'] },
  { word: '富士山', banned: ['山', '日本一', '登る'] },
  { word: 'カレー', banned: ['辛い', 'ルー', 'ご飯'] },
  { word: '猫', banned: ['動物', 'ニャー', 'ペット'] },
  { word: '犬', banned: ['動物', 'ワン', '散歩'] },
  { word: '洗濯機', banned: ['洗う', '服', '回る'] },
  { word: '消しゴム', banned: ['消す', '鉛筆', '白い'] },
  { word: '信号機', banned: ['赤', '青', '交差点'] },
  { word: '折り紙', banned: ['紙', '折る', '鶴'] },
  { word: '眼鏡', banned: ['目', 'レンズ', 'かける'] },
  { word: '財布', banned: ['お金', '入れる', 'カード'] },
  { word: '時計', banned: ['時間', '針', '秒'] },
  { word: '布団', banned: ['寝る', '毛布', 'ふかふか'] },
  { word: '台所', banned: ['料理', 'キッチン', '包丁'] },
  { word: '教室', banned: ['学校', '机', '黒板'] },
  { word: '病院', banned: ['医者', '注射', '薬'] },
  { word: '郵便局', banned: ['手紙', '切手', '配達'] },
  { word: '公園', banned: ['遊具', 'ブランコ', '散歩'] },
  { word: '動物園', banned: ['檻', '象', '入場料'] },
  { word: '水族館', banned: ['魚', 'イルカ', '水槽'] },
  { word: '花屋', banned: ['花束', '店員', '香り'] },
  { word: '美容院', banned: ['髪', 'カット', '鏡'] },
  { word: 'コンビニ', banned: ['24時間', 'レジ', 'おにぎり'] },
  { word: 'ラーメン', banned: ['麺', 'スープ', 'どんぶり'] },
  { word: 'おにぎり', banned: ['米', '海苔', '三角'] },
  { word: 'パン', banned: ['小麦', '焼く', 'トースト'] },
  { word: '卵焼き', banned: ['卵', '甘い', 'フライパン'] },
  { word: 'アイスクリーム', banned: ['冷たい', '甘い', 'コーン'] },
  { word: 'ケーキ', banned: ['誕生日', '甘い', 'ロウソク'] },
  { word: 'たこ焼き', banned: ['タコ', '丸い', 'ソース'] },
  { word: 'お好み焼き', banned: ['鉄板', 'ソース', '焼く'] },
  { word: 'うどん', banned: ['麺', 'だし', 'コシ'] },
  { word: 'そば', banned: ['麺', '年越し', 'つゆ'] },
  { word: '天ぷら', banned: ['揚げる', '衣', '油'] },
  { word: '焼き鳥', banned: ['串', '鶏', '炭'] },
  { word: 'すき焼き', banned: ['鍋', '牛肉', '割り下'] },
  { word: '餃子', banned: ['皮', '中華', '焼く'] },
  { word: 'ハンバーガー', banned: ['パン', '肉', '挟む'] },
  { word: 'ピザ', banned: ['チーズ', '生地', '切る'] },
  { word: 'コーヒー', banned: ['豆', '苦い', 'カフェイン'] },
  { word: '緑茶', banned: ['茶葉', '急須', '苦い'] },
  { word: 'お味噌汁', banned: ['味噌', 'だし', '椀'] },
  { word: '納豆', banned: ['大豆', '発酵', '粘る'] },
  { word: '象', banned: ['鼻', '大きい', '動物園'] },
  { word: 'キリン', banned: ['首', '長い', '動物'] },
  { word: 'パンダ', banned: ['白黒', '竹', '中国'] },
  { word: 'ライオン', banned: ['百獣', 'たてがみ', 'アフリカ'] },
  { word: 'うさぎ', banned: ['耳', '跳ねる', '動物'] },
  { word: 'カメ', banned: ['甲羅', '遅い', '動物'] },
  { word: 'ペンギン', banned: ['南極', '泳ぐ', '鳥'] },
  { word: 'フクロウ', banned: ['夜行性', '鳥', '目'] },
  { word: 'カラス', banned: ['黒い', '鳥', '鳴く'] },
  { word: '金魚', banned: ['水槽', 'オレンジ', '泳ぐ'] },
  { word: '虹', banned: ['雨', '七色', '空'] },
  { word: '雪', banned: ['白い', '冬', '冷たい'] },
  { word: '台風', banned: ['風', '雨', '進路'] },
  { word: '雷', banned: ['光る', '音', '空'] },
  { word: '星', banned: ['夜', '空', '光る'] },
  { word: '月', banned: ['夜', '満ちる', '空'] },
  { word: '海', banned: ['波', '塩', '泳ぐ'] },
  { word: '山', banned: ['登る', '高い', '頂上'] },
  { word: '川', banned: ['流れる', '水', '橋'] },
  { word: '森', banned: ['木', '緑', '動物'] },
  { word: '掃除機', banned: ['吸う', 'ホコリ', '電気'] },
  { word: '歯ブラシ', banned: ['歯', '磨く', '毛'] },
  { word: 'シャンプー', banned: ['髪', '泡', '洗う'] },
  { word: 'スマートフォン', banned: ['電話', 'アプリ', 'タッチ'] },
  { word: 'リモコン', banned: ['テレビ', 'ボタン', '電池'] },
  { word: '鏡', banned: ['映る', 'ガラス', '顔'] },
  { word: 'カーテン', banned: ['窓', '布', '開ける'] },
  { word: '枕', banned: ['頭', '寝る', '柔らかい'] },
  { word: 'ソファ', banned: ['座る', 'リビング', '柔らかい'] },
  { word: 'テーブル', banned: ['脚', '置く', '食卓'] },
  { word: '椅子', banned: ['座る', '脚', '家具'] },
  { word: 'ハンガー', banned: ['服', '掛ける', 'クローゼット'] },
  { word: 'ドライヤー', banned: ['髪', '風', '熱い'] },
  { word: 'アイロン', banned: ['しわ', '熱い', '服'] },
  { word: '傘立て', banned: ['傘', '玄関', '立てる'] },
  { word: '鍵', banned: ['開ける', 'ドア', '金属'] },
  { word: 'コンセント', banned: ['電気', '差し込む', '壁'] },
  { word: '電球', banned: ['明かり', '光る', '交換'] },
  { word: '鉛筆', banned: ['芯', '書く', '木'] },
  { word: 'ノート', banned: ['紙', '書く', '授業'] },
  { word: 'ランドセル', banned: ['小学生', '背負う', '通学'] },
  { word: '黒板', banned: ['チョーク', '教室', '白い'] },
  { word: '給食', banned: ['学校', '昼食', '配膳'] },
  { word: '運動会', banned: ['学校', '徒競走', '秋'] },
  { word: '卒業式', banned: ['学校', '証書', '3月'] },
  { word: '会社', banned: ['仕事', '社員', 'オフィス'] },
  { word: '名刺', banned: ['会社', '交換', '紙'] },
  { word: '会議', banned: ['話し合う', '仕事', '資料'] },
  { word: '飛行機', banned: ['空', '翼', '空港'] },
  { word: '自転車', banned: ['車輪', 'ペダル', 'こぐ'] },
  { word: 'バス', banned: ['停留所', '運転手', '乗る'] },
  { word: 'タクシー', banned: ['運転手', '料金', '乗る'] },
  { word: '船', banned: ['海', '浮かぶ', '港'] },
  { word: '地下鉄', banned: ['電車', '地下', '駅'] },
  { word: 'ヘリコプター', banned: ['空', 'プロペラ', '飛ぶ'] },
  { word: 'エレベーター', banned: ['昇る', 'ボタン', '階'] },
  { word: 'サッカー', banned: ['ボール', 'ゴール', '蹴る'] },
  { word: '野球', banned: ['バット', 'ボール', '打つ'] },
  { word: 'バスケットボール', banned: ['ゴール', 'ドリブル', '跳ぶ'] },
  { word: '水泳', banned: ['プール', '泳ぐ', '水着'] },
  { word: 'マラソン', banned: ['走る', '42キロ', 'ゴール'] },
  { word: '卓球', banned: ['ラケット', '台', '球'] },
  { word: '将棋', banned: ['駒', '盤', '対局'] },
  { word: '麻雀', banned: ['牌', '卓', '役'] },
  { word: '釣り', banned: ['竿', '魚', '糸'] },
  { word: 'キャンプ', banned: ['テント', '自然', '焚き火'] },
  { word: '読書', banned: ['本', 'ページ', '静か'] },
  { word: 'カラオケ', banned: ['マイク', '歌う', '部屋'] },
  { word: 'お正月', banned: ['元日', 'おせち', '新年'] },
  { word: 'ひな祭り', banned: ['人形', '3月', '女の子'] },
  { word: '七夕', banned: ['星', '短冊', '織姫'] },
  { word: 'お盆', banned: ['先祖', '8月', '帰省'] },
  { word: 'ハロウィン', banned: ['仮装', 'カボチャ', 'お菓子'] },
  { word: 'クリスマス', banned: ['サンタ', '12月', 'ツリー'] },
  { word: '節分', banned: ['豆', '鬼', '2月'] },
  { word: '入学式', banned: ['学校', '4月', '新生活'] },
  { word: '手', banned: ['指', '握る', '体'] },
  { word: '足', banned: ['歩く', '靴', '体'] },
  { word: '涙', banned: ['泣く', '目', '悲しい'] },
  { word: '笑顔', banned: ['笑う', '顔', '嬉しい'] },
  { word: '消防士', banned: ['火事', '消す', 'ホース'] },
  { word: '警察官', banned: ['犯人', '制服', 'パトカー'] },
  { word: '看護師', banned: ['病院', '患者', '白衣'] },
  { word: '先生', banned: ['学校', '教える', '生徒'] },
  { word: '料理人', banned: ['厨房', '作る', '包丁'] },
  { word: 'パソコン', banned: ['キーボード', '画面', '操作'] },
  { word: 'カメラ', banned: ['写真', 'レンズ', '撮る'] },
  { word: 'テレビ', banned: ['画面', '番組', 'リモコン'] },
  { word: '冷房', banned: ['涼しい', 'エアコン', '夏'] },
  { word: '暖房', banned: ['暖かい', 'エアコン', '冬'] },
  { word: '帽子', banned: ['かぶる', '頭', 'つば'] },
  { word: '靴下', banned: ['足', '履く', '布'] },
  { word: 'マフラー', banned: ['首', '巻く', '冬'] },
  { word: '手袋', banned: ['手', 'はめる', '冬'] },
  { word: '浴衣', banned: ['夏', '祭り', '着物'] },
  { word: '遊園地', banned: ['遊具', '乗り物', 'チケット'] },
  { word: '映画館', banned: ['スクリーン', '座席', 'ポップコーン'] },
  { word: '神社', banned: ['鳥居', 'お参り', '神様'] },
  { word: '銀行', banned: ['お金', '預ける', '口座'] },
  { word: '駅', banned: ['電車', 'ホーム', '改札'] },
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

// お題バンクから count 個(重複なし)をランダムに抜き出す
function pickRoundWords(rng = Math.random, bank = TABOO_BANK, count = ROUND_WORD_COUNT) {
  const shuffled = shuffle(bank, rng);
  return shuffled.slice(0, Math.min(count, bank.length));
}

// ルーム内で既に出題済みの単語(usedWords)を避けつつ count 個を選ぶ。
// 残りのプールが count 未満(=出題済みで足りない/使い切った)場合は、そのルームの
// 出題履歴をリセットしてバンク全体から選び直す。返り値の usedWords を次回呼び出しに渡す。
function selectRoundWords(rng = Math.random, bank = TABOO_BANK, count = ROUND_WORD_COUNT, usedWords = []) {
  const usedSet = new Set(usedWords);
  const pool = bank.filter((entry) => !usedSet.has(entry.word));

  if (pool.length >= count) {
    const words = pickRoundWords(rng, pool, count);
    return { words, usedWords: usedWords.concat(words.map((entry) => entry.word)) };
  }

  const words = pickRoundWords(rng, bank, count);
  return { words, usedWords: words.map((entry) => entry.word) };
}

// 挑戦記録({describerName, elapsedMs})の配列を、タイムの昇順(速い順)に並べ替える
function sortLeaderboard(entries) {
  return entries.slice().sort((a, b) => a.elapsedMs - b.elapsedMs);
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

const TabooWordLogicExports = {
  MIN_PLAYERS,
  ROUND_WORD_COUNT,
  TABOO_BANK,
  shuffle,
  pickRoundWords,
  selectRoundWords,
  sortLeaderboard,
  addPlayer,
  removePlayer,
  hasMinPlayers,
};

if (typeof module !== 'undefined') {
  module.exports = TabooWordLogicExports;
}
if (typeof window !== 'undefined') {
  window.TabooWordLogic = TabooWordLogicExports;
}
