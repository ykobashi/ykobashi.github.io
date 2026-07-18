// UIロジック(DOM操作)。純粋ロジックは logic.js を参照。
(function () {
  "use strict";

  const todayLabel = document.getElementById("today-label");
  const form = document.getElementById("fortune-form");
  const nameInput = document.getElementById("name-input");
  const resultSection = document.getElementById("result-section");
  const overallFortuneEl = document.getElementById("overall-fortune");
  const overallCommentEl = document.getElementById("overall-comment");
  const categoryListEl = document.getElementById("category-list");
  const shareButton = document.getElementById("share-button");
  const retryButton = document.getElementById("retry-button");

  const todayDate = new Date();
  const todayStr = formatDateLocal(todayDate);
  todayLabel.textContent = `${todayStr} の運勢を占います`;

  let lastResult = null;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = nameInput.value.trim();
    const result = getDailyFortune(name, todayStr);
    lastResult = result;
    renderResult(result);
    updateUrlParams({ name, date: todayStr });
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

  function renderResult(result) {
    overallFortuneEl.textContent = result.overall;
    overallCommentEl.textContent = result.overallComment;

    categoryListEl.innerHTML = "";
    for (const key of Object.keys(result.categories)) {
      const cat = result.categories[key];
      const li = document.createElement("li");
      li.className = "category-item";
      const header = document.createElement("div");
      header.className = "category-header";
      const nameSpan = document.createElement("span");
      nameSpan.className = "category-name";
      nameSpan.textContent = cat.label;
      const levelSpan = document.createElement("span");
      levelSpan.className = "category-level";
      levelSpan.textContent = cat.level;
      header.appendChild(nameSpan);
      header.appendChild(levelSpan);
      const comment = document.createElement("p");
      comment.className = "category-comment";
      comment.textContent = cat.comment;
      li.appendChild(header);
      li.appendChild(comment);
      categoryListEl.appendChild(li);
    }

    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: "smooth" });

    const displayName = result.name === "ゲスト" ? "" : `${result.name}さんの`;
    document.title = `【運勢診断】${displayName}今日の総合運は「${result.overall}」! | 今日の運勢おみくじ`;
    updateMetaDescription(`${displayName}${result.date}の運勢は総合運「${result.overall}」。${result.overallComment}`);
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
    const displayName = lastResult.name === "ゲスト" ? "" : `${lastResult.name}さんの`;
    const text = `【今日の運勢】${displayName}総合運は「${lastResult.overall}」でした。${lastResult.overallComment} あなたも診断してみよう!`;
    const shareUrl = location.href;

    if (navigator.share) {
      navigator.share({ title: "今日の運勢おみくじ", text, url: shareUrl }).catch(function () {
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

  // シェアされたURL(?name=...&date=...)から結果を復元して表示する
  (function restoreFromUrl() {
    const params = new URLSearchParams(location.search);
    const sharedDate = params.get("date");
    if (!sharedDate) return;

    const sharedName = params.get("name") || "";
    nameInput.value = sharedName;
    const result = getDailyFortune(sharedName, sharedDate);
    lastResult = result;
    renderResult(result);
  })();
})();
