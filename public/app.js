const {
  buildSuggestionCacheKey,
} = globalThis.suggestionCache;
const {
  buildBuildSuggestionCacheKey,
} = globalThis.buildSuggestionCache;
const {
  renderDraftProjectionView,
} = globalThis.draftProjectionView;
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
  BUILD_SUGGESTION_TABS,
  DEFAULT_BUILD_SUGGESTION_TAB,
  getRecommendedRunePages,
  getRunePageRecommendationKey,
  normalizeBuildSuggestionTab,
  renderBuildSuggestionBody,
} = globalThis.buildSuggestionView;
const {
  DEFAULT_TOP_RESULT_LIMIT,
  DEFAULT_SORT_MODE,
  PROJECTED_AGENCY_SORT_MODE,
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
  getAutoAssignableAllyRole,
  getRoleLabel,
  getSuggestedAllyRole,
  getTargetRoleOptions,
  getUnassignedTargetRoleOptions,
  normalizeRole,
  resolveAllyRoleAssignment,
} = globalThis.roles;

const state = {
  champions: [],
  allies: [],
  allyRoleLikelihoodsByRank: {},
  allyRoleLikelihoodRequestsByRank: {},
  enemies: [],
  loading: false,
  shuttingDown: false,
  canShutdown: false,
  shutdownToken: "",
  version: "0.6.2",
  resultsCache: {},
  selectedResultRole: DEFAULT_TARGET_ROLE,
  sortMode: DEFAULT_SORT_MODE,
  rankFilter: DEFAULT_RANK_FILTER,
  autoImport: createInitialAutoImportState(),
  buildSuggestionCache: {},
  buildSuggestionModal: createInitialBuildSuggestionModalState(),
  lolalyticsDataWindowDays: 7,
  lolalyticsLifetimeAccessCount: 0,
};

const AUTO_IMPORT_POLL_INTERVAL_MS = 3000;

const limits = {
  allies: 5,
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
const autoImportButton = document.getElementById("auto-import-button");
const autoImportBanner = document.getElementById("auto-import-banner");
const resetButton = document.getElementById("reset-button");
const closeButton = document.getElementById("close-button");
const allyRolePanel = document.getElementById("ally-role-panel");
const allyRoleList = document.getElementById("ally-role-list");
const allyRoleTitle = document.getElementById("ally-role-title");
const errorText = document.getElementById("error-text");
const emptyState = document.getElementById("empty-state");
const resultsWrap = document.getElementById("results-table-wrap");
const resultsBody = document.getElementById("results-body");
const resultsMeta = document.getElementById("results-meta");
const resultsTitle = document.getElementById("results-title");
const resultsRoleSelect = document.getElementById("results-role");
const resultsRoleControl = document.getElementById("results-role-control");
const lolalyticsDataWindow = document.getElementById("lolalytics-data-window");
const resultsRequestStat = document.getElementById("results-request-stat");
const partialFailures = document.getElementById("partial-failures");
const sortSelect = document.getElementById("results-sort");
const sortControl = document.getElementById("results-sort-control");
const draftProjectionWrap = document.getElementById("draft-projection-wrap");
const versionText = document.getElementById("app-version");
const buildSuggestionModal = document.getElementById("build-suggestion-modal");
const buildSuggestionBackdrop = document.getElementById("build-suggestion-backdrop");
const buildSuggestionCloseButton = document.getElementById("build-suggestion-close");
const buildSuggestionChampionIcon = document.getElementById("build-suggestion-champion-icon");
const buildSuggestionTitle = document.getElementById("build-suggestion-title");
const buildSuggestionMeta = document.getElementById("build-suggestion-meta");
const buildSuggestionTabs = document.getElementById("build-suggestion-tabs");
const buildSuggestionErrors = document.getElementById("build-suggestion-errors");
const buildSuggestionBody = document.getElementById("build-suggestion-body");

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
  autoImportButton.addEventListener("click", handleStartAutoImport);
  resetButton.addEventListener("click", handleResetDraft);
  closeButton.addEventListener("click", handleCloseApp);
  sortSelect.addEventListener("change", handleSortModeChange);
  buildSuggestionBackdrop.addEventListener("click", closeBuildSuggestionModal);
  buildSuggestionCloseButton.addEventListener("click", closeBuildSuggestionModal);
  document.addEventListener("click", handleOutsideClick);
  document.addEventListener("keydown", handleGlobalKeydown);

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
    const lolalyticsDataWindowDays = Number(config.lolalyticsDataWindowDays);
    if (Number.isFinite(lolalyticsDataWindowDays) && lolalyticsDataWindowDays > 0) {
      state.lolalyticsDataWindowDays = lolalyticsDataWindowDays;
    }
    state.canShutdown = Boolean(config.canShutdown);
    state.shutdownToken = typeof config.shutdownToken === "string" ? config.shutdownToken : "";
    updateLolalyticsRequestStats(config?.requestStats);
  } catch (_error) {
    state.canShutdown = false;
    state.shutdownToken = "";
  }

  renderVersion();
  renderLolalyticsDataWindow();
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
      picker.selected?.contains(event.target)
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

function getAutoImportSuggestedRole() {
  const assignedRole = normalizeRole(state.autoImport.assignedRole);
  if (!state.autoImport.active || !assignedRole) {
    return null;
  }

  const availableRoleValues = getAvailableResultRoleOptions().map((option) => option.value);
  return availableRoleValues.includes(assignedRole) ? assignedRole : null;
}

function getNoAvailableResultRolesMessage() {
  return "All five allied roles are assigned. Remove one ally or clear a role to fetch more suggestions.";
}

function hasCompleteAssignedAllyDraft() {
  return (
    state.allies.length === limits.allies &&
    state.allies.every((ally) => normalizeRole(ally.role)) &&
    new Set(state.allies.map((ally) => normalizeRole(ally.role))).size === limits.allies
  );
}

function isDraftProjectionModeActive() {
  return hasCompleteAssignedAllyDraft();
}

