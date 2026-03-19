const fixedVendor = {
  company: "American Tooling & Machining Company",
  addressLines: ["45554 INDUSTRIAL PL #5", "FREMONT, CA 94538"]
};

const state = {
  items: [
    { id: crypto.randomUUID(), partNumber: "ACT_ADAPTOR", description: "AL 6061", quantity: 3, priceEach: 745 },
    { id: crypto.randomUUID(), partNumber: "ACT_MOUNT_SMALL", description: "AL 6061", quantity: 3, priceEach: 250 }
  ]
};

const elements = {
  estimateNumber: document.querySelector("#estimateNumber"),
  estimateDate: document.querySelector("#estimateDate"),
  projectName: document.querySelector("#projectName"),
  leadTime: document.querySelector("#leadTime"),
  taxEnabled: document.querySelector("#taxEnabled"),
  taxRate: document.querySelector("#taxRate"),
  recipientCompany: document.querySelector("#recipientCompany"),
  recipientAddress: document.querySelector("#recipientAddress"),
  recipientContact: document.querySelector("#recipientContact"),
  footerNotes: document.querySelector("#footerNotes"),
  fileInput: document.querySelector("#fileInput"),
  addItemButton: document.querySelector("#addItemButton"),
  generatePdfButton: document.querySelector("#generatePdfButton"),
  itemsTableBody: document.querySelector("#itemsTableBody"),
  statusMessage: document.querySelector("#statusMessage"),
  grandTotalChip: document.querySelector("#grandTotalChip"),
  previewDate: document.querySelector("#previewDate"),
  previewEstimateNumber: document.querySelector("#previewEstimateNumber"),
  previewRecipientCompany: document.querySelector("#previewRecipientCompany"),
  previewRecipientAddress: document.querySelector("#previewRecipientAddress"),
  previewRecipientContact: document.querySelector("#previewRecipientContact"),
  previewProject: document.querySelector("#previewProject"),
  previewHeaderTotal: document.querySelector("#previewHeaderTotal"),
  previewItemsBody: document.querySelector("#previewItemsBody"),
  previewLeadTime: document.querySelector("#previewLeadTime"),
  previewNotes: document.querySelector("#previewNotes"),
  previewSubtotal: document.querySelector("#previewSubtotal"),
  previewTaxLabel: document.querySelector("#previewTaxLabel"),
  previewTaxAmount: document.querySelector("#previewTaxAmount"),
  previewGrandTotal: document.querySelector("#previewGrandTotal")
};

function setDefaultDate() {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  elements.estimateDate.value = iso;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value) || 0);
}

function formatDateForPreview(isoDate) {
  if (!isoDate) {
    return "";
  }

  const parsed = new Date(`${isoDate}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}

function getItemTotal(item) {
  const quantity = Number(item.quantity) || 0;
  const priceEach = Number(item.priceEach) || 0;
  return quantity * priceEach;
}

function getTotals() {
  const subtotal = state.items.reduce((sum, item) => sum + getItemTotal(item), 0);
  const taxEnabled = elements.taxEnabled.checked;
  const taxRate = taxEnabled ? Math.max(0, Number(elements.taxRate.value) || 0) : 0;
  const taxAmount = taxEnabled ? subtotal * (taxRate / 100) : 0;
  const total = subtotal + taxAmount;

  return { subtotal, taxEnabled, taxRate, taxAmount, total };
}

function getRecipientAddressLines() {
  return String(elements.recipientAddress.value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getFooterLines() {
  return String(elements.footerNotes.value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function setStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.style.color = isError ? "#8f2016" : "";
}

function renderItemsTable() {
  if (!state.items.length) {
    elements.itemsTableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-preview">No line items yet. Add a row or import a file.</div>
        </td>
      </tr>
    `;
    return;
  }

  elements.itemsTableBody.innerHTML = state.items.map((item) => `
    <tr data-item-id="${item.id}">
      <td><input type="text" data-field="partNumber" value="${escapeHtml(item.partNumber)}"></td>
      <td><input type="text" data-field="description" value="${escapeHtml(item.description)}"></td>
      <td><input type="number" min="0" step="1" data-field="quantity" value="${Number(item.quantity) || 0}"></td>
      <td><input type="number" min="0" step="0.01" data-field="priceEach" value="${Number(item.priceEach) || 0}"></td>
      <td><div class="line-total">${formatCurrency(getItemTotal(item))}</div></td>
      <td><button class="button icon-button" type="button" data-action="remove">x</button></td>
    </tr>
  `).join("");
}

