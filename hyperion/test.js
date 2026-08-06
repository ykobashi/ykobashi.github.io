'use strict';

const assert = require('assert');
const L = require('./logic.js');

function emptyBoard() { return Array.from({ length: 8 }, () => Array(8).fill(null)); }
function seat(seatIndex, overrides) { return Object.assign({ seatIndex, kind: 'human', playerId: 'p' + seatIndex, name: 'P' + seatIndex, team: L.TEAM_OF_SEAT(seatIndex), eliminated: false }, overrides || {}); }
function fourSeats(overrides) { return [0, 1, 2, 3].map((i) => seat(i, overrides && overrides[i])); }
function state(board, seats, extra) { return Object.assign({ board, seats, activeSeatIndex: 0, turnCount: 0, version: 0, phase: 'playing', winner: null, drawn: false, lastMove: null }, extra || {}); }

// --- 初期配置 ---
const initial = L.createInitialBoard();
let pieceCount = 0;
const perSeatCount = [0, 0, 0, 0];
initial.forEach((row) => row.forEach((cell) => { if (cell) { pieceCount += 1; perSeatCount[cell.seat] += 1; } }));
assert.strictEqual(pieceCount, 24);
assert.deepStrictEqual(perSeatCount, [6, 6, 6, 6]);
[0, 1, 2, 3].forEach((seatIndex) => {
  const cells = [];
  initial.forEach((row, r) => row.forEach((cell, c) => { if (cell && cell.seat === seatIndex) cells.push({ r, c, type: cell.type }); }));
  assert.strictEqual(cells.filter((c) => c.type === 'abrashimovich').length, 1);
  assert.strictEqual(cells.filter((c) => c.type === 'zafu').length, 2);
  assert.strictEqual(cells.filter((c) => c.type === 'hei').length, 3);
});
assert.strictEqual(L.TEAM_OF_SEAT(0), 'A');
assert.strictEqual(L.TEAM_OF_SEAT(2), 'A');
assert.strictEqual(L.TEAM_OF_SEAT(1), 'B');
assert.strictEqual(L.TEAM_OF_SEAT(3), 'B');

// --- アブラシモビッチの移動(1マス8方向) ---
{
  const board = emptyBoard();
  board[3][3] = { seat: 0, type: 'abrashimovich' };
  const moves = L.pieceMovesAbrashimovich(board, 3, 3, 0);
  assert.strictEqual(moves.length, 8);
  assert(moves.every((m) => Math.abs(m.to.r - 3) <= 1 && Math.abs(m.to.c - 3) <= 1));
}

// --- 兵の移動(1マス直交4方向のみ) ---
{
  const board = emptyBoard();
  board[3][3] = { seat: 0, type: 'hei' };
  const moves = L.pieceMovesHei(board, 3, 3, 0);
  assert.strictEqual(moves.length, 4);
  const targets = moves.map((m) => m.to.r + ':' + m.to.c).sort();
  assert.deepStrictEqual(targets, ['2:3', '3:2', '3:4', '4:3']);
}

// --- 座布(ザフ)の移動: 射程3、自駒/味方駒でブロック、捕獲後は止まる ---
{
  // 射程3と4の境界
  const board = emptyBoard();
  board[0][0] = { seat: 0, type: 'zafu' };
  const moves = L.pieceMovesZafu(board, 0, 0, 0);
  assert(moves.some((m) => m.to.r === 0 && m.to.c === 3));
  assert(!moves.some((m) => m.to.r === 0 && m.to.c === 4));
}
{
  // 自駒でブロック(自駒の手前までしか進めず、自駒は捕獲対象にならない)
  const board = emptyBoard();
  board[0][0] = { seat: 0, type: 'zafu' };
  board[0][2] = { seat: 0, type: 'hei' };
  const moves = L.pieceMovesZafu(board, 0, 0, 0);
  const rightMoves = moves.filter((m) => m.to.r === 0).map((m) => m.to.c);
  assert.deepStrictEqual(rightMoves.sort(), [1]);
}
{
  // 味方(別座席・同チーム)の駒でブロック
  const board = emptyBoard();
  board[0][0] = { seat: 0, type: 'zafu' };
  board[0][2] = { seat: 2, type: 'hei' }; // seat2はseat0とチームA
  const moves = L.pieceMovesZafu(board, 0, 0, 0);
  const rightMoves = moves.filter((m) => m.to.r === 0).map((m) => m.to.c);
  assert.deepStrictEqual(rightMoves.sort(), [1]);
}
{
  // 敵駒は着地マスでのみ捕獲でき、その先には進めない
  const board = emptyBoard();
  board[0][0] = { seat: 0, type: 'zafu' };
  board[0][2] = { seat: 1, type: 'hei' }; // seat1は敵チームB
  const moves = L.pieceMovesZafu(board, 0, 0, 0);
  const rightMoves = moves.filter((m) => m.to.r === 0).map((m) => m.to.c).sort();
  assert.deepStrictEqual(rightMoves, [1, 2]);
  const captureMove = moves.find((m) => m.to.r === 0 && m.to.c === 2);
  assert.deepStrictEqual(captureMove.capture, { seat: 1, type: 'hei' });
}

