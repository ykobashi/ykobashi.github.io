'use strict';

const assert = require('assert');
const L = require('./logic.js');

function emptyBoard() { return L.createEmptyBoard(); }
function seat(seatIndex, overrides) { return Object.assign({ seatIndex, kind: 'human', playerId: 'p' + seatIndex, name: 'P' + seatIndex, team: L.TEAM_OF_SEAT(seatIndex), eliminated: false }, overrides || {}); }
function fourSeats(overrides) { return [0, 1, 2, 3].map((i) => seat(i, overrides && overrides[i])); }
function state(board, seats, extra) { return Object.assign({ board, seats, turnOrder: [0, 1, 2, 3], activeSeatIndex: 0, turnCount: 0, version: 0, phase: 'playing', winner: null, drawn: false, lastMove: null }, extra || {}); }

// --- 盤面「グランドクロス」: 189マス、4隅は無効 ---
{
  let count = 0;
  for (let r = 0; r < L.BOARD_DIM; r += 1) for (let c = 0; c < L.BOARD_DIM; c += 1) if (L.isValidSquare(r, c)) count += 1;
  assert.strictEqual(count, 189);
  assert.strictEqual(L.isValidSquare(0, 0), false); // 左上の隅(無効)
  assert.strictEqual(L.isValidSquare(0, 16), false); // 右上の隅(無効)
  assert.strictEqual(L.isValidSquare(16, 0), false); // 左下の隅(無効)
  assert.strictEqual(L.isValidSquare(16, 16), false); // 右下の隅(無効)
  assert.strictEqual(L.isValidSquare(8, 8), true); // 中央
  assert.strictEqual(L.isValidSquare(0, 8), true); // 北の腕の先端
  assert.strictEqual(L.isValidSquare(8, 16), true); // 東の腕の先端
  assert.strictEqual(L.isValidSquare(16, 8), true); // 南の腕の先端
  assert.strictEqual(L.isValidSquare(8, 0), true); // 西の腕の先端
}
// チームの組み方(ファンブログに明記): 隣同士(0=北・1=東、2=南・3=西)が味方、対面(0⇔2, 1⇔3)が敵。
assert.strictEqual(L.TEAM_OF_SEAT(0), 'A'); assert.strictEqual(L.TEAM_OF_SEAT(1), 'A');
assert.strictEqual(L.TEAM_OF_SEAT(2), 'B'); assert.strictEqual(L.TEAM_OF_SEAT(3), 'B');
assert.strictEqual(L.teammateOf(0), 1); assert.strictEqual(L.teammateOf(1), 0);
assert.strictEqual(L.teammateOf(2), 3); assert.strictEqual(L.teammateOf(3), 2);

// --- 手番順: 最先手はコイントスで決定、最先手と味方が1番目と4番目になる(味方を2番目に踏まない回転方向) ---
assert.deepStrictEqual(L.buildTurnOrder(0), [0, 3, 2, 1]);
assert.deepStrictEqual(L.buildTurnOrder(1), [1, 2, 3, 0]);
assert.deepStrictEqual(L.buildTurnOrder(2), [2, 1, 0, 3]);
assert.deepStrictEqual(L.buildTurnOrder(3), [3, 0, 1, 2]);
[0, 1, 2, 3].forEach((first) => {
  const order = L.buildTurnOrder(first);
  assert.strictEqual(order[0], first);
  assert.strictEqual(order[3], L.teammateOf(first)); // 味方は必ず最後手
  assert.strictEqual(L.TEAM_OF_SEAT(order[1]), L.TEAM_OF_SEAT(order[2])); // 中2つは敵チームで揃う
});

