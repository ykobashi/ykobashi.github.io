(function (root) {
  'use strict';

  const MIN_PLAYERS = 2;
  const CANVAS_SIZE = 320;
  const MAX_PHRASE_LENGTH = 30;
  const MAX_SEGMENTS = 4000;

  function roundType(round) { return round % 2 === 0 ? 'write' : 'draw'; }
  function totalRounds(playerCount) { return playerCount; }
  function chainIndexForPlayer(playerIndex, round, playerCount) {
    return ((playerIndex - round) % playerCount + playerCount) % playerCount;
  }
  function validSegment(segment) {
    if (segment === null || typeof segment !== 'object' || Array.isArray(segment)) return false;
    return ['x0', 'y0', 'x1', 'y1'].every((key) =>
      Number.isFinite(segment[key]) && segment[key] >= 0 && segment[key] <= CANVAS_SIZE);
  }
  function validStrokes(strokes) {
    return Array.isArray(strokes) && strokes.length <= MAX_SEGMENTS && strokes.every(validSegment);
  }
  function normalizePhrase(text) { return String(text || '').trim().slice(0, MAX_PHRASE_LENGTH); }
  function addPlayer(roster, player) {
    if (roster.some((item) => item.id === player.id)) return roster;
    return roster.concat([player]);
  }
  function removePlayer(roster, id) { return roster.filter((item) => item.id !== id); }
  function hasMinPlayers(roster, min) { return roster.length >= (min === undefined ? MIN_PLAYERS : min); }
  // submit の正当性検証(ホストの hostHandleSubmit から呼ばれる純粋関数)。
  // phase/round/playerOrder/submittedIds(Set)/assignment のいずれかが不正なら false。
  function canAcceptSubmit(params) {
    if (!params || params.phase !== 'playing') return false;
    if (params.round !== params.currentRound) return false;
    if (!Array.isArray(params.playerOrder) || !params.playerOrder.includes(params.senderId)) return false;
    if (!params.submittedIds || params.submittedIds.has(params.senderId)) return false;
    if (!params.assignment) return false;
    return true;
  }
  // 現在ラウンドでまだ提出していないプレイヤーIDの配列(playerOrder の順序を保つ)。
  function missingPlayers(playerOrder, submittedIds) {
    return playerOrder.filter((id) => !submittedIds.has(id));
  }
  // strokes は「一筆」単位ではなく segment(線分)のフラット配列であるため、
  // strokeBoundaries(各ストロークの先頭segmentのインデックスを昇順に並べた配列)を
  // 別途保持してもらい、その最後の1本分だけを取り除く。非破壊(引数は変更しない)。
  function undoLastStroke(strokes, strokeBoundaries) {
    const safeStrokes = Array.isArray(strokes) ? strokes : [];
    const safeBoundaries = Array.isArray(strokeBoundaries) ? strokeBoundaries : [];
    if (safeBoundaries.length === 0) return { strokes: safeStrokes.slice(), strokeBoundaries: [] };
    const cutIndex = safeBoundaries[safeBoundaries.length - 1];
    return { strokes: safeStrokes.slice(0, cutIndex), strokeBoundaries: safeBoundaries.slice(0, -1) };
  }

  const api = { MIN_PLAYERS, CANVAS_SIZE, MAX_PHRASE_LENGTH, MAX_SEGMENTS, roundType, totalRounds,
    chainIndexForPlayer, validSegment, validStrokes, normalizePhrase, addPlayer, removePlayer, hasMinPlayers,
    canAcceptSubmit, missingPlayers, undoLastStroke };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PictureTelephoneLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
