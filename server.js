require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pdfParse = require("pdf-parse");
const { google } = require("googleapis");
const { buildFallbackAnalysis, buildOpenRouterPrompt, parseAnalysisResponse, cleanText } = require("./quote-engine");

const PORT = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const storedRfqsPath = path.join(dataDir, "rfq-store.json");
const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/oauth2callback`;
const autoSyncIntervalMs = 60 * 60 * 1000;
const defaultSyncQuery = "has:attachment newer_than:30d (quote OR rfq OR drawing OR step OR stp)";
const gmailScopes = [
  "https://www.googleapis.com/auth/gmail.readonly"
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml"
};

const state = {
  oauthState: null,
  gmailTokens: null,
  rfqs: [],
  lastSyncAt: null,
  storedRfqs: [],
  autoSyncQuery: defaultSyncQuery,
  autoSyncEnabled: true
};

const priorityKeywords = [
  { pattern: /\brfq\b/i, score: 5 },
  { pattern: /\bquote\b/i, score: 4 },
  { pattern: /\bestimate\b/i, score: 4 },
  { pattern: /\bpo\b|\bpurchase order\b/i, score: 3 },
  { pattern: /\blead time\b|\bdue date\b|\bneed by\b/i, score: 3 },
  { pattern: /\bqty\b|\bquantity\b|\bpcs\b|\bparts\b/i, score: 2 },
  { pattern: /\bmaterial\b|\bfinish\b|\bdrawing\b|\bprint\b/i, score: 2 }
];

function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthorizedClient() {
  const client = createOAuthClient();

  if (!client || !state.gmailTokens) {
    return null;
  }

  client.setCredentials(state.gmailTokens);
  return client;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function ensureDataStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(storedRfqsPath)) {
    fs.writeFileSync(storedRfqsPath, "[]", "utf8");
  }
}

function loadStoredRfqs() {
  ensureDataStore();

  try {
    const raw = fs.readFileSync(storedRfqsPath, "utf8");
    state.storedRfqs = JSON.parse(raw);
  } catch (error) {
    state.storedRfqs = [];
  }
}

function saveStoredRfqs() {
  ensureDataStore();
  fs.writeFileSync(storedRfqsPath, JSON.stringify(state.storedRfqs, null, 2), "utf8");
}

function sendRedirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function serveFile(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const resolvedPath = path.normalize(path.join(rootDir, safePath));

  if (!resolvedPath.startsWith(rootDir)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(resolvedPath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      sendJson(response, 500, { error: "Failed to load file" });
      return;
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    response.writeHead(200, { "Content-Type": mimeTypes[extension] || "application/octet-stream" });
    response.end(content);
  });
}

function collectRequestBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;

      if (rawBody.length > 2_000_000) {
        reject(new Error("Payload too large"));
        request.destroy();
      }
    });

    request.on("end", () => resolve(rawBody));
    request.on("error", reject);
  });
}

function decodeBase64Url(input) {
  if (!input) {
    return "";
  }

  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function stripHtmlTags(value) {
  return cleanText(String(value || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

function extractTextFromPayload(payload) {
  const textParts = [];

  function walk(part) {
    if (!part) {
      return;
    }

    if (part.mimeType === "text/plain" && part.body && part.body.data) {
      textParts.push(decodeBase64Url(part.body.data));
    }

    if (part.mimeType === "text/html" && part.body && part.body.data) {
      textParts.push(stripHtmlTags(decodeBase64Url(part.body.data)));
    }

    for (const child of part.parts || []) {
      walk(child);
    }
  }

  walk(payload);
  return cleanText(textParts.join("\n\n"));
}

function collectAttachmentParts(payload, found = []) {
  if (!payload) {
    return found;
  }

  const filename = String(payload.filename || "").trim();

  if (filename && payload.body && payload.body.attachmentId) {
    found.push({
      attachmentId: payload.body.attachmentId,
      filename,
      mimeType: payload.mimeType || "application/octet-stream",
      size: payload.body.size || 0
    });
  }

  for (const part of payload.parts || []) {
    collectAttachmentParts(part, found);
  }

  return found;
}

async function fetchAttachmentExcerpt(gmail, messageId, attachment) {
  const supportedTextMimeTypes = [
    "text/plain",
    "text/csv",
    "application/json",
    "application/xml",
    "text/xml"
  ];
  const lowerName = attachment.filename.toLowerCase();

  try {
    const result = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachment.attachmentId
    });

    const data = result.data && result.data.data ? result.data.data : "";
    const buffer = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");

    if (attachment.mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
      const parsed = await pdfParse(buffer);
      return cleanText(parsed.text).slice(0, 2500);
    }

    if (
      supportedTextMimeTypes.includes(attachment.mimeType) ||
      lowerName.endsWith(".stp") ||
      lowerName.endsWith(".step") ||
      lowerName.endsWith(".txt")
    ) {
      return cleanText(buffer.toString("utf8")).slice(0, 2500);
    }
  } catch (error) {
    return "";
  }

  return "";
}

function mapHeaders(headers) {
  const values = {};

  for (const header of headers || []) {
    values[String(header.name || "").toLowerCase()] = header.value || "";
  }

  return values;
}

function parseSenderDetails(fromValue) {
  const raw = String(fromValue || "").trim();
  const angleMatch = raw.match(/^(.*?)\s*<([^>]+)>$/);
  const email = angleMatch ? angleMatch[2].trim() : raw;
  const senderName = cleanText(angleMatch ? angleMatch[1].replace(/^"|"$/g, "") : email.split("@")[0] || "Unknown");
  const domain = (email.split("@")[1] || "").toLowerCase();
  const company = domain
    ? domain
        .split(".")
        .slice(0, 1)
        .join("")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Unknown";

  return {
    senderName: senderName || "Unknown",
    senderEmail: email || "Unknown",
    company: company || "Unknown"
  };
}

async function mapMessageToRfq(gmail, message) {
  const payload = message.payload || {};
  const headers = mapHeaders(payload.headers);
  const attachments = collectAttachmentParts(payload);
  const hydratedAttachments = [];
  const sender = parseSenderDetails(headers.from || "");

  for (const attachment of attachments.slice(0, 8)) {
    const excerpt = await fetchAttachmentExcerpt(gmail, message.id, attachment);
    hydratedAttachments.push({
      ...attachment,
      excerpt
    });
  }

  return {
    id: message.id,
    threadId: message.threadId,
    subject: headers.subject || "(no subject)",
    from: headers.from || "",
    senderName: sender.senderName,
    senderEmail: sender.senderEmail,
    company: sender.company,
    date: headers.date || "",
    snippet: cleanText(message.snippet || ""),
    bodyText: extractTextFromPayload(payload),
    attachments: hydratedAttachments
  };
}

function getAttachmentPriorityScore(attachments) {
  let score = 0;

  for (const attachment of attachments || []) {
    const name = String(attachment.filename || "").toLowerCase();

    if (name.endsWith(".pdf")) {
      score += 3;
    }

    if (name.endsWith(".stp") || name.endsWith(".step")) {
      score += 5;
    }

    if (name.includes("drawing") || name.includes("quote") || name.includes("po")) {
      score += 2;
    }
  }

  return score;
}

function getRecencyPriorityScore(dateValue) {
  const sentAt = new Date(dateValue);

  if (Number.isNaN(sentAt.getTime())) {
    return 0;
  }

  const ageHours = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60);

  if (ageHours <= 24) {
    return 6;
  }

  if (ageHours <= 72) {
    return 4;
  }

  if (ageHours <= 168) {
    return 2;
  }

  return 0;
}

function scoreRfqPriority(rfq) {
  const haystack = [rfq.subject, rfq.snippet, rfq.bodyText].join("\n");
  let score = 0;
  const reasons = [];

  for (const rule of priorityKeywords) {
    if (rule.pattern.test(haystack)) {
      score += rule.score;
      reasons.push(rule.pattern.source);
    }
  }

  const attachmentScore = getAttachmentPriorityScore(rfq.attachments);
  const recencyScore = getRecencyPriorityScore(rfq.date);
  const senderScore = /@tesla\.com\b/i.test(rfq.from) ? 2 : 0;

  score += attachmentScore + recencyScore + senderScore;

  if (attachmentScore > 0) {
    reasons.push("attachments");
  }

  if (recencyScore > 0) {
    reasons.push("recent");
  }

  if (senderScore > 0) {
    reasons.push("known customer domain");
  }

  return {
    ...rfq,
    sortScore: score,
    sortReasons: reasons
  };
}

function sortRfqsByPriority(rfqs) {
  return [...rfqs]
    .map(scoreRfqPriority)
    .sort((left, right) => {
      if (right.sortScore !== left.sortScore) {
        return right.sortScore - left.sortScore;
      }

      return new Date(right.date).getTime() - new Date(left.date).getTime();
    });
}

async function syncInbox(options = {}) {
  const auth = getAuthorizedClient();

  if (!auth) {
    throw new Error("Connect Gmail first.");
  }

  const gmail = google.gmail({ version: "v1", auth });
  const query = options.query || state.autoSyncQuery || defaultSyncQuery;
  const maxResults = Math.min(20, Math.max(1, Number(options.maxResults) || 8));

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults
  });

  const messages = listResponse.data.messages || [];
  const rfqs = [];

  for (const item of messages) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: item.id,
      format: "full"
    });

    rfqs.push(await mapMessageToRfq(gmail, detail.data));
  }

  state.rfqs = sortRfqsByPriority(rfqs);
  state.lastSyncAt = new Date().toISOString();
  state.autoSyncQuery = query;
  return state.rfqs;
}

async function runAutoSync() {
  if (!state.autoSyncEnabled || !state.gmailTokens) {
    return;
  }

  try {
    await syncInbox({
      query: state.autoSyncQuery || defaultSyncQuery,
      maxResults: 8
    });
    console.log(`[auto-sync] Gmail RFQs refreshed at ${new Date().toISOString()}`);
  } catch (error) {
    console.error("[auto-sync] Failed to refresh Gmail RFQs:", error.message || error);
  }
}

async function analyzeRfq(rfq) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";

  if (!apiKey) {
    return buildFallbackAnalysis(rfq);
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": `http://localhost:${PORT}`,
        "X-Title": "Machine Shop RFQ Desk"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are a senior CNC estimator helping a machine shop triage Gmail RFQs."
          },
          {
            role: "user",
            content: buildOpenRouterPrompt(rfq)
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const text = payload.choices && payload.choices[0] && payload.choices[0].message
      ? payload.choices[0].message.content
      : "";

    return {
      source: "openrouter-free",
      ...parseAnalysisResponse(text)
    };
  } catch (error) {
    return {
      ...buildFallbackAnalysis(rfq),
      source: "fallback",
      fallbackReason: error.message || "OpenRouter free request failed"
    };
  }
}

