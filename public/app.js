const state = {
  champions: [],
  allies: [],
  enemies: [],
  loading: false,
  lastResults: [],
  lastMeta: null,
};

const limits = {
  allies: 4,
  enemies: 5,
};

const pickers = {
  allies: {
    input: document.getElementById("allies-input"),
    suggestions: document.getElementById("allies-suggestions"),
    selected: document.getElementById("allies-selected"),
    count: document.getElementById("allies-count"),
  },
  enemies: {
    input: document.getElementById("enemies-input"),
    suggestions: document.getElementById("enemies-suggestions"),
    selected: document.getElementById("enemies-selected"),
    count: document.getElementById("enemies-count"),
  },
};

const fetchButton = document.getElementById("fetch-button");
const statusText = document.getElementById("status-text");
const errorText = document.getElementById("error-text");
const emptyState = document.getElementById("empty-state");
const resultsWrap = document.getElementById("results-table-wrap");
const resultsBody = document.getElementById("results-body");
const resultsMeta = document.getElementById("results-meta");
const partialFailures = document.getElementById("partial-failures");

initialize().catch((error) => {
  setError(error.message || "Failed to initialize champion metadata.");
});

async function initialize() {
  const response = await fetch("/champions.json");
  if (!response.ok) {
    throw new Error("Failed to load champion metadata.");
  }

  state.champions = await response.json();
  state.champions.forEach((champion) => {
    champion.searchText = normalizeText(`${champion.name} ${champion.id}`);
  });

  wirePicker("allies");
  wirePicker("enemies");

  fetchButton.addEventListener("click", handleFetchSuggestions);
  document.addEventListener("click", handleOutsideClick);

  renderAll();
}

function wirePicker(side) {
  const picker = pickers[side];

  picker.input.addEventListener("input", () => renderSuggestions(side));
  picker.input.addEventListener("focus", () => renderSuggestions(side));
  picker.input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    const suggestions = getSuggestions(side, picker.input.value);
    if (suggestions.length > 0) {
      addChampion(side, suggestions[0].id);
    }
  });
}

function handleOutsideClick(event) {
  for (const side of Object.keys(pickers)) {
    const picker = pickers[side];
    if (
      picker.input.contains(event.target) ||
      picker.suggestions.contains(event.target) ||
      picker.selected.contains(event.target)
    ) {
      continue;
    }

    picker.suggestions.innerHTML = "";
  }
}

function renderAll() {
  renderPicker("allies");
  renderPicker("enemies");
  renderResults();
}

function renderPicker(side) {
  const picker = pickers[side];
  const selectedChampions = state[side];
  const max = limits[side];

  picker.count.textContent = `${selectedChampions.length} / ${max}`;
  picker.input.disabled = state.loading || selectedChampions.length >= max;
  picker.input.placeholder =
    selectedChampions.length >= max
      ? `Maximum ${max} champions selected`
      : side === "allies"
        ? "Search ally champions"
        : "Search enemy champions";

  picker.selected.innerHTML = "";

  for (const champion of selectedChampions) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "champion-chip";
    chip.dataset.side = side;
    chip.dataset.id = champion.id;
    chip.innerHTML = `
      <img src="${champion.icon}" alt="${champion.name}" width="28" height="28" />
      <span>${champion.name}</span>
      <span class="chip-close" aria-hidden="true">×</span>
    `;
    chip.addEventListener("click", () => removeChampion(side, champion.id));
    picker.selected.appendChild(chip);
  }

  renderSuggestions(side);
}

function renderSuggestions(side) {
  const picker = pickers[side];
  const query = picker.input.value.trim();

  if (!query || state.loading || state[side].length >= limits[side]) {
    picker.suggestions.innerHTML = "";
    return;
  }

  const suggestions = getSuggestions(side, query);
  if (suggestions.length === 0) {
    picker.suggestions.innerHTML = '<div class="suggestion-empty">No champion matches.</div>';
    return;
  }

  picker.suggestions.innerHTML = "";

  for (const champion of suggestions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-item";
    button.innerHTML = `
      <img src="${champion.icon}" alt="${champion.name}" width="36" height="36" />
      <span>${champion.name}</span>
    `;
    button.addEventListener("click", () => addChampion(side, champion.id));
    picker.suggestions.appendChild(button);
  }
}