// --- localToAbsolute: 各座席の自陣一番奥・中央(depth0,lateral3)が原点と一致するか ---
assert.deepStrictEqual(L.localToAbsolute(0, 0, 3), { r: 0, c: 8 });
assert.deepStrictEqual(L.localToAbsolute(1, 0, 3), { r: 8, c: 16 });
assert.deepStrictEqual(L.localToAbsolute(2, 0, 3), { r: 16, c: 8 });
assert.deepStrictEqual(L.localToAbsolute(3, 0, 3), { r: 8, c: 0 });
// depthを進めると盤中央側へ、lateralを増やすと「自分から見て右」へ動く
assert.deepStrictEqual(L.localToAbsolute(0, 4, 3), { r: 4, c: 8 }); // 北: depth+=盤中央方向(南=行+)
assert.deepStrictEqual(L.localToAbsolute(1, 4, 3), { r: 8, c: 12 }); // 東: depth+=盤中央方向(西=列-)

// --- 駒の移動: 王将(8方向1マス) ---
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'king' };
  const moves = L.generateMovesForPiece(board, 10, 10);
  assert.strictEqual(moves.length, 8);
  assert(moves.every((m) => Math.abs(m.to.r - 10) <= 1 && Math.abs(m.to.c - 10) <= 1));
}

// --- 量産型ザフ(斜め4方向に直進・自駒/味方駒でブロック・敵駒は着地のみ捕獲) ---
{
  const board = emptyBoard();
  board[8][8] = { seat: 0, type: 'zafu' };
  const free = L.generateMovesForPiece(board, 8, 8);
  // 右下方向(dr=1,dc=1)に何マス進めるか(中央7x7盤の範囲内、(11,11)まで)
  const downRight = free.filter((m) => m.to.r > 8 && m.to.c > 8 && (m.to.r - 8) === (m.to.c - 8));
  assert.strictEqual(downRight.length, 3);
}
{
  const board = emptyBoard();
  board[8][8] = { seat: 0, type: 'zafu' };
  board[10][10] = { seat: 0, type: 'tequila' }; // 自駒でブロック
  const moves = L.generateMovesForPiece(board, 8, 8);
  const downRight = moves.filter((m) => m.to.r > 8 && m.to.c > 8 && (m.to.r - 8) === (m.to.c - 8)).map((m) => m.to.r);
  assert.deepStrictEqual(downRight.sort(), [9]);
}
{
  const board = emptyBoard();
  board[8][8] = { seat: 0, type: 'zafu' };
  board[10][10] = { seat: 2, type: 'tequila' }; // 敵駒: 着地のみ捕獲、その先には進めない
  const moves = L.generateMovesForPiece(board, 8, 8);
  const downRight = moves.filter((m) => m.to.r > 8 && m.to.c > 8 && (m.to.r - 8) === (m.to.c - 8)).map((m) => m.to.r).sort();
  assert.deepStrictEqual(downRight, [10, 9]); // Array#sort既定は文字列比較のため "10" < "9"
  assert.deepStrictEqual(moves.find((m) => m.to.r === 10 && m.to.c === 10).capture, { seat: 2, type: 'tequila' });
}

// --- 斜め移動は十字の外側(4隅の無効マス)で完全に遮られる(素通りしない) ---
{
  const board = emptyBoard();
  // 北の腕の右上角(0,11)から右下方向(dr=1,dc=1)は(1,12)が無効マス(十字の外側)なので、
  // その先の東の腕の角(5,16)までは届かず、この方向には1マスも進めない。
  assert.strictEqual(L.isValidSquare(1, 12), false);
  assert.strictEqual(L.isValidSquare(5, 16), true);
  board[0][11] = { seat: 0, type: 'zafu' };
  const moves = L.generateMovesForPiece(board, 0, 11);
  assert(!moves.some((m) => m.to.r === 5 && m.to.c === 16));
  assert(!moves.some((m) => m.to.r === 1 && m.to.c === 12));
}

// --- ドドンドンドドン(前方直進のみ)。座席ごとに前方が異なることを確認 ---
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'lance' }; // 北: 前方=南(行+)
  const moves = L.generateMovesForPiece(board, 10, 10);
  assert(moves.every((m) => m.to.c === 10 && m.to.r > 10));
  assert(moves.length >= 3);
}
{
  const board = emptyBoard();
  board[10][10] = { seat: 1, type: 'lance' }; // 東: 前方=西(列-)
  const moves = L.generateMovesForPiece(board, 10, 10);
  assert(moves.every((m) => m.to.r === 10 && m.to.c < 10));
  assert(moves.length >= 3);
}

