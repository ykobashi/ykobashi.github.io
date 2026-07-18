// UIロジック(DOM操作)。純粋ロジックは logic.js を参照。
(function () {
  "use strict";

  const form = document.getElementById("generator-form");
  const nameInput = document.getElementById("name-input");
  const resultSection = document.getElementById("result-section");
  const nicknameList = document.getElementById("nickname-list");
  const shareButton = document.getElementById("share-button");
  const retryButton = document.getElementById("retry-button");

  let lastName = "";
  let lastNicknames = [];

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;

    const { nicknames } = generateNicknames(name);
    lastName = name;
    lastNicknames = nicknames;
    renderResult(name, nicknames);
  });

  retryButton.addEventListener("click", function () {
    resultSection.hidden = true;
    document.getElementById("form-section").scrollIntoView({ behavior: "smooth" });
  });

  function renderResult(name, nicknames) {
    nicknameList.innerHTML = "";
    nicknames.forEach((nickname) => {
      const li = document.createElement("li");
      li.textContent = nickname;
      nicknameList.appendChild(li);
    });
    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: "smooth" });

    document.title = `【あだ名生成】${name}さんのあだ名候補は「${nicknames[0]}」他 | あだ名ジェネレーター`;
    updateMetaDescription(`${name}さんのあだ名候補:${nicknames.join("、")}`);
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
    if (!lastNicknames.length) return;
    const text = `【あだ名ジェネレーター】${lastName}さんのあだ名候補は「${lastNicknames.slice(0, 3).join("」「")}」など! あなたも診断してみよう!`;
    openTwitterIntent(text, location.href);
  });

  function openTwitterIntent(text, shareUrl) {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }
})();
