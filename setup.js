const elements = {
  configCards: document.querySelector("#configCards"),
  connectGmailButton: document.querySelector("#connectGmailButton"),
  refreshConfigButton: document.querySelector("#refreshConfigButton"),
  redirectUriInput: document.querySelector("#redirectUriInput"),
  setupStatus: document.querySelector("#setupStatus")
};

function setStatus(message, isError = false) {
  elements.setupStatus.textContent = message;
  elements.setupStatus.classList.toggle("error", isError);
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function renderConfig(config) {
  const cards = [
    {
      title: "Gmail API",
      status: config.gmail.connected ? "Connected" : config.gmail.configured ? "Needs login" : "Missing config",
      pillClass: config.gmail.connected ? "pill-live" : config.gmail.configured ? "pill-warn" : "pill-off",
      body: config.gmail.connected
        ? "Mailbox connection is active."
        : "Set Google OAuth credentials, then connect your Gmail inbox."
    },
    {
      title: "OpenRouter",
      status: config.openRouter && config.openRouter.configured ? "Available" : "Optional",
      pillClass: config.openRouter && config.openRouter.configured ? "pill-live" : "pill-warn",
      body: config.openRouter && config.openRouter.configured
        ? `Current model: ${config.openRouter.model}`
        : "Optional model help is not configured."
    },
    {
      title: "Saved RFQs",
      status: `${config.storedRfqCount || 0} stored`,
      pillClass: "pill-live",
      body: "Stored RFQs are available on the Saved RFQs page."
    }
  ];

  elements.configCards.innerHTML = cards.map((card) => `
    <article class="status-card">
      <div class="status-top">
        <h3>${card.title}</h3>
        <span class="pill ${card.pillClass}">${card.status}</span>
      </div>
      <p>${card.body}</p>
    </article>
  `).join("");

  elements.redirectUriInput.value = config.redirectUri || "";
}

async function loadConfig() {
  const config = await requestJson("/api/config");
  renderConfig(config);
}

async function connectGmail() {
  const payload = await requestJson("/api/gmail/auth-url");
  window.location.href = payload.url;
}

function handleUrlFeedback() {
  const params = new URLSearchParams(window.location.search);
  const gmail = params.get("gmail");

  if (gmail === "connected") {
    setStatus("Gmail connected. You can return to the inbox page now.");
  } else if (gmail === "failed") {
    setStatus("Gmail OAuth did not complete successfully.", true);
  } else if (gmail === "missing-config") {
    setStatus("Google OAuth environment variables are missing.", true);
  }

  if (gmail) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

elements.connectGmailButton.addEventListener("click", async () => {
  try {
    setStatus("Opening Google OAuth...");
    await connectGmail();
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.refreshConfigButton.addEventListener("click", async () => {
  try {
    setStatus("Refreshing setup status...");
    await loadConfig();
    setStatus("Setup status refreshed.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

handleUrlFeedback();
loadConfig().catch((error) => {
  setStatus(error.message, true);
});
