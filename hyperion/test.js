'use strict';

const assert = require('assert');
const L = require('./logic.js');

function emptyBoard() { return L.createEmptyBoard(); }
function seat(seatIndex, overrides) { return Object.assign({ seatIndex, kind: 'human', playerId: 'p' + seatIndex, name: 'P' + seatIndex, team: L.TEAM_OF_SEAT(seatIndex), eliminated: false }, overrides || {}); }
function fourSeats(overrides) { return [0, 1, 2, 3].map((i) => seat(i, overrides && overrides[i])); }
function state(board, seats, extra) { return Object.assign({ board, seats, activeSeatIndex: 0, turnCount: 0, version: 0, phase: 'playing', winner: null, drawn: false, lastMove: null }, extra || {}); }

// --- 盤面「グランドクロス」: 189マス、4隅は無効 ---
{
  let count = 0;
  for (let r = 0; r < L.BOARD_DIM; r += 1) for (let c = 0; c < L.BOARD_DIM; c += 1) if (L.isValidSquare(r, c)) count += 1;
  assert.strictEqual(count, 189);
  assert.strictEqual(L.isValidSquare(0, 0), false); // 左上の隅(無効)
  assert.strictEqual(L.isValidSquare(0, 20), false); // 右上の隅(無効)
  assert.strictEqual(L.isValidSquare(20, 0), false); // 左下の隅(無効)
  assert.strictEqual(L.isValidSquare(20, 20), false); // 右下の隅(無効)
  assert.strictEqual(L.isValidSquare(10, 10), true); // 中央
  assert.strictEqual(L.isValidSquare(0, 10), true); // 北の腕の先端
  assert.strictEqual(L.isValidSquare(10, 20), true); // 東の腕の先端
  assert.strictEqual(L.isValidSquare(20, 10), true); // 南の腕の先端
  assert.strictEqual(L.isValidSquare(10, 0), true); // 西の腕の先端
}
assert.strictEqual(L.TEAM_OF_SEAT(0), 'A'); assert.strictEqual(L.TEAM_OF_SEAT(2), 'A');
assert.strictEqual(L.TEAM_OF_SEAT(1), 'B'); assert.strictEqual(L.TEAM_OF_SEAT(3), 'B');

// --- localToAbsolute: 各座席の自陣一番奥・中央(depth0,lateral2)が原点と一致するか ---
assert.deepStrictEqual(L.localToAbsolute(0, 0, 2), { r: 0, c: 10 });
assert.deepStrictEqual(L.localToAbsolute(1, 0, 2), { r: 10, c: 20 });
assert.deepStrictEqual(L.localToAbsolute(2, 0, 2), { r: 20, c: 10 });
assert.deepStrictEqual(L.localToAbsolute(3, 0, 2), { r: 10, c: 0 });
// depthを進めると盤中央側へ、lateralを増やすと「自分から見て右」へ動く
assert.deepStrictEqual(L.localToAbsolute(0, 6, 2), { r: 6, c: 10 }); // 北: depth+=盤中央方向(南=行+)
assert.deepStrictEqual(L.localToAbsolute(1, 6, 2), { r: 10, c: 14 }); // 東: depth+=盤中央方向(西=列-)

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
  board[10][10] = { seat: 0, type: 'zafu' };
  const free = L.generateMovesForPiece(board, 10, 10);
  // 右下方向(dr=1,dc=1)に何マス進めるか(中央7x7盤の範囲内、(13,13)まで)
  const downRight = free.filter((m) => m.to.r > 10 && m.to.c > 10 && (m.to.r - 10) === (m.to.c - 10));
  assert.strictEqual(downRight.length, 3);
}
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'zafu' };
  board[12][12] = { seat: 0, type: 'tequila' }; // 自駒でブロック
  const moves = L.generateMovesForPiece(board, 10, 10);
  const downRight = moves.filter((m) => m.to.r > 10 && m.to.c > 10 && (m.to.r - 10) === (m.to.c - 10)).map((m) => m.to.r);
  assert.deepStrictEqual(downRight.sort(), [11]);
}
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'zafu' };
  board[12][12] = { seat: 1, type: 'tequila' }; // 敵駒: 着地のみ捕獲、その先には進めない
  const moves = L.generateMovesForPiece(board, 10, 10);
  const downRight = moves.filter((m) => m.to.r > 10 && m.to.c > 10 && (m.to.r - 10) === (m.to.c - 10)).map((m) => m.to.r).sort();
  assert.deepStrictEqual(downRight, [11, 12]);
  assert.deepStrictEqual(moves.find((m) => m.to.r === 12 && m.to.c === 12).capture, { seat: 1, type: 'tequila' });
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