function getConfigPayload() {
  const hasGoogleConfig = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasOpenRouterConfig = Boolean(process.env.OPENROUTER_API_KEY);

  return {
    serverTime: new Date().toISOString(),
    redirectUri,
    gmail: {
      configured: hasGoogleConfig,
      connected: Boolean(state.gmailTokens),
      scopes: gmailScopes
    },
    openRouter: {
      configured: hasOpenRouterConfig,
      model: process.env.OPENROUTER_MODEL || "openrouter/free"
    },
    autoSync: {
      enabled: state.autoSyncEnabled,
      intervalMinutes: 60
    },
    rfqCount: state.rfqs.length,
    storedRfqCount: state.storedRfqs.length,
    lastSyncAt: state.lastSyncAt
  };
}

function summarizeLeadTime(leadTime) {
  const value = String(leadTime || "").trim();

  if (!value || value === "Unknown") {
    return "Unknown";
  }

  if (/\b(?:1|2)\s*(?:day|days)\b/i.test(value) || /\brush\b|\basap\b/i.test(value)) {
    return "Urgent";
  }

  if (/\b(?:3|4|5)\s*(?:day|days)\b/i.test(value) || /\b1\s*week\b/i.test(value)) {
    return "Near term";
  }

  if (/\b2\s*week|\b3\s*week|\b4\s*week/i.test(value)) {
    return "Plannable";
  }

  return value;
}

