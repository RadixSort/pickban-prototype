const state = {
  champions: [],
  allies: [],
  enemies: [],
  loading: false,
  shuttingDown: false,
  canShutdown: false,
  shutdownToken: "",
  lastResults: [],
  lastMeta: null,
};

const limits = {
  allies: 4,
  enemies: 5,
};

const allyLaneOptions = [
  { value: "top", label: "Top" },
  { value: "jungle", label: "Jungle" },
  { value: "middle", label: "Mid" },
  { value: "bottom", label: "Bot" },
];

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
const closeButton = document.getElementById("close-button");
const closeHelp = document.getElementById("close-help");
const allyRolePanel = document.getElementById("ally-role-panel");
const allyRoleList = document.getElementById("ally-role-list");
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
  await loadAppConfig();

  wirePicker("allies");
  wirePicker("enemies");

  fetchButton.addEventListener("click", handleFetchSuggestions);
  closeButton.addEventListener("click", handleCloseApp);
  document.addEventListener("click", handleOutsideClick);

  renderAll();
}

async function loadAppConfig() {
  try {
    const response = await fetch("/app-config", {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const config = await response.json();
    state.canShutdown = Boolean(config.canShutdown);
    state.shutdownToken = typeof config.shutdownToken === "string" ? config.shutdownToken : "";
  } catch (_error) {
    state.canShutdown = false;
    state.shutdownToken = "";
  }
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
  renderAllyLaneAssignments();
  renderResults();
  renderActionState();
}

function renderPicker(side) {
  const picker = pickers[side];
  const selectedChampions = state[side];
  const max = limits[side];
  const busy = isInteractionLocked();

  picker.count.textContent = `${selectedChampions.length} / ${max}`;
  picker.input.disabled = busy || selectedChampions.length >= max;
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

function renderAllyLaneAssignments() {
  allyRoleList.innerHTML = "";

  if (state.allies.length === 0) {
    allyRolePanel.classList.add("hidden");
    return;
  }

  allyRolePanel.classList.remove("hidden");

  for (const ally of state.allies) {
    const row = document.createElement("div");
    row.className = "role-row";

    const main = document.createElement("div");
    main.className = "role-row-main";
    main.innerHTML = `
      <img src="${ally.icon}" alt="${ally.name}" width="36" height="36" />
      <span class="role-row-name">${ally.name}</span>
    `;

    const select = document.createElement("select");
    select.className = "lane-select";
    select.disabled = isInteractionLocked();
    select.setAttribute("aria-label", `Assign lane for ${ally.name}`);
    select.innerHTML = buildLaneOptionsMarkup(ally.id);
    select.value = ally.lane || "";
    select.addEventListener("change", (event) => assignAllyLane(ally.id, event.target.value));

    row.appendChild(main);
    row.appendChild(select);
    allyRoleList.appendChild(row);
  }
}

function renderSuggestions(side) {
  const picker = pickers[side];
  const query = picker.input.value.trim();

  if (!query || isInteractionLocked() || state[side].length >= limits[side]) {
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
  if (isInteractionLocked() || state[side].length >= limits[side]) {
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

  state[side].push(createSelectedChampion(champion, side));
  pickers[side].input.value = "";
  clearStatus();
  renderAll();
}

function createSelectedChampion(champion, side) {
  const selected = {
    id: champion.id,
    key: champion.key,
    name: champion.name,
    icon: champion.icon,
  };

  if (side === "allies") {
    selected.lane = "";
  }

  return selected;
}

function removeChampion(side, championId) {
  if (isInteractionLocked()) {
    return;
  }

  state[side] = state[side].filter((champion) => champion.id !== championId);
  renderAll();
}

function buildLaneOptionsMarkup(championId) {
  const takenLanes = new Set(
    state.allies
      .filter((ally) => ally.id !== championId && ally.lane)
      .map((ally) => ally.lane),
  );

  const options = ['<option value="">Unassigned</option>'];
  for (const option of allyLaneOptions) {
    const disabled = takenLanes.has(option.value) ? " disabled" : "";
    options.push(
      `<option value="${option.value}"${disabled}>${option.label}</option>`,
    );
  }

  return options.join("");
}

function assignAllyLane(championId, lane) {
  if (isInteractionLocked()) {
    return;
  }

  if (
    lane &&
    state.allies.some((ally) => ally.id !== championId && ally.lane === lane)
  ) {
    return;
  }

  state.allies = state.allies.map((ally) =>
    ally.id === championId
      ? {
          ...ally,
          lane,
        }
      : ally,
  );

  clearStatus();
  renderAll();
}

async function handleFetchSuggestions() {
  if (isInteractionLocked()) {
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
        allies: state.allies.map((champion) => {
          const selection = {
            champion: champion.name,
          };

          if (champion.lane) {
            selection.lane = champion.lane;
          }

          return selection;
        }),
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

async function handleCloseApp() {
  if (isInteractionLocked()) {
    return;
  }

  if (!state.canShutdown || !state.shutdownToken) {
    setError("Close App is unavailable. Stop the server from the terminal with Ctrl+C.");
    return;
  }

  const confirmed = window.confirm(
    "Stop the local PickBan app now? Anyone using it on this computer will be disconnected.",
  );

  if (!confirmed) {
    return;
  }

  state.shuttingDown = true;
  clearStatus();
  setStatus("Stopping the local server...");
  renderAll();

  try {
    const response = await fetch("/shutdown", {
      method: "POST",
      headers: {
        "x-shutdown-token": state.shutdownToken,
      },
    });

    const payload = await parseJsonSafely(response);
    if (!response.ok) {
      throw new Error(payload.error || "Failed to stop the app.");
    }

    setStatus(payload.message || "PickBan is closing. You can close this browser tab.");
  } catch (error) {
    state.shuttingDown = false;
    setError(error.message || "Failed to stop the app.");
  } finally {
    renderAll();
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
  renderPicker("allies");
  renderPicker("enemies");
  renderAllyLaneAssignments();
  renderActionState();
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

function renderActionState() {
  fetchButton.disabled = state.loading || state.shuttingDown;
  fetchButton.textContent = state.loading ? "Fetching..." : "Fetch Suggestions";

  closeButton.hidden = !state.canShutdown;
  closeHelp.classList.toggle("hidden", !state.canShutdown);
  closeButton.disabled = state.loading || state.shuttingDown || !state.shutdownToken;
  closeButton.textContent = state.shuttingDown ? "Closing..." : "Close App";
}

function isInteractionLocked() {
  return state.loading || state.shuttingDown;
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch (_error) {
    return {};
  }
}
