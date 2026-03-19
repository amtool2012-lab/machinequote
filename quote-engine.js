const MATERIAL_HINTS = [
  "6061",
  "7075",
  "1018",
  "1045",
  "4140",
  "17-4",
  "304",
  "316",
  "aluminum",
  "stainless",
  "steel",
  "brass",
  "copper",
  "delrin",
  "acetal",
  "peek",
  "nylon",
  "titanium"
];

const FINISH_HINTS = [
  "anodize",
  "anodized",
  "black oxide",
  "passivate",
  "passivated",
  "powder coat",
  "bead blast",
  "plating",
  "zinc",
  "nickel"
];

const CERT_HINTS = [
  "cert",
  "certification",
  "material cert",
  "coc",
  "cofc",
  "fair",
  "first article",
  "inspection report"
];

function cleanText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeWhitespace(value) {
  return cleanText(value).toLowerCase();
}

function findFirstMatch(text, regexes) {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match) {
      return match;
    }
  }

  return null;
}

function parseQuantity(text) {
  const match = findFirstMatch(text, [
    /\bqty(?:\.|uantity)?\s*[:=-]?\s*(\d{1,6})\b/i,
    /\bquantity\s*[:=-]?\s*(\d{1,6})\b/i,
    /\b(\d{1,6})\s*(?:pcs|pc|pieces|parts)\b/i
  ]);

  return match ? Number(match[1]) : null;
}

function parseLeadTime(text) {
  const match = findFirstMatch(text, [
    /\blead\s*time\s*[:=-]?\s*([^.|\n]+)/i,
    /\bneed(?:ed)?\s*by\s*[:=-]?\s*([^.|\n]+)/i,
    /\bdue\s*date\s*[:=-]?\s*([^.|\n]+)/i,
    /\blead time\s+(\d+\s*(?:day|days|week|weeks))/i,
    /\b(\d+\s*(?:day|days|week|weeks))\s*lead time\b/i
  ]);

  return match ? cleanText(match[1]).slice(0, 80) : null;
}

function parseMaterial(text) {
  const lowered = normalizeWhitespace(text);
  const found = MATERIAL_HINTS.find((item) => lowered.includes(item));
  return found ? found.toUpperCase() : null;
}

function parseTolerance(text) {
  const match = findFirstMatch(text, [
    /\+\/-\s*0?\.(\d{3,4})/i,
    /\btolerance\s*[:=-]?\s*([^.|\n]+)/i
  ]);

  if (!match) {
    return null;
  }

  return cleanText(match[0]).slice(0, 80);
}

function parsePartName(text, subject) {
  const subjectMatch = cleanText(subject || "")
    .replace(/\b(re|fw|fwd)\s*:\s*/gi, "")
    .trim();

  const match = findFirstMatch(text, [
    /\bpart\s*(?:name|description)?\s*[:=-]?\s*([^.|\n]+)/i,
    /\bfor\s+([^.|\n]{3,80})/i
  ]);

  if (match) {
    return cleanText(match[1]).slice(0, 100);
  }

  return subjectMatch || "Unknown";
}

function collectAttachmentSignals(attachments) {
  const summary = {
    hasStep: false,
    hasDrawingPdf: false,
    hasPdf: false,
    hasModel: false,
    attachmentNames: [],
    textSnippets: []
  };

  for (const attachment of attachments || []) {
    const name = String(attachment.filename || "").trim();
    const lowerName = name.toLowerCase();

    if (!name) {
      continue;
    }

    summary.attachmentNames.push(name);

    if (lowerName.endsWith(".stp") || lowerName.endsWith(".step")) {
      summary.hasStep = true;
      summary.hasModel = true;
    }

    if (lowerName.endsWith(".pdf")) {
      summary.hasPdf = true;
      if (lowerName.includes("drawing") || lowerName.includes("print") || lowerName.includes("dwg")) {
        summary.hasDrawingPdf = true;
      }
    }

    if (attachment.excerpt) {
      summary.textSnippets.push(cleanText(attachment.excerpt).slice(0, 1200));
    }
  }

  return summary;
}

function detectFlags(combinedText) {
  const lowered = normalizeWhitespace(combinedText);

  return {
    certificationsRequired: CERT_HINTS.some((item) => lowered.includes(item)),
    finishMentioned: FINISH_HINTS.some((item) => lowered.includes(item)),
    rushRequested: /\brush\b|\basap\b|\bexpedite\b|\burgent\b/i.test(combinedText),
    tightTolerance: /\+\/-\s*0?\.(?:0005|001|0008)\b/i.test(combinedText) || lowered.includes("tight tolerance"),
    platingOrFinish: FINISH_HINTS.filter((item) => lowered.includes(item)),
    itarMentioned: lowered.includes("itar"),
    ndaMentioned: lowered.includes("nda")
  };
}

function estimateComplexity(rfq) {
  const attachmentNames = (rfq.attachments || []).map((item) => item.filename.toLowerCase());
  const text = normalizeWhitespace([rfq.subject, rfq.snippet, rfq.bodyText].join("\n"));
  const score =
    (attachmentNames.some((name) => name.endsWith(".stp") || name.endsWith(".step")) ? 1 : 0) +
    (text.includes("5 axis") || text.includes("5-axis") ? 2 : 0) +
    (text.includes("4 axis") || text.includes("4-axis") ? 1 : 0) +
    (text.includes("fixture") ? 1 : 0) +
    (text.includes("tight tolerance") ? 1 : 0);

  if (score >= 3) {
    return "High";
  }
  if (score >= 1) {
    return "Medium";
  }
  return "Low";
}

