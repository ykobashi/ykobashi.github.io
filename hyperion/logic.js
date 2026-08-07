// logic.js - ヒュペリオン 純粋関数ロジック(DOM操作なし)
//
// SKET DANCE作中に登場する架空のゲーム。ニコニコ大百科と、それを元に実際にプレイする
// ためのハウスルールをまとめたファンブログ(https://senyakazuya.hatenablog.com/entry/2021/09/25/165614、
// ユーザー提供の一次資料)に明記されている設定はそのまま踏襲する: 盤面「グランドクロス」・
// 駒9種の動き・駒数(1人14駒、ザフとテキーラは「まで」なので駒落ち可)・成駒なし・
// チームの組み方(隣が味方、対面が敵)・手番順(最先手とその味方が1番目と4番目になる)・
// OTLの合体条件と移動(千鳥足経路)・コダクサンは前方の駒に妨害されない、など。それ以外
// (決着時の引き分け処理、CPU思考、デッドエクストリームアタック・サイレントダブルアーツの
// 具体的な発動条件・効果)は原作にもファンブログにも記述がない、または「処理しない」と
// 明言されているため、AsobiLaboが独自に補った。
// なお「十字の切れ込み(盤に存在しないマス)越しの斜め移動」はファンブログに明記されているが、
// 陣地を中央に幅を合わせた盤形状では見通しが長くなりすぎて実プレイ上不自然だったため、
// AsobiLaboの判断で無効マスは完全に移動を遮る(素通り不可)仕様に変更している。

const BOARD_DIM = 17;
const SEAT_COUNT = 4;
const MAX_TURNS = 300;

// 盤面「グランドクロス」: 7x7の中央盤に、四辺へ5x7の陣地が付属した十字形。
// 陣地の幅(7)は中央の一辺とぴったり合わせ(段差なし)、奥行き5マスだけ外側へ伸ばす。
function isValidSquare(r, c) {
  if (r < 0 || r >= BOARD_DIM || c < 0 || c >= BOARD_DIM) return false;
  const inCenter = r >= 5 && r <= 11 && c >= 5 && c <= 11;
  const inNorth = r >= 0 && r <= 4 && c >= 5 && c <= 11;
  const inSouth = r >= 12 && r <= 16 && c >= 5 && c <= 11;
  const inWest = c >= 0 && c <= 4 && r >= 5 && r <= 11;
  const inEast = c >= 12 && c <= 16 && r >= 5 && r <= 11;
  return inCenter || inNorth || inSouth || inWest || inEast;
}

// 座席: 0=北・1=東・2=南・3=西(時計回り)。
// チームの組み方はファンブログに明記: 「味方同士は隣り合うように着席する(対面は必ず相手になる)」。
// 時計回りで隣同士の0(北)・1(東)をチームA、2(南)・3(西)をチームBとする。
function TEAM_OF_SEAT(seatIndex) { return seatIndex < 2 ? 'A' : 'B'; }
function teammateOf(seatIndex) { return [0, 1, 2, 3].find((i) => i !== seatIndex && TEAM_OF_SEAT(i) === TEAM_OF_SEAT(seatIndex)); }

const ARM_BOUNDS = [
  { rMin: 0, rMax: 4, cMin: 5, cMax: 11 },   // 0: 北
  { rMin: 5, rMax: 11, cMin: 12, cMax: 16 }, // 1: 東
  { rMin: 12, rMax: 16, cMin: 5, cMax: 11 }, // 2: 南
  { rMin: 5, rMax: 11, cMin: 0, cMax: 4 },   // 3: 西
];
// 各座席の「前方(盤中央へ向かう向き)」「右手(前方を向いた時の右側)」の単位ベクトル。
const FORWARD = [{ dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }];
const RIGHT = [{ dr: 0, dc: -1 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 1, dc: 0 }];
// 自陣の一番奥(depth=0)・中央列(lateral=3)の座標。
const ARM_ORIGIN = [{ r: 0, c: 8 }, { r: 8, c: 16 }, { r: 16, c: 8 }, { r: 8, c: 0 }];
// 陣地の幅(中央の一辺と同じ7マス)の中心インデックス。
const LATERAL_CENTER = 3;

