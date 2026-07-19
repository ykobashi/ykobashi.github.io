const MIN_PLAYERS = 2;

const WORD_BANK = [
  'りんご','バナナ','みかん','ぶどう','いちご','すいか','メロン','もも','なし','レモン',
  'トマト','にんじん','じゃがいも','たまねぎ','きゅうり','かぼちゃ','キャベツ','だいこん','ピーマン','とうもろこし',
  '鉛筆','消しゴム','定規','はさみ','のり','ノート','封筒','切手','傘','鍵',
  '時計','眼鏡','財布','帽子','靴','靴下','手袋','タオル','歯ブラシ','石けん',
  '冷蔵庫','洗濯機','電子レンジ','掃除機','扇風機','テレビ','電話','パソコン','カメラ','電池',
  '机','椅子','ベッド','ソファ','本棚','鏡','カーテン','まくら','布団','じゅうたん',
  '自転車','自動車','バス','電車','飛行機','船','信号','地図','切符','ヘルメット',
  'サッカーボール','野球ボール','テニスラケット','バット','縄跳び','スキー板','スケート靴','ゴルフクラブ','水筒','リュック',
  'ギター','ピアノ','たいこ','笛','バイオリン','ハーモニカ','マイク','スピーカー','本','新聞',
  '茶碗','皿','コップ','箸','スプーン','フォーク','包丁','鍋','フライパン','やかん',
  'パン','ごはん','卵','チーズ','牛乳','アイスクリーム','チョコレート','クッキー','おにぎり','ケーキ',
  'ティッシュ','マスク','くし','ドライヤー','爪切り','体温計','絆創膏','懐中電灯','虫眼鏡','双眼鏡',
  'ランドセル','教科書','黒板','チョーク','ホチキス','クリップ','輪ゴム','画びょう','色鉛筆','筆箱',
  'ボタン','ベルト','ネクタイ','ハンカチ','エプロン','パジャマ','コート','マフラー','サンダル','長靴',
  'ぬいぐるみ','積み木','風船','折り紙','トランプ','サイコロ','将棋駒','けん玉','ヨーヨー','シャボン玉'
];

const ANSWER_ALIASES = { '眼鏡':['めがね','メガネ'], '石けん':['せっけん','石鹸'], '絆創膏':['ばんそうこう'], '将棋駒':['しょうぎごま','将棋の駒'] };

function shuffle(array, rng = Math.random) {
  const result = array.slice();
  for (let i=result.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [result[i],result[j]]=[result[j],result[i]]; }
  return result;
}
function validateIds(ids) {
  if (!Array.isArray(ids) || ids.length < 2 || new Set(ids).size !== ids.length) throw new Error('プレイヤーIDは重複のない2件以上が必要です');
}
function assignWords(playerIds, rng = Math.random, bank = WORD_BANK) {
  validateIds(playerIds);
  if (!Array.isArray(bank) || bank.length < playerIds.length || new Set(bank).size !== bank.length) throw new Error('単語バンクが不足または重複しています');
  const words=shuffle(bank,rng), ids=shuffle(playerIds,rng), result=Object.create(null);
  ids.forEach((id,i)=>{ result[id]=words[i]; }); return result;
}
function buildTargetChain(playerIds, rng = Math.random) {
  validateIds(playerIds); const order=shuffle(playerIds,rng), targetOf=Object.create(null);
  order.forEach((id,i)=>{ targetOf[id]=order[(i+1)%order.length]; }); return {order,targetOf};
}
function normalizeAnswer(value) {
  if (value == null) return '';
  return String(value).normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/[\s　・･,，.。!！?？「」『』()（）\-ー]/g,'');
}
function isCorrectGuess(guess, correctWord) {
  const normalized=normalizeAnswer(guess); if (!normalized) return false;
  return [correctWord].concat(ANSWER_ALIASES[correctWord]||[]).some(v=>normalizeAnswer(v)===normalized);
}
function addPlayer(roster, player) { return roster.some(p=>p.id===player.id) ? roster : roster.concat([player]); }
function removePlayer(roster,id) { return roster.filter(p=>p.id!==id); }
function hasMinPlayers(roster,min=MIN_PLAYERS) { return roster.length>=min; }
const api={MIN_PLAYERS,WORD_BANK,ANSWER_ALIASES,shuffle,assignWords,buildTargetChain,normalizeAnswer,isCorrectGuess,addPlayer,removePlayer,hasMinPlayers};
if(typeof module!=='undefined') module.exports=api;
if(typeof window!=='undefined') window.WordDetectiveLogic=api;
