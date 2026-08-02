'use strict';

const assert = require('assert');
const logic = require('./logic.js');

function ball(id, x, y, vx = 0, vy = 0, pocketed = false) {
  return { id, x, y, vx, vy, pocketed };
}

function seats(count) {
  let result = logic.autoSplitTeams(count);
  for (let i = 0; i < count; i += 1) {
    result = logic.assignSeat(result, i, 'human', `p${i}`, `P${i}`, i % 2 === 0 ? 'A' : 'B');
  }
  return result;
}

function outcome(firstContactId, pocketedIds, finalState, extras) {
  return Object.assign({
    firstContactId,
    pocketedIds: pocketedIds || [],
    railAfterContact: true,
    finalState
  }, extras || {});
}

// Rack structure and supplied RNG are deterministic.
const rackA = logic.createBreakLayout(() => 0.25);
const rackB = logic.createBreakLayout(() => 0.25);
assert.deepStrictEqual(rackA, rackB);
assert.strictEqual(rackA.balls.length, 16);
assert.strictEqual(new Set(rackA.balls.map((item) => item.id)).size, 16);

// A simple collision settles without producing invalid numbers.
const collisionTable = { balls: [ball(0, 200, 250), ball(1, 300, 250)] };
const collisionShot = logic.simulateShot(collisionTable, 0, 45);
assert(collisionShot.events.some((event) => event.type === 'collision'));
assert(logic.isSettled(collisionShot.finalState));
collisionShot.finalState.balls.forEach((item) => {
  assert(Number.isFinite(item.x) && Number.isFinite(item.y));
  assert(Number.isFinite(item.vx) && Number.isFinite(item.vy));
});

// The same initial state and input produce byte-for-byte-equivalent results.
assert.deepStrictEqual(
  logic.simulateShot(collisionTable, 0, 45),
  logic.simulateShot(collisionTable, 0, 45)
);

// A ball travelling along the top rail enters the corner pocket before bouncing.
const pocketTable = { balls: [ball(0, 300, 250), ball(2, 850, logic.BALL_R, 500, 0)] };
let pocketState = pocketTable;
let pocketed = false;
for (let i = 0; i < 200 && !pocketed; i += 1) {
  const stepped = logic.stepPhysics(pocketState, logic.FIXED_DT);
  pocketState = stepped.tableState;
  pocketed = stepped.events.some((event) => event.type === 'pocket' && event.ballId === 2);
}
assert(pocketed);
assert(pocketState.balls.find((item) => item.id === 2).pocketed);

// A ball whose centre reaches the visible mouth is accepted by the forgiving pocket radius.
const mouthShot = logic.stepPhysics({ balls: [ball(4, logic.TABLE_W / 2 + 31, 16)] }, logic.FIXED_DT);
assert(mouthShot.events.some((event) => event.type === 'pocket' && event.ballId === 4));

// Cushion reflection is recorded and reverses the relevant component.
const cushion = logic.stepPhysics({ balls: [ball(3, logic.BALL_R + 0.1, 200, -100, 0)] }, 0.01);
assert(cushion.events.some((event) => event.type === 'cushion'));
assert(cushion.tableState.balls[0].vx > 0);

// A coincident pair uses a fixed normal and remains finite.
const coincident = logic.stepPhysics({ balls: [ball(1, 400, 250, 20, 0), ball(2, 400, 250, -20, 0)] }, logic.FIXED_DT);
coincident.tableState.balls.forEach((item) => assert(Number.isFinite(item.x) && Number.isFinite(item.vx)));

// Sight lines ignore endpoints but reject an intervening ball.
const sightTable = { balls: [ball(0, 100, 250), ball(1, 400, 250), ball(2, 250, 250)] };
assert.strictEqual(logic.hasLineOfSight(sightTable, { x: 100, y: 250 }, { x: 400, y: 250 }, [0, 1]), false);
assert.strictEqual(logic.hasLineOfSight(sightTable, { x: 100, y: 200 }, { x: 400, y: 200 }, [0, 1]), true);

