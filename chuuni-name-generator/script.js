// UIロジック(DOM操作)。純粋ロジックは logic.js を参照。
(function () {
  "use strict";

  const form = document.getElementById("generator-form");
  const nameInput = document.getElementById("name-input");
  const resultSection = document.getElementById("result-section");
  const chuuniList = document.getElementById("chuuni-list");
  const shareButton = document.getElementById("share-button");
  const retryButton = document.getElementById("retry-button");

  let lastName = "";
  let lastResults = [];

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;

    const results = generateChuuniNames(name);
    lastName = name;
    lastResults = results;
    renderResult(name, results);
    updateUrlParams({ name });
  });

  retryButton.addEventListener("click", function () {
    resultSection.hidden = true;
    updateUrlParams(null);
    document.getElementById("form-section").scrollIntoView({ behavior: "smooth" });
  });

  function updateUrlParams(params) {
    if (!params) {
      history.replaceState(null, "", location.pathname);
      return;
    }
    const search = new URLSearchParams(params).toString();
    history.replaceState(null, "", `${location.pathname}?${search}`);
  }

  function renderResult(name, results) {
    chuuniList.innerHTML = "";
    results.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item.full;
      chuuniList.appendChild(li);
    });
    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: "smooth" });

    const topName = results[0].full;
    document.title = `【二つ名生成】${name}さんの二つ名は「${topName}」! | 厨二病風二つ名メーカー`;
    updateMetaDescription(`${name}さんの厨二病風二つ名候補:${results.map((r) => r.full).join("、")}`);
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
    if (!lastResults.length) return;
    const topName = lastResults[0].full;
    const text = `【厨二病風二つ名メーカー】私の二つ名は「${topName}」に覚醒した…! あなたも覚醒させてみよう!`;
    const shareUrl = location.href;

    if (navigator.share) {
      navigator.share({ title: "厨二病風二つ名メーカー", text, url: shareUrl }).catch(function () {
        openTwitterIntent(text, shareUrl);
      });
    } else {
      openTwitterIntent(text, shareUrl);
    }
  });

  function openTwitterIntent(text, shareUrl) {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // シェアされたURL(?name=...)から結果を復元して表示する
  (function restoreFromUrl() {
    const params = new URLSearchParams(location.search);
    const sharedName = params.get("name");
    if (!sharedName) return;

    const results = generateChuuniNames(sharedName);
    lastName = sharedName;
    lastResults = results;
    nameInput.value = sharedName;
    renderResult(sharedName, results);
  })();
})();