function getSelectedResultRole() {
  const availableRoleValues = getAvailableResultRoleOptions().map((option) => option.value);
  if (availableRoleValues.length === 0) {
    return DEFAULT_TARGET_ROLE;
  }

  const currentBundle = getCurrentResultsBundle();
  const candidates = [
    getAutoImportSuggestedRole(),
    currentBundle?.selectedRole,
    state.selectedResultRole,
    DEFAULT_TARGET_ROLE,
  ];

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
  const availableRoleOptions = getAvailableResultRoleOptions();
  const isDraftProjectionMode = isDraftProjectionModeActive();

  rankFilterSelect.value = state.rankFilter;
  rankFilterSelect.disabled = isInteractionLocked();
  resultsRoleSelect.innerHTML = availableRoleOptions
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  resultsRoleSelect.value = selectedRole;
  resultsRoleSelect.disabled =
    isInteractionLocked() || isDraftProjectionMode || availableRoleOptions.length === 0;
  resultsRoleControl.classList.toggle("hidden", isDraftProjectionMode);
  sortControl.classList.toggle("hidden", isDraftProjectionMode);

  allyRoleTitle.textContent = "Assign known roles";
  resultsTitle.textContent =
    isDraftProjectionMode ? "Projected win rate" : `${getRoleLabel(selectedRole)} recommendations`;
}

function renderAll() {
  renderControls();
  renderPicker("allies");
  renderPicker("enemies");
  renderAllyRoleAssignments();
  renderResultsRequestStat();
  renderLolalyticsDataWindow();
  renderResults();
  renderActionState();
  renderAutoImportBanner();
  renderBuildSuggestionModal();
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

  if (picker.selected) {
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
    select.innerHTML = buildRoleOptionsMarkup();
    select.value = ally.role || "";
    select.addEventListener("change", (event) => assignAllyRole(ally.id, event.target.value));

    const buildAction = getBuildSuggestionAction(ally);

    const controls = document.createElement("div");
    controls.className = "role-row-controls";
    controls.title = buildAction.tooltipText;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "role-remove-action";
    removeButton.disabled = isInteractionLocked();
    removeButton.title = `Remove ${ally.name}`;
    removeButton.setAttribute("aria-label", `Remove ${ally.name}`);
    removeButton.innerHTML = '<span aria-hidden="true">&times;</span>';
    removeButton.addEventListener("click", () => removeChampion("allies", ally.id));

    const buildButton = document.createElement("button");
    buildButton.type = "button";
    buildButton.className = "role-build-action";
    buildButton.textContent = "Build";
    buildButton.disabled = Boolean(buildAction.disabledReason);
    buildButton.title = buildAction.tooltipText;
    buildButton.setAttribute(
      "aria-label",
      buildAction.ariaLabel,
    );
    buildButton.addEventListener("click", () => handleOpenBuildSuggestions(ally.id));
    controls.appendChild(buildButton);
    controls.appendChild(select);
    controls.appendChild(removeButton);

    row.appendChild(main);
    row.appendChild(controls);
    allyRoleList.appendChild(row);
  }
}

function createInitialBuildSuggestionModalState() {
  return {
    open: false,
    loading: false,
    allyId: "",
    cacheKey: "",
    payload: null,
    error: "",
    activeTab: DEFAULT_BUILD_SUGGESTION_TAB,
    runeImportStatesByPageKey: {},
  };
}

function createInitialAutoImportState() {
  return {
    active: false,
    assignedRole: "",
    lastAppliedSignature: "",
    lastUpdatedAt: "",
    message: "",
    polling: false,
    queueDescription: "",
    requested: false,
    status: "idle",
    timerId: null,
  };
}

function canOpenBuildSuggestionsForAlly(ally) {
  return Boolean(ally?.role) && state.enemies.length === limits.enemies && !isInteractionLocked();
}

function getBuildSuggestionAction(ally) {
  if (state.loading) {
    return buildBuildActionState(
      ally,
      "Unavailable while role suggestions are loading.",
      "Unavailable while role suggestions are loading.",
    );
  }

  if (state.shuttingDown) {
    return buildBuildActionState(
      ally,
      "Unavailable while the app is stopping.",
      "Unavailable while the app is stopping.",
    );
  }

  if (!ally?.role) {
    return buildBuildActionState(
      ally,
      "Assign a role to unlock build suggestions.",
      "Assign a role to unlock build suggestions.",
    );
  }

  if (state.enemies.length < limits.enemies) {
    return buildBuildActionState(
      ally,
      `Select ${limits.enemies - state.enemies.length} more enemy ${
        limits.enemies - state.enemies.length === 1 ? "champion" : "champions"
      } to unlock build suggestions.`,
      "Build recommendations require all 5 enemy champions.",
    );
  }

  return buildBuildActionState(
    ally,
    "",
    `Open matchup build recommendation for ${ally.name}.`,
  );
}

function buildBuildActionState(ally, disabledReason, tooltipText) {
  const championName = ally?.name || "this champion";

  return {
    disabledReason,
    tooltipText,
    ariaLabel: disabledReason
      ? `Build recommendation for ${championName}. ${disabledReason}`
      : tooltipText,
  };
}

async function handleOpenBuildSuggestions(allyId) {
  if (state.shuttingDown) {
    return;
  }

  const ally = state.allies.find((entry) => entry.id === allyId);
  if (!canOpenBuildSuggestionsForAlly(ally)) {
    return;
  }

  const cacheKey = buildBuildSuggestionCacheKey(state.rankFilter, ally, state.enemies);
  const cachedPayload = state.buildSuggestionCache[cacheKey] || null;

  state.buildSuggestionModal = {
    open: true,
    loading: !cachedPayload,
    allyId,
    cacheKey,
    payload: cachedPayload,
    error: "",
    activeTab: DEFAULT_BUILD_SUGGESTION_TAB,
    runeImportStatesByPageKey: {},
  };
  renderBuildSuggestionModal();

  if (cachedPayload) {
    return;
  }

  try {
    const response = await fetch("/build-suggestions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        rankFilter: state.rankFilter,
        ally: {
          champion: ally.name,
          role: ally.role,
        },
        enemies: state.enemies.map((enemy) => enemy.name),
      }),
    });
    const payload = await parseJsonSafely(response);
    updateLolalyticsRequestStats(payload?.requestStats);
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load build recommendations.");
    }

    state.buildSuggestionCache[cacheKey] = payload;
    if (
      state.buildSuggestionModal.open &&
      state.buildSuggestionModal.cacheKey === cacheKey
    ) {
      state.buildSuggestionModal.payload = payload;
      state.buildSuggestionModal.loading = false;
      state.buildSuggestionModal.error = "";
      renderBuildSuggestionModal();
    }
  } catch (error) {
    if (
      state.buildSuggestionModal.open &&
      state.buildSuggestionModal.cacheKey === cacheKey
    ) {
      state.buildSuggestionModal.loading = false;
      state.buildSuggestionModal.error =
        error.message || "Failed to load build recommendations.";
      renderBuildSuggestionModal();
    }
  }
}