// --- スチーム(金)・シューズ(銀): 前方3+左右+後方(金) / 前方3+斜め後方2(銀) ---
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'gold' }; // 北: 前方=南(行+)
  const targets = L.generateMovesForPiece(board, 10, 10).map((m) => (m.to.r - 10) + ':' + (m.to.c - 10)).sort();
  assert.deepStrictEqual(targets, ['-1:0', '0:-1', '0:1', '1:-1', '1:0', '1:1']); // 前方3+左右+後方(斜め後方は含まない)
}
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'silver' };
  const targets = L.generateMovesForPiece(board, 10, 10).map((m) => (m.to.r - 10) + ':' + (m.to.c - 10)).sort();
  assert.deepStrictEqual(targets, ['-1:-1', '-1:1', '1:-1', '1:0', '1:1']); // 前方3+斜め後方2(左右・真後ろは含まない)
}

// --- 抹茶あずきーな(直交4方向1マス)・OL(斜め4方向1マス) ---
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'matcha' };
  const targets = L.generateMovesForPiece(board, 10, 10).map((m) => (m.to.r - 10) + ':' + (m.to.c - 10)).sort();
  assert.deepStrictEqual(targets, ['-1:0', '0:-1', '0:1', '1:0']);
}
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'ol' };
  const targets = L.generateMovesForPiece(board, 10, 10).map((m) => (m.to.r - 10) + ':' + (m.to.c - 10)).sort();
  assert.deepStrictEqual(targets, ['-1:-1', '-1:1', '1:-1', '1:1']);
}

// --- コダクサン(前方2マス先へジャンプ、間のマスは無視) ---
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'kodakusan' }; // 北: 前方=南
  board[11][10] = { seat: 0, type: 'tequila' }; // 間のマスに自駒があってもジャンプできる
  const moves = L.generateMovesForPiece(board, 10, 10);
  assert.strictEqual(moves.length, 1);
  assert.deepStrictEqual(moves[0].to, { r: 12, c: 10 });
}
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'kodakusan' };
  board[12][10] = { seat: 0, type: 'tequila' }; // 着地先に自駒があれば不可
  assert.strictEqual(L.generateMovesForPiece(board, 10, 10).length, 0);
}

// --- テキーラ(前方1マスのみ) ---
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'tequila' };
  const moves = L.generateMovesForPiece(board, 10, 10);
  assert.strictEqual(moves.length, 1);
  assert.deepStrictEqual(moves[0].to, { r: 11, c: 10 });
}

