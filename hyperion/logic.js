// logic.js - ヒュペリオン 純粋関数ロジック(DOM操作なし)
//
// SKET DANCE作中では実際のルールは明かされていない架空のゲーム。判明している断片
// (4人零和有限確定完全情報ゲーム/2vs2チーム戦/「座布(ザフ)」という駒/「アブラシモビッチ」
// を失うと脱落しその時点の駒が全て除去される)を元に、AsobiLaboが独自に組み立てた
// 非公式の再現ルール。

const BOARD_SIZE = 8;
const SEAT_COUNT = 4;
const PIECE_VALUES = { abrashimovich: 3, zafu: 2, hei: 1 };
const ZAFU_RANGE = 3;
const MAX_TURNS = 120;

const DIRS_8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIRS_4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// 座席0=左上・1=右上・2=右下・3=左下(時計回り)。対角の相方がチーム(0,2=A / 1,3=B)。
function TEAM_OF_SEAT(seatIndex) { return seatIndex % 2 === 0 ? 'A' : 'B'; }

// 各座席6駒: 外周にアブラシモビッチ+ザフ2、内側にへい兵3。4隅すべて90度回転対称。
const SEAT_HOME_LAYOUT = [
  [ // seat 0: top-left
    { r: 0, c: 0, type: 'zafu' }, { r: 0, c: 1, type: 'abrashimovich' }, { r: 0, c: 2, type: 'zafu' },
    { r: 1, c: 0, type: 'hei' }, { r: 1, c: 1, type: 'hei' }, { r: 1, c: 2, type: 'hei' },
  ],
  [ // seat 1: top-right
    { r: 0, c: 5, type: 'zafu' }, { r: 0, c: 6, type: 'abrashimovich' }, { r: 0, c: 7, type: 'zafu' },
    { r: 1, c: 5, type: 'hei' }, { r: 1, c: 6, type: 'hei' }, { r: 1, c: 7, type: 'hei' },
  ],
  [ // seat 2: bottom-right
    { r: 7, c: 5, type: 'zafu' }, { r: 7, c: 6, type: 'abrashimovich' }, { r: 7, c: 7, type: 'zafu' },
    { r: 6, c: 5, type: 'hei' }, { r: 6, c: 6, type: 'hei' }, { r: 6, c: 7, type: 'hei' },
  ],
  [ // seat 3: bottom-left
    { r: 7, c: 0, type: 'zafu' }, { r: 7, c: 1, type: 'abrashimovich' }, { r: 7, c: 2, type: 'zafu' },
    { r: 6, c: 0, type: 'hei' }, { r: 6, c: 1, type: 'hei' }, { r: 6, c: 2, type: 'hei' },
  ],
];

function inBounds(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }

function createInitialBoard() {
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  SEAT_HOME_LAYOUT.forEach((pieces, seatIndex) => {
    pieces.forEach(({ r, c, type }) => { board[r][c] = { seat: seatIndex, type }; });
  });
  return board;
}
function cloneBoard(board) { return board.map((row) => row.map((cell) => (cell ? { ...cell } : null))); }
function cloneSeats(seats) { return seats.map((seat) => ({ ...seat })); }