function buildCommercialReview(rfqSignals, flags) {
  const items = [];

  if (!rfqSignals.quantity) {
    items.push("Confirm quantity before quoting.");
  }

  if (!rfqSignals.material) {
    items.push("Material is not clearly specified.");
  }

  if (!rfqSignals.leadTime) {
    items.push("Lead time or need-by date is missing.");
  }

  if (!rfqSignals.attachmentSummary.hasStep) {
    items.push("No STEP file found, so geometry review may be incomplete.");
  }

  if (!rfqSignals.attachmentSummary.hasPdf) {
    items.push("No PDF drawing found; verify dimensions, tolerances, and notes.");
  }

  if (flags.certificationsRequired) {
    items.push("Customer appears to require certs or inspection documentation.");
  }

  if (flags.rushRequested) {
    items.push("Rush language detected, so capacity should be checked before commitment.");
  }

  return items;
}

function buildFallbackAnalysis(rfq) {
  const attachmentSummary = collectAttachmentSignals(rfq.attachments);
  const combinedText = cleanText(
    [rfq.subject, rfq.snippet, rfq.bodyText, ...attachmentSummary.textSnippets].join("\n\n")
  );
  const flags = detectFlags(combinedText);

  const extracted = {
    quantity: parseQuantity(combinedText),
    leadTime: parseLeadTime(combinedText),
    material: parseMaterial(combinedText),
    tolerance: parseTolerance(combinedText),
    partName: parsePartName(combinedText, rfq.subject),
    attachmentSummary,
    complexity: estimateComplexity(rfq)
  };

  const commercialReview = buildCommercialReview(extracted, flags);
  const nextActions = [
    "Review STEP geometry and confirm stock size, machine envelope, and workholding approach.",
    "Check drawing notes for hidden requirements such as deburr standard, edge breaks, or inspection sampling.",
    "Confirm outside processing needs before promising lead time."
  ];

  if (flags.certificationsRequired) {
    nextActions.push("Include cert and inspection cost in the final estimate package.");
  }

  return {
    source: "fallback",
    customerSummary: cleanText(
      `RFQ from ${rfq.from || "unknown sender"} regarding "${rfq.subject || "untitled request"}".`
    ),
    extractedRequirements: {
      quantity: extracted.quantity || "Unknown",
      material: extracted.material || "Unknown",
      leadTime: extracted.leadTime || "Unknown",
      tolerance: extracted.tolerance || "Unknown",
      partName: extracted.partName || "Unknown",
      complexity: extracted.complexity,
      attachments: attachmentSummary.attachmentNames
    },
    quoteConditions: [
      "Quote remains subject to engineering review of the attached model and drawing.",
      "Pricing should exclude tooling changes, fixtures, and outside processing unless explicitly listed.",
      "Lead time should start after PO receipt, drawing approval, and material availability confirmation."
    ],
    risks: [
      ...commercialReview,
      flags.tightTolerance ? "Tight tolerance language detected and likely needs manual inspection planning." : null,
      flags.itarMentioned ? "ITAR language detected; verify compliance workflow before proceeding." : null
    ].filter(Boolean),
    nextActions,
    internalNotes: cleanText(combinedText).slice(0, 1400)
  };
}

function buildOpenRouterPrompt(rfq) {
  const attachmentLines = (rfq.attachments || [])
    .map((item) => {
      const excerpt = item.excerpt ? `\nExcerpt:\n${cleanText(item.excerpt).slice(0, 1200)}` : "";
      return `- ${item.filename} (${item.mimeType}, ${item.size || 0} bytes)${excerpt}`;
    })
    .join("\n");

  return `
You are an estimating assistant for a CNC machine shop.
Review the incoming customer RFQ email and extract only what is actually supported by the message and attachment text.

Return JSON only with this shape:
{
  "customerSummary": "short summary",
  "extractedRequirements": {
    "quantity": "string",
    "material": "string",
    "leadTime": "string",
    "tolerance": "string",
    "finish": "string",
    "partDescription": "string",
    "attachments": ["file names"],
    "complexity": "Low|Medium|High"
  },
  "quoteConditions": ["condition"],
  "risks": ["risk"],
  "nextActions": ["action"],
  "internalNotes": "brief estimator notes"
}

Rules:
- Focus on machine-shop quoting, manufacturability, commercial risks, and missing data.
- Mention missing information clearly.
- Do not invent dimensions, tolerances, or materials.
- Prefer concise, estimator-friendly language.

Email subject:
${rfq.subject || ""}

From:
${rfq.from || ""}

Date:
${rfq.date || ""}

Snippet:
${rfq.snippet || ""}

Body:
${cleanText(rfq.bodyText).slice(0, 6000)}

Attachments:
${attachmentLines || "- none"}
  `.trim();
}

function parseAnalysisResponse(text) {
  const raw = cleanText(text);

  try {
    return JSON.parse(raw);
  } catch (error) {
    const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```([\s\S]*?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1].trim());
    }
    throw error;
  }
}

module.exports = {
  buildFallbackAnalysis,
  buildOpenRouterPrompt,
  parseAnalysisResponse,
  cleanText
};