// --- OTL合体(ファンブログに明記): OLが敵味方問わずテキーラのマスに入るとOTLになる。
//     味方(自分含む)のテキーラへは通常なら進入不可なところをこの合体だけ例外的に許可。敵のテキーラは
//     通常の捕獲だがこちらもOTLになる。テキーラ側からOLへ合体する動きはない。 ---
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'ol' };
  board[9][9] = { seat: 0, type: 'tequila' }; // 自分自身のテキーラ
  const merge = L.generateMovesForPiece(board, 10, 10).find((m) => m.to.r === 9 && m.to.c === 9);
  assert.strictEqual(merge.merge, 'otl');
  const result = L.applyMove(state(board, fourSeats()), 0, { r: 10, c: 10 }, { r: 9, c: 9 });
  assert.strictEqual(result.applied, true);
  assert.deepStrictEqual(result.state.board[9][9], { seat: 0, type: 'otl' });
  assert.strictEqual(result.state.board[10][10], null);
  assert.strictEqual(result.state.lastMove.merged, true);
}
{
  // 味方(別座席、seat1はseat0のチームメイト)のテキーラへも例外的に進入でき、OTLになる
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'ol' };
  board[9][9] = { seat: 1, type: 'tequila' };
  const merge = L.generateMovesForPiece(board, 10, 10).find((m) => m.to.r === 9 && m.to.c === 9);
  assert.strictEqual(merge.merge, 'otl');
  assert.strictEqual(merge.capture, null); // 味方の駒なので捕獲ではない
}
{
  // 敵(seat2、チームB)のテキーラは通常通り捕獲しつつ、OTLにもなる
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'ol' };
  board[9][9] = { seat: 2, type: 'tequila' };
  const move = L.generateMovesForPiece(board, 10, 10).find((m) => m.to.r === 9 && m.to.c === 9);
  assert.strictEqual(move.merge, 'otl');
  assert.deepStrictEqual(move.capture, { seat: 2, type: 'tequila' });
  const result = L.applyMove(state(board, fourSeats()), 0, { r: 10, c: 10 }, { r: 9, c: 9 });
  assert.deepStrictEqual(result.state.board[9][9], { seat: 0, type: 'otl' });
}
{
  // テキーラ側からOLのマスへ合体する動きはない(OL主体の合体のみ)
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'tequila' }; // 前方1マスのみ動けるテキーラ
  board[11][10] = { seat: 1, type: 'ol' }; // 前方に味方のOL
  const moves = L.generateMovesForPiece(board, 10, 10);
  assert.strictEqual(moves.length, 0); // 味方マスなので進入不可、合体もしない
}

// --- OTLの移動(千鳥足): 前方3マス先の右または左へ、左→中央→右(またはその逆)の経路を通る。
//     経路上(中間点)に駒があると、その方向へは移動できない。 ---
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'otl' }; // 北: 前方=南(行+)、右=西(列-)
  const moves = L.generateMovesForPiece(board, 10, 10);
  const targets = moves.map((m) => m.to.r + ':' + m.to.c).sort();
  assert.deepStrictEqual(targets, ['13:11', '13:9']); // 3マス先の左右(f=3,r=±1 → 行13、列9または11。文字列sortの順)
}
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'otl' };
  board[11][9] = { seat: 0, type: 'tequila' }; // (13,11)行きの経路の1歩目を自駒で塞ぐ
  const moves = L.generateMovesForPiece(board, 10, 10);
  const targets = moves.map((m) => m.to.r + ':' + m.to.c).sort();
  assert.deepStrictEqual(targets, ['13:9']); // (13,11)行きだけ塞がれ、(13,9)行きは無事
}
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'otl' };
  board[12][10] = { seat: 2, type: 'tequila' }; // 中央の中間点(2歩目)を敵駒で塞ぐ(両方向とも通る点)
  const moves = L.generateMovesForPiece(board, 10, 10);
  assert.strictEqual(moves.length, 0); // 両方向とも経路上に駒があるため移動不可
}

// --- applyMove: 不正な手の拒否 ---
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'tequila' };
  const s = state(board, fourSeats(), { activeSeatIndex: 0 });
  assert.strictEqual(L.applyMove(s, 1, { r: 10, c: 10 }, { r: 11, c: 10 }).reason, 'not-your-turn');
  assert.strictEqual(L.applyMove(s, 0, { r: 0, c: 10 }, { r: 1, c: 10 }).reason, 'not-your-piece');
  assert.strictEqual(L.applyMove(s, 0, { r: 10, c: 10 }, { r: 12, c: 10 }).reason, 'illegal-destination');
  const eliminatedActive = state(board, fourSeats({ 0: { eliminated: true } }), { activeSeatIndex: 0 });
  assert.strictEqual(L.applyMove(eliminatedActive, 0, { r: 10, c: 10 }, { r: 11, c: 10 }).reason, 'seat-eliminated');
  const overState = state(board, fourSeats(), { activeSeatIndex: 0, phase: 'result' });
  assert.strictEqual(L.applyMove(overState, 0, { r: 10, c: 10 }, { r: 11, c: 10 }).reason, 'game-over');
}