// --- isLegalMove ---
{
  const board = emptyBoard();
  board[3][3] = { seat: 0, type: 'hei' };
  assert.strictEqual(L.isLegalMove(board, 0, { r: 3, c: 3 }, { r: 2, c: 3 }), true);
  assert.strictEqual(L.isLegalMove(board, 0, { r: 3, c: 3 }, { r: 2, c: 2 }), false); // 兵は斜め不可
  assert.strictEqual(L.isLegalMove(board, 1, { r: 3, c: 3 }, { r: 2, c: 3 }), false); // 他人の駒
}

// --- applyMove: 不正な手の拒否 ---
{
  const board = emptyBoard();
  board[3][3] = { seat: 0, type: 'hei' };
  const s = state(board, fourSeats(), { activeSeatIndex: 0 });
  const wrongTurn = L.applyMove(s, 1, { r: 3, c: 3 }, { r: 2, c: 3 });
  assert.strictEqual(wrongTurn.applied, false);
  assert.strictEqual(wrongTurn.reason, 'not-your-turn');
  assert.strictEqual(wrongTurn.state, s); // 元のstateがそのまま返る

  const notMyPiece = L.applyMove(s, 0, { r: 0, c: 0 }, { r: 0, c: 1 });
  assert.strictEqual(notMyPiece.applied, false);
  assert.strictEqual(notMyPiece.reason, 'not-your-piece');

  const illegal = L.applyMove(s, 0, { r: 3, c: 3 }, { r: 2, c: 2 });
  assert.strictEqual(illegal.applied, false);
  assert.strictEqual(illegal.reason, 'illegal-destination');

  const eliminatedActive = state(board, fourSeats({ 0: { eliminated: true } }), { activeSeatIndex: 0 });
  const rejected = L.applyMove(eliminatedActive, 0, { r: 3, c: 3 }, { r: 2, c: 3 });
  assert.strictEqual(rejected.applied, false);
  assert.strictEqual(rejected.reason, 'seat-eliminated');

  const overState = state(board, fourSeats(), { activeSeatIndex: 0, phase: 'result' });
  const overResult = L.applyMove(overState, 0, { r: 3, c: 3 }, { r: 2, c: 3 });
  assert.strictEqual(overResult.applied, false);
  assert.strictEqual(overResult.reason, 'game-over');
}

// --- eliminateSeat: アブラシモビッチ捕獲でその座席の残り駒を全除去 ---
{
  const board = emptyBoard();
  board[0][0] = { seat: 0, type: 'abrashimovich' };
  board[5][5] = { seat: 0, type: 'hei' };
  board[6][6] = { seat: 1, type: 'hei' };
  const s = state(board, fourSeats());
  L.eliminateSeat(s, 0);
  assert.strictEqual(s.board[0][0], null);
  assert.strictEqual(s.board[5][5], null);
  assert.strictEqual(s.board[6][6].seat, 1); // 無関係の座席は影響を受けない
  assert.strictEqual(s.seats[0].eliminated, true);
}

// --- checkWinner: 対角チームの両方が脱落した時だけ発火 ---
{
  assert.strictEqual(L.checkWinner(state(emptyBoard(), fourSeats({ 0: { eliminated: true } }))), null);
  assert.strictEqual(L.checkWinner(state(emptyBoard(), fourSeats({ 0: { eliminated: true }, 2: { eliminated: true } }))), 'B');
  assert.strictEqual(L.checkWinner(state(emptyBoard(), fourSeats({ 1: { eliminated: true }, 3: { eliminated: true } }))), 'A');
}

