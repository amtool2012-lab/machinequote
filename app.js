const rates = {
  materials: {
    aluminum_6061: 18,
    aluminum_7075: 24,
    steel_1018: 20,
    stainless_304: 28,
    stainless_316: 34,
    delrin: 12,
    titanium: 52
  },
  finishMultiplier: {
    as_machined: 1,
    bead_blast: 1.08,
    anodized_clear: 1.15,
    anodized_black: 1.18,
    powder_coat: 1.2,
    passivated: 1.12
  },
  toleranceMultiplier: {
    standard: 1,
    precision: 1.14,
    tight: 1.3
  },
  complexityMultiplier: {
    simple: 0.88,
    medium: 1,
    complex: 1.32
  },
  leadMultiplier: {
    standard: 1,
    expedite: 1.18,
    rush: 1.35
  }
};

const form = document.querySelector("#quote-form");
const resetButton = document.querySelector("#resetButton");
const emptyState = document.querySelector("#empty-state");
const quoteOutput = document.querySelector("#quote-output");

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

function getLeadDays(leadTime) {
  if (leadTime === "rush") {
    return 2;
  }
  if (leadTime === "expedite") {
    return 5;
  }
  return 10;
}

function buildRecommendations(data, total) {
  const notes = [];

  if (!data.fileName) {
    notes.push("No STEP file is attached yet, so this estimate should be treated as a budgetary quote until geometry is reviewed.");
  } else {
    notes.push(`Attached file detected: ${data.fileName}. Confirm manufacturability and stock size before release.`);
  }

  if (data.quantity <= 3) {
    notes.push("Low quantity suggests prototype pricing. Consider combining setups with nearby parts to improve unit cost.");
  }

  if (data.quantity >= 50) {
    notes.push("Batch quantity is high enough that dedicated fixturing or soft jaws may reduce cycle cost.");
  }

  if (data.tolerance === "tight") {
    notes.push("Tight tolerance work may require additional inspection time or secondary finishing passes.");
  }

  if (data.complexity === "complex") {
    notes.push("Complex geometry likely benefits from a fixture review and toolpath validation before committing to delivery.");
  }

  if (data.leadTime !== "standard") {
    notes.push("Short lead times can affect machine scheduling and material availability, so keep this estimate subject to capacity confirmation.");
  }

  if (total > 5000) {
    notes.push("Higher-value quote: consider adding first article inspection and customer approval before full release.");
  }

  if (data.notes) {
    notes.push("Custom notes were included and should be reviewed during final quote approval.");
  }

  return notes;
}

function calculateQuote(data) {
  const quantity = Number(data.quantity);
  const setupHours = Number(data.setupHours);
  const cycleMinutes = Number(data.cycleMinutes);

  const machineRate = 85;
  const setupRate = 95;
  const materialBase = rates.materials[data.material] || 18;
  const finishMultiplier = rates.finishMultiplier[data.finish] || 1;
  const toleranceMultiplier = rates.toleranceMultiplier[data.tolerance] || 1;
  const complexityMultiplier = rates.complexityMultiplier[data.complexity] || 1;
  const leadMultiplier = rates.leadMultiplier[data.leadTime] || 1;

  const rawMaterialCost = materialBase * quantity * complexityMultiplier;
  const rawSetupCost = setupHours * setupRate;
  const rawMachiningCost = (cycleMinutes / 60) * machineRate * quantity * complexityMultiplier * toleranceMultiplier;
  const preFinishSubtotal = rawMaterialCost + rawSetupCost + rawMachiningCost;
  const totalWithFinish = preFinishSubtotal * finishMultiplier;
  const finalTotal = totalWithFinish * leadMultiplier;

  const finishCost = totalWithFinish - preFinishSubtotal;
  const leadCost = finalTotal - totalWithFinish;
  const unitPrice = finalTotal / quantity;

  return {
    quantity,
    unitPrice,
    totalPrice: finalTotal,
    materialCost: rawMaterialCost,
    setupCost: rawSetupCost,
    machiningCost: rawMachiningCost,
    finishCost,
    leadCost,
    leadDays: getLeadDays(data.leadTime)
  };
}

function buildSummary(data, quote) {
  const project = data.projectName || "Unnamed machining request";
  const materialLabel = fields.material.options[fields.material.selectedIndex].text;
  const finishLabel = fields.finish.options[fields.finish.selectedIndex].text;
  const toleranceLabel = fields.tolerance.options[fields.tolerance.selectedIndex].text;
  const leadLabel = fields.leadTime.options[fields.leadTime.selectedIndex].text;

  return `${project} is estimated at ${currency(quote.totalPrice)} for ${quote.quantity} part(s) in ${materialLabel} with ${finishLabel}. The current assumption uses ${data.setupHours} setup hour(s), ${data.cycleMinutes} cycle minute(s) per part, ${toleranceLabel.toLowerCase()}, and ${leadLabel.toLowerCase()}.`;
}

function updateRiskBadge(data) {
  let label = "Standard Review";
  let tone = "rgba(40, 89, 67, 0.12)";
  let color = "#285943";

  if (!data.fileName || data.tolerance === "tight" || data.leadTime === "rush") {
    label = "Manual Review";
    tone = "rgba(204, 95, 55, 0.18)";
    color = "#8e3414";
  }

  outputs.riskBadge.textContent = label;
  outputs.riskBadge.style.background = tone;
  outputs.riskBadge.style.color = color;
}

function renderQuote(data) {
  const quote = calculateQuote(data);
  const recommendations = buildRecommendations(data, quote.totalPrice);

  emptyState.classList.add("hidden");
  quoteOutput.classList.remove("hidden");

  outputs.totalPrice.textContent = currency(quote.totalPrice);
  outputs.unitPrice.textContent = currency(quote.unitPrice);
  outputs.leadTimeResult.textContent = `${quote.leadDays} business days`;
  outputs.quantityResult.textContent = String(quote.quantity);
  outputs.materialCost.textContent = currency(quote.materialCost);
  outputs.setupCost.textContent = currency(quote.setupCost);
  outputs.machiningCost.textContent = currency(quote.machiningCost);
  outputs.finishCost.textContent = currency(quote.finishCost);
  outputs.leadCost.textContent = currency(quote.leadCost);
  outputs.summaryText.textContent = buildSummary(data, quote);

  outputs.recommendations.innerHTML = "";
  recommendations.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    outputs.recommendations.appendChild(li);
  });

  updateRiskBadge(data);
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderQuote(getFormData());
});

resetButton.addEventListener("click", () => {
  form.reset();
  fields.quantity.value = 10;
  fields.setupHours.value = 1.5;
  fields.cycleMinutes.value = 18;
  emptyState.classList.remove("hidden");
  quoteOutput.classList.add("hidden");
});
