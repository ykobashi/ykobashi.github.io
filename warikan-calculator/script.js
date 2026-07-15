(function () {
  "use strict";

  const totalInput = document.getElementById("total");
  const peopleInput = document.getElementById("people");
  const organizersInput = document.getElementById("organizers");
  const extraInput = document.getElementById("extra");
  const calcBtn = document.getElementById("calc-btn");
  const resultEl = document.getElementById("result");
  const errorEl = document.getElementById("error-msg");
  const amountListEl = document.getElementById("amount-list");
  const totalCheckEl = document.getElementById("total-check");

  function handleCalculate() {
    const total = parseInt(totalInput.value, 10);
    const people = parseInt(peopleInput.value, 10);
    const organizers = parseInt(organizersInput.value || "0", 10);
    const extra = parseInt(extraInput.value || "0", 10);

    const r = calcWarikan(total, people, extra, organizers);

    if (!r.ok) {
      resultEl.hidden = true;
      errorEl.hidden = false;
      errorEl.textContent = r.error;
      return;
    }

    errorEl.hidden = true;
    resultEl.hidden = false;
    amountListEl.innerHTML = "";
    r.amounts.forEach((amount, i) => {
      const li = document.createElement("li");
      const isOrganizer = i < organizers;
      li.textContent = `${amount.toLocaleString()}円` + (isOrganizer ? "(幹事)" : "");
      amountListEl.appendChild(li);
    });
    totalCheckEl.textContent = r.amounts.reduce((a, b) => a + b, 0).toLocaleString();
  }

  calcBtn.addEventListener("click", handleCalculate);
  [totalInput, peopleInput, organizersInput, extraInput].forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleCalculate();
    });
  });
})();
