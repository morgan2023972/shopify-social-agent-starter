/** @type {HTMLDivElement} */
const queueEl = document.getElementById("queue");
/** @type {HTMLParagraphElement} */
const statusEl = document.getElementById("status");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? "error" : "info";
}

async function fetchQueue() {
  const res = await fetch("/api/queue");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body.data;
}

function renderVariants(variants, selectedIndex) {
  return variants
    .map(
      (v, i) =>
        `<li class="variant${i === selectedIndex ? " selected" : ""}">
          <span class="variant-idx">${i + 1}.</span>
          <span>${escapeHtml(v.reviewText ?? v.text)}</span>
        </li>`,
    )
    .join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderQueue(items) {
  if (!items.length) {
    queueEl.innerHTML = "<p class='empty'>No pending items.</p>";
    return;
  }

  queueEl.innerHTML = items
    .map(
      (item) => `
    <article class="card" data-id="${escapeHtml(item.id)}">
      <div class="card-header">
        <span class="post-id">${escapeHtml(item.id)}</span>
        <span class="badge ${item.status}">${item.status}</span>
      </div>
      <p class="original"><strong>Original:</strong> ${escapeHtml(item.originalText ?? "")}</p>
      <ul class="variants">${renderVariants(item.variants, item.selectedVariantIndex)}</ul>
      <div class="card-actions">
        ${item.variants
          .map(
            (_, i) =>
              `<button class="btn-approve" data-id="${escapeHtml(item.id)}" data-index="${i}">
                Approve variant ${i + 1}
              </button>`,
          )
          .join("")}
        <button class="btn-reject" data-id="${escapeHtml(item.id)}">Reject</button>
      </div>
    </article>`,
    )
    .join("");
}

async function approveItem(id, variantIndex) {
  const res = await fetch(`/api/queue/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variantIndex }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

async function rejectItem(id) {
  const res = await fetch(`/api/queue/${encodeURIComponent(id)}/reject`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

async function load() {
  try {
    setStatus("Loading…");
    const items = await fetchQueue();
    renderQueue(items);
    setStatus(`${items.length} pending item(s).`);
  } catch (err) {
    setStatus(`Error: ${err.message}`, true);
  }
}

document.addEventListener("click", async (e) => {
  const approveBtn = e.target.closest(".btn-approve");
  if (approveBtn) {
    const id = approveBtn.dataset.id;
    const index = Number(approveBtn.dataset.index);
    setStatus("Approving…");
    try {
      await approveItem(id, index);
      await load();
    } catch (err) {
      setStatus(`Error: ${err.message}`, true);
    }
    return;
  }

  const rejectBtn = e.target.closest(".btn-reject");
  if (rejectBtn) {
    const id = rejectBtn.dataset.id;
    setStatus("Rejecting…");
    try {
      await rejectItem(id);
      await load();
    } catch (err) {
      setStatus(`Error: ${err.message}`, true);
    }
  }
});

document.getElementById("btn-refresh").addEventListener("click", load);

load();