// --- eliminateSeat / checkWinner ---
{
  const board = emptyBoard();
  board[0][8] = { seat: 0, type: 'king' };
  board[4][8] = { seat: 0, type: 'tequila' };
  board[8][16] = { seat: 1, type: 'king' };
  const s = state(board, fourSeats());
  L.eliminateSeat(s, 0);
  assert.strictEqual(s.board[0][8], null);
  assert.strictEqual(s.board[4][8], null);
  assert.strictEqual(s.board[8][16].seat, 1);
  assert.strictEqual(s.seats[0].eliminated, true);
}
assert.strictEqual(L.checkWinner(state(emptyBoard(), fourSeats({ 0: { eliminated: true } }))), null);
assert.strictEqual(L.checkWinner(state(emptyBoard(), fourSeats({ 0: { eliminated: true }, 2: { eliminated: true } }))), null); // 0・2は別チームなのでまだ決着しない
assert.strictEqual(L.checkWinner(state(emptyBoard(), fourSeats({ 0: { eliminated: true }, 1: { eliminated: true } }))), 'B'); // チームA(0・1)が全滅
assert.strictEqual(L.checkWinner(state(emptyBoard(), fourSeats({ 2: { eliminated: true }, 3: { eliminated: true } }))), 'A'); // チームB(2・3)が全滅

// --- applyMove: 王将捕獲 → 脱落カスケード → 勝利判定 ---
// 座席0(北,チームA)が座席2(南,チームB)の王将を捕獲する。座席3(西,チームB)は事前に脱落済みなので、
// これでチームB(2・3)が両方脱落しチームAの勝利になる。
{
  const board = emptyBoard();
  board[4][8] = { seat: 0, type: 'king' };
  board[5][8] = { seat: 2, type: 'king' };
  board[8][16] = { seat: 2, type: 'tequila' }; // 遠く離れた駒もカスケードで消える
  const seats = fourSeats({ 3: { eliminated: true } });
  const s = state(board, seats, { activeSeatIndex: 0, turnCount: 5, version: 2 });
  const result = L.applyMove(s, 0, { r: 4, c: 8 }, { r: 5, c: 8 });
  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.state.phase, 'result');
  assert.strictEqual(result.state.winner, 'A');
  assert.strictEqual(result.state.seats[2].eliminated, true);
  assert.strictEqual(result.state.board[8][16], null);
  assert.strictEqual(result.state.lastMove.eliminatedSeat, 2);
}

// --- デッドエクストリームアタック: コダクサン捕獲で最も近い自分のザフが強化される ---
// 座席0(チームA)が座席2(チームB)のコダクサンを捕獲 → 座席2の残りザフのうち近い方が強化される。
{
  const board = emptyBoard();
  board[4][8] = { seat: 0, type: 'lance' }; // これでコダクサンを捕獲する(直進で届く位置)
  board[7][8] = { seat: 2, type: 'kodakusan' };
  board[7][6] = { seat: 2, type: 'zafu' }; // 近い方
  board[0][6] = { seat: 2, type: 'zafu' }; // 遠い方
  const s = state(board, fourSeats(), { activeSeatIndex: 0 });
  const result = L.applyMove(s, 0, { r: 4, c: 8 }, { r: 7, c: 8 });
  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.state.board[7][6].type, 'zafu-boosted'); // 近い方が強化される
  assert.strictEqual(result.state.board[0][6].type, 'zafu'); // 遠い方はそのまま
  assert.deepStrictEqual(result.state.lastMove.deadExtremeAttack, { r: 7, c: 6 });
}

