(function () {
  var THEME_KEY = "theme";

  function getTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var btn = document.querySelector(".theme-toggle-btn");
    if (btn) {
      btn.textContent = theme === "dark" ? "☀️" : "🌙";
      btn.setAttribute(
        "aria-label",
        theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"
      );
    }
  }

  apply(getTheme());

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector(".theme-toggle-btn");
    if (!btn) return;
    apply(getTheme());
    btn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      apply(next);
    });
  });

  window.addEventListener("storage", function (event) {
    if (event.key === THEME_KEY) {
      apply(getTheme());
    }
  });
})();