function closeBuildSuggestionModal() {
  if (!state.buildSuggestionModal.open) {
    return;
  }

  state.buildSuggestionModal = createInitialBuildSuggestionModalState();
  renderBuildSuggestionModal();
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

async function addChampion(side, championId) {
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

  const selectedChampion = createSelectedChampion(champion, side);
  state[side].push(selectedChampion);

  let allyRoleLikelihoodsByRole = null;
  if (side === "allies") {
    allyRoleLikelihoodsByRole = await loadAllyRoleLikelihoodsForChampion(selectedChampion);
    applySuggestedAllyRole(champion.id, allyRoleLikelihoodsByRole);
    applyAutoAssignedLastAllyRole();
  }
  pickers[side].input.value = "";
  closeBuildSuggestionModal();
  clearStatus();
  renderAll();
}

function createSelectedChampion(champion, side, options = {}) {
  const selected = {
    id: champion.id,
    key: champion.key,
    name: champion.name,
    icon: champion.icon,
  };

  if (side === "allies") {
    selected.role = "";
  }

  if (options.liveCellId != null) {
    selected.liveCellId = options.liveCellId;
  }

  if (options.autoImported) {
    selected.autoImported = true;
  }

  return selected;
}

function removeChampion(side, championId) {
  if (isInteractionLocked()) {
    return;
  }

  state[side] = state[side].filter((champion) => champion.id !== championId);
  closeBuildSuggestionModal();
  clearStatus();
  renderAll();
}

function findChampionForResult(result) {
  const resultKey = String(getResultKey(result) || "");
  const resultName = normalizeText(getResultName(result));

  return (
    state.champions.find((champion) => String(champion.key) === resultKey) ||
    state.champions.find((champion) => normalizeText(champion.name) === resultName) ||
    null
  );
}

function getSelectResultForDraftHelperText(targetRole, result) {
  if (state.loading) {
    return "Unavailable while role suggestions are loading.";
  }

  if (state.shuttingDown) {
    return "Unavailable while the app is stopping.";
  }

  const normalizedRole = normalizeRole(targetRole);
  if (!normalizedRole) {
    return "This recommendation is missing a target role.";
  }

  if (state.allies.length >= limits.allies) {
    return "The allied draft is already full.";
  }

  if (state.allies.some((ally) => ally.role === normalizedRole)) {
    return `${getRoleLabel(normalizedRole)} is already assigned to an allied champion.`;
  }

  const resultKey = String(getResultKey(result) || "");
  if (resultKey && getSelectedChampionKeys().has(resultKey)) {
    return `${getResultName(result)} is already in the current draft.`;
  }

  if (!findChampionForResult(result)) {
    return "Champion metadata is unavailable for this recommendation.";
  }

  return "";
}

function handleSelectResultForDraft(targetRole, result) {
  const helperText = getSelectResultForDraftHelperText(targetRole, result);
  if (helperText) {
    setError(helperText);
    return;
  }

  const champion = findChampionForResult(result);
  const normalizedRole = normalizeRole(targetRole);
  if (!champion || !normalizedRole) {
    return;
  }

  state.allies.push({
    ...createSelectedChampion(champion, "allies"),
    role: normalizedRole,
  });
  applyAutoAssignedLastAllyRole();
  closeBuildSuggestionModal();
  clearStatus();
  renderAll();
}

function buildRoleOptionsMarkup() {
  const options = [];
  for (const option of getTargetRoleOptions()) {
    options.push(`<option value="${option.value}">${option.label}</option>`);
  }

  return options.join("");
}

function assignAllyRole(championId, role) {
  if (isInteractionLocked()) {
    return;
  }

  state.allies = resolveAllyRoleAssignment(
    state.allies,
    championId,
    role,
    getCachedAllyRoleLikelihoodsByChampionKey(),
  );

  if (normalizeRole(role)) {
    applyAutoAssignedLastAllyRole();
  }

  closeBuildSuggestionModal();
  clearStatus();
  renderAll();
}

function applySuggestedAllyRole(championId, roleLikelihoodsByRole = null) {
  const suggestedRole = getSuggestedAllyRole(state.allies, championId, roleLikelihoodsByRole);
  if (!suggestedRole) {
    return false;
  }

  state.allies = state.allies.map((ally) =>
    ally.id === championId
      ? {
          ...ally,
          role: suggestedRole,
        }
      : ally,
  );

  return true;
}

function getCachedAllyRoleLikelihoodsByChampionKey() {
  const normalizedRankFilter = normalizeRankFilter(state.rankFilter) || DEFAULT_RANK_FILTER;
  return state.allyRoleLikelihoodsByRank[normalizedRankFilter] || null;
}

async function loadAllyRoleLikelihoodsForChampion(champion) {
  const normalizedRankFilter = normalizeRankFilter(state.rankFilter) || DEFAULT_RANK_FILTER;
  const cachedLikelihoodsByRank = state.allyRoleLikelihoodsByRank[normalizedRankFilter];
  if (cachedLikelihoodsByRank) {
    return cachedLikelihoodsByRank[String(champion.key)] || null;
  }

  setLoading(true);

  try {
    const likelihoodsByChampionKey = await ensureAllyRoleLikelihoodsLoaded(normalizedRankFilter);
    return likelihoodsByChampionKey[String(champion.key)] || null;
  } catch (_error) {
    return null;
  } finally {
    setLoading(false);
  }
}

async function ensureAllyRoleLikelihoodsLoaded(rankFilter) {
  const normalizedRankFilter = normalizeRankFilter(rankFilter) || DEFAULT_RANK_FILTER;
  const cachedLikelihoodsByRank = state.allyRoleLikelihoodsByRank[normalizedRankFilter];
  if (cachedLikelihoodsByRank) {
    return cachedLikelihoodsByRank;
  }

  const pendingRequest = state.allyRoleLikelihoodRequestsByRank[normalizedRankFilter];
  if (pendingRequest) {
    return pendingRequest;
  }

  const requestPromise = (async () => {
    const response = await fetch(
      `/ally-role-likelihoods?rankFilter=${encodeURIComponent(normalizedRankFilter)}`,
      {
        cache: "no-store",
      },
    );
    const payload = await parseJsonSafely(response);
    updateLolalyticsRequestStats(payload?.requestStats);

    if (!response.ok) {
      throw new Error(payload.error || "Failed to load ally role likelihoods.");
    }

    const likelihoodsByChampionKey =
      payload?.championRoleLikelihoods && typeof payload.championRoleLikelihoods === "object"
        ? payload.championRoleLikelihoods
        : {};
    state.allyRoleLikelihoodsByRank[normalizedRankFilter] = likelihoodsByChampionKey;
    return likelihoodsByChampionKey;
  })();

  state.allyRoleLikelihoodRequestsByRank[normalizedRankFilter] = requestPromise;

  try {
    return await requestPromise;
  } finally {
    delete state.allyRoleLikelihoodRequestsByRank[normalizedRankFilter];
  }
}

function applyAutoAssignedLastAllyRole() {
  const autoAssignment = getAutoAssignableAllyRole(state.allies);
  if (!autoAssignment) {
    return false;
  }

  state.allies = state.allies.map((ally, index) =>
    index === autoAssignment.allyIndex
      ? {
          ...ally,
          role: autoAssignment.role,
        }
      : ally,
  );

  return true;
}

async function handleStartAutoImport() {
  if (state.loading || state.shuttingDown || state.autoImport.polling) {
    return;
  }

  stopAutoImportPolling();
  state.autoImport.requested = true;
  state.autoImport.active = false;
  state.autoImport.status = "connecting";
  state.autoImport.message = "Looking for an active League pick/ban phase...";
  renderActionState();
  renderAutoImportBanner();

  await pollLiveDraftImport();
}

async function pollLiveDraftImport() {
  if (!state.autoImport.requested || state.autoImport.polling || state.shuttingDown) {
    return;
  }

  state.autoImport.polling = true;
  renderActionState();
  renderAutoImportBanner();

  try {
    const response = await fetch("/live-draft", {
      cache: "no-store",
    });
    const payload = await parseJsonSafely(response);

    if (!response.ok) {
      throw new Error(payload.message || payload.error || "Failed to connect to the League Client.");
    }

    handleLiveDraftImportPayload(payload);
  } catch (error) {
    disableAutoImport(
      "connection_lost",
      error.message || "Auto champion import is disabled: the League Client connection was lost.",
    );
  } finally {
    state.autoImport.polling = false;
    renderAll();
    scheduleAutoImportPoll();
  }
}

function handleLiveDraftImportPayload(payload) {
  if (!payload || payload.status !== "active") {
    disableAutoImport(
      payload?.reason || "unavailable",
      payload?.message || "Auto champion import is disabled: no live draft data was found.",
    );
    return;
  }

  state.autoImport.requested = true;
  state.autoImport.active = true;
  state.autoImport.status = "active";
  state.autoImport.message =
    payload.message || "Champion picks are automatically being imported from the League Client.";
  state.autoImport.assignedRole = normalizeRole(payload.assignedRole) || "";
  state.autoImport.queueDescription =
    typeof payload?.queue?.description === "string" ? payload.queue.description : "";
  state.autoImport.lastUpdatedAt =
    typeof payload.fetchedAt === "string" ? payload.fetchedAt : new Date().toISOString();

  const nextSignature = buildLiveDraftSignature(payload);
  if (nextSignature && nextSignature !== state.autoImport.lastAppliedSignature) {
    applyLiveDraftImport(payload);
    state.autoImport.lastAppliedSignature = nextSignature;
  }

  const assignedRole = getAutoImportSuggestedRole();
  if (assignedRole) {
    state.selectedResultRole = assignedRole;
    const currentBundle = getCurrentResultsBundle();
    if (currentBundle?.roles?.includes(assignedRole)) {
      currentBundle.selectedRole = assignedRole;
    }
  }
}

function applyLiveDraftImport(payload) {
  const liveAllies = normalizeLiveDraftSelections(payload.allies, "allies");
  const liveEnemies = normalizeLiveDraftSelections(payload.enemies, "enemies");
  const liveAllyKeys = new Set(liveAllies.map((ally) => String(ally.key)));
  const liveEnemyKeys = new Set(liveEnemies.map((enemy) => String(enemy.key)));

  state.enemies = state.enemies.filter((enemy) => !liveAllyKeys.has(String(enemy.key)));
  state.allies = state.allies.filter((ally) => !liveEnemyKeys.has(String(ally.key)));

  liveAllies.forEach((liveAlly) => upsertLiveDraftSelection("allies", liveAlly, liveAllyKeys));
  liveEnemies.forEach((liveEnemy) => upsertLiveDraftSelection("enemies", liveEnemy, liveEnemyKeys));

  state.allies = trimLiveDraftSelectionsToLimit(state.allies, limits.allies);
  state.enemies = trimLiveDraftSelectionsToLimit(state.enemies, limits.enemies);
  clearManualRolesConflictingWithLiveRoles();
  closeBuildSuggestionModal();
}

function normalizeLiveDraftSelections(entries = [], side) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const seenChampionKeys = new Set();
  const selections = [];

  for (const entry of entries) {
    const championKey = String(entry?.championKey || "");
    if (!championKey || seenChampionKeys.has(championKey)) {
      continue;
    }

    const champion = state.champions.find((candidate) => String(candidate.key) === championKey);
    if (!champion) {
      continue;
    }

    const selection = createSelectedChampion(champion, side, {
      autoImported: true,
      liveCellId: Number.isInteger(Number(entry.cellId)) ? Number(entry.cellId) : null,
    });
    if (side === "allies") {
      selection.role = normalizeRole(entry.role) || "";
    }

    seenChampionKeys.add(championKey);
    selections.push(selection);
  }

  return selections;
}