// --- サイレントダブルアーツ(独自ルール): 移動の結果として自分のザフとテキーラが隣接すると保留され、
//     次にその席の手番が来た時点でまだ隣接していれば自動的に合体して「ダブルアーツ」になる ---
{
  const s = { board: emptyBoard(), pendingDoubleArts: [] };
  s.board[8][8] = { seat: 0, type: 'zafu' };
  s.board[8][9] = { seat: 0, type: 'tequila' };
  L.registerPendingDoubleArts(s, 0, { r: 8, c: 8 }, 'zafu');
  assert.strictEqual(s.pendingDoubleArts.length, 1);
  L.resolvePendingDoubleArts(s, 0);
  assert.deepStrictEqual(s.board[8][8], { seat: 0, type: 'double-arts' });
  assert.strictEqual(s.board[8][9], null); // テキーラは消える
  assert.strictEqual(s.pendingDoubleArts.length, 0);
}
{
  // 保留した後にテキーラがいなくなれば(捕獲など)、合体せず保留も消費される(次のチャンスはない)
  const s = { board: emptyBoard(), pendingDoubleArts: [] };
  s.board[8][8] = { seat: 0, type: 'zafu' };
  s.board[8][9] = { seat: 0, type: 'tequila' };
  L.registerPendingDoubleArts(s, 0, { r: 8, c: 8 }, 'zafu');
  s.board[8][9] = null;
  L.resolvePendingDoubleArts(s, 0);
  assert.deepStrictEqual(s.board[8][8], { seat: 0, type: 'zafu' });
  assert.strictEqual(s.pendingDoubleArts.length, 0);
}
{
  // 陣形配置など、移動を経ずに隣接しているだけでは発動しない(必ず移動が引き金)
  const s = { board: emptyBoard(), pendingDoubleArts: [] };
  s.board[8][8] = { seat: 0, type: 'zafu' };
  s.board[8][9] = { seat: 0, type: 'tequila' };
  L.resolvePendingDoubleArts(s, 0);
  assert.deepStrictEqual(s.board[8][8], { seat: 0, type: 'zafu' });
}
{
  // ダブルアーツの動き: 前方直進(香車と同じ)+斜め4方向1マス(OLと同じ)の合成
  const board = emptyBoard();
  board[8][8] = { seat: 0, type: 'double-arts' };
  const moves = L.generateMovesForPiece(board, 8, 8);
  const targets = moves.map((m) => (m.to.r - 8) + ':' + (m.to.c - 8));
  ['-1:-1', '-1:1', '1:-1', '1:1'].forEach((t) => assert(targets.includes(t))); // 斜め4方向1マス
  assert(moves.filter((m) => m.to.c === 8 && m.to.r > 8).length >= 2); // 前方(seat0は行+)へ複数マス直進できる
  assert(!moves.some((m) => m.to.c === 8 && m.to.r < 8)); // 後方への直進はできない
}
{
  // 実戦の流れ: 移動で隣接→他席の手番を挟む→自分の次の手番開始時に自動合体
  const board = emptyBoard();
  board[6][8] = { seat: 0, type: 'zafu' };
  board[8][10] = { seat: 0, type: 'tequila' };
  board[9][9] = { seat: 2, type: 'tequila' }; // 座席2の適当な駒(座席1・3は脱落済み)
  const seats = fourSeats({ 1: { eliminated: true }, 3: { eliminated: true } });
  let s = state(board, seats, { turnOrder: [0, 3, 2, 1], activeSeatIndex: 0 });
  const move1 = L.applyMove(s, 0, { r: 6, c: 8 }, { r: 7, c: 9 }); // ザフが斜めに進みテキーラへ隣接
  assert.strictEqual(move1.applied, true);
  s = move1.state;
  assert.strictEqual(s.activeSeatIndex, 2); // 座席1は脱落済みなのでスキップされ座席2の番になる
  assert.strictEqual(s.pendingDoubleArts.length, 1);
  const move2 = L.applyMove(s, 2, { r: 9, c: 9 }, { r: 8, c: 9 }); // 座席2の手番(自分には無関係)
  assert.strictEqual(move2.applied, true);
  s = move2.state;
  assert.strictEqual(s.activeSeatIndex, 0); // 座席3は脱落済みなのでスキップされ座席0に戻る
  assert.deepStrictEqual(s.board[7][9], { seat: 0, type: 'double-arts' }); // ここで自動合体している
  assert.strictEqual(s.board[8][10], null);
  assert.strictEqual(s.pendingDoubleArts.length, 0);
}

