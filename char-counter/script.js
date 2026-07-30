(function () {
  "use strict";

  const textInput = document.getElementById("text-input");
  const charsWithSpaceEl = document.getElementById("chars-with-space");
  const charsWithoutSpaceEl = document.getElementById("chars-without-space");
  const lineCountEl = document.getElementById("line-count");
  const byteCountEl = document.getElementById("byte-count");
  const pageCountEl = document.getElementById("page-count");
  const twitterRemainingEl = document.getElementById("twitter-remaining");
  const twitterCard = document.getElementById("twitter-card");

  function update() {
    const text = textInput.value;

    charsWithSpaceEl.textContent = countChars(text, true).toLocaleString();
    charsWithoutSpaceEl.textContent = countChars(text, false).toLocaleString();
    lineCountEl.textContent = countLines(text).toLocaleString();
    byteCountEl.textContent = utf8ByteLength(text).toLocaleString();
    pageCountEl.textContent = manuscriptPages(text).toLocaleString() + "枚";

    const remaining = twitterRemaining(text);
    twitterRemainingEl.textContent = remaining.toLocaleString();
    twitterCard.classList.toggle("over-limit", remaining < 0);
  }

  textInput.addEventListener("input", update);
  update();
})();
