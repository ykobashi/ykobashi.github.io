// logic.js - ヒュペリオン 純粋関数ロジック(DOM操作なし)
//
// SKET DANCE作中に登場する架空のゲーム。ニコニコ大百科(ユーザー提供の一次資料)に
// 明記されている盤面「グランドクロス」・駒9種の動き・駒数(1人14駒)・成駒なし、
// という設定はそのまま踏襲する。それ以外(チームの組み方、決着時の引き分け処理、
// CPU思考、OTL/デッドエクストリームアタックの具体的な発動条件と効果)は原作に
//明記がない、または「効果不明」と明言されているため、AsobiLaboが独自に補った。

const BOARD_DIM = 21;
const SEAT_COUNT = 4;
const MAX_TURNS = 300;

// 盤面「グランドクロス」: 7x7の中央盤に、四辺へ5x7の陣地が付属した十字形。
function isValidSquare(r, c) {
  if (r < 0 || r >= BOARD_DIM || c < 0 || c >= BOARD_DIM) return false;
  const inCenter = r >= 7 && r <= 13 && c >= 7 && c <= 13;
  const inNorth = r >= 0 && r <= 6 && c >= 8 && c <= 12;
  const inSouth = r >= 14 && r <= 20 && c >= 8 && c <= 12;
  const inWest = c >= 0 && c <= 6 && r >= 8 && r <= 12;
  const inEast = c >= 14 && c <= 20 && r >= 8 && r <= 12;
  return inCenter || inNorth || inSouth || inWest || inEast;
}

// 座席: 0=北・1=東・2=南・3=西(時計回り)。手番は0→1→2→3→0…。
// チームの組み方(隣が味方か対面が味方か)は原作に記述がなく未確定。
// 「対岸(北⇔南、東⇔西)が味方」という未確認の仮置き。ここだけ直せば全体に反映される。
function TEAM_OF_SEAT(seatIndex) { return seatIndex % 2 === 0 ? 'A' : 'B'; }

const ARM_BOUNDS = [
  { rMin: 0, rMax: 6, cMin: 8, cMax: 12 },   // 0: 北
  { rMin: 8, rMax: 12, cMin: 14, cMax: 20 }, // 1: 東
  { rMin: 14, rMax: 20, cMin: 8, cMax: 12 }, // 2: 南
  { rMin: 8, rMax: 12, cMin: 0, cMax: 6 },   // 3: 西
];
// 各座席の「前方(盤中央へ向かう向き)」「右手(前方を向いた時の右側)」の単位ベクトル。
const FORWARD = [{ dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }];
const RIGHT = [{ dr: 0, dc: -1 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 1, dc: 0 }];
// 自陣の一番奥(depth=0)・中央列(lateral=2)の座標。
const ARM_ORIGIN = [{ r: 0, c: 10 }, { r: 10, c: 20 }, { r: 20, c: 10 }, { r: 10, c: 0 }];

function isInOwnArm(seatIndex, r, c) {
  const b = ARM_BOUNDS[seatIndex];
  return r >= b.rMin && r <= b.rMax && c >= b.cMin && c <= b.cMax;
}
// depth: 0(自陣の一番奥/自分の背後)〜6(盤中央側)。lateral: 0〜4(自分から見て左〜右)。
function localToAbsolute(seatIndex, depth, lateral) {
  const origin = ARM_ORIGIN[seatIndex], f = FORWARD[seatIndex], right = RIGHT[seatIndex];
  const lat = lateral - 2;
  return { r: origin.r + depth * f.dr + lat * right.dr, c: origin.c + depth * f.dc + lat * right.dc };
}
// localToAbsoluteの逆変換。f・rightは直交単位ベクトルなので内積で係数を復元できる。
function absoluteToLocal(seatIndex, r, c) {
  const origin = ARM_ORIGIN[seatIndex], f = FORWARD[seatIndex], right = RIGHT[seatIndex];
  const dr = r - origin.r, dc = c - origin.c;
  const depth = dr * f.dr + dc * f.dc;
  const lateral = (dr * right.dr + dc * right.dc) + 2;
  return { depth, lateral };
}