function buildStoredRfqRecord(rfq, analysis, body = {}) {
  const requirements = analysis.extractedRequirements || {};
  const existing = state.storedRfqs.find((item) => item.id === rfq.id);
  const sender = parseSenderDetails(rfq.from);

  return {
    id: rfq.id,
    threadId: rfq.threadId,
    subject: rfq.subject,
    from: rfq.from,
    senderName: requirements.senderName || sender.senderName,
    senderEmail: sender.senderEmail,
    company: requirements.company || sender.company,
    date: rfq.date,
    savedAt: new Date().toISOString(),
    outcome: body.outcome || (existing ? existing.outcome : "pending"),
    sortScore: rfq.sortScore || 0,
    sortReasons: rfq.sortReasons || [],
    customerSummary: analysis.customerSummary || "",
    partName: requirements.partName || rfq.subject || "Unknown",
    quantity: requirements.quantity || "Unknown",
    material: requirements.material || "Unknown",
    leadTime: requirements.leadTime || "Unknown",
    leadTimeStatus: summarizeLeadTime(requirements.leadTime),
    complexity: requirements.complexity || "Unknown",
    attachments: requirements.attachments || [],
    topCondition: analysis.quoteConditions && analysis.quoteConditions[0] ? analysis.quoteConditions[0] : "None",
    topRisk: analysis.risks && analysis.risks[0] ? analysis.risks[0] : "None",
    nextStep: analysis.nextActions && analysis.nextActions[0] ? analysis.nextActions[0] : "None",
    notes: body.notes || (existing ? existing.notes : "")
  };
}