// Legal open-table pot assigns a group and lets the same shooter continue.
let match = logic.createMatchState(seats(2), rackA);
match.breakShot = false;
const solidsPot = logic.createBreakLayout(() => 0.5);
solidsPot.balls.find((item) => item.id === 1).pocketed = true;
match = logic.applyShotOutcome(match, outcome(1, [1], solidsPot));
assert.deepStrictEqual(match.sideGroups, { A: 'solids', B: 'stripes' });
assert.strictEqual(match.activeSeatIndex, 0);
assert.deepStrictEqual(logic.legalTargetBallIds(match), [2, 3, 4, 5, 6, 7]);

const opponentTargets = JSON.parse(JSON.stringify(match));
opponentTargets.activeSeatIndex = 1;
assert.deepStrictEqual(logic.legalTargetBallIds(opponentTargets), [9, 10, 11, 12, 13, 14, 15]);

const eightOnly = JSON.parse(JSON.stringify(match));
eightOnly.table.balls.filter((item) => item.id >= 1 && item.id <= 7).forEach((item) => { item.pocketed = true; });
assert.deepStrictEqual(logic.legalTargetBallIds(eightOnly), [8]);

// Scratch, wrong first contact, and no-rail are fouls with ball in hand.
let scratch = logic.createMatchState(seats(2), rackA);
scratch.breakShot = false;
scratch = logic.applyShotOutcome(scratch, outcome(1, [0], rackA, { scratch: true }));
assert.strictEqual(scratch.foulReason, 'scratch');
assert.strictEqual(scratch.activeSeatIndex, 1);
assert.strictEqual(scratch.ballInHandSide, 'B');

let wrong = logic.createMatchState(seats(2), rackA);
wrong.breakShot = false;
wrong.sideGroups = { A: 'solids', B: 'stripes' };
wrong = logic.applyShotOutcome(wrong, outcome(9, [], rackA));
assert.strictEqual(wrong.foulReason, 'wrong-first-contact');

let noRail = logic.createMatchState(seats(2), rackA);
noRail.breakShot = false;
noRail = logic.applyShotOutcome(noRail, outcome(1, [], rackA, { railAfterContact: false, pocketAfterContact: false }));
assert.strictEqual(noRail.foulReason, 'no-rail');

// Clearing one's group before the shot permits a legal 8-ball win.
let legalEight = logic.createMatchState(seats(2), rackA);
legalEight.breakShot = false;
legalEight.sideGroups = { A: 'solids', B: 'stripes' };
legalEight.table.balls.filter((item) => item.id >= 1 && item.id <= 7).forEach((item) => { item.pocketed = true; });
const legalEightFinal = JSON.parse(JSON.stringify(legalEight.table));
legalEightFinal.balls.find((item) => item.id === 8).pocketed = true;
legalEight = logic.applyShotOutcome(legalEight, outcome(8, [8], legalEightFinal));
assert.strictEqual(logic.winningSide(legalEight), 'A');
assert.strictEqual(legalEight.racksWon.A, 1);

// Early 8-ball and 8-ball plus scratch both lose immediately.
let earlyEight = logic.createMatchState(seats(2), rackA);
earlyEight.breakShot = false;
earlyEight.sideGroups = { A: 'solids', B: 'stripes' };
earlyEight = logic.applyShotOutcome(earlyEight, outcome(8, [8], rackA));
assert.strictEqual(logic.winningSide(earlyEight), 'B');

let eightScratch = logic.createMatchState(seats(2), rackA);
eightScratch.breakShot = false;
eightScratch.sideGroups = { A: 'solids', B: 'stripes' };
eightScratch.table.balls.filter((item) => item.id >= 1 && item.id <= 7).forEach((item) => { item.pocketed = true; });
eightScratch = logic.applyShotOutcome(eightScratch, outcome(8, [8, 0], eightScratch.table, { scratch: true }));
assert.strictEqual(logic.winningSide(eightScratch), 'B');
assert.strictEqual(eightScratch.lastOutcome.reason, 'eight-and-scratch');