// --- 手数上限到達時の駒価値タイブレーク ---
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'tequila' };
  const s = state(board, fourSeats(), { activeSeatIndex: 0, turnCount: L.MAX_TURNS - 1 });
  const result = L.applyMove(s, 0, { r: 10, c: 10 }, { r: 11, c: 10 });
  assert.strictEqual(result.state.turnCount, L.MAX_TURNS);
  assert.strictEqual(result.state.phase, 'result');
}
{
  const board = emptyBoard();
  board[0][8] = { seat: 0, type: 'tequila' };
  board[16][8] = { seat: 2, type: 'tequila' };
  const resolved = L.resolveByPieceValue(state(board, fourSeats()));
  assert.strictEqual(resolved.drawn, true);
  assert.strictEqual(resolved.winner, null);
}

// --- 陣形: 3種×4座席、すべて14駒・自陣内・有効マスであること ---
Object.keys(L.FORMATIONS).forEach((idxKey) => {
  const idx = Number(idxKey);
  [0, 1, 2, 3].forEach((seatIndex) => {
    const placements = L.formationPlacements(seatIndex, idx);
    assert.strictEqual(placements.length, L.TOTAL_PIECES_PER_SEAT);
    const counts = {};
    placements.forEach((p) => {
      assert.strictEqual(L.isValidSquare(p.r, p.c), true);
      assert.strictEqual(L.isInOwnArm(seatIndex, p.r, p.c), true);
      counts[p.type] = (counts[p.type] || 0) + 1;
    });
    assert.deepStrictEqual(counts, L.PIECE_COUNTS);
    const cellKeys = new Set(placements.map((p) => p.r + ':' + p.c));
    assert.strictEqual(cellKeys.size, placements.length); // 重複マスなし
  });
});

// --- 配置フェーズ: canPlacePiece / addPlacement / removePlacement / isSetupComplete ---
{
  let placements = [];
  assert.strictEqual(L.canPlacePiece(placements, 0, 0, 10, 'king'), true);
  assert.strictEqual(L.canPlacePiece(placements, 0, 10, 10, 'king'), false); // 自陣外
  placements = L.addPlacement(placements, 0, 0, 10, 'king');
  assert.strictEqual(placements.length, 1);
  assert.strictEqual(L.canPlacePiece(placements, 0, 0, 10, 'tequila'), false); // 既に駒があるマス
  assert.strictEqual(L.canPlacePiece(placements, 0, 0, 11, 'king'), false); // 王将は既に1体使い切っている
  placements = L.removePlacement(placements, 0, 10);
  assert.strictEqual(placements.length, 0);
  assert.strictEqual(L.isSetupComplete(placements), false);
  const full = L.formationPlacements(0, 0);
  assert.strictEqual(L.isSetupComplete(full), true);
}
// --- 駒落ち(ファンブログに明記): ザフとテキーラは「まで」の駒なので、任意に減らして0個でもよい ---
{
  const mandatoryOnly = L.MANDATORY_PIECE_TYPES.map((type, index) => ({ r: 0, c: 8 + index, type }));
  assert.strictEqual(mandatoryOnly.length, 7);
  assert.strictEqual(L.isSetupComplete(mandatoryOnly), true); // ザフ0・テキーラ0でも成立する
  const missingOne = mandatoryOnly.slice(1); // 必須駒が1つ欠けていると不成立
  assert.strictEqual(L.isSetupComplete(missingOne), false);
}
{
  const allPlacements = [0, 1, 2, 3].map((seatIndex) => L.formationPlacements(seatIndex, 0));
  const board = L.buildBoardFromPlacements(allPlacements);
  let total = 0;
  board.forEach((row) => row.forEach((cell) => { if (cell) total += 1; }));
  assert.strictEqual(total, L.TOTAL_PIECES_PER_SEAT * 4);
}