async function handleApiConfig(response) {
  sendJson(response, 200, getConfigPayload());
}

async function handleApiAuthUrl(response) {
  const client = createOAuthClient();

  if (!client) {
    sendJson(response, 400, {
      error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in your environment."
    });
    return;
  }

  state.oauthState = crypto.randomBytes(12).toString("hex");

  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: gmailScopes,
    state: state.oauthState
  });

  sendJson(response, 200, { url });
}

async function handleOAuthCallback(url, response) {
  const client = createOAuthClient();

  if (!client) {
    sendRedirect(response, "/?gmail=missing-config");
    return;
  }

  if (!url.searchParams.get("code") || url.searchParams.get("state") !== state.oauthState) {
    sendRedirect(response, "/?gmail=failed");
    return;
  }

  const { tokens } = await client.getToken(url.searchParams.get("code"));
  state.gmailTokens = tokens;
  sendRedirect(response, "/setup.html?gmail=connected");
}

async function handleApiSync(request, response) {
  try {
    const rawBody = await collectRequestBody(request);
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const rfqs = await syncInbox(payload);
    sendJson(response, 200, {
      items: rfqs,
      count: rfqs.length,
      lastSyncAt: state.lastSyncAt
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid JSON payload." });
      return;
    }

    sendJson(response, 500, { error: error.message || "Unable to sync Gmail." });
  }
}

async function handleApiAnalyze(request, response, rfqId) {
  try {
    await collectRequestBody(request);
    const rfq = state.rfqs.find((item) => item.id === rfqId);

    if (!rfq) {
      sendJson(response, 404, { error: "RFQ not found. Sync inbox first." });
      return;
    }

    const analysis = await analyzeRfq(rfq);
    sendJson(response, 200, {
      rfq,
      analysis
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Unable to analyze RFQ." });
  }
}

async function handleApiStoreRfq(request, response, rfqId) {
  try {
    const rawBody = await collectRequestBody(request);
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const rfq = state.rfqs.find((item) => item.id === rfqId);

    if (!rfq) {
      sendJson(response, 404, { error: "RFQ not found. Sync inbox first." });
      return;
    }

    const analysis = await analyzeRfq(rfq);
    const record = buildStoredRfqRecord(rfq, analysis, payload);
    const existingIndex = state.storedRfqs.findIndex((item) => item.id === rfq.id);

    if (existingIndex >= 0) {
      state.storedRfqs[existingIndex] = record;
    } else {
      state.storedRfqs.push(record);
    }

    state.storedRfqs.sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime());
    saveStoredRfqs();
    sendJson(response, 200, { item: record, count: state.storedRfqs.length });
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid JSON payload." });
      return;
    }

    sendJson(response, 500, { error: error.message || "Unable to store RFQ." });
  }
}

async function handleApiStoredRfqs(response) {
  sendJson(response, 200, {
    items: state.storedRfqs
      .slice()
      .sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime())
  });
}

