(function () {
  "use strict";

  const passwordOutput = document.getElementById("password-output");
  const copyBtn = document.getElementById("copy-btn");
  const strengthFill = document.getElementById("strength-fill");
  const strengthLabel = document.getElementById("strength-label");
  const entropyValueEl = document.getElementById("entropy-value");
  const lengthSlider = document.getElementById("length-slider");
  const lengthValueEl = document.getElementById("length-value");
  const optLowercase = document.getElementById("opt-lowercase");
  const optUppercase = document.getElementById("opt-uppercase");
  const optNumbers = document.getElementById("opt-numbers");
  const optSymbols = document.getElementById("opt-symbols");
  const generateBtn = document.getElementById("generate-btn");
  const errorEl = document.getElementById("error-msg");

  const STRENGTH_STYLE = {
    "弱い": { color: "var(--color-weak)", percent: 25 },
    "普通": { color: "var(--color-fair)", percent: 50 },
    "強い": { color: "var(--color-strong)", percent: 75 },
    "非常に強い": { color: "var(--color-very-strong)", percent: 100 },
  };

  function getOptions() {
    return {
      lowercase: optLowercase.checked,
      uppercase: optUppercase.checked,
      numbers: optNumbers.checked,
      symbols: optSymbols.checked,
    };
  }

  function updateStrengthMeter() {
    const options = getOptions();
    const length = parseInt(lengthSlider.value, 10);
    const poolSize = calcPoolSize(options);
    const entropy = calcEntropy(poolSize, length);
    const label = classifyStrength(entropy);
    const style = STRENGTH_STYLE[label];

    strengthFill.style.width = style.percent + "%";
    strengthFill.style.backgroundColor = style.color;
    strengthLabel.textContent = label;
    strengthLabel.style.color = style.color;
    entropyValueEl.textContent = poolSize > 0 ? `(約${Math.round(entropy)}bit)` : "";
  }

  function generate() {
    const options = getOptions();
    const length = parseInt(lengthSlider.value, 10);

    if (calcPoolSize(options) === 0) {
      errorEl.hidden = false;
      passwordOutput.value = "";
      return;
    }
    errorEl.hidden = true;

    const password = generatePassword(length, options);
    passwordOutput.value = password;
    updateStrengthMeter();
  }

  lengthSlider.addEventListener("input", () => {
    lengthValueEl.textContent = lengthSlider.value;
    updateStrengthMeter();
  });

  [optLowercase, optUppercase, optNumbers, optSymbols].forEach((el) => {
    el.addEventListener("change", updateStrengthMeter);
  });

  generateBtn.addEventListener("click", generate);

  copyBtn.addEventListener("click", async () => {
    if (!passwordOutput.value) return;
    try {
      await navigator.clipboard.writeText(passwordOutput.value);
    } catch (e) {
      passwordOutput.select();
      document.execCommand("copy");
    }
    copyBtn.textContent = "コピーしました";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.textContent = "コピー";
      copyBtn.classList.remove("copied");
    }, 1500);
  });

  // 初期表示
  lengthValueEl.textContent = lengthSlider.value;
  generate();
})();
