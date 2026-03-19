const elements = {
  savedStatus: document.querySelector("#savedStatus"),
  savedRfqList: document.querySelector("#savedRfqList")
};

function setStatus(message, isError = false) {
  elements.savedStatus.textContent = message;
  elements.savedStatus.classList.toggle("error", isError);
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function formatDate(value) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value || "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

function renderSavedRfqs(items) {
  if (!items.length) {
    elements.savedRfqList.className = "saved-grid empty-block";
    elements.savedRfqList.innerHTML = `
      <p>No stored RFQs yet.</p>
      <span>Open the inbox page, review an RFQ, and click Store RFQ.</span>
    `;
    return;
  }

  elements.savedRfqList.className = "saved-grid";
  elements.savedRfqList.innerHTML = items.map((item) => `
    <article class="saved-card">
      <div class="saved-top">
        <div>
          <p class="saved-date">${formatDate(item.date)}</p>
          <h3>${item.subject}</h3>
        </div>
        <div class="outcome-group">
          <button class="outcome-chip ${item.outcome === "won" ? "outcome-active" : ""}" data-id="${item.id}" data-outcome="won" type="button">Won</button>
          <button class="outcome-chip ${item.outcome === "lost" ? "outcome-active" : ""}" data-id="${item.id}" data-outcome="lost" type="button">Lost</button>
          <button class="outcome-chip ${item.outcome === "pending" ? "outcome-active" : ""}" data-id="${item.id}" data-outcome="pending" type="button">Pending</button>
          <button class="outcome-chip delete-chip" data-delete-id="${item.id}" type="button">Remove</button>
        </div>
      </div>

      <div class="saved-facts">
        <div class="saved-fact"><span>Sender</span><strong>${item.senderName || "Unknown"}</strong></div>
        <div class="saved-fact"><span>Company</span><strong>${item.company || "Unknown"}</strong></div>
        <div class="saved-fact"><span>Part</span><strong>${item.partName || "Unknown"}</strong></div>
        <div class="saved-fact"><span>Quantity</span><strong>${item.quantity || "Unknown"}</strong></div>
        <div class="saved-fact"><span>Lead Time</span><strong>${item.leadTime || "Unknown"}</strong></div>
        <div class="saved-fact"><span>Lead Status</span><strong>${item.leadTimeStatus || "Unknown"}</strong></div>
        <div class="saved-fact"><span>Material</span><strong>${item.material || "Unknown"}</strong></div>
        <div class="saved-fact"><span>Saved</span><strong>${formatDate(item.savedAt)}</strong></div>
      </div>

      <div class="saved-lines">
        <div class="compact-line">Summary: ${item.customerSummary || "None"}</div>
        <div class="compact-line">Condition: ${item.topCondition || "None"}</div>
        <div class="compact-line">Risk: ${item.topRisk || "None"}</div>
        <div class="compact-line">Next Step: ${item.nextStep || "None"}</div>
      </div>
    </article>
  `).join("");
}

async function loadSavedRfqs() {
  setStatus("Loading stored RFQs...");
  const payload = await requestJson("/api/stored-rfqs");
  renderSavedRfqs(payload.items || []);
  setStatus(`Loaded ${payload.items.length} stored RFQ${payload.items.length === 1 ? "" : "s"}.`);
}

async function updateOutcome(id, outcome) {
  setStatus(`Updating RFQ to ${outcome}...`);
  await requestJson(`/api/stored-rfqs/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outcome })
  });
  await loadSavedRfqs();
}

async function deleteSavedRfq(id) {
  setStatus("Removing saved RFQ...");
  await requestJson(`/api/stored-rfqs/${id}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  await loadSavedRfqs();
}

elements.savedRfqList.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-id]");

  if (deleteButton) {
    try {
      await deleteSavedRfq(deleteButton.dataset.deleteId);
    } catch (error) {
      setStatus(error.message, true);
    }
    return;
  }

  const button = event.target.closest("[data-id][data-outcome]");

  if (!button) {
    return;
  }

  try {
    await updateOutcome(button.dataset.id, button.dataset.outcome);
  } catch (error) {
    setStatus(error.message, true);
  }
});

loadSavedRfqs().catch((error) => {
  setStatus(error.message, true);
});
