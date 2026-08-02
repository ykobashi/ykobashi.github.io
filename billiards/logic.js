(function (root) {
  'use strict';

  const TABLE_W = 1000;
  const TABLE_H = 500;
  const BALL_R = 12;
  const POCKET_R = 30;
  // Keep the drawn pocket size unchanged while accepting near-mouth shots that
  // the rectangular cushion model would otherwise bounce away.
  const POCKET_CAPTURE_R = 36;
  const POCKETS = Object.freeze([
    Object.freeze({ x: 0, y: 0 }),
    Object.freeze({ x: TABLE_W / 2, y: 0 }),
    Object.freeze({ x: TABLE_W, y: 0 }),
    Object.freeze({ x: 0, y: TABLE_H }),
    Object.freeze({ x: TABLE_W / 2, y: TABLE_H }),
    Object.freeze({ x: TABLE_W, y: TABLE_H })
  ]);
  const FIXED_DT = 1 / 240;
  const FRICTION_DECEL = 185;
  const RESTITUTION_WALL = 0.82;
  const RESTITUTION_BALL = 0.94;
  const STOP_EPSILON = 2;
  const MAX_POWER = 100;
  const MAX_SIM_SECONDS = 12;
  const MAX_CUE_SPEED = 900;
  const EPSILON = 1e-9;

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cloneBall(ball) {
    return {
      id: Number(ball.id),
      x: finite(Number(ball.x), TABLE_W / 2),
      y: finite(Number(ball.y), TABLE_H / 2),
      vx: finite(Number(ball.vx), 0),
      vy: finite(Number(ball.vy), 0),
      pocketed: Boolean(ball.pocketed)
    };
  }

  function cloneTable(tableState) {
    const balls = tableState && Array.isArray(tableState.balls) ? tableState.balls : [];
    return { balls: balls.map(cloneBall).sort((a, b) => a.id - b.id) };
  }

  function cloneSeats(seats) {
    return (Array.isArray(seats) ? seats : []).map((seat, index) => ({
      seatIndex: Number.isInteger(seat.seatIndex) ? seat.seatIndex : index,
      kind: seat.kind || 'empty',
      playerId: seat.playerId == null ? null : String(seat.playerId),
      name: seat.name == null ? '' : String(seat.name),
      side: seat.side === 'A' || seat.side === 'B' ? seat.side : null
    }));
  }

  function ballGroup(id) {
    if (id >= 1 && id <= 7) return 'solids';
    if (id >= 9 && id <= 15) return 'stripes';
    return null;
  }

  function oppositeSide(side) {
    return side === 'A' ? 'B' : 'A';
  }

  function createBreakLayout(random) {
    const rng = typeof random === 'function' ? random : Math.random;
    const ids = [];
    for (let id = 1; id <= 15; id += 1) {
      if (id !== 8) ids.push(id);
    }
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const value = clamp(finite(Number(rng()), 0.5), 0, 0.999999999999);
      const j = Math.floor(value * (i + 1));
      const temp = ids[i];
      ids[i] = ids[j];
      ids[j] = temp;
    }

    // Keep opposite groups at the two rear corners and the 8-ball in the centre.
    let solidIndex = ids.findIndex((id) => ballGroup(id) === 'solids');
    if (solidIndex > 0) [ids[0], ids[solidIndex]] = [ids[solidIndex], ids[0]];
    let stripeIndex = ids.findIndex((id) => ballGroup(id) === 'stripes');
    if (stripeIndex > 1) [ids[1], ids[stripeIndex]] = [ids[stripeIndex], ids[1]];

    const slots = [];
    const horizontalGap = Math.sqrt(3) * BALL_R + 0.08;
    const verticalGap = BALL_R * 2 + 0.08;
    const apexX = TABLE_W * 0.70;
    for (let row = 0; row < 5; row += 1) {
      for (let position = 0; position <= row; position += 1) {
        slots.push({
          x: apexX + row * horizontalGap,
          y: TABLE_H / 2 + (position - row / 2) * verticalGap
        });
      }
    }

    const rackIds = [];
    let shuffledIndex = 0;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      rackIds.push(slotIndex === 4 ? 8 : ids[shuffledIndex++]);
    }
    // Slots 10 and 14 are the two rear corners.
    const rearSolid = rackIds.findIndex((id) => ballGroup(id) === 'solids');
    if (rearSolid !== 10) [rackIds[10], rackIds[rearSolid]] = [rackIds[rearSolid], rackIds[10]];
    const rearStripe = rackIds.findIndex((id) => ballGroup(id) === 'stripes' && rackIds.indexOf(id) !== 10);
    if (rearStripe !== 14) [rackIds[14], rackIds[rearStripe]] = [rackIds[rearStripe], rackIds[14]];

    const balls = [{ id: 0, x: TABLE_W * 0.25, y: TABLE_H / 2, vx: 0, vy: 0, pocketed: false }];
    slots.forEach((slot, index) => {
      balls.push({ id: rackIds[index], x: slot.x, y: slot.y, vx: 0, vy: 0, pocketed: false });
    });
    balls.sort((a, b) => a.id - b.id);
    return { balls };
  }

  function applyCueInput(tableState, angle, power) {
    const table = cloneTable(tableState);
    const cue = table.balls.find((ball) => ball.id === 0 && !ball.pocketed);
    if (!cue) return table;
    const safeAngle = finite(Number(angle), 0);
    const safePower = clamp(finite(Number(power), 0), 0, MAX_POWER);
    const speed = (safePower / MAX_POWER) * MAX_CUE_SPEED;
    cue.vx = Math.cos(safeAngle) * speed;
    cue.vy = Math.sin(safeAngle) * speed;
    return table;
  }

  function pocketBalls(table, events, nextSeq) {
    table.balls.forEach((ball) => {
      if (ball.pocketed) return;
      for (let pocketIndex = 0; pocketIndex < POCKETS.length; pocketIndex += 1) {
        const pocket = POCKETS[pocketIndex];
        const dx = ball.x - pocket.x;
        const dy = ball.y - pocket.y;
        if (dx * dx + dy * dy <= POCKET_CAPTURE_R * POCKET_CAPTURE_R) {
          ball.pocketed = true;
          ball.x = pocket.x;
          ball.y = pocket.y;
          ball.vx = 0;
          ball.vy = 0;
          events.push({ type: 'pocket', ballId: ball.id, pocketIndex, seq: nextSeq() });
          break;
        }
      }
    });
  }

  function stepPhysics(tableState, dt) {
    const table = cloneTable(tableState);
    const step = clamp(finite(Number(dt), FIXED_DT), 0, 0.05);
    const events = [];
    let sequence = 0;
    const nextSeq = () => sequence++;

    pocketBalls(table, events, nextSeq);
    table.balls.forEach((ball) => {
      if (ball.pocketed) return;
      ball.x += ball.vx * step;
      ball.y += ball.vy * step;
    });
    pocketBalls(table, events, nextSeq);

    const active = table.balls.filter((ball) => !ball.pocketed);
    const diameter = BALL_R * 2;
    const diameterSquared = diameter * diameter;
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const a = active[i];
        const b = active[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > diameterSquared) continue;
        let distance = Math.sqrt(distanceSquared);
        let nx;
        let ny;
        if (distance < EPSILON) {
          nx = a.id <= b.id ? 1 : -1;
          ny = 0;
          distance = 0;
        } else {
          nx = dx / distance;
          ny = dy / distance;
        }

        const overlap = diameter - distance;
        if (overlap > 0) {
          const correction = overlap / 2 + 1e-7;
          a.x -= nx * correction;
          a.y -= ny * correction;
          b.x += nx * correction;
          b.y += ny * correction;
        }

        const relativeNormalVelocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (relativeNormalVelocity < -EPSILON) {
          const impulse = -((1 + RESTITUTION_BALL) * relativeNormalVelocity) / 2;
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          b.vx += impulse * nx;
          b.vy += impulse * ny;
          events.push({ type: 'collision', ballA: a.id, ballB: b.id, seq: nextSeq() });
        }
      }
    }

    pocketBalls(table, events, nextSeq);
    table.balls.forEach((ball) => {
      if (ball.pocketed) return;
      let axis = '';
      if (ball.x < BALL_R) {
        ball.x = BALL_R;
        if (ball.vx < 0) ball.vx = -ball.vx * RESTITUTION_WALL;
        axis += 'x';
      } else if (ball.x > TABLE_W - BALL_R) {
        ball.x = TABLE_W - BALL_R;
        if (ball.vx > 0) ball.vx = -ball.vx * RESTITUTION_WALL;
        axis += 'x';
      }
      if (ball.y < BALL_R) {
        ball.y = BALL_R;
        if (ball.vy < 0) ball.vy = -ball.vy * RESTITUTION_WALL;
        axis += 'y';
      } else if (ball.y > TABLE_H - BALL_R) {
        ball.y = TABLE_H - BALL_R;
        if (ball.vy > 0) ball.vy = -ball.vy * RESTITUTION_WALL;
        axis += 'y';
      }
      if (axis) events.push({ type: 'cushion', ballId: ball.id, axis, seq: nextSeq() });
    });

    table.balls.forEach((ball) => {
      if (ball.pocketed) return;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed <= STOP_EPSILON) {
        ball.vx = 0;
        ball.vy = 0;
        return;
      }
      const newSpeed = Math.max(0, speed - FRICTION_DECEL * step);
      if (newSpeed <= STOP_EPSILON) {
        ball.vx = 0;
        ball.vy = 0;
      } else {
        const ratio = newSpeed / speed;
        ball.vx *= ratio;
        ball.vy *= ratio;
      }
    });

    return { tableState: table, events };
  }

  function isSettled(tableState) {
    if (!tableState || !Array.isArray(tableState.balls)) return true;
    return tableState.balls.every((ball) => {
      if (ball.pocketed) return true;
      return Number.isFinite(ball.x) && Number.isFinite(ball.y) &&
        Number.isFinite(ball.vx) && Number.isFinite(ball.vy) &&
        Math.hypot(ball.vx, ball.vy) <= STOP_EPSILON;
    });
  }

  function simulateShot(tableState, angle, power) {
    let table = applyCueInput(tableState, angle, power);
    const events = [];
    const maxSteps = Math.ceil(MAX_SIM_SECONDS / FIXED_DT);
    let seq = 0;
    let steps = 0;
    while (!isSettled(table) && steps < maxSteps) {
      const result = stepPhysics(table, FIXED_DT);
      table = result.tableState;
      result.events.forEach((event) => events.push(Object.assign({}, event, { seq: seq++ })));
      steps += 1;
    }
    if (!isSettled(table)) {
      table.balls.forEach((ball) => { ball.vx = 0; ball.vy = 0; });
      events.push({ type: 'timeout', seq: seq++ });
    }
    return { finalState: table, events };
  }

  function ghostBallPosition(objectBallPos, pocketPos) {
    const dx = finite(Number(pocketPos && pocketPos.x), 0) - finite(Number(objectBallPos && objectBallPos.x), 0);
    const dy = finite(Number(pocketPos && pocketPos.y), 0) - finite(Number(objectBallPos && objectBallPos.y), 0);
    const distance = Math.hypot(dx, dy);
    if (distance < EPSILON) {
      return { x: finite(Number(objectBallPos && objectBallPos.x), 0) - BALL_R * 2, y: finite(Number(objectBallPos && objectBallPos.y), 0) };
    }
    return {
      x: objectBallPos.x - (dx / distance) * BALL_R * 2,
      y: objectBallPos.y - (dy / distance) * BALL_R * 2
    };
  }

  function hasLineOfSight(tableState, fromPos, toPos, ignoreBallIds) {
    if (!fromPos || !toPos) return false;
    const fromX = finite(Number(fromPos.x), NaN);
    const fromY = finite(Number(fromPos.y), NaN);
    const toX = finite(Number(toPos.x), NaN);
    const toY = finite(Number(toPos.y), NaN);
    if (![fromX, fromY, toX, toY].every(Number.isFinite)) return false;
    const ignored = new Set(Array.isArray(ignoreBallIds) ? ignoreBallIds.map(Number) : []);
    const segmentX = toX - fromX;
    const segmentY = toY - fromY;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    if (lengthSquared < EPSILON) return true;
    const clearanceSquared = (BALL_R * 2 - 1e-6) ** 2;
    const table = cloneTable(tableState);
    return table.balls.every((ball) => {
      if (ball.pocketed || ignored.has(ball.id)) return true;
      if (Math.hypot(ball.x - fromX, ball.y - fromY) < 1e-6) return true;
      if (Math.hypot(ball.x - toX, ball.y - toY) < 1e-6) return true;
      const projection = ((ball.x - fromX) * segmentX + (ball.y - fromY) * segmentY) / lengthSquared;
      if (projection <= 0 || projection >= 1) return true;
      const closestX = fromX + projection * segmentX;
      const closestY = fromY + projection * segmentY;
      const dx = ball.x - closestX;
      const dy = ball.y - closestY;
      return dx * dx + dy * dy >= clearanceSquared;
    });
  }

  function createMatchState(seatsConfig, breakLayout) {
    const seats = cloneSeats(seatsConfig);
    const turnOrder = seats.map((seat, index) => Number.isInteger(seat.seatIndex) ? seat.seatIndex : index);
    const activeSeatIndex = turnOrder[0] == null ? null : turnOrder[0];
    const activeSeat = seats.find((seat) => seat.seatIndex === activeSeatIndex);
    const lastSeatBySide = { A: null, B: null };
    if (activeSeat && activeSeat.side) lastSeatBySide[activeSeat.side] = activeSeat.seatIndex;
    return {
      seats,
      turnOrder,
      activeSeatIndex,
      version: 0,
      sideGroups: { A: null, B: null },
      ballInHand: false,
      ballInHandSide: null,
      phase: 'playing',
      table: cloneTable(breakLayout || createBreakLayout()),
      racksWon: { A: 0, B: 0 },
      breakShot: true,
      winner: null,
      foul: false,
      foulReason: null,
      lastOutcome: null,
      lastSeatBySide
    };
  }

  function eventSequence(event, fallback) {
    return Number.isFinite(event && event.seq) ? event.seq : fallback;
  }

  function normalizeShotOutcome(matchState, shotOutcome) {
    const wrapper = Array.isArray(shotOutcome) ? { events: shotOutcome } : (shotOutcome || {});
    const events = Array.isArray(wrapper.events) ? wrapper.events : [];
    let firstContactId = Number.isInteger(wrapper.firstContactId) ? wrapper.firstContactId : null;
    let firstContactSeq = Number.POSITIVE_INFINITY;
    const pocketedIds = Array.isArray(wrapper.pocketedIds) ? wrapper.pocketedIds.map(Number) : [];
    let railAfterContact = wrapper.railAfterContact === true;
    let pocketAfterContact = wrapper.pocketAfterContact === true;

    events.forEach((event, index) => {
      const seq = eventSequence(event, index);
      if (event.type === 'collision' && firstContactId == null) {
        if (event.ballA === 0 && event.ballB !== 0) {
          firstContactId = Number(event.ballB);
          firstContactSeq = seq;
        } else if (event.ballB === 0 && event.ballA !== 0) {
          firstContactId = Number(event.ballA);
          firstContactSeq = seq;
        }
      } else if (event.type === 'collision' && seq < firstContactSeq && (event.ballA === 0 || event.ballB === 0)) {
        firstContactId = Number(event.ballA === 0 ? event.ballB : event.ballA);
        firstContactSeq = seq;
      }
      if (event.type === 'pocket' && !pocketedIds.includes(Number(event.ballId))) pocketedIds.push(Number(event.ballId));
    });
    if (firstContactId != null && !Number.isFinite(firstContactSeq)) firstContactSeq = -1;
    events.forEach((event, index) => {
      const seq = eventSequence(event, index);
      if (seq <= firstContactSeq) return;
      if (event.type === 'cushion') railAfterContact = true;
      if (event.type === 'pocket') pocketAfterContact = true;
    });
    if (pocketedIds.length && wrapper.pocketAfterContact == null) pocketAfterContact = true;
    const finalState = wrapper.finalState ? cloneTable(wrapper.finalState) : cloneTable(matchState.table);
    if (!wrapper.finalState) {
      pocketedIds.forEach((id) => {
        const ball = finalState.balls.find((candidate) => candidate.id === id);
        if (ball) { ball.pocketed = true; ball.vx = 0; ball.vy = 0; }
      });
    }
    return {
      events,
      finalState,
      firstContactId,
      pocketedIds: Array.from(new Set(pocketedIds)).sort((a, b) => a - b),
      railAfterContact,
      pocketAfterContact,
      scratch: wrapper.scratch === true || pocketedIds.includes(0)
    };
  }

  function remainingGroupBalls(table, group) {
    return table.balls.filter((ball) => !ball.pocketed && ballGroup(ball.id) === group);
  }

  function legalFirstContact(matchState, side, ballId) {
    if (!Number.isInteger(ballId) || ballId === 0) return false;
    const group = matchState.sideGroups[side];
    if (!group) return ballId !== 8 && ballGroup(ballId) !== null;
    return remainingGroupBalls(matchState.table, group).length === 0 ? ballId === 8 : ballGroup(ballId) === group;
  }

  function legalTargetBallIds(matchState) {
    if (!matchState || !matchState.table || !Array.isArray(matchState.table.balls)) return [];
    const activeSeat = (matchState.seats || []).find((seat) => seat.seatIndex === matchState.activeSeatIndex);
    if (!activeSeat || !activeSeat.side) return [];
    const available = matchState.table.balls.filter((ball) => !ball.pocketed && ball.id !== 0);
    const group = matchState.sideGroups && matchState.sideGroups[activeSeat.side];
    if (!group) return available.filter((ball) => ball.id !== 8 && ballGroup(ball.id)).map((ball) => ball.id);
    const ownBalls = available.filter((ball) => ballGroup(ball.id) === group);
    if (ownBalls.length) return ownBalls.map((ball) => ball.id);
    return available.some((ball) => ball.id === 8) ? [8] : [];
  }

  function nextSeatForSide(state, side) {
    const members = state.turnOrder.filter((seatIndex) => {
      const seat = state.seats.find((candidate) => candidate.seatIndex === seatIndex);
      return seat && seat.side === side && seat.kind !== 'empty';
    });
    if (!members.length) return null;
    const previous = state.lastSeatBySide && state.lastSeatBySide[side];
    const previousIndex = members.indexOf(previous);
    return members[(previousIndex + 1 + members.length) % members.length];
  }

  function finishRack(state, winner, reason) {
    state.phase = 'rack-over';
    state.winner = winner;
    state.racksWon[winner] = (state.racksWon[winner] || 0) + 1;
    state.ballInHand = false;
    state.ballInHandSide = null;
    state.foul = winner !== null && reason !== 'legal-eight';
    state.foulReason = state.foul ? reason : null;
    state.lastOutcome = { type: 'rack-over', winner, reason, foul: state.foul };
    return state;
  }

  function passTurn(state, targetSide, ballInHand, reason) {
    const nextSeat = nextSeatForSide(state, targetSide);
    if (nextSeat != null) {
      state.activeSeatIndex = nextSeat;
      state.lastSeatBySide[targetSide] = nextSeat;
    }
    state.ballInHand = Boolean(ballInHand);
    state.ballInHandSide = ballInHand ? targetSide : null;
    state.foul = Boolean(ballInHand);
    state.foulReason = ballInHand ? reason : null;
  }

  function applyShotOutcome(matchState, shotOutcome) {
    const state = Object.assign({}, matchState, {
      seats: cloneSeats(matchState.seats),
      turnOrder: (matchState.turnOrder || []).slice(),
      sideGroups: Object.assign({ A: null, B: null }, matchState.sideGroups),
      racksWon: Object.assign({ A: 0, B: 0 }, matchState.racksWon),
      table: cloneTable(matchState.table),
      lastSeatBySide: Object.assign({ A: null, B: null }, matchState.lastSeatBySide)
    });
    if (state.phase !== 'playing') return state;
    const activeSeat = state.seats.find((seat) => seat.seatIndex === state.activeSeatIndex);
    if (!activeSeat || !activeSeat.side) return state;
    const shootingSide = activeSeat.side;
    const opponent = oppositeSide(shootingSide);
    const outcome = normalizeShotOutcome(state, shotOutcome);
    state.table = outcome.finalState;
    state.version = finite(Number(state.version), 0) + 1;
    state.foul = false;
    state.foulReason = null;

    const eightPocketed = outcome.pocketedIds.includes(8);
    if (state.breakShot && eightPocketed) {
      state.table = createBreakLayout(() => 0.5);
      state.breakShot = true;
      state.ballInHand = false;
      state.ballInHandSide = null;
      state.lastOutcome = { type: 'rerack', reason: 'eight-on-break', foul: false };
      return state;
    }

    if (eightPocketed) {
      const assignedGroup = state.sideGroups[shootingSide];
      const groupWasClear = Boolean(assignedGroup) && remainingGroupBalls(matchState.table, assignedGroup).length === 0;
      const legalEight = groupWasClear && outcome.firstContactId === 8 && !outcome.scratch &&
        (outcome.railAfterContact || outcome.pocketAfterContact);
      return finishRack(state, legalEight ? shootingSide : opponent,
        legalEight ? 'legal-eight' : (outcome.scratch ? 'eight-and-scratch' : 'early-eight'));
    }

    let foulReason = null;
    if (outcome.scratch) foulReason = 'scratch';
    else if (outcome.firstContactId == null) foulReason = 'no-contact';
    else if (!legalFirstContact(matchState, shootingSide, outcome.firstContactId)) foulReason = 'wrong-first-contact';
    else if (!outcome.railAfterContact && !outcome.pocketAfterContact) foulReason = 'no-rail';

    if (foulReason) {
      state.breakShot = false;
      passTurn(state, opponent, true, foulReason);
      state.lastOutcome = { type: 'foul', reason: foulReason, foul: true, nextSide: opponent };
      return state;
    }

    const objectPockets = outcome.pocketedIds.filter((id) => id !== 0 && id !== 8);
    const pocketedGroups = new Set(objectPockets.map(ballGroup).filter(Boolean));
    if (state.breakShot) {
      // A legal break never assigns groups.
    } else if (!state.sideGroups[shootingSide] && pocketedGroups.size === 1) {
      const assigned = Array.from(pocketedGroups)[0];
      state.sideGroups[shootingSide] = assigned;
      state.sideGroups[opponent] = assigned === 'solids' ? 'stripes' : 'solids';
    }

    const ownGroup = state.sideGroups[shootingSide];
    const legalPot = objectPockets.length > 0 && (!ownGroup || objectPockets.some((id) => ballGroup(id) === ownGroup));
    state.breakShot = false;
    state.ballInHand = false;
    state.ballInHandSide = null;
    if (!legalPot) passTurn(state, opponent, false, null);
    state.lastOutcome = {
      type: legalPot ? 'continue' : 'turn-over',
      foul: false,
      nextSide: legalPot ? shootingSide : opponent,
      pocketedIds: objectPockets.slice()
    };
    return state;
  }

  function placeCueBall(matchState, x, y) {
    const state = Object.assign({}, matchState, { table: cloneTable(matchState.table) });
    const safeX = Number(x);
    const safeY = Number(y);
    const activeSeat = (state.seats || []).find((seat) => seat.seatIndex === state.activeSeatIndex);
    const validTurn = state.ballInHand && activeSeat && activeSeat.side === state.ballInHandSide;
    const inside = Number.isFinite(safeX) && Number.isFinite(safeY) &&
      safeX >= BALL_R && safeX <= TABLE_W - BALL_R && safeY >= BALL_R && safeY <= TABLE_H - BALL_R;
    const clear = inside && state.table.balls.every((ball) => ball.id === 0 || ball.pocketed ||
      Math.hypot(ball.x - safeX, ball.y - safeY) >= BALL_R * 2 - 1e-6);
    const outsidePocket = inside && POCKETS.every((pocket) => Math.hypot(pocket.x - safeX, pocket.y - safeY) > POCKET_CAPTURE_R);
    if (!validTurn || !inside || !clear || !outsidePocket) {
      state.placementError = !validTurn ? 'not-allowed' : 'invalid-position';
      return state;
    }
    let cue = state.table.balls.find((ball) => ball.id === 0);
    if (!cue) {
      cue = { id: 0, x: safeX, y: safeY, vx: 0, vy: 0, pocketed: false };
      state.table.balls.push(cue);
      state.table.balls.sort((a, b) => a.id - b.id);
    }
    cue.x = safeX;
    cue.y = safeY;
    cue.vx = 0;
    cue.vy = 0;
    cue.pocketed = false;
    state.ballInHand = false;
    state.ballInHandSide = null;
    state.placementError = null;
    state.version = finite(Number(state.version), 0) + 1;
    return state;
  }

  function isGameOver(matchState) {
    return Boolean(matchState && (matchState.phase === 'rack-over' || matchState.phase === 'game-over'));
  }

  function winningSide(matchState) {
    return isGameOver(matchState) && (matchState.winner === 'A' || matchState.winner === 'B') ? matchState.winner : null;
  }

  function buildRackScoreboard(racksWon, seats) {
    const scores = Object.assign({ A: 0, B: 0 }, racksWon);
    const roster = cloneSeats(seats);
    const rows = ['A', 'B'].map((side) => ({
      id: side,
      side,
      name: `Side ${side}`,
      members: roster.filter((seat) => seat.side === side).map((seat) => seat.name || `Seat ${seat.seatIndex + 1}`),
      score: finite(Number(scores[side]), 0)
    })).sort((a, b) => b.score - a.score || a.side.localeCompare(b.side));
    let previousScore = null;
    let rank = 0;
    rows.forEach((row, index) => {
      if (row.score !== previousScore) {
        rank = index + 1;
        previousScore = row.score;
      }
      row.rank = rank;
    });
    return rows;
  }

  function getRackWinners(rows) {
    return (Array.isArray(rows) ? rows : []).filter((row) => row.rank === 1);
  }

  function assignSeat(seats, seatIndex, kind, playerId, name, side) {
    const result = cloneSeats(seats);
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= result.length) return result;
    if (!['human', 'cpu', 'empty'].includes(kind)) return result;
    if (side !== 'A' && side !== 'B' && kind !== 'empty') return result;
    const normalizedId = playerId == null || playerId === '' ? (kind === 'cpu' ? `cpu-${seatIndex}` : null) : String(playerId);
    if (kind !== 'empty' && normalizedId && result.some((seat, index) => index !== seatIndex && seat.playerId === normalizedId)) return result;
    result[seatIndex] = {
      seatIndex,
      kind,
      playerId: kind === 'empty' ? null : normalizedId,
      name: kind === 'empty' ? '' : (String(name || '').trim() || (kind === 'cpu' ? `CPU ${seatIndex + 1}` : `プレイヤー ${seatIndex + 1}`)),
      side: kind === 'empty' ? null : side
    };
    return result;
  }

  function autoSplitTeams(seatCount) {
    if (!Number.isInteger(seatCount) || seatCount < 2 || seatCount > 4) return [];
    return Array.from({ length: seatCount }, (_, index) => ({
      seatIndex: index,
      kind: 'empty',
      playerId: null,
      name: '',
      side: index % 2 === 0 ? 'A' : 'B'
    }));
  }

  function canStartMatch(seats) {
    if (!Array.isArray(seats) || seats.length < 2 || seats.length > 4) return false;
    const normalized = cloneSeats(seats);
    const seatIndexes = normalized.map((seat) => seat.seatIndex);
    if (new Set(seatIndexes).size !== normalized.length ||
        seatIndexes.some((seatIndex) => !Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= normalized.length)) return false;
    const occupied = normalized.filter((seat) => seat.kind !== 'empty');
    if (occupied.length !== normalized.length) return false;
    if (occupied.some((seat) => !['human', 'cpu'].includes(seat.kind) || !seat.playerId || !seat.name || !seat.side)) return false;
    const ids = occupied.map((seat) => seat.playerId);
    if (new Set(ids).size !== ids.length) return false;
    return occupied.some((seat) => seat.side === 'A') && occupied.some((seat) => seat.side === 'B');
  }

  function scoreCandidateShot(tableState, cueBallPos, objectBall, pocket) {
    if (!cueBallPos || !objectBall || !pocket || objectBall.pocketed || objectBall.id === 0) return null;
    const ghost = ghostBallPosition(objectBall, pocket);
    if (ghost.x < BALL_R || ghost.x > TABLE_W - BALL_R || ghost.y < BALL_R || ghost.y > TABLE_H - BALL_R) return null;
    if (!hasLineOfSight(tableState, objectBall, pocket, [objectBall.id])) return null;
    if (!hasLineOfSight(tableState, cueBallPos, ghost, [0, objectBall.id])) return null;
    const cueDistance = Math.hypot(ghost.x - cueBallPos.x, ghost.y - cueBallPos.y);
    const objectDistance = Math.hypot(pocket.x - objectBall.x, pocket.y - objectBall.y);
    if (cueDistance < EPSILON || objectDistance < EPSILON) return null;
    const cueDirectionX = (ghost.x - cueBallPos.x) / cueDistance;
    const cueDirectionY = (ghost.y - cueBallPos.y) / cueDistance;
    const targetDirectionX = (pocket.x - objectBall.x) / objectDistance;
    const targetDirectionY = (pocket.y - objectBall.y) / objectDistance;
    const alignment = clamp(cueDirectionX * targetDirectionX + cueDirectionY * targetDirectionY, -1, 1);
    if (alignment < 0.08) return null;
    return alignment * 1500 - cueDistance - objectDistance * 0.45;
  }

  function legalCpuTargets(tableState, matchState, seatIndex) {
    const table = cloneTable(tableState);
    const seat = (matchState.seats || []).find((candidate) => candidate.seatIndex === seatIndex);
    const side = seat && seat.side;
    const group = side && matchState.sideGroups ? matchState.sideGroups[side] : null;
    if (!group) return table.balls.filter((ball) => !ball.pocketed && ball.id !== 0 && ball.id !== 8);
    const groupBalls = table.balls.filter((ball) => !ball.pocketed && ballGroup(ball.id) === group);
    return groupBalls.length ? groupBalls : table.balls.filter((ball) => !ball.pocketed && ball.id === 8);
  }

  function chooseCpuShot(tableState, matchState, seatIndex, randomValue) {
    const table = cloneTable(tableState);
    const cue = table.balls.find((ball) => ball.id === 0 && !ball.pocketed);
    if (!cue) return { angle: 0, power: 0 };
    const targets = legalCpuTargets(table, matchState || {}, seatIndex);
    const candidates = [];
    targets.forEach((objectBall) => {
      POCKETS.forEach((pocket, pocketIndex) => {
        const score = scoreCandidateShot(table, cue, objectBall, pocket);
        if (score == null) return;
        const ghost = ghostBallPosition(objectBall, pocket);
        const distance = Math.hypot(ghost.x - cue.x, ghost.y - cue.y) + Math.hypot(pocket.x - objectBall.x, pocket.y - objectBall.y);
        candidates.push({
          score,
          objectId: objectBall.id,
          pocketIndex,
          angle: Math.atan2(ghost.y - cue.y, ghost.x - cue.x),
          power: clamp(28 + distance / 16, 28, MAX_POWER)
        });
      });
    });
    candidates.sort((a, b) => b.score - a.score || a.objectId - b.objectId || a.pocketIndex - b.pocketIndex);
    if (candidates.length) {
      const nearBest = candidates.filter((candidate) => candidate.score >= candidates[0].score - 1e-7);
      const random = clamp(finite(Number(randomValue), 0), 0, 0.999999999);
      return Object.assign({}, nearBest[Math.floor(random * nearBest.length)]);
    }
    const fallback = targets.sort((a, b) => a.id - b.id)[0];
    if (!fallback) return { angle: 0, power: 25 };
    return { angle: Math.atan2(fallback.y - cue.y, fallback.x - cue.x), power: 45, objectId: fallback.id, pocketIndex: null };
  }

  function validCuePosition(table, x, y) {
    if (x < BALL_R || x > TABLE_W - BALL_R || y < BALL_R || y > TABLE_H - BALL_R) return false;
    if (POCKETS.some((pocket) => Math.hypot(pocket.x - x, pocket.y - y) <= POCKET_CAPTURE_R)) return false;
    return table.balls.every((ball) => ball.id === 0 || ball.pocketed || Math.hypot(ball.x - x, ball.y - y) >= BALL_R * 2 + 0.5);
  }

  function chooseCpuCuePlacement(tableState, matchState, randomValue) {
    const table = cloneTable(tableState);
    const random = clamp(finite(Number(randomValue), 0.5), 0, 0.999999999);
    const preferred = legalCpuTargets(table, matchState || {}, matchState && matchState.activeSeatIndex)[0];
    const candidates = [];
    if (preferred) {
      const offset = BALL_R * 5;
      candidates.push({ x: preferred.x - offset, y: preferred.y });
    }
    const columns = 12;
    const rows = 7;
    const start = Math.floor(random * columns * rows);
    for (let i = 0; i < columns * rows; i += 1) {
      const index = (start + i * 37) % (columns * rows);
      candidates.push({
        x: BALL_R * 2 + (index % columns) * ((TABLE_W - BALL_R * 4) / (columns - 1)),
        y: BALL_R * 2 + Math.floor(index / columns) * ((TABLE_H - BALL_R * 4) / (rows - 1))
      });
    }
    const chosen = candidates.find((candidate) => validCuePosition(table, candidate.x, candidate.y));
    return chosen || { x: TABLE_W * 0.25, y: TABLE_H / 2 };
  }

  const api = {
    TABLE_W, TABLE_H, BALL_R, POCKET_R, POCKET_CAPTURE_R, POCKETS, FIXED_DT, FRICTION_DECEL,
    RESTITUTION_WALL, RESTITUTION_BALL, STOP_EPSILON, MAX_POWER, MAX_SIM_SECONDS,
    createBreakLayout, applyCueInput, stepPhysics, isSettled, simulateShot,
    ghostBallPosition, hasLineOfSight, createMatchState, applyShotOutcome,
    placeCueBall, isGameOver, winningSide, buildRackScoreboard, getRackWinners,
    assignSeat, autoSplitTeams, canStartMatch, scoreCandidateShot, chooseCpuShot,
    chooseCpuCuePlacement, legalTargetBallIds
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BilliardsLogic = api;
}(typeof window !== 'undefined' ? window : null));