function pieceMovesAbrashimovich(board, r, c, seatIndex) {
  const moves = [];
  DIRS_8.forEach(([dr, dc]) => {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) return;
    const target = board[nr][nc];
    if (!target) moves.push({ to: { r: nr, c: nc }, capture: null });
    else if (TEAM_OF_SEAT(target.seat) !== TEAM_OF_SEAT(seatIndex)) moves.push({ to: { r: nr, c: nc }, capture: { seat: target.seat, type: target.type } });
  });
  return moves;
}
function pieceMovesHei(board, r, c, seatIndex) {
  const moves = [];
  DIRS_4.forEach(([dr, dc]) => {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) return;
    const target = board[nr][nc];
    if (!target) moves.push({ to: { r: nr, c: nc }, capture: null });
    else if (TEAM_OF_SEAT(target.seat) !== TEAM_OF_SEAT(seatIndex)) moves.push({ to: { r: nr, c: nc }, capture: { seat: target.seat, type: target.type } });
  });
  return moves;
}
function pieceMovesZafu(board, r, c, seatIndex) {
  const moves = [];
  DIRS_8.forEach(([dr, dc]) => {
    for (let step = 1; step <= ZAFU_RANGE; step += 1) {
      const nr = r + dr * step, nc = c + dc * step;
      if (!inBounds(nr, nc)) break;
      const target = board[nr][nc];
      if (!target) { moves.push({ to: { r: nr, c: nc }, capture: null }); continue; }
      if (TEAM_OF_SEAT(target.seat) !== TEAM_OF_SEAT(seatIndex)) moves.push({ to: { r: nr, c: nc }, capture: { seat: target.seat, type: target.type } });
      break; // 味方・敵問わず、駒があればそこで進路が止まる
    }
  });
  return moves;
}
function generateMovesForPiece(board, r, c) {
  const cell = board[r] && board[r][c];
  if (!cell) return [];
  if (cell.type === 'abrashimovich') return pieceMovesAbrashimovich(board, r, c, cell.seat);
  if (cell.type === 'hei') return pieceMovesHei(board, r, c, cell.seat);
  if (cell.type === 'zafu') return pieceMovesZafu(board, r, c, cell.seat);
  return [];
}
function generateAllMovesForSeat(board, seats, seatIndex) {
  const seat = seats[seatIndex];
  if (!seat || seat.eliminated) return [];
  const moves = [];
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const cell = board[r][c];
      if (cell && cell.seat === seatIndex) {
        generateMovesForPiece(board, r, c).forEach((move) => moves.push({ from: { r, c }, to: move.to, capture: move.capture }));
      }
    }
  }
  return moves;
}
function hasAnyLegalMove(board, seats, seatIndex) { return generateAllMovesForSeat(board, seats, seatIndex).length > 0; }
function isLegalMove(board, seatIndex, from, to) {
  const cell = board[from.r] && board[from.r][from.c];
  if (!cell || cell.seat !== seatIndex) return false;
  return generateMovesForPiece(board, from.r, from.c).some((move) => move.to.r === to.r && move.to.c === to.c);
}
function isSquareThreatenedBy(board, seats, r, c, byTeam) {
  for (let seatIndex = 0; seatIndex < SEAT_COUNT; seatIndex += 1) {
    if (!seats[seatIndex] || seats[seatIndex].eliminated) continue;
    if (TEAM_OF_SEAT(seatIndex) !== byTeam) continue;
    if (generateAllMovesForSeat(board, seats, seatIndex).some((move) => move.to.r === r && move.to.c === c)) return true;
  }
  return false;
}

function eliminateSeat(state, seatIndex) {
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (state.board[r][c] && state.board[r][c].seat === seatIndex) state.board[r][c] = null;
    }
  }
  if (state.seats[seatIndex]) state.seats[seatIndex].eliminated = true;
  return state;
}
function checkWinner(state) {
  const teamAOut = !!(state.seats[0] && state.seats[0].eliminated && state.seats[2] && state.seats[2].eliminated);
  const teamBOut = !!(state.seats[1] && state.seats[1].eliminated && state.seats[3] && state.seats[3].eliminated);
  if (teamAOut) return 'B';
  if (teamBOut) return 'A';
  return null;
}
function teamPieceValue(board, seats, team) {
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const cell = board[r][c];
      if (cell && TEAM_OF_SEAT(cell.seat) === team) total += PIECE_VALUES[cell.type] || 0;
    }
  }
  return total;
}
function resolveByPieceValue(state) {
  const valueA = teamPieceValue(state.board, state.seats, 'A');
  const valueB = teamPieceValue(state.board, state.seats, 'B');
  state.phase = 'result';
  if (valueA === valueB) { state.winner = null; state.drawn = true; }
  else { state.winner = valueA > valueB ? 'A' : 'B'; state.drawn = false; }
  return state;
}
function advanceTurn(state) {
  for (let step = 1; step <= SEAT_COUNT; step += 1) {
    const next = (state.activeSeatIndex + step) % SEAT_COUNT;
    const seat = state.seats[next];
    if (seat && !seat.eliminated && hasAnyLegalMove(state.board, state.seats, next)) {
      state.activeSeatIndex = next;
      return state;
    }
  }
  return resolveByPieceValue(state); // 誰も動けない(理論上のみ)
}