function upsertLiveDraftSelection(side, liveSelection, liveChampionKeys) {
  const selections = state[side];
  const existingIndex = selections.findIndex((selection) =>
    liveSelection.liveCellId != null
      ? selection.liveCellId === liveSelection.liveCellId
      : String(selection.key) === String(liveSelection.key),
  );
  const matchingChampionIndex = selections.findIndex(
    (selection) => String(selection.key) === String(liveSelection.key),
  );
  const targetIndex = existingIndex === -1 ? matchingChampionIndex : existingIndex;

  if (targetIndex !== -1) {
    const nextSelection = {
      ...selections[targetIndex],
      ...liveSelection,
    };
    if (side === "allies") {
      nextSelection.role = liveSelection.role || selections[targetIndex].role || "";
    } else {
      delete nextSelection.role;
    }

    selections[targetIndex] = nextSelection;
    return;
  }

  if (selections.length < limits[side]) {
    selections.push(liveSelection);
    return;
  }

  const replaceIndex = selections.findIndex(
    (selection) => !liveChampionKeys.has(String(selection.key)),
  );
  if (replaceIndex !== -1) {
    selections[replaceIndex] = liveSelection;
  }
}

function trimLiveDraftSelectionsToLimit(selections, maxCount) {
  if (selections.length <= maxCount) {
    return selections;
  }

  const liveSelections = selections.filter((selection) => selection.autoImported);
  const manualSelections = selections.filter((selection) => !selection.autoImported);
  return [...liveSelections, ...manualSelections].slice(0, maxCount);
}

