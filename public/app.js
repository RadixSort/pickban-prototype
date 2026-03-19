const {
  buildSuggestionCacheKey,
} = globalThis.suggestionCache;
const {
  buildSelectedChampionKeys,
  getVisibleSuggestionResults,
  MIN_PROJECTED_WIN_RATE,
} = globalThis.suggestionFilters;
const {
  DEFAULT_RANK_FILTER,
  getRankFilterLabel,
  getRankFilterOptions,
  normalizeRankFilter,
} = globalThis.rankFilters;
const {
  DEFAULT_TOP_RESULT_LIMIT,
  DEFAULT_SORT_MODE,
  PROJECTED_WIN_RATE_SORT_MODE,
  getProjectedAgency,
  getProjectedWinRate,
  getResultKey,
  getResultName,
  getTopResultKeys,
  sortResults,
} = globalThis.resultRanking;
const {
  DEFAULT_TARGET_ROLE,
  getRoleLabel,
  getTargetRoleOptions,
  getUnassignedTargetRoleOptions,
  normalizeRole,
} = globalThis.roles;

const state = {
  champions: [],
  allies: [],
  enemies: [],
  loading: false,
  shuttingDown: false,
  canShutdown: false,
  shutdownToken: "",
  version: "2.1.0",
  resultsCache: {},
  selectedResultRole: DEFAULT_TARGET_ROLE,
  sortMode: DEFAULT_SORT_MODE,
  rankFilter: DEFAULT_RANK_FILTER,
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

const rankFilterSelect = document.getElementById("rank-filter");
const fetchButton = document.getElementById("fetch-button");
const resetButton = document.getElementById("reset-button");
const closeButton = document.getElementById("close-button");
const allyRolePanel = document.getElementById("ally-role-panel");
const allyRoleList = document.getElementById("ally-role-list");
const allyRoleTitle = document.getElementById("ally-role-title");
const allyRoleCopy = document.getElementById("ally-role-copy");
const statusText = document.getElementById("status-text");
const errorText = document.getElementById("error-text");
const emptyState = document.getElementById("empty-state");
const resultsWrap = document.getElementById("results-table-wrap");
const resultsBody = document.getElementById("results-body");
const resultsMeta = document.getElementById("results-meta");
const resultsTitle = document.getElementById("results-title");
const resultsRoleSelect = document.getElementById("results-role");
const resultsRequestStat = document.getElementById("results-request-stat");
const partialFailures = document.getElementById("partial-failures");
const sortSelect = document.getElementById("results-sort");
const versionText = document.getElementById("app-version");

initialize().catch((error) => {
  setError(error.message || "Failed to initialize champion metadata.");
});

async function initialize() {
  const response = await fetch("/champions.json", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load champion metadata.");
  }

  state.champions = await response.json();
  state.champions.forEach((champion) => {
    champion.searchText = normalizeText(`${champion.name} ${champion.id}`);
  });
  await loadAppConfig();
  initializeRankFilterOptions();

  wirePicker("allies");
  wirePicker("enemies");

  rankFilterSelect.addEventListener("change", handleRankFilterChange);
  resultsRoleSelect.addEventListener("change", handleResultsRoleChange);
  fetchButton.addEventListener("click", handleFetchSuggestions);
  resetButton.addEventListener("click", handleResetDraft);
  closeButton.addEventListener("click", handleCloseApp);
  sortSelect.addEventListener("change", handleSortModeChange);
  document.addEventListener("click", handleOutsideClick);

  clearStatus();
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
    state.version = typeof config.version === "string" ? config.version : state.version;
    state.canShutdown = Boolean(config.canShutdown);
    state.shutdownToken = typeof config.shutdownToken === "string" ? config.shutdownToken : "";
  } catch (_error) {
    state.canShutdown = false;
    state.shutdownToken = "";
  }

  renderVersion();
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

function getSelectedChampionKeys() {
  return buildSelectedChampionKeys(state.allies, state.enemies);
}

function getCurrentSuggestionCacheKey() {
  return buildSuggestionCacheKey(state.rankFilter, state.allies, state.enemies);
}

function getCurrentResultsBundle() {
  return state.resultsCache[getCurrentSuggestionCacheKey()] || null;
}

function getAvailableResultRoleOptions() {
  return getUnassignedTargetRoleOptions(state.allies);
}

function getSelectedResultRole() {
  const availableRoleValues = getAvailableResultRoleOptions().map((option) => option.value);
  if (availableRoleValues.length === 0) {
    return DEFAULT_TARGET_ROLE;
  }

  const currentBundle = getCurrentResultsBundle();
  const candidates = [currentBundle?.selectedRole, state.selectedResultRole, DEFAULT_TARGET_ROLE];

  for (const candidate of candidates) {
    if (candidate && availableRoleValues.includes(candidate)) {
      return candidate;
    }
  }

  return availableRoleValues[0];
}

function syncSelectedResultRole() {
  const selectedRole = getSelectedResultRole();
  state.selectedResultRole = selectedRole;
  const currentBundle = getCurrentResultsBundle();
  if (currentBundle) {
    currentBundle.selectedRole = selectedRole;
  }

  return selectedRole;
}

function getRankFilterDisplayLabel() {
  return getRankFilterLabel(state.rankFilter);
}

function initializeRankFilterOptions() {
  rankFilterSelect.innerHTML = getRankFilterOptions()
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
}

function renderControls() {
  const selectedRole = syncSelectedResultRole();
  const rankFilterLabel = getRankFilterDisplayLabel();
  const availableRoleOptions = getAvailableResultRoleOptions();
  const availableRoleLabels = availableRoleOptions.map((option) => option.label);

  rankFilterSelect.value = state.rankFilter;
  rankFilterSelect.disabled = isInteractionLocked();
  resultsRoleSelect.innerHTML = availableRoleOptions
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  resultsRoleSelect.value = selectedRole;
  resultsRoleSelect.disabled = isInteractionLocked() || availableRoleOptions.length === 0;

  allyRoleTitle.textContent = "Assign known roles";
  allyRoleCopy.textContent =
    availableRoleLabels.length > 0
      ? `Rank filter: ${rankFilterLabel}. Unassigned result roles: ${availableRoleLabels.join(", ")}. Assign allies to lock lanes, or leave them unassigned to fetch every remaining role.`
      : `Rank filter: ${rankFilterLabel}.`;
  resultsTitle.textContent = `${getRoleLabel(selectedRole)} recommendations`;
}

function renderAll() {
  renderControls();
  renderPicker("allies");
  renderPicker("enemies");
  renderAllyRoleAssignments();
  renderResults();
  renderActionState();
  renderVersion();
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

function renderAllyRoleAssignments() {
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
    select.setAttribute("aria-label", `Assign role for ${ally.name}`);
    select.innerHTML = buildRoleOptionsMarkup(ally.id);
    select.value = ally.role || "";
    select.addEventListener("change", (event) => assignAllyRole(ally.id, event.target.value));

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
    selected.role = "";
  }

  return selected;
}

function removeChampion(side, championId) {
  if (isInteractionLocked()) {
    return;
  }

  state[side] = state[side].filter((champion) => champion.id !== championId);
  clearStatus();
  renderAll();
}

function buildRoleOptionsMarkup(championId) {
  const takenRoles = new Set(
    state.allies
      .filter((ally) => ally.id !== championId && ally.role)
      .map((ally) => ally.role),
  );

  const options = ['<option value="">Unassigned</option>'];
  for (const option of getTargetRoleOptions()) {
    if (takenRoles.has(option.value)) {
      continue;
    }

    options.push(`<option value="${option.value}">${option.label}</option>`);
  }

  return options.join("");
}

function assignAllyRole(championId, role) {
  if (isInteractionLocked()) {
    return;
  }

  if (
    role &&
    state.allies.some((ally) => ally.id !== championId && ally.role === role)
  ) {
    return;
  }

  state.allies = state.allies.map((ally) =>
    ally.id === championId
      ? {
          ...ally,
          role,
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

  const cacheKey = getCurrentSuggestionCacheKey();
  const availableRoleOptions = getAvailableResultRoleOptions();
  const availableRoleValues = availableRoleOptions.map((option) => option.value);

  setLoading(true);
  clearStatus();
  setStatus(
    `Fetching live Lolalytics ${getRankFilterDisplayLabel().toLowerCase()} data for ${formatRoleLabels(availableRoleOptions)}...`,
  );

  try {
    const response = await fetch("/suggest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        rankFilter: state.rankFilter,
        allies: state.allies.map((champion) => {
          const selection = {
            champion: champion.name,
          };

          if (champion.role) {
            selection.role = champion.role;
          }

          return selection;
        }),
        enemies: state.enemies.map((champion) => champion.name),
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(
        payload.error ||
          `Failed to fetch ${getRankFilterDisplayLabel().toLowerCase()} role suggestions.`,
      );
    }

    const selectedRole = syncSelectedResultRole();
    state.resultsCache[cacheKey] = buildResultsBundle(payload, availableRoleValues, selectedRole);
    const currentBundle = state.resultsCache[cacheKey];
    const successfulRoleCount = availableRoleValues.filter(
      (role) => !currentBundle.metaByRole[role]?.error,
    ).length;
    const failedRoleLabels = availableRoleValues
      .filter((role) => currentBundle.metaByRole[role]?.error)
      .map((role) => getRoleLabel(role));
    const lolalyticsAccessCount = getLolalyticsLiveAccessCount(currentBundle);
    const lolalyticsAccessStatus = formatLolalyticsAccessStatus(lolalyticsAccessCount);

    setStatus(
      successfulRoleCount === availableRoleValues.length
        ? `Fetched ${successfulRoleCount} ${successfulRoleCount === 1 ? "role result set" : "role result sets"} for the current draft. ${lolalyticsAccessStatus}`
        : `Fetched ${successfulRoleCount} of ${availableRoleValues.length} role result sets. Unavailable: ${failedRoleLabels.join(", ")}. ${lolalyticsAccessStatus}`,
    );
  } catch (error) {
    setError(
      error.message ||
        `Failed to fetch ${getRankFilterDisplayLabel().toLowerCase()} role suggestions.`,
    );
  } finally {
    setLoading(false);
    renderAll();
  }
}

function handleResetDraft() {
  if (isInteractionLocked()) {
    return;
  }

  state.allies = [];
  state.enemies = [];
  state.selectedResultRole = DEFAULT_TARGET_ROLE;
  pickers.allies.input.value = "";
  pickers.enemies.input.value = "";
  clearStatus();
  renderAll();
}

function handleSortModeChange(event) {
  state.sortMode = normalizeSortMode(event.target.value);
  renderResults();
}

function handleRankFilterChange(event) {
  const normalizedRankFilter = normalizeRankFilter(event.target.value) || DEFAULT_RANK_FILTER;
  if (normalizedRankFilter === state.rankFilter) {
    return;
  }

  state.rankFilter = normalizedRankFilter;
  clearStatus();
  renderAll();
}

function handleResultsRoleChange(event) {
  const normalizedRole = normalizeRole(event.target.value) || DEFAULT_TARGET_ROLE;
  if (normalizedRole === state.selectedResultRole) {
    return;
  }

  state.selectedResultRole = normalizedRole;
  const currentBundle = getCurrentResultsBundle();
  if (currentBundle) {
    currentBundle.selectedRole = normalizedRole;
  }

  renderControls();
  renderResults();
  renderActionState();
}

async function handleCloseApp() {
  if (isInteractionLocked()) {
    return;
  }

  if (!state.canShutdown || !state.shutdownToken) {
    setError("The top-right close button is unavailable. Stop the server from the terminal with Ctrl+C.");
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
  const selectedRole = syncSelectedResultRole();
  const currentBundle = getCurrentResultsBundle();
  const currentMeta = currentBundle?.metaByRole?.[selectedRole] || null;
  const currentResults = currentBundle?.resultsByRole?.[selectedRole] || [];
  const visibleResults = sortResults(getVisibleResults(currentResults), state.sortMode);
  const topProjectedWinRateKeys = getTopResultKeys(
    visibleResults,
    PROJECTED_WIN_RATE_SORT_MODE,
    DEFAULT_TOP_RESULT_LIMIT,
  );
  const topProjectedAgencyKeys = getTopResultKeys(
    visibleResults,
    DEFAULT_SORT_MODE,
    DEFAULT_TOP_RESULT_LIMIT,
  );

  resultsBody.innerHTML = "";
  partialFailures.innerHTML = "";
  resultsRequestStat.textContent = "";
  resultsRequestStat.classList.add("hidden");
  sortSelect.value = state.sortMode;
  sortSelect.disabled =
    state.loading ||
    state.shuttingDown ||
    currentResults.length === 0 ||
    Boolean(currentMeta?.error);

  if (!currentBundle) {
    emptyState.textContent = getPendingResultsMessage();
    emptyState.classList.remove("hidden");
    resultsWrap.classList.add("hidden");
    resultsMeta.textContent = "";
    return;
  }

  resultsRequestStat.textContent = formatLolalyticsAccessStat(getLolalyticsLiveAccessCount(currentBundle));
  resultsRequestStat.classList.remove("hidden");

  if (currentMeta?.error) {
    emptyState.textContent = currentMeta.error;
    emptyState.classList.remove("hidden");
    resultsWrap.classList.add("hidden");
    resultsMeta.textContent = `${getRoleLabel(selectedRole)} unavailable`;
    renderPartialFailures(currentMeta.partialFailures || []);
    return;
  }

  if (!visibleResults.length) {
    emptyState.textContent = `No ${getRoleLabel(selectedRole).toLowerCase()} recommendations are available for the current draft.`;
    emptyState.classList.remove("hidden");
    resultsWrap.classList.add("hidden");
    resultsMeta.textContent = "";
    renderPartialFailures(currentMeta?.partialFailures || []);
    return;
  }

  emptyState.classList.add("hidden");
  resultsWrap.classList.remove("hidden");
  resultsMeta.textContent = `${visibleResults.length} ranked ${getRoleLabel(selectedRole).toLowerCase()} options`;

  visibleResults.forEach((result, index) => {
    const resultKey = getResultKey(result) || "";
    const resultName = getResultName(result);
    const liveWinRate = Number(result.winRate);
    const projectedWinRate = getProjectedWinRate(result);
    const isTopProjectedWinRate = topProjectedWinRateKeys.has(resultKey);
    const isTopProjectedAgency = topProjectedAgencyKeys.has(resultKey);
    const topOptionTone = getTopOptionTone(isTopProjectedAgency, isTopProjectedWinRate);
    const hasLowProjectedWinRate = isLowWinRate(projectedWinRate);
    const rowClassNames = [];

    if (topOptionTone) {
      rowClassNames.push("top-option", `top-option--${topOptionTone}`);
    }

    if (hasLowProjectedWinRate) {
      rowClassNames.push("low-winrate-option");
    }

    const row = document.createElement("tr");
    row.className = rowClassNames.join(" ");
    const projectedWinRateClassName = getMetricClassName(
      [],
      hasLowProjectedWinRate || isTopProjectedWinRate,
      hasLowProjectedWinRate ? "danger" : topOptionTone === "overlap" ? "overlap" : "winrate",
    );
    const projectedAgencyClassName = getMetricClassName(
      ["final-score"],
      isTopProjectedAgency,
      topOptionTone === "overlap" ? "overlap" : "agency",
    );
    const overlapBadgeMarkup = getOverlapBadgeMarkup(topOptionTone);
    row.innerHTML = `
      <td class="rank-cell">${index + 1}</td>
      <td>
        <div class="support-cell">
          <img src="${result.icon}" alt="${resultName}" width="36" height="36" />
          <span class="support-name">
            <span>${resultName}</span>
            ${overlapBadgeMarkup}
          </span>
        </div>
      </td>
      <td>${formatRate(liveWinRate)}</td>
      <td class="${projectedWinRateClassName}">${formatRate(projectedWinRate)}</td>
      <td>${formatScore(result.synergyScore)}</td>
      <td>${formatScore(result.counterScore)}</td>
      <td class="${projectedAgencyClassName}">${formatScore(getProjectedAgency(result))}</td>
    `;
    resultsBody.appendChild(row);
  });

  renderPartialFailures(currentMeta?.partialFailures || []);
}

function renderPartialFailures(failures = []) {
  if (failures.length === 0) {
    return;
  }

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

function buildResultsBundle(payload, requestedRoles = [], selectedRole = DEFAULT_TARGET_ROLE) {
  const resultsByRole = {};
  const metaByRole = {};
  const payloadRole =
    normalizeRole(payload?.meta?.role ?? null) ||
    (Array.isArray(payload?.roles) && payload.roles.length === 1 ? normalizeRole(payload.roles[0]) : null);

  requestedRoles.forEach((role) => {
    resultsByRole[role] = Array.isArray(payload?.resultsByRole?.[role])
      ? payload.resultsByRole[role]
      : role === payloadRole && Array.isArray(payload?.results)
        ? payload.results
        : [];
    metaByRole[role] =
      payload?.metaByRole?.[role] ||
      (role === payloadRole && payload?.meta ? payload.meta : { role, partialFailures: [] });
  });

  return {
    roles: [...requestedRoles],
    resultsByRole,
    metaByRole,
    requestStats: {
      lolalyticsLiveAccessCount: Number(payload?.requestStats?.lolalyticsLiveAccessCount || 0),
    },
    selectedRole: requestedRoles.includes(selectedRole) ? selectedRole : requestedRoles[0] || DEFAULT_TARGET_ROLE,
  };
}

function getPendingResultsMessage() {
  if (state.allies.length === 0 && state.enemies.length === 0) {
    return "Select some champions, optionally assign known ally roles, then fetch suggestions to load every remaining role.";
  }

  return `Fetch suggestions to load ${formatRoleLabels(getAvailableResultRoleOptions())} for the current draft.`;
}

function formatRoleLabels(roles = []) {
  const labels = roles
    .map((role) =>
      typeof role === "string" ? getRoleLabel(role) : role?.label || getRoleLabel(role?.value),
    )
    .filter(Boolean);

  if (labels.length <= 1) {
    return labels[0] || "the available roles";
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function getLolalyticsLiveAccessCount(resultsBundle = null) {
  return Number(resultsBundle?.requestStats?.lolalyticsLiveAccessCount || 0);
}

function formatLolalyticsAccessStatus(accessCount) {
  if (accessCount === 0) {
    return "No new live Lolalytics hits were needed.";
  }

  return `Lolalytics was contacted ${accessCount} ${accessCount === 1 ? "time" : "times"}.`;
}

function formatLolalyticsAccessStat(accessCount) {
  if (accessCount === 0) {
    return "Nerd stat: Lolalytics live hits for this draft: 0. Served from local cache, so no fresh outbound requests.";
  }

  return `Nerd stat: Lolalytics live hits for this draft: ${accessCount}. This only counts real outbound requests, not cached reuse.`;
}

function formatScore(value) {
  return Number(value || 0).toFixed(2);
}

function getMetricClassName(baseClasses = [], isHighlighted = false, tone = "") {
  const classNames = [...baseClasses];

  if (isHighlighted && tone) {
    classNames.push("metric-highlight", `metric-highlight--${tone}`);
  }

  return classNames.join(" ");
}

function getOverlapBadgeMarkup(topOptionTone) {
  if (topOptionTone !== "overlap") {
    return "";
  }

  const tooltip = "Top 3 in both Projected Agency and Projected Win Rate.";
  return `<span class="top-option-badge" title="${tooltip}" aria-label="${tooltip}">★</span>`;
}

function formatRate(value) {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }

  return `${Number(value).toFixed(2)}%`;
}

function isLowWinRate(value) {
  return Number.isFinite(Number(value)) && Number(value) <= MIN_PROJECTED_WIN_RATE;
}

function formatVersion(version) {
  const normalizedVersion = version.startsWith("v") ? version.slice(1) : version;
  return `v${normalizedVersion.replace(/\.0$/, "")}`;
}

function normalizeSortMode(value) {
  return value === PROJECTED_WIN_RATE_SORT_MODE ? PROJECTED_WIN_RATE_SORT_MODE : DEFAULT_SORT_MODE;
}

function getTopOptionTone(isTopProjectedAgency, isTopProjectedWinRate) {
  if (isTopProjectedAgency && isTopProjectedWinRate) {
    return "overlap";
  }

  if (isTopProjectedAgency) {
    return "agency";
  }

  if (isTopProjectedWinRate) {
    return "winrate";
  }

  return "";
}

function getVisibleResults(results = []) {
  return getVisibleSuggestionResults(results, getSelectedChampionKeys());
}

function normalizeText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function setLoading(loading) {
  state.loading = loading;
  renderControls();
  renderPicker("allies");
  renderPicker("enemies");
  renderAllyRoleAssignments();
  renderActionState();
}

function renderVersion() {
  versionText.textContent = formatVersion(state.version);
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
  rankFilterSelect.disabled = state.loading || state.shuttingDown;
  resultsRoleSelect.disabled =
    state.loading || state.shuttingDown || getAvailableResultRoleOptions().length === 0;
  fetchButton.disabled = state.loading || state.shuttingDown;
  fetchButton.textContent = state.loading ? "Fetching..." : "Fetch Suggestions";

  resetButton.disabled = state.loading || state.shuttingDown;
  closeButton.hidden = !state.canShutdown;
  closeButton.disabled = state.loading || state.shuttingDown || !state.shutdownToken;
  closeButton.setAttribute("aria-label", state.shuttingDown ? "Stopping app" : "Stop app");
  closeButton.setAttribute("title", state.shuttingDown ? "Stopping app" : "Stop app");
  sortSelect.disabled =
    state.loading ||
    state.shuttingDown ||
    (getCurrentResultsBundle()?.resultsByRole?.[getSelectedResultRole()] || []).length === 0 ||
    Boolean(getCurrentResultsBundle()?.metaByRole?.[getSelectedResultRole()]?.error);
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
