const form = document.querySelector("#quote-form");
const resetButton = document.querySelector("#resetButton");
const emptyState = document.querySelector("#empty-state");
const quoteOutput = document.querySelector("#quote-output");
const formStatus = document.querySelector("#form-status");

const fields = {
  projectName: document.querySelector("#projectName"),
  stepFile: document.querySelector("#stepFile"),
  material: document.querySelector("#material"),
  quantity: document.querySelector("#quantity"),
  finish: document.querySelector("#finish"),
  tolerance: document.querySelector("#tolerance"),
  leadTime: document.querySelector("#leadTime"),
  complexity: document.querySelector("#complexity"),
  setupHours: document.querySelector("#setupHours"),
  cycleMinutes: document.querySelector("#cycleMinutes"),
  notes: document.querySelector("#notes")
};

const outputs = {
  totalPrice: document.querySelector("#totalPrice"),
  unitPrice: document.querySelector("#unitPrice"),
  leadTimeResult: document.querySelector("#leadTimeResult"),
  quantityResult: document.querySelector("#quantityResult"),
  materialCost: document.querySelector("#materialCost"),
  setupCost: document.querySelector("#setupCost"),
  machiningCost: document.querySelector("#machiningCost"),
  finishCost: document.querySelector("#finishCost"),
  leadCost: document.querySelector("#leadCost"),
  summaryText: document.querySelector("#summaryText"),
  recommendations: document.querySelector("#recommendations"),
  riskBadge: document.querySelector("#riskBadge")
};

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function setFormStatus(message, isError = false) {
  formStatus.textContent = message;
  formStatus.classList.toggle("error", isError);
}

function renderQuote(result) {
  emptyState.classList.add("hidden");
  quoteOutput.classList.remove("hidden");

  outputs.totalPrice.textContent = currency(result.quote.totalPrice);
  outputs.unitPrice.textContent = currency(result.quote.unitPrice);
  outputs.leadTimeResult.textContent = `${result.quote.leadDays} business days`;
  outputs.quantityResult.textContent = String(result.quote.quantity);
  outputs.materialCost.textContent = currency(result.quote.materialCost);
  outputs.setupCost.textContent = currency(result.quote.setupCost);
  outputs.machiningCost.textContent = currency(result.quote.machiningCost);
  outputs.finishCost.textContent = currency(result.quote.finishCost);
  outputs.leadCost.textContent = currency(result.quote.leadCost);
  outputs.summaryText.textContent = result.summaryText;

  outputs.recommendations.innerHTML = "";
  result.recommendations.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    outputs.recommendations.appendChild(li);
  });

  outputs.riskBadge.textContent = result.risk.label;
  outputs.riskBadge.style.background = result.risk.tone === "warning" ? "rgba(204, 95, 55, 0.18)" : "rgba(40, 89, 67, 0.12)";
  outputs.riskBadge.style.color = result.risk.tone === "warning" ? "#8e3414" : "#285943";
}

function getFormData() {
  const file = fields.stepFile.files[0];

  return {
    projectName: fields.projectName.value.trim(),
    fileName: file ? file.name : "",
    material: fields.material.value,
    quantity: Math.max(1, Number(fields.quantity.value) || 1),
    finish: fields.finish.value,
    tolerance: fields.tolerance.value,
    leadTime: fields.leadTime.value,
    complexity: fields.complexity.value,
    setupHours: Math.max(0.5, Number(fields.setupHours.value) || 0.5),
    cycleMinutes: Math.max(1, Number(fields.cycleMinutes.value) || 1),
    notes: fields.notes.value.trim()
  };
}

async function requestQuote(data) {
  const response = await fetch("/api/quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Unable to generate quote");
  }

  return payload;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormStatus("Calculating quote...");

  try {
    const result = await requestQuote(getFormData());
    renderQuote(result);
    setFormStatus("Quote generated from backend pricing engine.");
  } catch (error) {
    setFormStatus(error.message, true);
  }
});

resetButton.addEventListener("click", () => {
  form.reset();
  fields.quantity.value = 10;
  fields.setupHours.value = 1.5;
  fields.cycleMinutes.value = 18;
  emptyState.classList.remove("hidden");
  quoteOutput.classList.add("hidden");
  setFormStatus("");
});
