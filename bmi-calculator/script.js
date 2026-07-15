(function () {
  "use strict";

  const heightInput = document.getElementById("height");
  const weightInput = document.getElementById("weight");
  const calcBtn = document.getElementById("calc-btn");
  const resultEl = document.getElementById("result");
  const errorEl = document.getElementById("error-msg");
  const bmiValueEl = document.getElementById("bmi-value");
  const bmiCategoryEl = document.getElementById("bmi-category");
  const idealWeightEl = document.getElementById("ideal-weight");

  function handleCalculate() {
    const height = parseFloat(heightInput.value);
    const weight = parseFloat(weightInput.value);
    const bmi = calcBMI(height, weight);

    if (isNaN(bmi)) {
      resultEl.hidden = true;
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;
    resultEl.hidden = false;
    bmiValueEl.textContent = round1(bmi).toFixed(1);
    bmiCategoryEl.textContent = classifyBMI(bmi);
    idealWeightEl.textContent = round1(calcIdealWeight(height)).toFixed(1) + " kg";
  }

  calcBtn.addEventListener("click", handleCalculate);
  [heightInput, weightInput].forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleCalculate();
    });
  });
})();