// --- 駒定義(凡例: f=前方への歩数, r=右方向への歩数。共に負の値は逆方向) ---
const DIAG = [{ f: 1, r: 1 }, { f: 1, r: -1 }, { f: -1, r: 1 }, { f: -1, r: -1 }];
const ORTHO = [{ f: 1, r: 0 }, { f: -1, r: 0 }, { f: 0, r: 1 }, { f: 0, r: -1 }];
const ALL8 = DIAG.concat(ORTHO);

// 画像で確認済みの動き(◇=1マス、☆=直進)。将棋の駒名と一致するもの(金/銀/角/香車)はその通りに実装。
const PIECE_SPECS = {
  king: { offsets: ALL8, mode: 'fixed' }, // 覇王アブラシモビッチ/アブラシモダッチ: 8方向1マス
  zafu: { offsets: DIAG, mode: 'slide' }, // 量産型ザフ: 斜め4方向に直進(角)
  lance: { offsets: [{ f: 1, r: 0 }], mode: 'slide' }, // 重戦士ドドンドンドドン: 前方直進のみ(香車)
  gold: { offsets: [{ f: 1, r: 1 }, { f: 1, r: 0 }, { f: 1, r: -1 }, { f: 0, r: 1 }, { f: 0, r: -1 }, { f: -1, r: 0 }], mode: 'fixed' }, // スチーム: 金と同じ
  silver: { offsets: [{ f: 1, r: 1 }, { f: 1, r: 0 }, { f: 1, r: -1 }, { f: -1, r: 1 }, { f: -1, r: -1 }], mode: 'fixed' }, // シューズ: 銀と同じ
  matcha: { offsets: ORTHO, mode: 'fixed' }, // 抹茶あずきーな: 大将棋の嗔猪(前後左右1マス)
  ol: { offsets: DIAG, mode: 'fixed' }, // OL: 大将棋の猫刃(斜め1マス)
  kodakusan: { offsets: [{ f: 2, r: 0 }], mode: 'fixed' }, // コダクサン: 前方2マス先へジャンプ(跳び駒)
  tequila: { offsets: [{ f: 1, r: 0 }], mode: 'fixed' }, // テキーラ: 前方1マスのみ
  // OTL: OL+テキーラが合体した複合駒。千鳥足で前方3マス先の左右どちらかへ跳ぶ、という原作の図(千鳥足の経路)を簡略化して実装。
  otl: { offsets: [{ f: 3, r: 1 }, { f: 3, r: -1 }], mode: 'fixed' },
  // デッドエクストリームアタックで強化された量産型ザフ。8方向直進(将棋の飛車角相当)に強化(具体的強化内容は原作に記述なく創作)。
  'zafu-boosted': { offsets: ALL8, mode: 'slide' },
};
// 1人あたりの初期駒数(ニコニコ大百科「エクスカリバーの陣」の図から逆算し確認)。
const PIECE_COUNTS = { king: 1, zafu: 2, lance: 1, gold: 1, silver: 1, matcha: 1, ol: 1, kodakusan: 1, tequila: 5 };
const TOTAL_PIECES_PER_SEAT = Object.values(PIECE_COUNTS).reduce((a, b) => a + b, 0); // 14
// 決着が長引いた場合のタイブレーク用の駒価値(原作に記載なし、AsobiLaboが独自に設定)。
const PIECE_VALUES = { king: 10, zafu: 4, lance: 3, gold: 3, silver: 3, matcha: 2, ol: 2, kodakusan: 2, tequila: 1, otl: 5, 'zafu-boosted': 7 };

function templateToDelta(seatIndex, offset) {
  const f = FORWARD[seatIndex], r = RIGHT[seatIndex];
  return { dr: offset.f * f.dr + offset.r * r.dr, dc: offset.f * f.dc + offset.r * r.dc };
}

function createEmptyBoard() { return Array.from({ length: BOARD_DIM }, () => Array(BOARD_DIM).fill(null)); }
function cloneBoard(board) { return board.map((row) => row.map((cell) => (cell ? { ...cell } : null))); }
function cloneSeats(seats) { return seats.map((seat) => ({ ...seat })); }

