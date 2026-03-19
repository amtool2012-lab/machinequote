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

const labels = {
  materials: {
    aluminum_6061: "Aluminum 6061",
    aluminum_7075: "Aluminum 7075",
    steel_1018: "Steel 1018",
    stainless_304: "Stainless 304",
    stainless_316: "Stainless 316",
    delrin: "Delrin",
    titanium: "Titanium Grade 5"
  },
  finish: {
    as_machined: "As Machined",
    bead_blast: "Bead Blast",
    anodized_clear: "Clear Anodize",
    anodized_black: "Black Anodize",
    powder_coat: "Powder Coat",
    passivated: "Passivated"
  },
  tolerance: {
    standard: "Standard (+/- 0.005\")",
    precision: "Precision (+/- 0.002\")",
    tight: "Tight (+/- 0.001\")"
  },
  leadTime: {
    standard: "Standard (10 business days)",
    expedite: "Expedite (5 business days)",
    rush: "Rush (2 business days)"
  }
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

function buildSummary(data, quote) {
  const project = data.projectName || "Unnamed machining request";
  const materialLabel = labels.materials[data.material];
  const finishLabel = labels.finish[data.finish];
  const toleranceLabel = labels.tolerance[data.tolerance];
  const leadLabel = labels.leadTime[data.leadTime];

  return `${project} is estimated at ${currency(quote.totalPrice)} for ${quote.quantity} part(s) in ${materialLabel} with ${finishLabel}. The current assumption uses ${data.setupHours} setup hour(s), ${data.cycleMinutes} cycle minute(s) per part, ${toleranceLabel.toLowerCase()}, and ${leadLabel.toLowerCase()}.`;
}

function getRiskStatus(data) {
  if (!data.fileName || data.tolerance === "tight" || data.leadTime === "rush") {
    return {
      label: "Manual Review",
      tone: "warning"
    };
  }

  return {
    label: "Standard Review",
    tone: "ok"
  };
}

function normalizeRequest(data) {
  return {
    projectName: typeof data.projectName === "string" ? data.projectName.trim() : "",
    fileName: typeof data.fileName === "string" ? data.fileName.trim() : "",
    material: data.material,
    quantity: Math.max(1, Number(data.quantity) || 1),
    finish: data.finish,
    tolerance: data.tolerance,
    leadTime: data.leadTime,
    complexity: data.complexity,
    setupHours: Math.max(0.5, Number(data.setupHours) || 0.5),
    cycleMinutes: Math.max(1, Number(data.cycleMinutes) || 1),
    notes: typeof data.notes === "string" ? data.notes.trim() : ""
  };
}

function validateQuoteRequest(data) {
  if (!data || typeof data !== "object") {
    return "Quote payload must be an object";
  }

  if (!rates.materials[data.material]) {
    return "Unsupported material";
  }

  if (!rates.finishMultiplier[data.finish]) {
    return "Unsupported finish";
  }

  if (!rates.toleranceMultiplier[data.tolerance]) {
    return "Unsupported tolerance";
  }

  if (!rates.complexityMultiplier[data.complexity]) {
    return "Unsupported complexity";
  }

  if (!rates.leadMultiplier[data.leadTime]) {
    return "Unsupported lead time";
  }

  return "";
}

function calculateQuoteResponse(input) {
  const data = normalizeRequest(input);
  const machineRate = 85;
  const setupRate = 95;
  const materialBase = rates.materials[data.material];
  const finishMultiplier = rates.finishMultiplier[data.finish];
  const toleranceMultiplier = rates.toleranceMultiplier[data.tolerance];
  const complexityMultiplier = rates.complexityMultiplier[data.complexity];
  const leadMultiplier = rates.leadMultiplier[data.leadTime];

  const rawMaterialCost = materialBase * data.quantity * complexityMultiplier;
  const rawSetupCost = data.setupHours * setupRate;
  const rawMachiningCost = (data.cycleMinutes / 60) * machineRate * data.quantity * complexityMultiplier * toleranceMultiplier;
  const preFinishSubtotal = rawMaterialCost + rawSetupCost + rawMachiningCost;
  const totalWithFinish = preFinishSubtotal * finishMultiplier;
  const finalTotal = totalWithFinish * leadMultiplier;
  const finishCost = totalWithFinish - preFinishSubtotal;
  const leadCost = finalTotal - totalWithFinish;
  const unitPrice = finalTotal / data.quantity;

  const quote = {
    quantity: data.quantity,
    unitPrice,
    totalPrice: finalTotal,
    materialCost: rawMaterialCost,
    setupCost: rawSetupCost,
    machiningCost: rawMachiningCost,
    finishCost,
    leadCost,
    leadDays: getLeadDays(data.leadTime)
  };

  return {
    input: data,
    quote,
    summaryText: buildSummary(data, quote),
    recommendations: buildRecommendations(data, quote.totalPrice),
    risk: getRiskStatus(data)
  };
}

module.exports = {
  calculateQuoteResponse,
  validateQuoteRequest
};