function getSuggestions(side, query) {
  const search = normalizeText(query);
  const selectedIds = new Set([
    ...state.allies.map((champion) => champion.id),
    ...state.enemies.map((champion) => champion.id),
  ]);

  return state.champions
    .filter((champion) => !selectedIds.has(champion.id))
    .map((champion) => ({
      champion,
      score: scoreChampionMatch(champion, search),
    }))
    .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
    .sort((left, right) => right.score - left.score || left.champion.name.localeCompare(right.champion.name))
    .slice(0, 8)
    .map((entry) => entry.champion);
}

function scoreChampionMatch(champion, query) {
  const searchText = champion.searchText;
  if (searchText.startsWith(query)) {
    return 1000 - champion.name.length;
  }

  if (searchText.includes(query)) {
    return 500 - searchText.indexOf(query);
  }

  return Number.NEGATIVE_INFINITY;
}

function addChampion(side, championId) {
  if (state[side].length >= limits[side]) {
    return;
  }

  const champion = state.champions.find((entry) => entry.id === championId);
  if (!champion) {
    return;
  }

  const alreadySelected =
    state.allies.some((entry) => entry.id === championId) ||
    state.enemies.some((entry) => entry.id === championId);

  if (alreadySelected) {
    return;
  }

  state[side].push(champion);
  pickers[side].input.value = "";
  clearStatus();
  renderAll();
}

function removeChampion(side, championId) {
  state[side] = state[side].filter((champion) => champion.id !== championId);
  renderAll();
}

async function handleFetchSuggestions() {
  if (state.loading) {
    return;
  }

  if (state.allies.length === 0 && state.enemies.length === 0) {
    setError("Choose at least one allied or enemy champion before fetching suggestions.");
    return;
  }

  setLoading(true);
  clearStatus();
  setStatus("Fetching live Lolalytics data...");

  try {
    const response = await fetch("/suggest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        allies: state.allies.map((champion) => champion.name),
        enemies: state.enemies.map((champion) => champion.name),
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to fetch support suggestions.");
    }

    state.lastResults = payload.results || [];
    state.lastMeta = payload.meta || null;
    setStatus(`Fetched ${state.lastResults.length} support suggestions.`);
  } catch (error) {
    state.lastResults = [];
    state.lastMeta = null;
    setError(error.message || "Failed to fetch support suggestions.");
  } finally {
    setLoading(false);
    renderResults();
  }
}

function renderResults() {
  resultsBody.innerHTML = "";
  partialFailures.innerHTML = "";

  if (!state.lastResults.length) {
    emptyState.classList.remove("hidden");
    resultsWrap.classList.add("hidden");
    resultsMeta.textContent = "";
    return;
  }

  emptyState.classList.add("hidden");
  resultsWrap.classList.remove("hidden");
  resultsMeta.textContent = `${state.lastResults.length} ranked support options`;

  state.lastResults.forEach((result, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="rank-cell">${index + 1}</td>
      <td>
        <div class="support-cell">
          <img src="${result.icon}" alt="${result.support}" width="36" height="36" />
          <span>${result.support}</span>
        </div>
      </td>
      <td>${formatScore(result.synergyScore)}</td>
      <td>${formatScore(result.counterScore)}</td>
      <td class="final-score">${formatScore(result.finalScore)}</td>
    `;
    resultsBody.appendChild(row);
  });

  const failures = state.lastMeta?.partialFailures || [];
  if (failures.length > 0) {
    const title = document.createElement("p");
    title.className = "partial-failures-title";
    title.textContent = "Partial scrape failures";
    partialFailures.appendChild(title);

    failures.forEach((message) => {
      const item = document.createElement("p");
      item.className = "partial-failure-item";
      item.textContent = message;
      partialFailures.appendChild(item);
    });
  }
}

function formatScore(value) {
  return Number(value || 0).toFixed(2);
}

function normalizeText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function setLoading(loading) {
  state.loading = loading;
  fetchButton.disabled = loading;
  fetchButton.textContent = loading ? "Fetching..." : "Fetch Suggestions";
  renderPicker("allies");
  renderPicker("enemies");
}

function setStatus(message) {
  statusText.textContent = message;
}

function setError(message) {
  errorText.textContent = message;
  statusText.textContent = "";
}

function clearStatus() {
  errorText.textContent = "";
  statusText.textContent = "";
}