function clearManualRolesConflictingWithLiveRoles() {
  const liveRoles = new Set(
    state.allies
      .filter((ally) => ally.autoImported)
      .map((ally) => normalizeRole(ally.role))
      .filter(Boolean),
  );

  if (liveRoles.size === 0) {
    return;
  }

  state.allies = state.allies.map((ally) => {
    const role = normalizeRole(ally.role);
    if (ally.autoImported || !role || !liveRoles.has(role)) {
      return ally;
    }

    return {
      ...ally,
      role: "",
    };
  });
}

function buildLiveDraftSignature(payload) {
  const normalizeEntries = (entries = []) =>
    (Array.isArray(entries) ? entries : [])
      .map((entry) => [
        Number.isInteger(Number(entry?.cellId)) ? Number(entry.cellId) : "",
        String(entry?.championKey || ""),
        normalizeRole(entry?.role) || "",
      ])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])));

  return JSON.stringify({
    assignedRole: normalizeRole(payload.assignedRole) || "",
    allies: normalizeEntries(payload.allies),
    enemies: normalizeEntries(payload.enemies),
    queueId: payload?.queue?.id ?? "",
  });
}

function disableAutoImport(reason, message) {
  stopAutoImportPolling();
  state.autoImport.requested = false;
  state.autoImport.active = false;
  state.autoImport.status = "disabled";
  state.autoImport.message = formatDisplayMessage(message);
  state.autoImport.assignedRole = "";
  state.autoImport.queueDescription = "";
  state.autoImport.lastUpdatedAt = new Date().toISOString();
  state.autoImport.reason = reason;
}

function scheduleAutoImportPoll() {
  stopAutoImportPolling();
  if (!state.autoImport.requested || state.autoImport.status !== "active" || state.shuttingDown) {
    return;
  }

  state.autoImport.timerId = window.setTimeout(
    pollLiveDraftImport,
    AUTO_IMPORT_POLL_INTERVAL_MS,
  );
}

