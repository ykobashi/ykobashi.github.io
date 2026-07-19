(function (root) {
  'use strict';

  const MIN_PLAYERS = 2;
  const CANVAS_SIZE = 320;
  const MAX_PHRASE_LENGTH = 30;
  const MAX_SEGMENTS = 1500;

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

  const api = { MIN_PLAYERS, CANVAS_SIZE, MAX_PHRASE_LENGTH, MAX_SEGMENTS, roundType, totalRounds,
    chainIndexForPlayer, validSegment, validStrokes, normalizePhrase, addPlayer, removePlayer, hasMinPlayers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PictureTelephoneLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