function cloneMatchState(matchState) {
  return { ...matchState, board: cloneBoard(matchState.board), seats: cloneSeats(matchState.seats) };
}

// 純粋リデューサー。不正な手は{applied:false, reason}で元のstateをそのまま返す。
function applyMove(matchState, seatIndex, from, to) {
  if (!matchState || matchState.phase !== 'playing') return { state: matchState, applied: false, reason: 'game-over' };
  if (seatIndex !== matchState.activeSeatIndex) return { state: matchState, applied: false, reason: 'not-your-turn' };
  const seat = matchState.seats[seatIndex];
  if (!seat || seat.eliminated) return { state: matchState, applied: false, reason: 'seat-eliminated' };
  const fromCell = matchState.board[from.r] && matchState.board[from.r][from.c];
  if (!fromCell || fromCell.seat !== seatIndex) return { state: matchState, applied: false, reason: 'not-your-piece' };
  if (!isLegalMove(matchState.board, seatIndex, from, to)) return { state: matchState, applied: false, reason: 'illegal-destination' };

  const state = cloneMatchState(matchState);
  const capturedCell = state.board[to.r][to.c];
  state.board[to.r][to.c] = state.board[from.r][from.c];
  state.board[from.r][from.c] = null;
  let eliminatedSeat = null;
  if (capturedCell && capturedCell.type === 'abrashimovich') {
    eliminateSeat(state, capturedCell.seat);
    eliminatedSeat = capturedCell.seat;
  }
  state.version = (state.version || 0) + 1;
  state.turnCount = (state.turnCount || 0) + 1;
  state.lastMove = { seatIndex, from, to, captured: capturedCell ? { seat: capturedCell.seat, type: capturedCell.type } : null, eliminatedSeat };

  const winner = checkWinner(state);
  if (winner) { state.phase = 'result'; state.winner = winner; state.drawn = false; return { state, applied: true, reason: null }; }
  if (state.turnCount >= MAX_TURNS) { resolveByPieceValue(state); return { state, applied: true, reason: null }; }
  advanceTurn(state);
  return { state, applied: true, reason: null };
}

// --- 座席・ロビー関連 ---
function createEmptySeats() {
  return Array.from({ length: SEAT_COUNT }, (_, seatIndex) => ({ seatIndex, kind: 'empty', playerId: null, name: '', team: TEAM_OF_SEAT(seatIndex), eliminated: false }));
}
function assignSeat(seats, seatIndex, kind, playerId, name) {
  const result = cloneSeats(seats);
  if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= result.length) return result;
  if (!['human', 'cpu', 'empty'].includes(kind)) return result;
  const normalizedId = kind === 'empty' ? null : (playerId == null || playerId === '' ? (kind === 'cpu' ? 'cpu-' + seatIndex : null) : String(playerId));
  if (kind !== 'empty' && normalizedId && result.some((seat, index) => index !== seatIndex && seat.playerId === normalizedId)) return result;
  result[seatIndex] = {
    seatIndex,
    kind,
    playerId: kind === 'empty' ? null : normalizedId,
    name: kind === 'empty' ? '' : (String(name || '').trim() || (kind === 'cpu' ? 'CPU' + (seatIndex + 1) : 'プレイヤー' + (seatIndex + 1))),
    team: TEAM_OF_SEAT(seatIndex),
    eliminated: false,
  };
  return result;
}
function createDefaultSeats() {
  let seats = assignSeat(createEmptySeats(), 0, 'human', 'local-0', 'あなた');
  for (let seatIndex = 1; seatIndex < SEAT_COUNT; seatIndex += 1) seats = assignSeat(seats, seatIndex, 'cpu', null, 'CPU' + (seatIndex + 1));
  return seats;
}
function fillEmptySeatsWithCpu(seats) {
  return seats.reduce((acc, seat, index) => (seat.kind === 'empty' ? assignSeat(acc, index, 'cpu', null, 'CPU' + (index + 1)) : acc), cloneSeats(seats));
}
function canStartMatch(seats) {
  if (!Array.isArray(seats) || seats.length !== SEAT_COUNT) return false;
  if (new Set(seats.map((seat) => seat.seatIndex)).size !== SEAT_COUNT) return false;
  if (seats.some((seat) => !['human', 'cpu'].includes(seat.kind) || !seat.name)) return false;
  const humanIds = seats.filter((seat) => seat.kind === 'human').map((seat) => seat.playerId);
  if (humanIds.some((id) => !id) || new Set(humanIds).size !== humanIds.length) return false;
  return true;
}
function createMatchState(seats) {
  return { board: createInitialBoard(), seats: cloneSeats(seats).map((seat) => ({ ...seat, eliminated: false })), activeSeatIndex: 0, turnCount: 0, version: 0, phase: 'playing', winner: null, drawn: false, lastMove: null };
}
function buildMatchScoreboard(matchesWon, seats) {
  const scores = Object.assign({ A: 0, B: 0 }, matchesWon);
  const rows = ['A', 'B'].map((team) => ({
    team,
    members: seats.filter((seat) => TEAM_OF_SEAT(seat.seatIndex) === team).map((seat) => seat.name),
    score: Number(scores[team]) || 0,
  })).sort((a, b) => b.score - a.score || a.team.localeCompare(b.team));
  let lastScore = null, lastRank = 0;
  return rows.map((row, index) => {
    if (row.score !== lastScore) { lastScore = row.score; lastRank = index + 1; }
    return { ...row, rank: lastRank };
  });
}
function getMatchWinners(rows) { return rows.filter((row) => row.rank === 1); }