function stopAutoImportPolling() {
  if (!state.autoImport.timerId) {
    return;
  }

  window.clearTimeout(state.autoImport.timerId);
  state.autoImport.timerId = null;
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

  if (isDraftProjectionModeActive()) {
    await handleFetchDraftProjection(cacheKey);
    return;
  }

  if (availableRoleValues.length === 0) {
    setError(getNoAvailableResultRolesMessage());
    return;
  }

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
    updateLolalyticsRequestStats(payload?.requestStats);
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

async function handleFetchDraftProjection(cacheKey = getCurrentSuggestionCacheKey()) {
  setLoading(true);
  clearStatus();
  setStatus(
    `Fetching live Lolalytics ${getRankFilterDisplayLabel().toLowerCase()} draft win-rate data...`,
  );

  try {
    const response = await fetch("/draft-outlook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        rankFilter: state.rankFilter,
        allies: state.allies.map((champion) => ({
          champion: champion.name,
          role: champion.role,
        })),
        enemies: state.enemies.map((champion) => champion.name),
      }),
    });
    const payload = await parseJsonSafely(response);
    updateLolalyticsRequestStats(payload?.requestStats);
    if (!response.ok) {
      throw new Error(payload.error || "Failed to project the current draft win rates.");
    }

    state.resultsCache[cacheKey] = buildDraftProjectionBundle(payload);
    const lolalyticsAccessCount = getLolalyticsLiveAccessCount(state.resultsCache[cacheKey]);

    setStatus(
      `Projected the current draft win rates. ${formatLolalyticsAccessStatus(lolalyticsAccessCount)}`,
    );
  } catch (error) {
    setError(error.message || "Failed to project the current draft win rates.");
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
  state.autoImport.lastAppliedSignature = "";
  pickers.allies.input.value = "";
  pickers.enemies.input.value = "";
  closeBuildSuggestionModal();
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
  closeBuildSuggestionModal();
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

function handleGlobalKeydown(event) {
  if (event.key === "Escape" && state.buildSuggestionModal.open) {
    closeBuildSuggestionModal();
  }
}

function renderBuildSuggestionModal() {
  const modalState = state.buildSuggestionModal;
  const ally = state.allies.find((entry) => entry.id === modalState.allyId) || null;
  const payload = modalState.payload;

  buildSuggestionModal.classList.toggle("hidden", !modalState.open);
  buildSuggestionModal.setAttribute("aria-hidden", modalState.open ? "false" : "true");

  if (!modalState.open) {
    buildSuggestionChampionIcon.classList.add("hidden");
    buildSuggestionChampionIcon.src = "";
    buildSuggestionChampionIcon.alt = "";
    buildSuggestionTitle.textContent = "Build Recommendation";
    buildSuggestionMeta.textContent = "";
    buildSuggestionTabs.innerHTML = "";
    buildSuggestionErrors.innerHTML = "";
    buildSuggestionBody.innerHTML = "";
    return;
  }

  if (ally?.icon) {
    buildSuggestionChampionIcon.classList.remove("hidden");
    buildSuggestionChampionIcon.src = ally.icon;
    buildSuggestionChampionIcon.alt = ally.name;
  } else {
    buildSuggestionChampionIcon.classList.add("hidden");
    buildSuggestionChampionIcon.src = "";
    buildSuggestionChampionIcon.alt = "";
  }

  buildSuggestionTitle.textContent = ally
    ? [ally.name, ally.role ? getRoleLabel(ally.role) : "", "Build Recommendation"]
        .filter(Boolean)
        .join(" ")
    : "Build Recommendation";
  buildSuggestionMeta.textContent = buildBuildSuggestionMetaText(ally, payload);
  const shouldShowBuildSuggestionTabs = BUILD_SUGGESTION_TABS.length > 1;
  buildSuggestionTabs.classList.toggle("hidden", !shouldShowBuildSuggestionTabs);
  buildSuggestionTabs.innerHTML = shouldShowBuildSuggestionTabs
    ? BUILD_SUGGESTION_TABS.map((tab) => {
        const isSelected = normalizeBuildSuggestionTab(modalState.activeTab) === tab.value;
        return `
          <button
            type="button"
            class="build-modal-tab"
            data-tab="${tab.value}"
            role="tab"
            aria-selected="${isSelected ? "true" : "false"}"
          >
            ${tab.label}
          </button>
        `;
      }).join("")
    : "";
  if (shouldShowBuildSuggestionTabs) {
    buildSuggestionTabs.querySelectorAll("[data-tab]").forEach((button) => {
      button.disabled = modalState.loading;
      button.addEventListener("click", () => {
        state.buildSuggestionModal.activeTab = normalizeBuildSuggestionTab(button.dataset.tab);
        renderBuildSuggestionModal();
      });
    });
  }
  buildSuggestionErrors.innerHTML = buildBuildSuggestionMessages(payload, modalState.error);
  buildSuggestionBody.innerHTML = modalState.loading
    ? '<div class="build-empty-state">Fetching build recommendations from Lolalytics...</div>'
    : modalState.error
      ? '<div class="build-empty-state">The build recommendation request failed.</div>'
      : renderBuildSuggestionBody(payload, modalState.activeTab, {
          runeImportStatesByPageKey: modalState.runeImportStatesByPageKey,
        });
  if (!modalState.loading && !modalState.error) {
    wireBuildSuggestionRuneImportButtons(payload);
  }
}

function wireBuildSuggestionRuneImportButtons(payload) {
  buildSuggestionBody.querySelectorAll("[data-rune-import-key]").forEach((button) => {
    button.addEventListener("click", () => {
      handleImportBuildSuggestionRunes(payload, button.dataset.runeImportKey);
    });
  });
}

async function handleImportBuildSuggestionRunes(payload, pageKey) {
  if (state.shuttingDown || !state.buildSuggestionModal.open || !pageKey) {
    return;
  }

  const modalState = state.buildSuggestionModal;
  const ally = state.allies.find((entry) => entry.id === modalState.allyId) || null;
  const page = getBuildSuggestionRuneRecommendationByKey(payload, pageKey);
  if (!ally || !page) {
    setBuildSuggestionRuneImportState(pageKey, {
      status: "error",
      message: "Rune import is unavailable for this recommendation.",
    });
    return;
  }

  const cacheKey = modalState.cacheKey;
  setBuildSuggestionRuneImportState(pageKey, {
    status: "importing",
    message: "Importing runes into the League Client...",
  });

  try {
    const response = await fetch("/rune-import", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        champion: ally.name,
        page,
      }),
    });
    const importPayload = await parseJsonSafely(response);
    if (!response.ok || importPayload?.status !== "imported") {
      throw new Error(
        importPayload?.message ||
          importPayload?.error ||
          "Failed to import runes into the League Client.",
      );
    }

    if (!isCurrentBuildSuggestionRuneImportTarget(cacheKey, pageKey)) {
      return;
    }

    setBuildSuggestionRuneImportState(pageKey, {
      status: "success",
      message: importPayload.message || "Imported runes into the League Client.",
    });
  } catch (error) {
    if (!isCurrentBuildSuggestionRuneImportTarget(cacheKey, pageKey)) {
      return;
    }

    setBuildSuggestionRuneImportState(pageKey, {
      status: "error",
      message: formatDisplayMessage(
        error.message || "Failed to import runes into the League Client.",
      ),
    });
  }
}

function getBuildSuggestionRuneRecommendationByKey(payload, pageKey) {
  const recommendations = getRecommendedRunePages(
    payload?.runes?.highestWinPage,
    payload?.runes?.mostPickedPage,
  );

  return recommendations.find((page) => getRunePageRecommendationKey(page) === pageKey) || null;
}

function isCurrentBuildSuggestionRuneImportTarget(cacheKey, pageKey) {
  return (
    state.buildSuggestionModal.open &&
    state.buildSuggestionModal.cacheKey === cacheKey &&
    Boolean(state.buildSuggestionModal.runeImportStatesByPageKey?.[pageKey])
  );
}

function setBuildSuggestionRuneImportState(pageKey, importState) {
  if (!state.buildSuggestionModal.open || !pageKey) {
    return;
  }

  state.buildSuggestionModal.runeImportStatesByPageKey = {
    ...state.buildSuggestionModal.runeImportStatesByPageKey,
    [pageKey]: importState,
  };
  renderBuildSuggestionModal();
}