// --- applyMove: アブラシモビッチ捕獲 → 脱落カスケード → 勝利判定まで一気通貫 ---
{
  const board = emptyBoard();
  board[3][3] = { seat: 0, type: 'abrashimovich' };
  board[3][4] = { seat: 3, type: 'abrashimovich' };
  board[5][5] = { seat: 3, type: 'hei' }; // 遠く離れた駒もカスケードで消えることを確認
  const seats = fourSeats({ 1: { eliminated: true } }); // チームBの片割れは事前に脱落済み
  const s = state(board, seats, { activeSeatIndex: 0, turnCount: 5, version: 2 });
  const result = L.applyMove(s, 0, { r: 3, c: 3 }, { r: 3, c: 4 });
  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.state.phase, 'result');
  assert.strictEqual(result.state.winner, 'A');
  assert.strictEqual(result.state.drawn, false);
  assert.strictEqual(result.state.seats[3].eliminated, true);
  assert.strictEqual(result.state.board[5][5], null);
  assert.deepStrictEqual(result.state.board[3][4], { seat: 0, type: 'abrashimovich' });
  assert.strictEqual(result.state.board[3][3], null);
  assert.strictEqual(result.state.version, 3);
  assert.strictEqual(result.state.turnCount, 6);
  assert.strictEqual(result.state.lastMove.eliminatedSeat, 3);
  // 元のstateは変更されない(イミュータブル)
  assert.strictEqual(s.phase, 'playing');
  assert.strictEqual(s.board[3][3].seat, 0);
}

// --- advanceTurn: 脱落した座席・合法手のない座席をスキップ ---
{
  const board = emptyBoard();
  board[0][0] = { seat: 2, type: 'abrashimovich' }; // 3方向とも味方に囲まれ身動きできない
  board[0][1] = { seat: 0, type: 'hei' };
  board[1][0] = { seat: 0, type: 'hei' };
  board[1][1] = { seat: 0, type: 'hei' };
  board[6][6] = { seat: 3, type: 'hei' }; // seat3は動ける
  const seats = fourSeats({ 1: { eliminated: true } });
  const s = state(board, seats, { activeSeatIndex: 0 });
  L.advanceTurn(s);
  assert.strictEqual(s.activeSeatIndex, 3); // 1(脱落)と2(合法手なし)をスキップ
}

// --- 手数上限到達時の駒価値タイブレーク ---
{
  const board = emptyBoard();
  board[3][3] = { seat: 0, type: 'hei' };
  board[3][4] = { seat: 1, type: 'hei' }; // これを捕獲する
  board[0][0] = { seat: 0, type: 'zafu' };
  board[7][7] = { seat: 2, type: 'abrashimovich' };
  board[6][0] = { seat: 3, type: 'zafu' };
  const s = state(board, fourSeats(), { activeSeatIndex: 0, turnCount: L.MAX_TURNS - 1, version: 10 });
  const result = L.applyMove(s, 0, { r: 3, c: 3 }, { r: 3, c: 4 });
  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.state.turnCount, L.MAX_TURNS);
  assert.strictEqual(result.state.phase, 'result');
  // チームA: hei(1)+zafu(2)+abrashimovich(3)=6, チームB: 0 (seat1のheiは捕獲されて消滅)
  assert.strictEqual(result.state.winner, 'A');
  assert.strictEqual(result.state.drawn, false);
}
{
  // 完全同値なら引き分け
  const board = emptyBoard();
  board[0][0] = { seat: 0, type: 'hei' };
  board[7][7] = { seat: 1, type: 'hei' };
  const s = state(board, fourSeats());
  const resolved = L.resolveByPieceValue(s);
  assert.strictEqual(resolved.phase, 'result');
  assert.strictEqual(resolved.winner, null);
  assert.strictEqual(resolved.drawn, true);
}

// --- chooseCpuMove: 優先順位(勝利捕獲 > 高価値捕獲 > 危険回避 > ランダム) ---
const stubRng = () => 0; // Math.floor(0*n)===0 で常に配列の先頭を選ぶ
{
  // 勝利捕獲が最優先(通常捕獲も同時に選べる状況でも勝利捕獲を選ぶ)
  const board = emptyBoard();
  board[3][3] = { seat: 0, type: 'zafu' };
  board[3][4] = { seat: 1, type: 'hei' }; // 通常捕獲(価値1)も可能
  board[5][5] = { seat: 0, type: 'hei' };
  board[5][6] = { seat: 1, type: 'abrashimovich' }; // これを捕獲すれば勝利
  const s = state(board, fourSeats());
  const move = L.chooseCpuMove(s, 0, stubRng);
  assert.deepStrictEqual(move.to, { r: 5, c: 6 });
  assert.strictEqual(move.capture.type, 'abrashimovich');
}
{
  // 勝利捕獲がない場合は最も価値の高い捕獲を選ぶ
  const board = emptyBoard();
  board[2][2] = { seat: 0, type: 'hei' };
  board[2][3] = { seat: 1, type: 'hei' }; // 価値1
  board[4][4] = { seat: 0, type: 'zafu' };
  board[4][5] = { seat: 1, type: 'zafu' }; // 価値2
  const s = state(board, fourSeats());
  const move = L.chooseCpuMove(s, 0, stubRng);
  assert.deepStrictEqual(move.to, { r: 4, c: 5 });
  assert.strictEqual(move.capture.type, 'zafu');
}
{
  // 捕獲手がなく、自分のアブラシモビッチが危険な場合は安全なマスへ退避
  const board = emptyBoard();
  board[3][3] = { seat: 0, type: 'abrashimovich' };
  board[3][0] = { seat: 1, type: 'zafu' }; // 同じ行、距離3以内で(3,3)を狙える
  const s = state(board, fourSeats());
  assert.strictEqual(L.isSquareThreatenedBy(board, s.seats, 3, 3, 'B'), true);
  const move = L.chooseCpuMove(s, 0, stubRng);
  assert.deepStrictEqual(move.from, { r: 3, c: 3 });
  assert.deepStrictEqual(move.to, { r: 2, c: 2 }); // DIRS_8先頭の安全マス
  assert.strictEqual(L.isSquareThreatenedBy(board, s.seats, move.to.r, move.to.c, 'B'), false);
}
{
  // 捕獲も危険もなければ合法手の中からランダム(rng=0なら生成順の先頭)を選ぶ
  const board = emptyBoard();
  board[3][3] = { seat: 0, type: 'hei' };
  const s = state(board, fourSeats());
  const expected = L.generateAllMovesForSeat(board, s.seats, 0)[0];
  const move = L.chooseCpuMove(s, 0, stubRng);
  assert.deepStrictEqual(move, expected);
}
{
  // 動ける駒が一つもなければnull
  const s = state(emptyBoard(), fourSeats());
  assert.strictEqual(L.chooseCpuMove(s, 0, stubRng), null);
}