// --- OTL合体: 自分のOL⇔テキーラが同マスに入ると合体。味方(別座席)や敵とは合体しない ---
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'ol' };
  board[9][9] = { seat: 0, type: 'tequila' }; // 斜め1マスに自分のテキーラ
  const merge = L.generateMovesForPiece(board, 10, 10).find((m) => m.to.r === 9 && m.to.c === 9);
  assert.strictEqual(merge.merge, 'otl');
  const result = L.applyMove(state(board, fourSeats()), 0, { r: 10, c: 10 }, { r: 9, c: 9 });
  assert.strictEqual(result.applied, true);
  assert.deepStrictEqual(result.state.board[9][9], { seat: 0, type: 'otl' });
  assert.strictEqual(result.state.board[10][10], null);
  assert.strictEqual(result.state.lastMove.merged, true);
}
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'ol' };
  board[9][9] = { seat: 2, type: 'tequila' }; // 味方(別座席)のテキーラとは合体しない・移動もできない(味方マスはブロック)
  const merge = L.generateMovesForPiece(board, 10, 10).find((m) => m.to.r === 9 && m.to.c === 9);
  assert.strictEqual(merge, undefined);
}
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'ol' };
  board[9][9] = { seat: 1, type: 'tequila' }; // 敵のテキーラは通常通り捕獲
  const move = L.generateMovesForPiece(board, 10, 10).find((m) => m.to.r === 9 && m.to.c === 9);
  assert.strictEqual(move.merge, undefined);
  assert.deepStrictEqual(move.capture, { seat: 1, type: 'tequila' });
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
  board[0][10] = { seat: 0, type: 'king' };
  board[6][10] = { seat: 0, type: 'tequila' };
  board[10][20] = { seat: 1, type: 'king' };
  const s = state(board, fourSeats());
  L.eliminateSeat(s, 0);
  assert.strictEqual(s.board[0][10], null);
  assert.strictEqual(s.board[6][10], null);
  assert.strictEqual(s.board[10][20].seat, 1);
  assert.strictEqual(s.seats[0].eliminated, true);
}
assert.strictEqual(L.checkWinner(state(emptyBoard(), fourSeats({ 0: { eliminated: true } }))), null);
assert.strictEqual(L.checkWinner(state(emptyBoard(), fourSeats({ 0: { eliminated: true }, 2: { eliminated: true } }))), 'B');
assert.strictEqual(L.checkWinner(state(emptyBoard(), fourSeats({ 1: { eliminated: true }, 3: { eliminated: true } }))), 'A');

// --- applyMove: 王将捕獲 → 脱落カスケード → 勝利判定 ---
// 座席0(北,チームA)が座席1(東,チームB)の王将を捕獲する。座席3(西,チームB)は事前に脱落済みなので、
// これでチームB(1・3)が両方脱落しチームAの勝利になる。
{
  const board = emptyBoard();
  board[6][10] = { seat: 0, type: 'king' };
  board[6][11] = { seat: 1, type: 'king' };
  board[10][20] = { seat: 1, type: 'tequila' }; // 遠く離れた駒もカスケードで消える
  const seats = fourSeats({ 3: { eliminated: true } });
  const s = state(board, seats, { activeSeatIndex: 0, turnCount: 5, version: 2 });
  const result = L.applyMove(s, 0, { r: 6, c: 10 }, { r: 6, c: 11 });
  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.state.phase, 'result');
  assert.strictEqual(result.state.winner, 'A');
  assert.strictEqual(result.state.seats[1].eliminated, true);
  assert.strictEqual(result.state.board[10][20], null);
  assert.strictEqual(result.state.lastMove.eliminatedSeat, 1);
}

// --- デッドエクストリームアタック: コダクサン捕獲で最も近い自分のザフが強化される ---
// 座席0(チームA)が座席1(チームB)のコダクサンを捕獲 → 座席1の残りザフのうち近い方が強化される。
{
  const board = emptyBoard();
  board[6][10] = { seat: 0, type: 'lance' }; // これでコダクサンを捕獲する(直進で届く位置)
  board[9][10] = { seat: 1, type: 'kodakusan' };
  board[9][8] = { seat: 1, type: 'zafu' }; // 近い方
  board[0][8] = { seat: 1, type: 'zafu' }; // 遠い方
  const s = state(board, fourSeats(), { activeSeatIndex: 0 });
  const result = L.applyMove(s, 0, { r: 6, c: 10 }, { r: 9, c: 10 });
  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.state.board[9][8].type, 'zafu-boosted'); // 近い方が強化される
  assert.strictEqual(result.state.board[0][8].type, 'zafu'); // 遠い方はそのまま
  assert.deepStrictEqual(result.state.lastMove.deadExtremeAttack, { r: 9, c: 8 });
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
  board[0][10] = { seat: 0, type: 'tequila' };
  board[20][10] = { seat: 1, type: 'tequila' };
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
  const ms = L.createMatchState(seats, allPlacements);
  assert.strictEqual(ms.phase, 'playing');
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
  board[9][9] = { seat: 1, type: 'tequila' }; // 通常捕獲(価値1)
  board[5][10] = { seat: 0, type: 'lance' };
  board[8][10] = { seat: 1, type: 'king' }; // これを取れば勝利
  const s = state(board, fourSeats());
  const move = L.chooseCpuMove(s, 0, stubRng);
  assert.deepStrictEqual(move.to, { r: 8, c: 10 });
  assert.strictEqual(move.capture.type, 'king');
}
{
  const board = emptyBoard();
  board[10][10] = { seat: 0, type: 'ol' };
  board[9][9] = { seat: 1, type: 'tequila' }; // 価値1
  board[6][10] = { seat: 0, type: 'zafu' };
  board[7][11] = { seat: 1, type: 'zafu' }; // 価値4、こちらを優先
  const s = state(board, fourSeats());
  const move = L.chooseCpuMove(s, 0, stubRng);
  assert.deepStrictEqual(move.to, { r: 7, c: 11 });
}
{
  // 捕獲手がなく、自分の王将が危険な場合は安全なマスへ退避
  const board = emptyBoard();
  board[6][10] = { seat: 0, type: 'king' };
  board[6][7] = { seat: 1, type: 'zafu' }; // 王将から見て斜め方向、距離3以内
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