function pieceMovesGeneric(board, r, c, seatIndex, type) {
  const spec = PIECE_SPECS[type];
  const moves = [];
  spec.offsets.forEach((offset) => {
    const delta = templateToDelta(seatIndex, offset);
    if (spec.mode === 'slide') {
      for (let step = 1; ; step += 1) {
        const nr = r + delta.dr * step, nc = c + delta.dc * step;
        if (!isValidSquare(nr, nc)) break;
        const target = board[nr][nc];
        if (!target) { moves.push({ to: { r: nr, c: nc }, capture: null }); continue; }
        if (TEAM_OF_SEAT(target.seat) !== TEAM_OF_SEAT(seatIndex)) moves.push({ to: { r: nr, c: nc }, capture: { seat: target.seat, type: target.type } });
        break; // 味方・敵問わず、駒があればそこで止まる(捕獲は着地マスのみ)
      }
    } else {
      // 'fixed': 1マス駒(step)も跳び駒(leap)も、着地マスだけを見る点で同じ処理でよい(跳び駒は間のマスを無視するため)
      const nr = r + delta.dr, nc = c + delta.dc;
      if (!isValidSquare(nr, nc)) return;
      const target = board[nr][nc];
      if (!target) { moves.push({ to: { r: nr, c: nc }, capture: null }); return; }
      if (TEAM_OF_SEAT(target.seat) !== TEAM_OF_SEAT(seatIndex)) moves.push({ to: { r: nr, c: nc }, capture: { seat: target.seat, type: target.type } });
    }
  });
  return moves;
}
// OL・テキーラは、自分の同じ駒(テキーラ/OL)がいるマスへ限り移動でき、その場合はOTLへ合体する特殊移動を追加する。
function generateMovesForPiece(board, r, c) {
  const cell = board[r] && board[r][c];
  if (!cell) return [];
  const moves = pieceMovesGeneric(board, r, c, cell.seat, cell.type);
  if (cell.type === 'ol' || cell.type === 'tequila') {
    const complement = cell.type === 'ol' ? 'tequila' : 'ol';
    PIECE_SPECS[cell.type].offsets.forEach((offset) => {
      const delta = templateToDelta(cell.seat, offset);
      const nr = r + delta.dr, nc = c + delta.dc;
      if (!isValidSquare(nr, nc)) return;
      const target = board[nr][nc];
      if (target && target.seat === cell.seat && target.type === complement) moves.push({ to: { r: nr, c: nc }, capture: null, merge: 'otl' });
    });
  }
  return moves;
}
function generateAllMovesForSeat(board, seats, seatIndex) {
  const seat = seats[seatIndex];
  if (!seat || seat.eliminated) return [];
  const moves = [];
  for (let r = 0; r < BOARD_DIM; r += 1) {
    for (let c = 0; c < BOARD_DIM; c += 1) {
      const cell = board[r][c];
      if (cell && cell.seat === seatIndex) generateMovesForPiece(board, r, c).forEach((m) => moves.push({ from: { r, c }, to: m.to, capture: m.capture, merge: m.merge || null }));
    }
  }
  return moves;
}
function hasAnyLegalMove(board, seats, seatIndex) { return generateAllMovesForSeat(board, seats, seatIndex).length > 0; }
function isLegalMove(board, seatIndex, from, to) {
  const cell = board[from.r] && board[from.r][from.c];
  if (!cell || cell.seat !== seatIndex) return false;
  return generateMovesForPiece(board, from.r, from.c).some((m) => m.to.r === to.r && m.to.c === to.c);
}
function isSquareThreatenedBy(board, seats, r, c, byTeam) {
  for (let seatIndex = 0; seatIndex < SEAT_COUNT; seatIndex += 1) {
    if (!seats[seatIndex] || seats[seatIndex].eliminated) continue;
    if (TEAM_OF_SEAT(seatIndex) !== byTeam) continue;
    if (generateAllMovesForSeat(board, seats, seatIndex).some((m) => m.to.r === r && m.to.c === c)) return true;
  }
  return false;
}

