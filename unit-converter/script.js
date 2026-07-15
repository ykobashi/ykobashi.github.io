(function () {
  "use strict";

  const tabs = document.querySelectorAll(".tab");
  const valueInput = document.getElementById("value-input");
  const fromSelect = document.getElementById("from-unit");
  const toSelect = document.getElementById("to-unit");
  const swapBtn = document.getElementById("swap-btn");
  const resultText = document.getElementById("result-text");

  const CATEGORY_CONFIG = {
    length: { keys: Object.keys(LENGTH_UNITS), labels: LENGTH_LABELS, convert: convertLength, defaultFrom: "m", defaultTo: "cm" },
    weight: { keys: Object.keys(WEIGHT_UNITS), labels: WEIGHT_LABELS, convert: convertWeight, defaultFrom: "kg", defaultTo: "g" },
    temperature: { keys: ["celsius", "fahrenheit", "kelvin"], labels: TEMPERATURE_LABELS, convert: convertTemperature, defaultFrom: "celsius", defaultTo: "fahrenheit" },
  };

  let currentCategory = "length";

  function populateSelects() {
    const config = CATEGORY_CONFIG[currentCategory];
    fromSelect.innerHTML = "";
    toSelect.innerHTML = "";
    config.keys.forEach((key) => {
      const label = config.labels[key] + " (" + key + ")";
      const opt1 = new Option(label, key);
      const opt2 = new Option(label, key);
      fromSelect.add(opt1);
      toSelect.add(opt2);
    });
    fromSelect.value = config.defaultFrom;
    toSelect.value = config.defaultTo;
  }

  function formatNumber(n) {
    if (!isFinite(n)) return "--";
    return Number(n.toFixed(6)).toString();
  }

  function update() {
    const config = CATEGORY_CONFIG[currentCategory];
    const value = parseFloat(valueInput.value);
    const from = fromSelect.value;
    const to = toSelect.value;
    const result = config.convert(value, from, to);

    if (isNaN(result)) {
      resultText.textContent = "入力値を確認してください";
      return;
    }
    resultText.textContent = `${formatNumber(value)} ${from} = ${formatNumber(result)} ${to}`;
  }

  function switchCategory(category) {
    currentCategory = category;
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.category === category));
    populateSelects();
    update();
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchCategory(tab.dataset.category));
  });

  swapBtn.addEventListener("click", () => {
    const tmp = fromSelect.value;
    fromSelect.value = toSelect.value;
    toSelect.value = tmp;
    update();
  });

  [valueInput, fromSelect, toSelect].forEach((el) => {
    el.addEventListener("input", update);
    el.addEventListener("change", update);
  });

  populateSelects();
  update();
})();
