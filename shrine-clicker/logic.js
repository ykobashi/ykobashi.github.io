(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ShrineClickerLogic = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const SAVE_VERSION = 1;
  const CLICK_VALUE = 1;
  const MAX_VALUE = Number.MAX_VALUE;
  const BUILDINGS = Object.freeze([
    Object.freeze({ id: 'miko', name: 'お守り屋の巫女', emoji: '🎴', image: 'images/omamori.png', baseCost: 15, production: 0.1 }),
    Object.freeze({ id: 'omikuji', name: 'おみくじ箱', emoji: '🔮', image: 'images/omikuji.png', baseCost: 100, production: 1 }),
    Object.freeze({ id: 'yatai', name: '参道の屋台', emoji: '🏮', image: 'images/yatai.png', baseCost: 1100, production: 8 }),
    Object.freeze({ id: 'kagura', name: '神楽の舞', emoji: '💃', image: 'images/kagura.png', baseCost: 12000, production: 47 }),
    Object.freeze({ id: 'komainu', name: '狛犬の護り', emoji: '🐕', image: 'images/komainu.png', baseCost: 130000, production: 260 }),
    Object.freeze({ id: 'kannushi', name: '神主のお祓い', emoji: '🙏', image: 'images/kannushi.png', baseCost: 1400000, production: 1400 }),
    Object.freeze({ id: 'torii', name: '大鳥居', emoji: '⛩️', image: 'images/torii.png', baseCost: 20000000, production: 7800 }),
    Object.freeze({ id: 'powerspot', name: 'パワースポット認定', emoji: '✨', image: 'images/powerspot.png', baseCost: 330000000, production: 44000 })
  ]);

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function safeNow(now) {
    return typeof now === 'number' && Number.isFinite(now) && now >= 0 ? now : Date.now();
  }

  function nonNegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function nonNegativeInteger(value) {
    return Math.floor(nonNegativeNumber(value));
  }

  function saturatingAdd(left, right) {
    if (left === Infinity || right === Infinity) return MAX_VALUE;
    const sum = nonNegativeNumber(left) + nonNegativeNumber(right);
    return Number.isFinite(sum) ? Math.min(sum, MAX_VALUE) : MAX_VALUE;
  }

  function createBuildingCounts(catalog, source) {
    const counts = {};
    const safeSource = isPlainObject(source) ? source : {};
    catalog.forEach(function (building) {
      counts[building.id] = nonNegativeInteger(safeSource[building.id]);
    });
    return counts;
  }

  function createInitialState(now) {
    const timestamp = safeNow(now === undefined ? Date.now() : now);
    return {
      version: SAVE_VERSION,
      goriyaku: 0,
      totalEarned: 0,
      totalClicks: 0,
      buildings: createBuildingCounts(BUILDINGS),
      lastSaveTime: timestamp
    };
  }

  function normalizeState(state, now, catalog) {
    const timestamp = safeNow(now === undefined ? Date.now() : now);
    const source = isPlainObject(state) ? state : {};
    const goriyaku = nonNegativeNumber(source.goriyaku);
    return {
      version: SAVE_VERSION,
      goriyaku: goriyaku,
      totalEarned: Math.max(goriyaku, nonNegativeNumber(source.totalEarned)),
      totalClicks: nonNegativeInteger(source.totalClicks),
      buildings: createBuildingCounts(catalog || BUILDINGS, source.buildings),
      lastSaveTime: typeof source.lastSaveTime === 'number' && Number.isFinite(source.lastSaveTime) && source.lastSaveTime >= 0
        ? source.lastSaveTime
        : timestamp
    };
  }

  function calculateBuildingCost(baseCost, owned) {
    const cost = nonNegativeNumber(baseCost);
    if (cost === 0) return 0;
    const count = nonNegativeInteger(owned);
    const result = Math.ceil(cost * Math.pow(1.15, count));
    return Number.isFinite(result) ? Math.min(result, MAX_VALUE) : MAX_VALUE;
  }

  function calculateProductionRate(buildings, catalog) {
    const counts = isPlainObject(buildings) ? buildings : {};
    const items = Array.isArray(catalog) ? catalog : BUILDINGS;
    let total = 0;
    items.forEach(function (building) {
      if (!building || typeof building.id !== 'string') return;
      const production = nonNegativeNumber(building.production);
      const owned = nonNegativeInteger(counts[building.id]);
      total = saturatingAdd(total, production * owned);
    });
    return total;
  }

  function applyClick(state, amount) {
    const next = normalizeState(state, state && state.lastSaveTime, BUILDINGS);
    const gain = typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : CLICK_VALUE;
    next.goriyaku = saturatingAdd(next.goriyaku, gain);
    next.totalEarned = saturatingAdd(next.totalEarned, gain);
    next.totalClicks = saturatingAdd(next.totalClicks, 1);
    return next;
  }

  function purchaseBuilding(state, buildingId, catalog) {
    const items = Array.isArray(catalog) ? catalog : BUILDINGS;
    const next = normalizeState(state, state && state.lastSaveTime, items);
    const building = items.find(function (item) { return item && item.id === buildingId; });
    if (!building) return { state: next, purchased: false, cost: 0 };

    const owned = next.buildings[building.id] || 0;
    const cost = calculateBuildingCost(building.baseCost, owned);
    if (next.goriyaku < cost) return { state: next, purchased: false, cost: cost };

    next.goriyaku = Math.max(0, next.goriyaku - cost);
    next.buildings[building.id] = saturatingAdd(owned, 1);
    return { state: next, purchased: true, cost: cost };
  }

  function serializeState(state, now) {
    const timestamp = safeNow(now === undefined ? Date.now() : now);
    const normalized = normalizeState(state, timestamp, BUILDINGS);
    normalized.lastSaveTime = timestamp;
    return JSON.stringify(normalized);
  }

  function deserializeState(serialized, now) {
    const timestamp = safeNow(now === undefined ? Date.now() : now);
    let parsed;
    try {
      parsed = typeof serialized === 'string' ? JSON.parse(serialized) : null;
    } catch (error) {
      return createInitialState(timestamp);
    }
    if (!isPlainObject(parsed) || parsed.version !== SAVE_VERSION) {
      return createInitialState(timestamp);
    }
    const normalized = normalizeState(parsed, timestamp, BUILDINGS);
    if (normalized.lastSaveTime > timestamp) normalized.lastSaveTime = timestamp;
    return normalized;
  }

  function trimUnitNumber(value) {
    return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  }

  function formatNumber(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
    if (Object.is(value, -0)) return '0';
    const absolute = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    const units = [
      { limit: 1e16, suffix: '京' },
      { limit: 1e12, suffix: '兆' },
      { limit: 1e8, suffix: '億' },
      { limit: 1e4, suffix: '万' }
    ];
    let unitIndex = units.findIndex(function (entry) { return absolute >= entry.limit; });
    if (unitIndex >= 0) {
      let scaled = absolute / units[unitIndex].limit;
      while (unitIndex > 0 && Number(scaled.toFixed(2)) >= 10000) {
        unitIndex -= 1;
        scaled = absolute / units[unitIndex].limit;
      }
      return sign + trimUnitNumber(scaled) + units[unitIndex].suffix;
    }
    return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(value);
  }

  return Object.freeze({
    SAVE_VERSION: SAVE_VERSION,
    CLICK_VALUE: CLICK_VALUE,
    BUILDINGS: BUILDINGS,
    createInitialState: createInitialState,
    calculateBuildingCost: calculateBuildingCost,
    calculateProductionRate: calculateProductionRate,
    applyClick: applyClick,
    purchaseBuilding: purchaseBuilding,
    serializeState: serializeState,
    deserializeState: deserializeState,
    formatNumber: formatNumber
  });
});
