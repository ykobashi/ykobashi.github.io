(function () {
  'use strict';

  const logic = window.ShrineClickerLogic;
  if (!logic) return;

  const STORAGE_KEY = 'shrineClicker_save';
  const TICK_INTERVAL_MS = 100;
  const SAVE_INTERVAL_MS = 10000;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const buildingViews = new Map();
  let storageWarningShown = false;
  let lastTickTime;
  let state;

  const elements = {
    goriyaku: document.getElementById('goriyaku-count'),
    rate: document.getElementById('rate-count'),
    total: document.getElementById('total-count'),
    clicks: document.getElementById('click-count'),
    offeringBox: document.getElementById('offering-box'),
    offeringImage: document.getElementById('offering-image'),
    effectLayer: document.getElementById('effect-layer'),
    buildingList: document.getElementById('building-list'),
    announcer: document.getElementById('game-announcer')
  };

  const rendered = { goriyaku: '', rate: '', total: '', clicks: '' };

  function cappedAdd(value, gain) {
    const result = value + gain;
    return Number.isFinite(result) ? Math.min(result, Number.MAX_VALUE) : Number.MAX_VALUE;
  }

  function readSave() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function announceStorageWarning() {
    if (storageWarningShown) return;
    storageWarningShown = true;
    elements.announcer.textContent = '保存機能を利用できません。ゲームはこのまま遊べます。';
  }

  function writeSave(serialized) {
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch (error) {
      announceStorageWarning();
    }
  }

  function addEarnings(earnings) {
    if (!(earnings > 0)) return;
    state = Object.assign({}, state, {
      goriyaku: cappedAdd(state.goriyaku, earnings),
      totalEarned: cappedAdd(state.totalEarned, earnings)
    });
  }

  function advanceTo(now) {
    const delta = Math.max(0, (now - lastTickTime) / 1000);
    const rate = logic.calculateProductionRate(state.buildings);
    addEarnings(rate * delta);
    lastTickTime = now;
  }

  function saveNow(now) {
    advanceTo(now);
    state = Object.assign({}, state, { lastSaveTime: now });
    writeSave(logic.serializeState(state, now));
  }

  function setTextIfChanged(element, key, value) {
    if (rendered[key] === value) return;
    rendered[key] = value;
    element.textContent = value;
  }

  function render() {
    const rate = logic.calculateProductionRate(state.buildings);
    setTextIfChanged(elements.goriyaku, 'goriyaku', logic.formatNumber(state.goriyaku));
    setTextIfChanged(elements.rate, 'rate', logic.formatNumber(rate));
    setTextIfChanged(elements.total, 'total', logic.formatNumber(state.totalEarned));
    setTextIfChanged(elements.clicks, 'clicks', logic.formatNumber(state.totalClicks));

    logic.BUILDINGS.forEach(function (building) {
      const view = buildingViews.get(building.id);
      if (!view) return;
      const owned = state.buildings[building.id] || 0;
      const cost = logic.calculateBuildingCost(building.baseCost, owned);
      const ownedText = '×' + logic.formatNumber(owned);
      const costText = '次の価格 ' + logic.formatNumber(cost) + ' ご利益';
      if (view.owned.textContent !== ownedText) view.owned.textContent = ownedText;
      if (view.cost.textContent !== costText) view.cost.textContent = costText;
      view.button.disabled = state.goriyaku < cost;
    });
  }

  function activateImageFallback(image, frame) {
    function loaded() {
      image.classList.remove('is-broken');
      image.classList.add('is-loaded');
      frame.classList.add('has-image');
    }
    function failed() {
      image.classList.remove('is-loaded');
      image.classList.add('is-broken');
      frame.classList.remove('has-image');
    }
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    if (image.complete && image.getAttribute('src')) {
      if (image.naturalWidth > 0) loaded();
      else failed();
    }
  }

  function createBuildingImage(building) {
    const frame = document.createElement('span');
    frame.className = 'building-image image-frame';

    const fallback = document.createElement('span');
    fallback.className = 'image-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    fallback.textContent = building.emoji;

    const image = document.createElement('img');
    image.alt = '';
    image.width = 512;
    image.height = 512;
    image.decoding = 'async';
    image.loading = 'lazy';
    activateImageFallback(image, frame);
    frame.append(fallback, image);
    image.src = building.image;
    return { frame: frame, image: image };
  }

  function buildBuildingList() {
    logic.BUILDINGS.forEach(function (building) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'building-card';
      button.dataset.buildingId = building.id;

      const visual = createBuildingImage(building);
      const copy = document.createElement('span');
      copy.className = 'building-copy';
      const name = document.createElement('span');
      name.className = 'building-name';
      name.textContent = building.name;
      const production = document.createElement('span');
      production.className = 'building-production';
      production.textContent = '1つにつき毎秒 ' + logic.formatNumber(building.production) + ' ご利益';
      const cost = document.createElement('span');
      cost.className = 'building-price';
      copy.append(name, production, cost);

      const owned = document.createElement('span');
      owned.className = 'building-owned';
      button.append(visual.frame, copy, owned);
      item.appendChild(button);
      elements.buildingList.appendChild(item);
      buildingViews.set(building.id, { button: button, owned: owned, cost: cost, production: production, image: visual.image });

      button.addEventListener('click', function () { purchase(building); });
    });
  }

  function removeAfterAnimation(element, timeout) {
    let removed = false;
    function remove() {
      if (removed) return;
      removed = true;
      element.remove();
    }
    element.addEventListener('animationend', remove, { once: true });
    window.setTimeout(remove, timeout);
  }

  function clearClassAfterAnimation(element, className, timeout) {
    let cleared = false;
    function clear(event) {
      if (event && event.target !== element) return;
      if (cleared) return;
      cleared = true;
      element.classList.remove(className);
      element.removeEventListener('animationend', clear);
    }
    element.addEventListener('animationend', clear);
    window.setTimeout(clear, timeout);
  }

  function animateClick() {
    if (reducedMotion.matches) return;
    elements.offeringBox.classList.remove('is-bouncing');
    void elements.offeringBox.offsetWidth;
    elements.offeringBox.classList.add('is-bouncing');
    clearClassAfterAnimation(elements.offeringBox, 'is-bouncing', 400);

    while (elements.effectLayer.children.length >= 18) {
      elements.effectLayer.firstElementChild.remove();
    }
    const gain = document.createElement('span');
    gain.className = 'floating-gain';
    gain.setAttribute('aria-hidden', 'true');
    gain.textContent = '+1';
    gain.style.marginLeft = (Math.random() * 50 - 25) + 'px';
    elements.effectLayer.appendChild(gain);
    removeAfterAnimation(gain, 900);

    const sparkleCount = 3 + Math.floor(Math.random() * 3);
    for (let index = 0; index < sparkleCount; index += 1) {
      const sparkle = document.createElement('span');
      sparkle.className = 'sparkle';
      sparkle.setAttribute('aria-hidden', 'true');
      sparkle.style.setProperty('--angle', (Math.random() * 360) + 'deg');
      sparkle.style.setProperty('--distance', (42 + Math.random() * 55) + 'px');
      elements.effectLayer.appendChild(sparkle);
      removeAfterAnimation(sparkle, 800);
    }
  }

  function animatePurchase(view, important) {
    if (reducedMotion.matches) return;
    view.button.classList.remove('is-purchased');
    void view.button.offsetWidth;
    view.button.classList.add('is-purchased');
    clearClassAfterAnimation(view.button, 'is-purchased', 520);
    if (!important) return;
    const ring = document.createElement('span');
    ring.className = 'blessing-ring';
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring);
    removeAfterAnimation(ring, 1100);
  }

  function purchase(building) {
    const result = logic.purchaseBuilding(state, building.id);
    if (!result.purchased) return;
    state = result.state;
    render();
    const view = buildingViews.get(building.id);
    animatePurchase(view, building.id === 'torii' || building.id === 'powerspot');
    elements.announcer.textContent = building.name + 'を購入しました。';
    saveNow(Date.now());
  }

  function handleOfferingClick(event) {
    if (event.detail === 0) return;
    state = logic.applyClick(state);
    render();
    animateClick();
  }

  function handleVisibilityChange() {
    const now = Date.now();
    saveNow(now);
    render();
  }

  function initialize() {
    const now = Date.now();
    const rawSave = readSave();
    state = logic.deserializeState(rawSave, now);
    state = Object.assign({}, state, { lastSaveTime: now });
    lastTickTime = now;
    writeSave(logic.serializeState(state, now));

    activateImageFallback(elements.offeringImage, elements.offeringImage.parentElement);
    buildBuildingList();
    render();

    elements.offeringBox.addEventListener('click', handleOfferingClick);
    elements.offeringBox.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', function () { saveNow(Date.now()); });

    window.setInterval(function () {
      if (document.hidden) return;
      advanceTo(Date.now());
      render();
    }, TICK_INTERVAL_MS);
    window.setInterval(function () { saveNow(Date.now()); }, SAVE_INTERVAL_MS);
  }

  initialize();
})();