function isInOwnArm(seatIndex, r, c) {
  const b = ARM_BOUNDS[seatIndex];
  return r >= b.rMin && r <= b.rMax && c >= b.cMin && c <= b.cMax;
}
// depth: 0(自陣の一番奥/自分の背後)〜4(盤中央側)。lateral: 0〜6(自分から見て左〜右)。
function localToAbsolute(seatIndex, depth, lateral) {
  const origin = ARM_ORIGIN[seatIndex], f = FORWARD[seatIndex], right = RIGHT[seatIndex];
  const lat = lateral - LATERAL_CENTER;
  return { r: origin.r + depth * f.dr + lat * right.dr, c: origin.c + depth * f.dc + lat * right.dc };
}
// localToAbsoluteの逆変換。f・rightは直交単位ベクトルなので内積で係数を復元できる。
function absoluteToLocal(seatIndex, r, c) {
  const origin = ARM_ORIGIN[seatIndex], f = FORWARD[seatIndex], right = RIGHT[seatIndex];
  const dr = r - origin.r, dc = c - origin.c;
  const depth = dr * f.dr + dc * f.dc;
  const lateral = (dr * right.dr + dc * right.dc) + LATERAL_CENTER;
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
  // OTL: 移動は専用のotlMoves()で扱う(千鳥足の経路を通り、経路上に駒があると移動不可なため
  // 単純なoffsets方式では表現できない)。
  // デッドエクストリームアタックで強化された量産型ザフ。8方向直進(将棋の飛車角相当)に強化(具体的強化内容は原作に記述なく創作)。
  'zafu-boosted': { offsets: ALL8, mode: 'slide' },
  // サイレントダブルアーツ(合体条件・効果とも原作・ファンブログに記述がないためAsobiLaboが独自に設定)。
  // 前方直進(香車と同じ、offset側でslideに上書き)+斜め4方向1マス(OLと同じ)を合成した動き。
  'double-arts': { offsets: [{ f: 1, r: 0, mode: 'slide' }, ...DIAG], mode: 'fixed' },
};
// 1人あたりの初期駒数(ニコニコ大百科「エクスカリバーの陣」の図から逆算し確認)。
const PIECE_COUNTS = { king: 1, zafu: 2, lance: 1, gold: 1, silver: 1, matcha: 1, ol: 1, kodakusan: 1, tequila: 5 };
const TOTAL_PIECES_PER_SEAT = Object.values(PIECE_COUNTS).reduce((a, b) => a + b, 0); // 14
// 決着が長引いた場合のタイブレーク用の駒価値(原作に記載なし、AsobiLaboが独自に設定)。
const PIECE_VALUES = { king: 10, zafu: 4, lance: 3, gold: 3, silver: 3, matcha: 2, ol: 2, kodakusan: 2, tequila: 1, otl: 5, 'zafu-boosted': 7, 'double-arts': 6 };

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
    const mode = offset.mode || spec.mode; // offset単位でspecのmodeを上書き可能(ダブルアーツの直進+1マスの合成用)
    if (mode === 'slide') {
      for (let step = 1; ; step += 1) {
        const nr = r + delta.dr * step, nc = c + delta.dc * step;
        if (nr < 0 || nr >= BOARD_DIM || nc < 0 || nc >= BOARD_DIM) break; // 盤の外
        if (!isValidSquare(nr, nc)) break; // 十字の外側の無効マスはそこで完全に遮る(素通り不可)
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
// OTLの移動(千鳥足)。ファンブログの記述「右に行く場合は左→中央→右、左に行く場合は右→中央→左の
// 経路を通る」「経路上に他の駒が存在している場合は移動できない」をそのまま実装。
// 中間点(1・2歩目)は空きマスであることが必須、3歩目(最終目的地)だけが捕獲の対象になる。
const OTL_PATHS = {
  right: [{ f: 1, r: -1 }, { f: 2, r: 0 }, { f: 3, r: 1 }],
  left: [{ f: 1, r: 1 }, { f: 2, r: 0 }, { f: 3, r: -1 }],
};
function otlMoves(board, r, c, seatIndex) {
  const moves = [];
  Object.values(OTL_PATHS).forEach((path) => {
    for (let i = 0; i < path.length - 1; i += 1) {
      const delta = templateToDelta(seatIndex, path[i]);
      const nr = r + delta.dr, nc = c + delta.dc;
      if (!isValidSquare(nr, nc) || board[nr][nc]) return; // 経路上(中間点)に駒があれば移動不可
    }
    const finalDelta = templateToDelta(seatIndex, path[path.length - 1]);
    const nr = r + finalDelta.dr, nc = c + finalDelta.dc;
    if (!isValidSquare(nr, nc)) return;
    const target = board[nr][nc];
    if (!target) { moves.push({ to: { r: nr, c: nc }, capture: null }); return; }
    if (TEAM_OF_SEAT(target.seat) !== TEAM_OF_SEAT(seatIndex)) moves.push({ to: { r: nr, c: nc }, capture: { seat: target.seat, type: target.type } });
  });
  return moves;
}
// OLは、テキーラ(敵味方問わず)がいるマスに入るとOTLへ合体する(ファンブログに明記)。
// 味方(自分含む)のテキーラへは、通常なら味方マスとして進入できないところをこの合体だけ例外的に許可される。
// 敵のテキーラへは通常通りの捕獲だが、この場合もOTLへ合体する。テキーラ側からOLへ合体する動きはない。
function generateMovesForPiece(board, r, c) {
  const cell = board[r] && board[r][c];
  if (!cell) return [];
  if (cell.type === 'otl') return otlMoves(board, r, c, cell.seat);
  const moves = pieceMovesGeneric(board, r, c, cell.seat, cell.type);
  if (cell.type === 'ol') {
    PIECE_SPECS.ol.offsets.forEach((offset) => {
      const delta = templateToDelta(cell.seat, offset);
      const nr = r + delta.dr, nc = c + delta.dc;
      if (!isValidSquare(nr, nc)) return;
      const target = board[nr][nc];
      if (!target || target.type !== 'tequila') return;
      if (TEAM_OF_SEAT(target.seat) === TEAM_OF_SEAT(cell.seat)) {
        if (!moves.some((m) => m.to.r === nr && m.to.c === nc)) moves.push({ to: { r: nr, c: nc }, capture: null, merge: 'otl' });
      } else {
        const existing = moves.find((m) => m.to.r === nr && m.to.c === nc);
        if (existing) existing.merge = 'otl';
      }
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
  const isOut = (seatIndex) => !!(state.seats[seatIndex] && state.seats[seatIndex].eliminated);
  const teamAOut = [0, 1, 2, 3].filter((i) => TEAM_OF_SEAT(i) === 'A').every(isOut);
  const teamBOut = [0, 1, 2, 3].filter((i) => TEAM_OF_SEAT(i) === 'B').every(isOut);
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
// 手番順(ファンブログに明記): 最先手はコイントス(フリップオアフロップ)で決定し、最先手と
// その味方が必ず1番目と4番目になる(例: AB vs CDでAが最先手ならA→D→C→B)。これは「最先手の
// 隣が味方ならその反対回りに、隣が敵ならそちらの向きに、盤を1周する」のと同じことなので、
// 味方を2番目に踏まないほうの回転方向(時計/反時計)で4席を1周する順序として実装する。
function buildTurnOrder(firstMover) {
  const teammate = teammateOf(firstMover);
  const clockwiseNext = (firstMover + 1) % SEAT_COUNT;
  const direction = clockwiseNext === teammate ? -1 : 1;
  const order = [];
  let current = firstMover;
  for (let i = 0; i < SEAT_COUNT; i += 1) { order.push(current); current = (current + direction + SEAT_COUNT) % SEAT_COUNT; }
  return order;
}
function advanceTurn(state) {
  const order = state.turnOrder || [0, 1, 2, 3];
  const startIndex = order.indexOf(state.activeSeatIndex);
  for (let step = 1; step <= SEAT_COUNT; step += 1) {
    const next = order[(startIndex + step) % SEAT_COUNT];
    const seat = state.seats[next];
    if (seat && !seat.eliminated && hasAnyLegalMove(state.board, state.seats, next)) {
      state.activeSeatIndex = next;
      resolvePendingDoubleArts(state, next);
      return state;
    }
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

// サイレントダブルアーツ(合体条件・効果とも原作・ファンブログに記述がないためAsobiLaboが独自に設定):
// 自分の量産型ザフとテキーラが「移動の結果として」隣接すると保留され、次にその席の手番が回って
// きた時点でまだ隣接していれば自動的に合体して「ダブルアーツ」になる(OTLの「敵味方問わず即座に
// 合体」と対になるよう、自陣の駒同士限定・1手番待っての合体とした)。陣形配置による初期隣接では
// 発動しない(必ず移動が引き金になる)。
const NEIGHBOR_DELTAS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
function findDoubleArtsPairsAt(board, seatIndex, r, c, movedType) {
  const otherType = movedType === 'zafu' ? 'tequila' : 'zafu';
  const pairs = [];
  NEIGHBOR_DELTAS.forEach(([dr, dc]) => {
    const nr = r + dr, nc = c + dc;
    if (!isValidSquare(nr, nc)) return;
    const cell = board[nr] && board[nr][nc];
    if (cell && cell.seat === seatIndex && cell.type === otherType) {
      const zafuPos = movedType === 'zafu' ? { r, c } : { r: nr, c: nc };
      const tequilaPos = movedType === 'zafu' ? { r: nr, c: nc } : { r, c };
      pairs.push({ seat: seatIndex, zafuPos, tequilaPos });
    }
  });
  return pairs;
}
function registerPendingDoubleArts(state, seatIndex, to, movedType) {
  if (movedType !== 'zafu' && movedType !== 'tequila') return;
  const pairs = findDoubleArtsPairsAt(state.board, seatIndex, to.r, to.c, movedType);
  if (pairs.length) state.pendingDoubleArts = (state.pendingDoubleArts || []).concat(pairs);
}
function resolvePendingDoubleArts(state, seatIndex) {
  const pending = (state.pendingDoubleArts || []).filter((p) => p.seat === seatIndex);
  state.pendingDoubleArts = (state.pendingDoubleArts || []).filter((p) => p.seat !== seatIndex);
  pending.forEach((p) => {
    const zafuCell = state.board[p.zafuPos.r][p.zafuPos.c];
    const tequilaCell = state.board[p.tequilaPos.r][p.tequilaPos.c];
    const stillValid = zafuCell && zafuCell.seat === seatIndex && zafuCell.type === 'zafu'
      && tequilaCell && tequilaCell.seat === seatIndex && tequilaCell.type === 'tequila';
    if (stillValid) {
      state.board[p.tequilaPos.r][p.tequilaPos.c] = null;
      state.board[p.zafuPos.r][p.zafuPos.c] = { seat: seatIndex, type: 'double-arts' };
    }
  });
}

function cloneMatchState(matchState) {
  return {
    ...matchState,
    board: cloneBoard(matchState.board),
    seats: cloneSeats(matchState.seats),
    pendingDoubleArts: (matchState.pendingDoubleArts || []).map((p) => ({ ...p, zafuPos: { ...p.zafuPos }, tequilaPos: { ...p.tequilaPos } })),
  };
}

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
    registerPendingDoubleArts(state, seatIndex, to, movingPiece.type);
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

// --- 陣形(原作記事に図解されている3つの陣形の座標復元。depth=0が自陣の一番奥、
//     lateral=0〜6が左〜右で、中央(lateral=3)が陣地の幅の中心。画像上は5列分だけ使い、
//     lateral=1〜5(中心3を挟んで左右2列ずつ)に配置することで陣地の中央に揃う。) ---
const FORMATIONS = [
  { // 0: エクスカリバーの陣
    name: 'エクスカリバーの陣',
    pieces: [
      { depth: 0, lateral: 1, type: 'silver' }, { depth: 0, lateral: 2, type: 'tequila' }, { depth: 0, lateral: 3, type: 'king' }, { depth: 0, lateral: 4, type: 'tequila' }, { depth: 0, lateral: 5, type: 'gold' },
      { depth: 1, lateral: 1, type: 'zafu' }, { depth: 1, lateral: 3, type: 'kodakusan' }, { depth: 1, lateral: 5, type: 'zafu' },
      { depth: 2, lateral: 2, type: 'tequila' }, { depth: 2, lateral: 3, type: 'tequila' }, { depth: 2, lateral: 4, type: 'tequila' },
      { depth: 3, lateral: 2, type: 'ol' }, { depth: 3, lateral: 4, type: 'matcha' },
      { depth: 4, lateral: 3, type: 'lance' },
    ],
  },
  { // 1: 千手孔雀陣
    name: '千手孔雀陣',
    pieces: [
      { depth: 0, lateral: 2, type: 'tequila' }, { depth: 0, lateral: 4, type: 'tequila' },
      { depth: 1, lateral: 1, type: 'zafu' }, { depth: 1, lateral: 3, type: 'matcha' }, { depth: 1, lateral: 5, type: 'zafu' },
      { depth: 2, lateral: 2, type: 'lance' }, { depth: 2, lateral: 3, type: 'king' }, { depth: 2, lateral: 4, type: 'ol' }, { depth: 2, lateral: 6, type: 'tequila' },
      { depth: 3, lateral: 1, type: 'silver' }, { depth: 3, lateral: 3, type: 'kodakusan' }, { depth: 3, lateral: 5, type: 'gold' },
      { depth: 4, lateral: 2, type: 'tequila' }, { depth: 4, lateral: 4, type: 'tequila' },
    ],
  },
  { // 2: 例の陣
    name: '例の陣',
    pieces: [
      { depth: 0, lateral: 2, type: 'ol' }, { depth: 0, lateral: 3, type: 'king' }, { depth: 0, lateral: 4, type: 'matcha' },
      { depth: 1, lateral: 2, type: 'tequila' }, { depth: 1, lateral: 3, type: 'tequila' }, { depth: 1, lateral: 4, type: 'tequila' },
      { depth: 2, lateral: 1, type: 'silver' }, { depth: 2, lateral: 3, type: 'kodakusan' }, { depth: 2, lateral: 5, type: 'gold' },
      { depth: 3, lateral: 1, type: 'zafu' }, { depth: 3, lateral: 3, type: 'lance' }, { depth: 3, lateral: 5, type: 'zafu' },
      { depth: 4, lateral: 1, type: 'tequila' }, { depth: 4, lateral: 5, type: 'tequila' },
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
// テキーラ(最大5)とザフ(最大2)は原作で「まで」と明記されているため、任意に減らして配置してよい
// (いわゆる駒落ち)。それ以外の7種は必ず1個ずつ配置する必要がある。
const MANDATORY_PIECE_TYPES = Object.keys(PIECE_COUNTS).filter((type) => type !== 'zafu' && type !== 'tequila');
function isSetupComplete(placements) {
  const counts = {};
  placements.forEach((p) => { counts[p.type] = (counts[p.type] || 0) + 1; });
  return MANDATORY_PIECE_TYPES.every((type) => counts[type] === 1);
}

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
// 最先手はフリップオアフロップ(コイントス)で決定する、とファンブログに明記。
function createMatchState(seats, allPlacements, rng) {
  const firstMover = Math.floor((rng || Math.random)() * SEAT_COUNT);
  const turnOrder = buildTurnOrder(firstMover);
  return { board: buildBoardFromPlacements(allPlacements), seats: cloneSeats(seats).map((seat) => ({ ...seat, eliminated: false })), turnOrder, activeSeatIndex: turnOrder[0], turnCount: 0, version: 0, phase: 'playing', winner: null, drawn: false, lastMove: null, pendingDoubleArts: [] };
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
  BOARD_DIM, SEAT_COUNT, MAX_TURNS, PIECE_SPECS, PIECE_COUNTS, PIECE_VALUES, TOTAL_PIECES_PER_SEAT, MANDATORY_PIECE_TYPES, TEAM_OF_SEAT, teammateOf, ARM_BOUNDS, FORMATIONS,
  isValidSquare, isInOwnArm, localToAbsolute, absoluteToLocal, createEmptyBoard, cloneBoard,
  generateMovesForPiece, generateAllMovesForSeat, hasAnyLegalMove, isLegalMove, isSquareThreatenedBy, otlMoves,
  applyMove, eliminateSeat, checkWinner, teamPieceValue, resolveByPieceValue, buildTurnOrder, advanceTurn, triggerDeadExtremeAttack,
  registerPendingDoubleArts, resolvePendingDoubleArts, findDoubleArtsPairsAt,
  formationPlacements, remainingPieceCounts, canPlacePiece, addPlacement, removePlacement, isSetupComplete, buildBoardFromPlacements,
  createEmptySeats, assignSeat, createDefaultSeats, fillEmptySeatsWithCpu, canStartMatch, cpuFormationChoice, createMatchState,
  buildMatchScoreboard, getMatchWinners, chooseCpuMove,
};
if (typeof module !== 'undefined') module.exports = HyperionLogic;
if (typeof window !== 'undefined') window.HyperionLogic = HyperionLogic;