function renderPreview() {
  const { subtotal, taxEnabled, taxRate, taxAmount, total } = getTotals();
  const footerLines = getFooterLines();

  elements.previewDate.textContent = formatDateForPreview(elements.estimateDate.value);
  elements.previewEstimateNumber.textContent = elements.estimateNumber.value || "-";
  elements.previewRecipientCompany.textContent = elements.recipientCompany.value || "-";
  elements.previewRecipientAddress.textContent = getRecipientAddressLines().join("\n");
  elements.previewRecipientAddress.style.whiteSpace = "pre-line";
  elements.previewRecipientContact.textContent = elements.recipientContact.value ? `Attn: ${elements.recipientContact.value}` : "";
  elements.previewProject.textContent = elements.projectName.value || "-";
  elements.previewHeaderTotal.textContent = formatCurrency(total);
  elements.previewLeadTime.textContent = elements.leadTime.value ? `lead time ${elements.leadTime.value}` : "";
  elements.previewNotes.innerHTML = footerLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  elements.previewSubtotal.textContent = formatCurrency(subtotal);
  elements.previewTaxLabel.textContent = `Sales Tax (${(Math.max(0, Number(elements.taxRate.value) || 0)).toFixed(2)}%)`;
  elements.previewTaxAmount.textContent = formatCurrency(taxAmount);
  elements.previewGrandTotal.textContent = formatCurrency(total);
  elements.grandTotalChip.textContent = formatCurrency(total);

  if (!state.items.length) {
    elements.previewItemsBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-preview">Add parts to see the estimate table.</td>
      </tr>
    `;
    return;
  }

  elements.previewItemsBody.innerHTML = state.items.map((item) => `
    <tr>
      <td>
        <div class="description-line">
          <strong>${escapeHtml(item.partNumber || "Untitled part")}</strong>
          <span>${escapeHtml(item.description || "")}</span>
        </div>
      </td>
      <td>${Number(item.quantity) || 0}</td>
      <td>${formatCurrency(item.priceEach)}</td>
      <td>${formatCurrency(getItemTotal(item))}</td>
    </tr>
  `).join("");
}

function syncAll() {
  renderItemsTable();
  renderPreview();
}

function addItem(item = {}) {
  state.items.push({
    id: crypto.randomUUID(),
    partNumber: item.partNumber || "",
    description: item.description || "",
    quantity: Number(item.quantity) || 0,
    priceEach: Number(item.priceEach) || 0
  });
  syncAll();
}

function updateItem(itemId, field, value) {
  const item = state.items.find((entry) => entry.id === itemId);

  if (!item) {
    return;
  }

  if (field === "quantity" || field === "priceEach") {
    item[field] = Number(value) || 0;
  } else {
    item[field] = value;
  }

  syncAll();
}

function removeItem(itemId) {
  state.items = state.items.filter((item) => item.id !== itemId);
  syncAll();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function pickField(record, aliases) {
  const keys = Object.keys(record);

  for (const key of keys) {
    const normalized = normalizeHeader(key);

    if (aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
      return record[key];
    }
  }

  return "";
}

function parseImportedRows(rows) {
  return rows
    .map((row) => ({
      partNumber: pickField(row, ["part number", "part no", "part", "item", "item number"]),
      description: pickField(row, ["description", "desc", "material"]),
      quantity: pickField(row, ["qty", "quantity"]),
      priceEach: pickField(row, ["price each", "price", "rate", "unit price", "each"])
    }))
    .filter((row) => Object.values(row).some((value) => String(value || "").trim() !== ""));
}

async function importSpreadsheet(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("The file does not contain any sheets.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
  const importedItems = parseImportedRows(rows);

  if (!importedItems.length) {
    throw new Error("No usable rows were found. Check the header names in the file.");
  }

  state.items = importedItems.map((item) => ({
    id: crypto.randomUUID(),
    partNumber: String(item.partNumber || "").trim(),
    description: String(item.description || "").trim(),
    quantity: Number(item.quantity) || 0,
    priceEach: Number(item.priceEach) || 0
  }));

  syncAll();
  setStatus(`Imported ${state.items.length} line item${state.items.length === 1 ? "" : "s"} from ${file.name}.`);
}

function drawWrappedText(doc, lines, x, y, options = {}) {
  const safeLines = lines.filter(Boolean);
  const lineHeight = options.lineHeight || 5;
  const maxWidth = options.maxWidth || 72;
  let currentY = y;

  safeLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, maxWidth);
    doc.text(wrapped, x, currentY);
    currentY += wrapped.length * lineHeight;
  });

  return currentY;
}

function generatePdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const { subtotal, taxEnabled, taxRate, taxAmount, total } = getTotals();
  const dateText = formatDateForPreview(elements.estimateDate.value);
  const recipientAddressLines = getRecipientAddressLines();
  const footerLines = getFooterLines();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), "F");

  doc.setFont("times", "normal");
  doc.setFontSize(14);
  doc.text(fixedVendor.company, 40, 58);
  doc.setFontSize(10.5);
  doc.text(fixedVendor.addressLines[0], 40, 80);
  doc.text(fixedVendor.addressLines[1], 40, 95);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Estimate", 470, 58);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.rect(396, 66, 131, 44);
  doc.line(461.5, 66, 461.5, 110);
  doc.line(396, 88, 527, 88);
  doc.text("Date", 417, 80);
  doc.text("Estimate #", 472, 80);
  doc.setFont("helvetica", "bold");
  doc.text(dateText || "-", 417, 103);
  doc.text(elements.estimateNumber.value || "-", 499, 103, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Name / Address", 40, 145);
  doc.setFont("helvetica", "bold");
  doc.text(elements.recipientCompany.value || "-", 40, 160);
  doc.setFont("helvetica", "normal");
  let addressEndY = drawWrappedText(doc, recipientAddressLines, 40, 176, { maxWidth: 210, lineHeight: 14 });

  if (elements.recipientContact.value) {
    addressEndY += 4;
    doc.text(`Attn: ${elements.recipientContact.value}`, 40, addressEndY);
  }

  doc.setFont("helvetica", "normal");
  doc.rect(435, 216, 92, 44);
  doc.line(435, 238, 527, 238);
  doc.text("Project", 468, 231);
  doc.text("Total", 471, 253);
  doc.setFont("helvetica", "bold");
  doc.text(elements.projectName.value || "-", 40, 355);
  doc.text(formatCurrency(total), 519, 253, { align: "right" });

  doc.autoTable({
    startY: 260,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: { top: 6, right: 4, bottom: 6, left: 4 },
      textColor: [20, 20, 20],
      lineColor: [90, 90, 90],
      lineWidth: 0.6
    },
    headStyles: {
      fontStyle: "normal",
      fillColor: [255, 255, 255],
      textColor: [20, 20, 20]
    },
    columnStyles: {
      0: { cellWidth: 300 },
      1: { halign: "right", cellWidth: 55 },
      2: { halign: "right", cellWidth: 80 },
      3: { halign: "right", cellWidth: 85 }
    },
    head: [["Description", "Qty", "Rate", "Total"]],
    body: state.items.map((item) => [
      [item.partNumber || "", item.description || ""].filter(Boolean).join("  "),
      String(Number(item.quantity) || 0),
      formatCurrency(item.priceEach),
      formatCurrency(getItemTotal(item))
    ])
  });

  let afterTableY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 22 : 320;

  doc.setFont("helvetica", "normal");
  if (elements.leadTime.value) {
    doc.text(`lead time ${elements.leadTime.value}`, 40, afterTableY);
    afterTableY += 18;
  }

  footerLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, 260);
    doc.text(wrapped, 40, afterTableY);
    afterTableY += wrapped.length * 14;
  });

  const totalsBoxX = 360;
  const totalsBoxY = Math.max(560, (doc.lastAutoTable ? doc.lastAutoTable.finalY : 320) + 18);

  doc.setDrawColor(210, 210, 210);
  doc.roundedRect(totalsBoxX, totalsBoxY, 175, 86, 10, 10);
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal", totalsBoxX + 14, totalsBoxY + 24);
  doc.text(`Sales Tax (${(Math.max(0, Number(elements.taxRate.value) || 0)).toFixed(2)}%)`, totalsBoxX + 14, totalsBoxY + 46);
  doc.setFont("helvetica", "bold");
  doc.text(formatCurrency(subtotal), totalsBoxX + 160, totalsBoxY + 24, { align: "right" });
  doc.text(formatCurrency(taxAmount), totalsBoxX + 160, totalsBoxY + 46, { align: "right" });
  doc.line(totalsBoxX + 14, totalsBoxY + 58, totalsBoxX + 161, totalsBoxY + 58);
  doc.text("Total", totalsBoxX + 14, totalsBoxY + 77);
  doc.text(formatCurrency(total), totalsBoxX + 160, totalsBoxY + 77, { align: "right" });

  const safeEstimateNumber = String(elements.estimateNumber.value || "estimate").replace(/[^\w-]+/g, "-");
  doc.save(`estimate-${safeEstimateNumber}.pdf`);
}

function handleTableInput(event) {
  const row = event.target.closest("tr[data-item-id]");

  if (!row) {
    return;
  }

  const field = event.target.dataset.field;

  if (!field) {
    return;
  }

  updateItem(row.dataset.itemId, field, event.target.value);
}

function handleTableClick(event) {
  const button = event.target.closest("button[data-action='remove']");

  if (!button) {
    return;
  }

  const row = button.closest("tr[data-item-id]");

  if (!row) {
    return;
  }

  removeItem(row.dataset.itemId);
  setStatus("Line item removed.");
}

function registerEvents() {
  const liveInputs = [
    elements.estimateNumber,
    elements.estimateDate,
    elements.projectName,
    elements.leadTime,
    elements.taxEnabled,
    elements.taxRate,
    elements.recipientCompany,
    elements.recipientAddress,
    elements.recipientContact,
    elements.footerNotes
  ];

  liveInputs.forEach((element) => {
    element.addEventListener("input", () => {
      renderPreview();
      setStatus("");
    });
  });

  elements.addItemButton.addEventListener("click", () => {
    addItem();
    setStatus("New line item added.");
  });

  elements.itemsTableBody.addEventListener("input", handleTableInput);
  elements.itemsTableBody.addEventListener("click", handleTableClick);

  elements.fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];

    if (!file) {
      return;
    }

    try {
      await importSpreadsheet(file);
    } catch (error) {
      setStatus(error.message || "Import failed.", true);
    } finally {
      elements.fileInput.value = "";
    }
  });

  elements.generatePdfButton.addEventListener("click", () => {
    if (!state.items.length) {
      setStatus("Add at least one line item before generating the PDF.", true);
      return;
    }

    generatePdf();
    setStatus("PDF generated and download started.");
  });
}

function init() {
  setDefaultDate();
  elements.taxEnabled.checked = false;
  registerEvents();
  syncAll();
}

init();