function buildBuildSuggestionMetaText(ally, payload) {
  const parts = [];

  if (ally?.role) {
    parts.push(getRoleLabel(ally.role));
  }

  parts.push(getRankFilterDisplayLabel());

  if (payload?.summary?.enemyCount) {
    parts.push(
      `${payload.summary.enemyCount} ${payload.summary.enemyCount === 1 ? "enemy" : "enemies"}`,
    );
  } else if (state.enemies.length > 0) {
    parts.push(`${state.enemies.length} ${state.enemies.length === 1 ? "enemy" : "enemies"}`);
  }

  if (payload?.summary?.sourceMatchups) {
    parts.push(
      `${payload.summary.sourceMatchups} ${
        payload.summary.sourceMatchups === 1 ? "matchup" : "matchups"
      }`,
    );
  }

  if (payload?.summary?.lastUpdatedAt) {
    parts.push(`Updated ${formatBuildSuggestionTimestamp(payload.summary.lastUpdatedAt)}`);
  }

  return parts.join(" | ");
}

function buildBuildSuggestionMessages(payload, errorMessage = "") {
  const sections = [];

  if (errorMessage) {
    sections.push(`<p class="partial-failures-title">${escapeHtml(errorMessage)}</p>`);
  }

  const failures = Array.isArray(payload?.summary?.partialFailures)
    ? payload.summary.partialFailures
    : [];
  if (failures.length > 0) {
    sections.push('<p class="partial-failures-title">Partial matchup failures</p>');
    failures.forEach((failure) => {
      sections.push(`<p class="partial-failure-item">${escapeHtml(failure)}</p>`);
    });
  }

  return sections.join("");
}