// The 8-ball on the break triggers a re-rack, not a loss.
let breakEight = logic.createMatchState(seats(2), rackA);
breakEight = logic.applyShotOutcome(breakEight, outcome(1, [8], rackA));
assert.strictEqual(breakEight.phase, 'playing');
assert.strictEqual(breakEight.breakShot, true);
assert.strictEqual(breakEight.lastOutcome.type, 'rerack');

// Mixed groups on an open table do not assign ownership.
let mixed = logic.createMatchState(seats(2), rackA);
mixed.breakShot = false;
mixed = logic.applyShotOutcome(mixed, outcome(1, [1, 9], rackA));
assert.deepStrictEqual(mixed.sideGroups, { A: null, B: null });
assert.strictEqual(mixed.activeSeatIndex, 0);

// Fair 2v2 and 2v1 side rotation reaches every seat.
let teams = logic.createMatchState(seats(4), rackA);
teams.breakShot = false;
const turnSequence = [teams.activeSeatIndex];
for (let i = 0; i < 4; i += 1) {
  teams = logic.applyShotOutcome(teams, outcome(1, [], teams.table));
  turnSequence.push(teams.activeSeatIndex);
}
assert.deepStrictEqual(turnSequence, [0, 1, 2, 3, 0]);

let threeSeats = logic.autoSplitTeams(3);
threeSeats = logic.assignSeat(threeSeats, 0, 'human', 'a0', 'A0', 'A');
threeSeats = logic.assignSeat(threeSeats, 1, 'human', 'b0', 'B0', 'B');
threeSeats = logic.assignSeat(threeSeats, 2, 'human', 'a1', 'A1', 'A');
let handicap = logic.createMatchState(threeSeats, rackA);
handicap.breakShot = false;
const handicapTurns = [handicap.activeSeatIndex];
for (let i = 0; i < 4; i += 1) {
  handicap = logic.applyShotOutcome(handicap, outcome(1, [], handicap.table));
  handicapTurns.push(handicap.activeSeatIndex);
}
assert.deepStrictEqual(handicapTurns, [0, 1, 2, 1, 0]);

// Ball in hand rejects overlaps and accepts a clear location.
const invalidPlacement = logic.placeCueBall(scratch, scratch.table.balls.find((item) => item.id === 1).x, scratch.table.balls.find((item) => item.id === 1).y);
assert.strictEqual(invalidPlacement.ballInHand, true);
const validPlacement = logic.placeCueBall(scratch, 300, 100);
assert.strictEqual(validPlacement.ballInHand, false);
assert.strictEqual(validPlacement.table.balls.find((item) => item.id === 0).pocketed, false);

// CPU chooses the exact ghost-ball line for a sole straight candidate.
const cpuTable = { balls: [ball(0, 200, logic.BALL_R), ball(1, 700, logic.BALL_R)] };
const cpuMatch = logic.createMatchState(seats(2), cpuTable);
cpuMatch.breakShot = false;
const cpuShot = logic.chooseCpuShot(cpuTable, cpuMatch, 0, 0);
const ghost = logic.ghostBallPosition(cpuTable.balls[1], { x: logic.TABLE_W, y: 0 });
assert(Math.abs(cpuShot.angle - Math.atan2(ghost.y - logic.BALL_R, ghost.x - 200)) < 1e-10);

// Roster helpers are immutable and validate occupancy, sides and duplicate IDs.
const split = logic.autoSplitTeams(4);
assert.deepStrictEqual(split.map((seat) => seat.side), ['A', 'B', 'A', 'B']);
assert.strictEqual(logic.autoSplitTeams(1).length, 0);
assert.strictEqual(logic.canStartMatch(split), false);
const ready = seats(4);
assert.strictEqual(logic.canStartMatch(ready), true);
const duplicateAttempt = logic.assignSeat(ready, 1, 'human', 'p0', 'Duplicate', 'B');
assert.deepStrictEqual(duplicateAttempt, ready);
assert.notStrictEqual(logic.assignSeat(ready, 0, 'cpu', null, '', 'A'), ready);

const rows = logic.buildRackScoreboard({ A: 2, B: 1 }, ready);
assert.strictEqual(rows[0].side, 'A');
assert.deepStrictEqual(logic.getRackWinners(rows).map((row) => row.side), ['A']);

console.log('All tests passed');