// --- 座席ヘルパー ---
{
  const seats = L.assignSeat(L.createEmptySeats(), 0, 'human', 'peer-1', '太郎');
  assert.strictEqual(seats[0].kind, 'human');
  assert.strictEqual(seats[0].name, '太郎');
  assert.strictEqual(seats[0].team, 'A');

  const blankName = L.assignSeat(L.createEmptySeats(), 1, 'human', 'peer-2', '  ');
  assert.strictEqual(blankName[1].name, 'プレイヤー2');

  const cpuSeat = L.assignSeat(L.createEmptySeats(), 2, 'cpu', null, '');
  assert.strictEqual(cpuSeat[2].kind, 'cpu');
  assert(cpuSeat[2].playerId);
  assert.strictEqual(cpuSeat[2].name, 'CPU3');

  // 重複するplayerIdへの割り当ては拒否され、元の配列が返る
  let seatsWithDup = L.assignSeat(L.createEmptySeats(), 0, 'human', 'dup', 'A');
  const rejected = L.assignSeat(seatsWithDup, 1, 'human', 'dup', 'B');
  assert.strictEqual(rejected[1].kind, 'empty');

  const cleared = L.assignSeat(seatsWithDup, 0, 'empty', null, '');
  assert.strictEqual(cleared[0].playerId, null);
  assert.strictEqual(cleared[0].name, '');
}
{
  let seats = L.assignSeat(L.createEmptySeats(), 0, 'human', 'peer-1', 'ホスト');
  seats = L.fillEmptySeatsWithCpu(seats);
  assert.strictEqual(seats[0].kind, 'human');
  assert.strictEqual(seats[0].name, 'ホスト');
  [1, 2, 3].forEach((i) => { assert.strictEqual(seats[i].kind, 'cpu'); assert(seats[i].playerId); });
}
{
  assert.strictEqual(L.canStartMatch(L.createDefaultSeats()), true);
  assert.strictEqual(L.canStartMatch(L.createEmptySeats()), false); // 空席が残っている
  const dupIds = L.createDefaultSeats().map((s, i) => (i === 1 ? { ...s, kind: 'human', playerId: 'local-0' } : s));
  assert.strictEqual(L.canStartMatch(dupIds), false); // playerId重複
  const missingId = L.createDefaultSeats().map((s, i) => (i === 1 ? { ...s, kind: 'human', playerId: null } : s));
  assert.strictEqual(L.canStartMatch(missingId), false); // human席なのにplayerIdなし
}

// --- createMatchState / buildMatchScoreboard / getMatchWinners ---
{
  const ms = L.createMatchState(L.createDefaultSeats());
  assert.strictEqual(ms.phase, 'playing');
  assert.strictEqual(ms.activeSeatIndex, 0);
  assert.strictEqual(ms.turnCount, 0);
  let pieces = 0; ms.board.forEach((row) => row.forEach((c) => { if (c) pieces += 1; }));
  assert.strictEqual(pieces, 24);

  const rows = L.buildMatchScoreboard({ A: 2, B: 1 }, ms.seats);
  assert.deepStrictEqual(rows.map((r) => r.rank), [1, 2]);
  assert.strictEqual(L.getMatchWinners(rows).length, 1);
  assert.strictEqual(L.getMatchWinners(rows)[0].team, 'A');
}

console.log('All tests passed');