function eliminateSeat(state, seatIndex) {
  for (let r = 0; r < BOARD_DIM; r += 1) {
    for (let c = 0; c < BOARD_DIM; c += 1) {
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
  for (let r = 0; r < BOARD_DIM; r += 1) {
    for (let c = 0; c < BOARD_DIM; c += 1) {
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
    if (seat && !seat.eliminated && hasAnyLegalMove(state.board, state.seats, next)) { state.activeSeatIndex = next; return state; }
  }
  return resolveByPieceValue(state); // 誰も動けない(理論上のみ)
}

// デッドエクストリームアタック: 「破壊されたコダクサンから子供が飛び出し、量産型ザフのマスに飛び込む」
// (効果は原作でも「不明」と明言されているため、盤上の自分のザフのうち最も近い1体を強化する、という
// 効果をAsobiLaboが独自に設定した)。
function triggerDeadExtremeAttack(state, ownerSeat, kodakusanPos) {
  const candidates = [];
  for (let r = 0; r < BOARD_DIM; r += 1) {
    for (let c = 0; c < BOARD_DIM; c += 1) {
      const cell = state.board[r][c];
      if (cell && cell.seat === ownerSeat && cell.type === 'zafu') candidates.push({ r, c });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => (Math.abs(a.r - kodakusanPos.r) + Math.abs(a.c - kodakusanPos.c)) - (Math.abs(b.r - kodakusanPos.r) + Math.abs(b.c - kodakusanPos.c)));
  const target = candidates[0];
  state.board[target.r][target.c] = { seat: ownerSeat, type: 'zafu-boosted' };
  return target;
}

function cloneMatchState(matchState) { return { ...matchState, board: cloneBoard(matchState.board), seats: cloneSeats(matchState.seats) }; }

// 純粋リデューサー。不正な手は{applied:false, reason}で元のstateをそのまま返す。
function applyMove(matchState, seatIndex, from, to) {
  if (!matchState || matchState.phase !== 'playing') return { state: matchState, applied: false, reason: 'game-over' };
  if (seatIndex !== matchState.activeSeatIndex) return { state: matchState, applied: false, reason: 'not-your-turn' };
  const seat = matchState.seats[seatIndex];
  if (!seat || seat.eliminated) return { state: matchState, applied: false, reason: 'seat-eliminated' };
  const fromCell = matchState.board[from.r] && matchState.board[from.r][from.c];
  if (!fromCell || fromCell.seat !== seatIndex) return { state: matchState, applied: false, reason: 'not-your-piece' };
  const candidates = generateMovesForPiece(matchState.board, from.r, from.c);
  const matched = candidates.find((m) => m.to.r === to.r && m.to.c === to.c);
  if (!matched) return { state: matchState, applied: false, reason: 'illegal-destination' };

  const state = cloneMatchState(matchState);
  const movingPiece = state.board[from.r][from.c];
  const capturedCell = state.board[to.r][to.c];
  let eliminatedSeat = null;
  let deadExtremeAttack = null;

  if (matched.merge === 'otl') {
    state.board[to.r][to.c] = { seat: seatIndex, type: 'otl' };
    state.board[from.r][from.c] = null;
  } else {
    state.board[to.r][to.c] = movingPiece;
    state.board[from.r][from.c] = null;
    if (capturedCell && capturedCell.type === 'king') { eliminateSeat(state, capturedCell.seat); eliminatedSeat = capturedCell.seat; }
    else if (capturedCell && capturedCell.type === 'kodakusan') { deadExtremeAttack = triggerDeadExtremeAttack(state, capturedCell.seat, to); }
  }

  state.version = (state.version || 0) + 1;
  state.turnCount = (state.turnCount || 0) + 1;
  state.lastMove = { seatIndex, from, to, captured: capturedCell ? { seat: capturedCell.seat, type: capturedCell.type } : null, eliminatedSeat, merged: matched.merge === 'otl', deadExtremeAttack };

  const winner = checkWinner(state);
  if (winner) { state.phase = 'result'; state.winner = winner; state.drawn = false; return { state, applied: true, reason: null }; }
  if (state.turnCount >= MAX_TURNS) { resolveByPieceValue(state); return { state, applied: true, reason: null }; }
  advanceTurn(state);
  return { state, applied: true, reason: null };
}

// --- 陣形(原作記事に図解されている3つの陣形の座標復元。depth=0が自陣の一番奥、lateral=0〜4が左〜右) ---
const FORMATIONS = [
  { // 0: エクスカリバーの陣
    name: 'エクスカリバーの陣',
    pieces: [
      { depth: 0, lateral: 0, type: 'silver' }, { depth: 0, lateral: 1, type: 'tequila' }, { depth: 0, lateral: 2, type: 'king' }, { depth: 0, lateral: 3, type: 'tequila' }, { depth: 0, lateral: 4, type: 'gold' },
      { depth: 1, lateral: 0, type: 'zafu' }, { depth: 1, lateral: 2, type: 'kodakusan' }, { depth: 1, lateral: 4, type: 'zafu' },
      { depth: 2, lateral: 0, type: 'tequila' }, { depth: 2, lateral: 1, type: 'tequila' }, { depth: 2, lateral: 2, type: 'tequila' },
      { depth: 3, lateral: 0, type: 'ol' }, { depth: 3, lateral: 2, type: 'matcha' },
      { depth: 4, lateral: 0, type: 'lance' },
    ],
  },
  { // 1: 千手孔雀陣
    name: '千手孔雀陣',
    pieces: [
      { depth: 0, lateral: 0, type: 'tequila' }, { depth: 0, lateral: 2, type: 'tequila' },
      { depth: 1, lateral: 0, type: 'zafu' }, { depth: 1, lateral: 2, type: 'matcha' }, { depth: 1, lateral: 4, type: 'zafu' },
      { depth: 2, lateral: 0, type: 'lance' }, { depth: 2, lateral: 1, type: 'king' }, { depth: 2, lateral: 2, type: 'ol' }, { depth: 2, lateral: 4, type: 'tequila' },
      { depth: 3, lateral: 0, type: 'silver' }, { depth: 3, lateral: 2, type: 'kodakusan' }, { depth: 3, lateral: 4, type: 'gold' },
      { depth: 4, lateral: 0, type: 'tequila' }, { depth: 4, lateral: 2, type: 'tequila' },
    ],
  },
  { // 2: 例の陣
    name: '例の陣',
    pieces: [
      { depth: 0, lateral: 0, type: 'ol' }, { depth: 0, lateral: 1, type: 'king' }, { depth: 0, lateral: 2, type: 'matcha' },
      { depth: 1, lateral: 0, type: 'tequila' }, { depth: 1, lateral: 1, type: 'tequila' }, { depth: 1, lateral: 2, type: 'tequila' },
      { depth: 2, lateral: 0, type: 'silver' }, { depth: 2, lateral: 2, type: 'kodakusan' }, { depth: 2, lateral: 4, type: 'gold' },
      { depth: 3, lateral: 0, type: 'zafu' }, { depth: 3, lateral: 2, type: 'lance' }, { depth: 3, lateral: 4, type: 'zafu' },
      { depth: 4, lateral: 0, type: 'tequila' }, { depth: 4, lateral: 4, type: 'tequila' },
    ],
  },
];
function formationPlacements(seatIndex, formationIndex) {
  const formation = FORMATIONS[formationIndex];
  if (!formation) return [];
  return formation.pieces.map(({ depth, lateral, type }) => { const pos = localToAbsolute(seatIndex, depth, lateral); return { r: pos.r, c: pos.c, type }; });
}

// --- 配置フェーズ(対局開始前に、各自の5x7陣地へ14駒を自由に並べる) ---
function remainingPieceCounts(placements) {
  const counts = { ...PIECE_COUNTS };
  placements.forEach((p) => { counts[p.type] = (counts[p.type] || 0) - 1; });
  return counts;
}
function canPlacePiece(placements, seatIndex, r, c, type) {
  if (!PIECE_COUNTS[type]) return false;
  if (!isInOwnArm(seatIndex, r, c)) return false;
  if (placements.some((p) => p.r === r && p.c === c)) return false;
  return (remainingPieceCounts(placements)[type] || 0) > 0;
}
function addPlacement(placements, seatIndex, r, c, type) {
  if (!canPlacePiece(placements, seatIndex, r, c, type)) return placements;
  return placements.concat([{ r, c, type }]);
}
function removePlacement(placements, r, c) { return placements.filter((p) => !(p.r === r && p.c === c)); }
function isSetupComplete(placements) { return placements.length === TOTAL_PIECES_PER_SEAT; }

// 4席分の最終配置(各 seatIndex -> [{r,c,type}]×14)から対局開始時の盤面を組み立てる。
function buildBoardFromPlacements(allPlacements) {
  const board = createEmptyBoard();
  allPlacements.forEach((placements, seatIndex) => { placements.forEach(({ r, c, type }) => { board[r][c] = { seat: seatIndex, type }; }); });
  return board;
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
    seatIndex, kind, playerId: kind === 'empty' ? null : normalizedId,
    name: kind === 'empty' ? '' : (String(name || '').trim() || (kind === 'cpu' ? 'CPU' + (seatIndex + 1) : 'プレイヤー' + (seatIndex + 1))),
    team: TEAM_OF_SEAT(seatIndex), eliminated: false,
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
// CPU席の初期配置はランダムに3陣形から1つを採用する(ユーザー確認済み)。
function cpuFormationChoice(rng) { return Math.floor((rng ? rng() : Math.random()) * FORMATIONS.length); }
function createMatchState(seats, allPlacements) {
  return { board: buildBoardFromPlacements(allPlacements), seats: cloneSeats(seats).map((seat) => ({ ...seat, eliminated: false })), activeSeatIndex: 0, turnCount: 0, version: 0, phase: 'playing', winner: null, drawn: false, lastMove: null };
}
function buildMatchScoreboard(matchesWon, seats) {
  const scores = Object.assign({ A: 0, B: 0 }, matchesWon);
  const rows = ['A', 'B'].map((team) => ({ team, members: seats.filter((seat) => TEAM_OF_SEAT(seat.seatIndex) === team).map((seat) => seat.name), score: Number(scores[team]) || 0 }))
    .sort((a, b) => b.score - a.score || a.team.localeCompare(b.team));
  let lastScore = null, lastRank = 0;
  return rows.map((row, index) => { if (row.score !== lastScore) { lastScore = row.score; lastRank = index + 1; } return { ...row, rank: lastRank }; });
}
function getMatchWinners(rows) { return rows.filter((row) => row.rank === 1); }

// --- CPU ---
function chooseCpuMove(matchState, seatIndex, rng = Math.random) {
  const { board, seats } = matchState;
  const candidates = generateAllMovesForSeat(board, seats, seatIndex);
  if (candidates.length === 0) return null;
  const pickRandom = (arr) => arr[Math.floor(rng() * arr.length)];

  const winningCaptures = candidates.filter((move) => move.capture && move.capture.type === 'king');
  if (winningCaptures.length) return pickRandom(winningCaptures);

  const captures = candidates.filter((move) => move.capture);
  if (captures.length) {
    const maxValue = Math.max(...captures.map((move) => PIECE_VALUES[move.capture.type] || 0));
    return pickRandom(captures.filter((move) => (PIECE_VALUES[move.capture.type] || 0) === maxValue));
  }

  const myTeam = TEAM_OF_SEAT(seatIndex);
  const enemyTeam = myTeam === 'A' ? 'B' : 'A';
  let kingPos = null;
  for (let r = 0; r < BOARD_DIM; r += 1) {
    for (let c = 0; c < BOARD_DIM; c += 1) {
      const cell = board[r][c];
      if (cell && cell.seat === seatIndex && cell.type === 'king') kingPos = { r, c };
    }
  }
  if (kingPos && isSquareThreatenedBy(board, seats, kingPos.r, kingPos.c, enemyTeam)) {
    const escapes = candidates.filter((move) => move.from.r === kingPos.r && move.from.c === kingPos.c);
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
  BOARD_DIM, SEAT_COUNT, MAX_TURNS, PIECE_SPECS, PIECE_COUNTS, PIECE_VALUES, TOTAL_PIECES_PER_SEAT, TEAM_OF_SEAT, ARM_BOUNDS, FORMATIONS,
  isValidSquare, isInOwnArm, localToAbsolute, absoluteToLocal, createEmptyBoard, cloneBoard,
  generateMovesForPiece, generateAllMovesForSeat, hasAnyLegalMove, isLegalMove, isSquareThreatenedBy,
  applyMove, eliminateSeat, checkWinner, teamPieceValue, resolveByPieceValue, advanceTurn, triggerDeadExtremeAttack,
  formationPlacements, remainingPieceCounts, canPlacePiece, addPlacement, removePlacement, isSetupComplete, buildBoardFromPlacements,
  createEmptySeats, assignSeat, createDefaultSeats, fillEmptySeatsWithCpu, canStartMatch, cpuFormationChoice, createMatchState,
  buildMatchScoreboard, getMatchWinners, chooseCpuMove,
};
if (typeof module !== 'undefined') module.exports = HyperionLogic;
if (typeof window !== 'undefined') window.HyperionLogic = HyperionLogic;