// --- CPU ---
function chooseCpuMove(matchState, seatIndex, rng = Math.random) {
  const { board, seats } = matchState;
  const candidates = generateAllMovesForSeat(board, seats, seatIndex);
  if (candidates.length === 0) return null;
  const pickRandom = (arr) => arr[Math.floor(rng() * arr.length)];

  const winningCaptures = candidates.filter((move) => move.capture && move.capture.type === 'abrashimovich');
  if (winningCaptures.length) return pickRandom(winningCaptures);

  const captures = candidates.filter((move) => move.capture);
  if (captures.length) {
    const maxValue = Math.max(...captures.map((move) => PIECE_VALUES[move.capture.type] || 0));
    return pickRandom(captures.filter((move) => (PIECE_VALUES[move.capture.type] || 0) === maxValue));
  }

  const myTeam = TEAM_OF_SEAT(seatIndex);
  const enemyTeam = myTeam === 'A' ? 'B' : 'A';
  let abraPos = null;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const cell = board[r][c];
      if (cell && cell.seat === seatIndex && cell.type === 'abrashimovich') abraPos = { r, c };
    }
  }
  if (abraPos && isSquareThreatenedBy(board, seats, abraPos.r, abraPos.c, enemyTeam)) {
    const escapes = candidates.filter((move) => move.from.r === abraPos.r && move.from.c === abraPos.c);
    const safeEscapes = escapes.filter((move) => {
      const nextBoard = cloneBoard(board);
      nextBoard[move.to.r][move.to.c] = nextBoard[move.from.r][move.from.c];
      nextBoard[move.from.r][move.from.c] = null;
      return !isSquareThreatenedBy(nextBoard, seats, move.to.r, move.to.c, enemyTeam);
    });
    if (safeEscapes.length) return pickRandom(safeEscapes);
  }
  return pickRandom(candidates);
}

const HyperionLogic = {
  BOARD_SIZE, SEAT_COUNT, PIECE_VALUES, ZAFU_RANGE, MAX_TURNS, TEAM_OF_SEAT, SEAT_HOME_LAYOUT,
  createInitialBoard, cloneBoard,
  pieceMovesAbrashimovich, pieceMovesHei, pieceMovesZafu, generateMovesForPiece, generateAllMovesForSeat,
  hasAnyLegalMove, isLegalMove, isSquareThreatenedBy,
  applyMove, eliminateSeat, checkWinner, teamPieceValue, resolveByPieceValue, advanceTurn,
  createEmptySeats, assignSeat, createDefaultSeats, fillEmptySeatsWithCpu, canStartMatch, createMatchState,
  buildMatchScoreboard, getMatchWinners, chooseCpuMove,
};
if (typeof module !== 'undefined') module.exports = HyperionLogic;
if (typeof window !== 'undefined') window.HyperionLogic = HyperionLogic;