async function handleApiStoredRfqStatus(request, response, rfqId) {
  try {
    const rawBody = await collectRequestBody(request);
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const item = state.storedRfqs.find((entry) => entry.id === rfqId);

    if (!item) {
      sendJson(response, 404, { error: "Stored RFQ not found." });
      return;
    }

    item.outcome = payload.outcome || item.outcome || "pending";
    item.notes = typeof payload.notes === "string" ? payload.notes : item.notes || "";
    item.savedAt = new Date().toISOString();
    saveStoredRfqs();
    sendJson(response, 200, { item });
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid JSON payload." });
      return;
    }

    sendJson(response, 500, { error: error.message || "Unable to update RFQ status." });
  }
}

async function handleApiStoredRfqDelete(response, rfqId) {
  const existingIndex = state.storedRfqs.findIndex((entry) => entry.id === rfqId);

  if (existingIndex < 0) {
    sendJson(response, 404, { error: "Stored RFQ not found." });
    return;
  }

  state.storedRfqs.splice(existingIndex, 1);
  saveStoredRfqs();
  sendJson(response, 200, { success: true, count: state.storedRfqs.length });
}

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url) {
      sendJson(response, 400, { error: "Missing request URL" });
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/api/config") {
      await handleApiConfig(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/gmail/auth-url") {
      await handleApiAuthUrl(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/oauth2callback") {
      await handleOAuthCallback(url, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/inbox/sync") {
      await handleApiSync(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/stored-rfqs") {
      await handleApiStoredRfqs(response);
      return;
    }

    if (request.method === "POST" && /^\/api\/rfqs\/[^/]+\/analyze$/.test(url.pathname)) {
      const rfqId = url.pathname.split("/")[3];
      await handleApiAnalyze(request, response, rfqId);
      return;
    }

    if (request.method === "POST" && /^\/api\/rfqs\/[^/]+\/store$/.test(url.pathname)) {
      const rfqId = url.pathname.split("/")[3];
      await handleApiStoreRfq(request, response, rfqId);
      return;
    }

    if (request.method === "POST" && /^\/api\/stored-rfqs\/[^/]+\/status$/.test(url.pathname)) {
      const rfqId = url.pathname.split("/")[3];
      await handleApiStoredRfqStatus(request, response, rfqId);
      return;
    }

    if (request.method === "POST" && /^\/api\/stored-rfqs\/[^/]+\/delete$/.test(url.pathname)) {
      const rfqId = url.pathname.split("/")[3];
      await handleApiStoredRfqDelete(response, rfqId);
      return;
    }

    if (request.method === "GET") {
      serveFile(url.pathname, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Unexpected server error" });
  }
});

loadStoredRfqs();
setInterval(runAutoSync, autoSyncIntervalMs);
server.listen(PORT, () => {
  console.log(`Machine Shop RFQ Desk running at http://localhost:${PORT}`);
});