// --- 座席ヘルパー ---
{
  const seats = L.assignSeat(L.createEmptySeats(), 0, 'human', 'peer-1', '太郎');
  assert.strictEqual(seats[0].name, '太郎'); assert.strictEqual(seats[0].team, 'A');
  let dup = L.assignSeat(L.createEmptySeats(), 0, 'human', 'dup', 'A');
  const rejected = L.assignSeat(dup, 1, 'human', 'dup', 'B');
  assert.strictEqual(rejected[1].kind, 'empty');
}
{
  let seats = L.assignSeat(L.createEmptySeats(), 0, 'human', 'peer-1', 'ホスト');
  seats = L.fillEmptySeatsWithCpu(seats);
  [1, 2, 3].forEach((i) => assert.strictEqual(seats[i].kind, 'cpu'));
}
assert.strictEqual(L.canStartMatch(L.createDefaultSeats()), true);
assert.strictEqual(L.canStartMatch(L.createEmptySeats()), false);

// --- createMatchState / buildMatchScoreboard / getMatchWinners ---
{
  const seats = L.createDefaultSeats();
  const allPlacements = [0, 1, 2, 3].map((seatIndex) => L.formationPlacements(seatIndex, 0));
  const ms = L.createMatchState(seats, allPlacements, () => 0); // rng=0でコイントスの最先手を座席0に固定
  assert.strictEqual(ms.phase, 'playing');
  assert.deepStrictEqual(ms.turnOrder, [0, 3, 2, 1]);
  assert.strictEqual(ms.activeSeatIndex, 0);
  let pieces = 0; ms.board.forEach((row) => row.forEach((c) => { if (c) pieces += 1; }));
  assert.strictEqual(pieces, L.TOTAL_PIECES_PER_SEAT * 4);
  const rows = L.buildMatchScoreboard({ A: 2, B: 1 }, ms.seats);
  assert.deepStrictEqual(rows.map((r) => r.rank), [1, 2]);
  assert.strictEqual(L.getMatchWinners(rows)[0].team, 'A');
}

// --- cpuFormationChoice: 0〜2の範囲 ---
{
  assert.strictEqual(L.cpuFormationChoice(() => 0), 0);
  assert.strictEqual(L.cpuFormationChoice(() => 0.99), 2);
}

// --- chooseCpuMove: 優先順位(勝利捕獲 > 高価値捕獲 > 危険回避 > ランダム) ---
const stubRng = () => 0;
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'ol' };
  board[9][9] = { seat: 2, type: 'tequila' }; // 通常捕獲(価値1)
  board[5][10] = { seat: 0, type: 'lance' };
  board[8][10] = { seat: 2, type: 'king' }; // これを取れば勝利
  const s = state(board, fourSeats());
  const move = L.chooseCpuMove(s, 0, stubRng);
  assert.deepStrictEqual(move.to, { r: 8, c: 10 });
  assert.strictEqual(move.capture.type, 'king');
}
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'ol' };
  board[9][9] = { seat: 2, type: 'tequila' }; // 価値1
  board[6][10] = { seat: 0, type: 'zafu' };
  board[7][11] = { seat: 2, type: 'zafu' }; // 価値4、こちらを優先
  const s = state(board, fourSeats());
  const move = L.chooseCpuMove(s, 0, stubRng);
  assert.deepStrictEqual(move.to, { r: 7, c: 11 });
}
{
  // 捕獲手がなく、自分の王将が危険な場合は安全なマスへ退避
  const board = emptyBoard();
  board[6][10] = { seat: 0, type: 'king' };
  board[6][7] = { seat: 2, type: 'zafu' }; // 王将から見て斜め方向、距離3以内
  const s = state(board, fourSeats());
  const move = L.chooseCpuMove(s, 0, stubRng);
  assert.deepStrictEqual(move.from, { r: 6, c: 10 });
  assert.strictEqual(L.isSquareThreatenedBy(board, s.seats, move.to.r, move.to.c, 'B'), false);
}
{
  const s = state(emptyBoard(), fourSeats());
  assert.strictEqual(L.chooseCpuMove(s, 0, stubRng), null);
}

console.log('All tests passed');
