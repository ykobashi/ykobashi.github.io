// UIロジック(DOM操作)。純粋ロジックは logic.js を参照。
(function () {
  "use strict";

  const quizSection = document.getElementById("quiz-section");
  const progressLabel = document.getElementById("progress-label");
  const questionContainer = document.getElementById("question-container");
  const resultSection = document.getElementById("result-section");
  const resultHeadline = document.getElementById("result-headline");
  const resultDescription = document.getElementById("result-description");
  const resultAxis = document.getElementById("result-axis");
  const shareButton = document.getElementById("share-button");
  const retryButton = document.getElementById("retry-button");

  let currentIndex = 0;
  let answers = [];
  let lastResult = null;

  function renderQuestion() {
    const q = QUESTIONS[currentIndex];
    progressLabel.textContent = `質問 ${currentIndex + 1} / ${QUESTIONS.length}`;

    questionContainer.innerHTML = "";
    const block = document.createElement("div");
    block.className = "question-block";

    const text = document.createElement("p");
    text.className = "question-text";
    text.textContent = q.text;
    block.appendChild(text);

    q.options.forEach((optionText, optionIndex) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option-button";
      btn.textContent = optionText;
      btn.addEventListener("click", function () {
        selectAnswer(optionIndex);
      });
      block.appendChild(btn);
    });

    questionContainer.appendChild(block);
  }

  function selectAnswer(optionIndex) {
    answers[currentIndex] = optionIndex;
    if (currentIndex < QUESTIONS.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      finishQuiz();
    }
  }

  function finishQuiz() {
    const result = diagnosePersonality(answers);
    lastResult = result;
    quizSection.hidden = true;
    renderResult(result);
    updateUrlParams({ a1: result.axis1, a2: result.axis2 });
  }

  function updateUrlParams(params) {
    if (!params) {
      history.replaceState(null, "", location.pathname);
      return;
    }
    const search = new URLSearchParams(params).toString();
    history.replaceState(null, "", `${location.pathname}?${search}`);
  }

  function renderResult(result) {
    resultHeadline.textContent = `あなたは「${result.name}」`;
    resultDescription.textContent = result.description;
    resultAxis.textContent = `行動軸スコア:${result.axis1}/5 ・ 思考軸スコア:${result.axis2}/5`;
    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: "smooth" });

    document.title = `【性格診断】あなたは「${result.name}」でした! | 簡易性格タイプ診断`;
    updateMetaDescription(`性格タイプ診断の結果、あなたは「${result.name}」でした。${result.description}`);
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

  retryButton.addEventListener("click", function () {
    currentIndex = 0;
    answers = [];
    lastResult = null;
    resultSection.hidden = true;
    quizSection.hidden = false;
    updateUrlParams(null);
    renderQuestion();
    quizSection.scrollIntoView({ behavior: "smooth" });
  });

  shareButton.addEventListener("click", function () {
    if (!lastResult) return;
    const text = `【性格タイプ診断】私は「${lastResult.name}」でした。${lastResult.description} あなたも診断してみよう!`;
    openTwitterIntent(text, location.href);
  });

  function openTwitterIntent(text, shareUrl) {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // シェアされたURL(?a1=...&a2=...)から結果を復元して表示する
  (function restoreFromUrl() {
    const params = new URLSearchParams(location.search);
    const axis1 = parseInt(params.get("a1"), 10);
    const axis2 = parseInt(params.get("a2"), 10);
    const isValidAxis = (v) => Number.isInteger(v) && v >= 0 && v <= 5;
    if (!isValidAxis(axis1) || !isValidAxis(axis2)) {
      renderQuestion();
      return;
    }

    const type = determineType(axis1, axis2);
    const result = { ...type, axis1, axis2 };
    lastResult = result;
    quizSection.hidden = true;
    renderResult(result);
  })();
})();
