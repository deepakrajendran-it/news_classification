const CATEGORY_ORDER = [
  "automobile",
  "entertainment",
  "politics",
  "science",
  "sports",
  "technology",
  "world",
];

const state = {
  view: "classify",
  filter: "all",
  items: [],
  counts: {},
};

const els = {
  navButtons: document.querySelectorAll(".nav-btn"),
  views: {
    classify: document.getElementById("view-classify"),
    inbox: document.getElementById("view-inbox"),
  },
  headline: document.getElementById("headline"),
  article: document.getElementById("article"),
  classifyBtn: document.getElementById("classify-btn"),
  clearBtn: document.getElementById("clear-btn"),
  formError: document.getElementById("form-error"),
  emptyState: document.getElementById("empty-state"),
  result: document.getElementById("result"),
  statusChip: document.getElementById("status-chip"),
  winnerName: document.getElementById("winner-name"),
  winnerMeta: document.getElementById("winner-meta"),
  reviewFlag: document.getElementById("review-flag"),
  scoreList: document.getElementById("score-list"),
  tabs: document.getElementById("tabs"),
  feed: document.getElementById("feed"),
  inboxCount: document.getElementById("inbox-count"),
  refreshBtn: document.getElementById("refresh-btn"),
};

function titleCase(value) {
  return String(value || "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatPct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function excerpt(text, limit = 220) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit).trim()}…`;
}

function showError(message) {
  els.formError.hidden = !message;
  els.formError.textContent = message || "";
}

function setView(view) {
  state.view = view;
  els.navButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === view);
  });
  Object.entries(els.views).forEach(([name, node]) => {
    node.classList.toggle("is-visible", name === view);
  });
  if (view === "inbox") loadInbox();
}

function renderScores(scores, winner) {
  const ordered = CATEGORY_ORDER.filter((name) => name in scores);
  els.scoreList.innerHTML = ordered
    .map((name) => {
      const value = scores[name] || 0;
      const active = name === winner ? " is-top" : "";
      return `
        <li class="score-row${active}">
          <span>${titleCase(name)}</span>
          <div class="bar"><i class="bar-${name}" style="width:${value * 100}%"></i></div>
          <span class="pct">${formatPct(value)}</span>
        </li>`;
    })
    .join("");
}

function renderResult(payload) {
  els.emptyState.hidden = true;
  els.result.hidden = false;
  els.winnerName.textContent = titleCase(payload.category);
  els.winnerMeta.textContent = `Confidence ${formatPct(payload.confidence)} · filed to the ${payload.category} feed`;
  els.reviewFlag.hidden = !payload.low_confidence;
  els.statusChip.textContent = payload.low_confidence ? "Needs review" : "Routed";
  els.statusChip.className = `chip ${payload.low_confidence ? "warn" : "ok"}`;
  renderScores(payload.scores, payload.category);
}

function storyHeadline(item) {
  if (item.headline) return item.headline;
  const first = String(item.text || "").split(/[.!?]/)[0];
  return first.trim() || "Untitled story";
}

function renderTabs() {
  const total = state.items.length;
  const tabs = ["all", ...CATEGORY_ORDER];
  els.tabs.innerHTML = tabs
    .map((name) => {
      const count = name === "all" ? total : state.counts[name] || 0;
      const active = state.filter === name ? " is-active" : "";
      const label = name === "all" ? "All sections" : titleCase(name);
      return `<button class="tab${active}" data-filter="${name}" type="button">${label} (${count})</button>`;
    })
    .join("");
}

function renderFeed() {
  const items =
    state.filter === "all"
      ? state.items
      : state.items.filter((item) => item.category === state.filter);

  els.inboxCount.textContent =
    items.length === 1 ? "1 story in this view" : `${items.length} stories in this view`;

  if (!items.length) {
    els.feed.innerHTML = `<div class="empty"><p>No stories in this section yet.</p></div>`;
    return;
  }

  els.feed.innerHTML = items
    .map((item) => {
      const when = item.timestamp ? new Date(item.timestamp).toLocaleString() : "Unknown time";
      const conf =
        item.confidence == null ? "confidence n/a" : `confidence ${formatPct(item.confidence)}`;
      return `
        <article class="story">
          <div class="rail cat-${item.category}"></div>
          <div>
            <h3>${escapeHtml(storyHeadline(item))}</h3>
            <p class="meta">${escapeHtml(when)} · ${escapeHtml(conf)}</p>
            <p class="excerpt">${escapeHtml(excerpt(item.text))}</p>
          </div>
          <span class="cat cat-${item.category}">${escapeHtml(titleCase(item.category))}</span>
        </article>`;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function classify() {
  const text = els.article.value.trim();
  const headline = els.headline.value.trim();
  if (!text) {
    showError("Paste a news article before classifying.");
    return;
  }

  showError("");
  els.classifyBtn.disabled = true;
  els.classifyBtn.textContent = "Scoring…";
  els.statusChip.textContent = "Running model";
  els.statusChip.className = "chip muted";

  try {
    const response = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, headline }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "Classification failed");
    }
    renderResult(payload);
  } catch (error) {
    showError(error.message || "Could not reach the classification API.");
  } finally {
    els.classifyBtn.disabled = false;
    els.classifyBtn.textContent = "Classify & route";
  }
}

async function loadInbox() {
  els.inboxCount.textContent = "Loading stories…";
  try {
    const [feedsRes, catsRes] = await Promise.all([
      fetch("/api/feeds"),
      fetch("/api/categories"),
    ]);
    const feeds = await feedsRes.json();
    const cats = await catsRes.json();
    state.items = feeds.items || [];
    state.counts = cats.counts || {};
    renderTabs();
    renderFeed();
  } catch (error) {
    els.inboxCount.textContent = "Could not load feeds.";
    els.feed.innerHTML = `<div class="empty"><p>${escapeHtml(error.message)}</p></div>`;
  }
}

els.navButtons.forEach((btn) => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

els.classifyBtn.addEventListener("click", classify);
els.clearBtn.addEventListener("click", () => {
  els.headline.value = "";
  els.article.value = "";
  showError("");
  els.result.hidden = true;
  els.emptyState.hidden = false;
  els.statusChip.textContent = "Waiting for copy";
  els.statusChip.className = "chip muted";
});

els.refreshBtn.addEventListener("click", loadInbox);
els.tabs.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-filter]");
  if (!btn) return;
  state.filter = btn.dataset.filter;
  renderTabs();
  renderFeed();
});