function formatBuildSuggestionTimestamp(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function renderResults() {
  const selectedRole = syncSelectedResultRole();
  const currentBundle = getCurrentResultsBundle();
  const isDraftProjectionBundle = currentBundle?.mode === "draftProjection";
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
    PROJECTED_AGENCY_SORT_MODE,
    DEFAULT_TOP_RESULT_LIMIT,
  );

  resultsBody.innerHTML = "";
  partialFailures.innerHTML = "";
  draftProjectionWrap.innerHTML = "";
  sortSelect.value = state.sortMode;
  sortSelect.disabled =
    state.loading ||
    state.shuttingDown ||
    isDraftProjectionBundle ||
    currentResults.length === 0 ||
    Boolean(currentMeta?.error);

  if (!currentBundle) {
    emptyState.textContent = getPendingResultsMessage();
    emptyState.classList.remove("hidden");
    draftProjectionWrap.classList.add("hidden");
    resultsWrap.classList.add("hidden");
    resultsMeta.textContent = "";
    return;
  }

  if (isDraftProjectionBundle) {
    const projectionPayload = currentBundle.payload || {};

    emptyState.classList.add("hidden");
    resultsWrap.classList.add("hidden");
    draftProjectionWrap.classList.remove("hidden");
    draftProjectionWrap.innerHTML = renderDraftProjectionView(projectionPayload, {
      partialFailures: (projectionPayload?.summary?.partialFailures || []).map((message) =>
        formatDisplayMessage(message),
      ),
      rankFilterLabel: getRankFilterDisplayLabel(),
    });
    resultsMeta.textContent = `${projectionPayload?.summary?.allyCount || state.allies.length} allies vs ${projectionPayload?.summary?.enemyCount || state.enemies.length} ${Number(projectionPayload?.summary?.enemyCount || state.enemies.length) === 1 ? "enemy" : "enemies"}`;
    return;
  }

  if (currentMeta?.error) {
    emptyState.textContent = formatDisplayMessage(currentMeta.error);
    emptyState.classList.remove("hidden");
    draftProjectionWrap.classList.add("hidden");
    resultsWrap.classList.add("hidden");
    resultsMeta.textContent = `${getRoleLabel(selectedRole)} unavailable`;
    renderPartialFailures(currentMeta.partialFailures || []);
    return;
  }

  if (!visibleResults.length) {
    emptyState.textContent = `No ${getRoleLabel(selectedRole).toLowerCase()} recommendations are available for the current draft.`;
    emptyState.classList.remove("hidden");
    draftProjectionWrap.classList.add("hidden");
    resultsWrap.classList.add("hidden");
    resultsMeta.textContent = "";
    renderPartialFailures(currentMeta?.partialFailures || []);
    return;
  }

  emptyState.classList.add("hidden");
  draftProjectionWrap.classList.add("hidden");
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
    const selectForDraftHelperText = getSelectResultForDraftHelperText(selectedRole, result);
    const selectForDraftDescription = selectForDraftHelperText
      ? selectForDraftHelperText
      : `Add ${resultName} to the allied draft as ${getRoleLabel(selectedRole)}.`;
    const selectForDraftDisabled = Boolean(selectForDraftHelperText);
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
      <td class="${projectedAgencyClassName}">
        <div class="result-agency-cell">
          <span class="result-agency-score">${formatScore(getProjectedAgency(result))}</span>
          <button
            type="button"
            class="result-draft-action"
            data-action="select-for-draft"
            title="${escapeHtml(selectForDraftDescription)}"
            aria-label="${escapeHtml(selectForDraftDescription)}"
            ${selectForDraftDisabled ? "disabled" : ""}
          >
            +
          </button>
        </div>
      </td>
    `;
    const selectForDraftButton = row.querySelector('[data-action="select-for-draft"]');
    if (selectForDraftButton) {
      selectForDraftButton.addEventListener("click", () =>
        handleSelectResultForDraft(selectedRole, result),
      );
    }
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
    item.textContent = formatDisplayMessage(message);
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
    mode: "suggestions",
    roles: [...requestedRoles],
    resultsByRole,
    metaByRole,
    requestStats: {
      lolalyticsLiveAccessCount: Number(payload?.requestStats?.lolalyticsLiveAccessCount || 0),
      lolalyticsLifetimeAccessCount: Number(
        payload?.requestStats?.lolalyticsLifetimeAccessCount || 0,
      ),
    },
    selectedRole: requestedRoles.includes(selectedRole) ? selectedRole : requestedRoles[0] || DEFAULT_TARGET_ROLE,
  };
}

function buildDraftProjectionBundle(payload) {
  return {
    mode: "draftProjection",
    payload,
    requestStats: {
      lolalyticsLiveAccessCount: Number(payload?.requestStats?.lolalyticsLiveAccessCount || 0),
      lolalyticsLifetimeAccessCount: Number(
        payload?.requestStats?.lolalyticsLifetimeAccessCount || 0,
      ),
    },
  };
}

function getPendingResultsMessage() {
  if (state.allies.length === 0 && state.enemies.length === 0) {
    return "Select some champions, optionally assign known ally roles, then fetch suggestions to load every remaining role.";
  }

  if (isDraftProjectionModeActive()) {
    return 'Click "Who will win?" to project the current draft win rates for both teams.';
  }

  const availableRoleOptions = getAvailableResultRoleOptions();
  return `Fetch suggestions to load ${formatRoleLabels(availableRoleOptions)} for the current draft.`;
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

function updateLolalyticsRequestStats(requestStats = null) {
  const lifetimeAccessCount = Number(requestStats?.lolalyticsLifetimeAccessCount);
  if (Number.isFinite(lifetimeAccessCount)) {
    state.lolalyticsLifetimeAccessCount = Math.max(0, lifetimeAccessCount);
    renderResultsRequestStat();
  }
}

function formatLolalyticsAccessStatus(accessCount) {
  if (accessCount === 0) {
    return "No new live Lolalytics hits were needed.";
  }

  return `Lolalytics was contacted ${accessCount} ${accessCount === 1 ? "time" : "times"}.`;
}

function formatLolalyticsAccessStat(accessCount) {
  return `Total Lolalytics live hits since server start: ${Math.max(0, accessCount)}.`;
}

function formatLolalyticsDataWindow(days) {
  const normalizedDays = Math.max(1, Math.round(Number(days) || 7));
  return `last ${normalizedDays} ${normalizedDays === 1 ? "day" : "days"}`;
}

function renderLolalyticsDataWindow() {
  lolalyticsDataWindow.textContent = formatLolalyticsDataWindow(
    state.lolalyticsDataWindowDays,
  );
}

function renderResultsRequestStat() {
  resultsRequestStat.textContent = formatDisplayMessage(
    formatLolalyticsAccessStat(state.lolalyticsLifetimeAccessCount),
  );
}

function renderAutoImportBanner() {
  if (state.autoImport.status === "idle") {
    autoImportBanner.className = "auto-import-banner hidden";
    autoImportBanner.textContent = "";
    return;
  }

  const tone = state.autoImport.status === "active" ? "active" : "disabled";
  autoImportBanner.className = `auto-import-banner auto-import-banner--${tone}`;
  autoImportBanner.textContent = buildAutoImportBannerMessage();
}

function buildAutoImportBannerMessage() {
  const parts = [state.autoImport.message].filter(Boolean);

  if (state.autoImport.status === "active") {
    if (state.autoImport.queueDescription) {
      parts.push(`${state.autoImport.queueDescription}.`);
    }

    const assignedRole = normalizeRole(state.autoImport.assignedRole);
    if (assignedRole && getAutoImportSuggestedRole()) {
      parts.push(`Showing ${getRoleLabel(assignedRole)} suggestions.`);
    }
  }

  return formatDisplayMessage(parts.join(" "));
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
  return "";
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
  return `v${normalizedVersion}`;
}

function formatDisplayMessage(message) {
  const normalizedMessage = typeof message === "string" ? message.trim() : "";

  if (normalizedMessage.length < 2) {
    return normalizedMessage;
  }

  const quotePairs = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
  ];

  for (const [openingQuote, closingQuote] of quotePairs) {
    if (
      normalizedMessage.startsWith(openingQuote) &&
      normalizedMessage.endsWith(closingQuote)
    ) {
      const unwrappedMessage = normalizedMessage
        .slice(openingQuote.length, normalizedMessage.length - closingQuote.length)
        .trim();

      if (unwrappedMessage && /[\s.,:;!?-]/.test(unwrappedMessage)) {
        return unwrappedMessage;
      }
    }
  }

  return normalizedMessage;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeSortMode(value) {
  if (value === PROJECTED_AGENCY_SORT_MODE || value === PROJECTED_WIN_RATE_SORT_MODE) {
    return value;
  }

  return DEFAULT_SORT_MODE;
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
  void message;
}

function setError(message) {
  errorText.textContent = formatDisplayMessage(message);
}

function clearStatus() {
  errorText.textContent = "";
}

function renderActionState() {
  const availableRoleCount = getAvailableResultRoleOptions().length;
  const isDraftProjectionMode = isDraftProjectionModeActive();
  const autoImportBusy = state.autoImport.polling || state.autoImport.status === "connecting";

  rankFilterSelect.disabled = state.loading || state.shuttingDown;
  resultsRoleSelect.disabled =
    state.loading || state.shuttingDown || isDraftProjectionMode || availableRoleCount === 0;
  fetchButton.disabled =
    state.loading || state.shuttingDown || (!isDraftProjectionMode && availableRoleCount === 0);
  fetchButton.textContent =
    state.loading ? "Fetching..." : isDraftProjectionMode ? "Who will win?" : "Fetch Suggestions";

  autoImportButton.disabled = state.loading || state.shuttingDown || autoImportBusy;
  autoImportButton.textContent = getAutoImportButtonText();
  resetButton.disabled = state.loading || state.shuttingDown;
  closeButton.hidden = !state.canShutdown;
  closeButton.disabled = state.loading || state.shuttingDown || !state.shutdownToken;
  closeButton.setAttribute("aria-label", state.shuttingDown ? "Stopping app" : "Stop app");
  closeButton.setAttribute("title", state.shuttingDown ? "Stopping app" : "Stop app");
  sortSelect.disabled =
    state.loading ||
    state.shuttingDown ||
    isDraftProjectionMode ||
    (getCurrentResultsBundle()?.resultsByRole?.[getSelectedResultRole()] || []).length === 0 ||
    Boolean(getCurrentResultsBundle()?.metaByRole?.[getSelectedResultRole()]?.error);
}

function getAutoImportButtonText() {
  if (state.autoImport.polling || state.autoImport.status === "connecting") {
    return "Connecting...";
  }

  if (state.autoImport.status === "active") {
    return "Importing";
  }

  if (state.autoImport.status === "disabled") {
    return "Retry Auto Import";
  }

  return "Auto Import";
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
