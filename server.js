const http = require("http");
const fs = require("fs");
const path = require("path");
const { calculateQuoteResponse, validateQuoteRequest } = require("./quote-engine");

const PORT = process.env.PORT || 3000;
const rootDir = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
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

      if (rawBody.length > 1_000_000) {
        reject(new Error("Payload too large"));
        request.destroy();
      }
    });

    request.on("end", () => resolve(rawBody));
    request.on("error", reject);
  });
}

async function handleApiQuote(request, response) {
  try {
    const rawBody = await collectRequestBody(request);
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const validationError = validateQuoteRequest(payload);

    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    const quote = calculateQuoteResponse(payload);
    sendJson(response, 200, quote);
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid JSON payload" });
      return;
    }

    if (error.message === "Payload too large") {
      sendJson(response, 413, { error: "Payload too large" });
      return;
    }

    sendJson(response, 500, { error: "Unable to generate quote" });
  }
}

const server = http.createServer((request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: "Missing request URL" });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "POST" && url.pathname === "/api/quote") {
    handleApiQuote(request, response);
    return;
  }

  if (request.method === "GET") {
    serveFile(url.pathname, response);
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
});

server.listen(PORT, () => {
  console.log(`MachineQuote server running at http://localhost:${PORT}`);
});
