// UIロジック(DOM操作)。純粋ロジックは logic.js を参照。
(function () {
  "use strict";

  const form = document.getElementById("diagnosis-form");
  const nameInput = document.getElementById("name-input");
  const birthdateInput = document.getElementById("birthdate-input");
  const resultSection = document.getElementById("result-section");
  const resultHeadline = document.getElementById("result-headline");
  const resultJob = document.getElementById("result-job");
  const resultEra = document.getElementById("result-era");
  const resultFlavor = document.getElementById("result-flavor");
  const shareButton = document.getElementById("share-button");
  const retryButton = document.getElementById("retry-button");

  let lastResult = null;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = nameInput.value.trim();
    const birthdate = birthdateInput.value;
    if (!name || !birthdate) return;

    const result = diagnosePastLife(name, birthdate);
    lastResult = { name, result };
    renderResult(name, result);
  });

  retryButton.addEventListener("click", function () {
    resultSection.hidden = true;
    document.getElementById("form-section").scrollIntoView({ behavior: "smooth" });
  });

  function renderResult(name, result) {
    resultHeadline.textContent = `${name}さんの前世は「${result.era}の${result.job}」`;
    resultJob.textContent = result.job;
    resultEra.textContent = result.era;
    resultFlavor.textContent = result.flavor;
    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: "smooth" });

    const newTitle = `【前世診断】${name}さんの前世は${result.era}の${result.job}! | 前世診断`;
    document.title = newTitle;
    updateMetaDescription(`${name}さんの前世診断結果:${result.era}の${result.job}。${result.flavor}。あなたも無料で前世を診断してみよう。`);
  }

  function updateMetaDescription(text) {
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", text);
  }

  shareButton.addEventListener("click", function () {
    if (!lastResult) return;
    const { name, result } = lastResult;
    const text = `【前世診断】${name}さんの前世は「${result.era}の${result.job}」でした。${result.flavor}。あなたも診断してみよう!`;
    openTwitterIntent(text, location.href);
  });

  function openTwitterIntent(text, shareUrl) {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }
})();
