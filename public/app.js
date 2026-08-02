const {
  buildSuggestionCacheKey,
} = globalThis.suggestionCache;
const {
  buildBuildSuggestionCacheKey,
} = globalThis.buildSuggestionCache;
const {
  DEFAULT_BUILD_COUNTER_FILTER_ORIENTATION,
  VERTICAL_BUILD_COUNTER_FILTER_ORIENTATION,
  filterBuildCounterEnemies,
  formatBuildGoldThousands,
  normalizeBuildCounterFilterOrientation,
  resolveBuildGoldScoreboard,
  resolveAutomaticBuildCounterFilter,
  resolveHighestRankedEnemyChampionKey,
  resolveVisibleBuildGoldRank,
  toggleBuildCounterFilter,
  toggleBuildCounterFilterOrientation,
} = globalThis.buildCounterFilter;
const {
  createInitialLiveGameState,
  reconcileLiveGameState,
} = globalThis.liveGameState;
const {
  completeBanSuggestionRequest,
  createInitialBanSuggestionState,
  failBanSuggestionRequest,
  reconcileBanSuggestionState,
} = globalThis.banSuggestionState;
const {
  getBuildSuggestionActionState,
} = globalThis.buildActionState;
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
  DEFAULT_LANE_OPPONENT_WEIGHT,
  getDefaultLaneOpponentWeightForRole,
  getLaneOpponentWeightAfterRoleChange,
  getLaneOpponentWeightOptions,
  normalizeLaneOpponentWeight,
} = globalThis.laneOpponentWeight;
const {
  BUILD_SUGGESTION_TABS,
  DEFAULT_BUILD_SUGGESTION_TAB,
  DEFAULT_ITEM_RECOMMENDATION_SCOPE,
  DEFAULT_RUNE_RECOMMENDATION_SCOPE,
  LANE_OPPONENT_ITEM_RECOMMENDATION_SCOPE,
  LANE_OPPONENT_RUNE_RECOMMENDATION_SCOPE,
  getRecommendedRunePages,
  getRunePageRecommendationKey,
  normalizeBuildSuggestionTab,
  normalizeItemRecommendationScope,
  normalizeRuneRecommendationScope,
  renderBuildSuggestionBody,
} = globalThis.buildSuggestionView;
const {
  CHAMPION_SORT_MODE,
  DEFAULT_FIRST_PICK_SORT_MODE,
  DEFAULT_TOP_RESULT_LIMIT,
  DEFAULT_SORT_MODE,
  DRAFT_TOP_RESULT_LIMIT,
  PBI_SORT_MODE,
  PROJECTED_AGENCY_SORT_MODE,
  PROJECTED_WIN_RATE_HIGH_SKILL_SORT_MODE,
  PROJECTED_WIN_RATE_LOW_SKILL_SORT_MODE,
  PROJECTED_WIN_RATE_SORT_MODE,
  WIN_RATE_SORT_MODE,
  getDraftHighlightTone,
  getPbi,
  getProjectedAgency,
  getResultKey,
  getResultName,
  getSkillAdjustedProjectedWinRate,
  getTopProjectedWinRateKeysAtEverySkillLevel,
  getTopResultKeys,
  getWinRate,
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
const {
  assignEnemyRoles,
  resolveEnemyRoleSelection,
} = globalThis.enemyRoleAssignments;

const LANE_OPPONENT_WEIGHTS = getLaneOpponentWeightOptions().map(
  (option) => option.value,
);

const state = {
  champions: [],
  championById: new Map(),
  championByKey: new Map(),
  championByName: new Map(),
  allies: [],
  allyRoleLikelihoodsByRank: {},
  allyRoleLikelihoodRequestsByRank: {},
  enemies: [],
  loading: false,
  shuttingDown: false,
  canShutdown: false,
  shutdownToken: "",
  version: "0.8.2",
  resultsCache: {},
  selectedResultRole: DEFAULT_TARGET_ROLE,
  skillLevelSortMode: DEFAULT_SORT_MODE,
  resultSortMode: PROJECTED_WIN_RATE_SORT_MODE,
  firstPickSortMode: DEFAULT_FIRST_PICK_SORT_MODE,
  rankFilter: DEFAULT_RANK_FILTER,
  laneOpponentWeight: getDefaultLaneOpponentWeightForRole(DEFAULT_TARGET_ROLE),
  autoImport: createInitialAutoImportState(),
  liveGame: createInitialLiveGameState(),
  banSuggestions: createInitialBanSuggestionState(),
  banSuggestionRequestsByKey: {},
  buildSuggestionCache: {},
  buildSuggestionRequestsByKey: {},
  buildSuggestionModal: createInitialBuildSuggestionModalState(),
  lolalyticsDataWindowDays: 30,
  lolalyticsLifetimeAccessCount: 0,
};

const AUTO_IMPORT_POLL_INTERVAL_MS = 3000;
const LIVE_GAME_POLL_INTERVAL_MS = 15 * 1000;

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
const laneOpponentWeightSelect = document.getElementById("lane-opponent-weight");
const fetchButton = document.getElementById("fetch-button");
const autoImportButton = document.getElementById("auto-import-button");
const autoImportBanner = document.getElementById("auto-import-banner");
const banSuggestions = document.getElementById("ban-suggestions");
const banSuggestionsList = document.getElementById("ban-suggestions-list");
const banSuggestionsStatus = document.getElementById("ban-suggestions-status");
const resetButton = document.getElementById("reset-button");
const closeButton = document.getElementById("close-button");
const allyRolePanel = document.getElementById("ally-role-panel");
const allyRoleList = document.getElementById("ally-role-list");
const allyRoleTitle = document.getElementById("ally-role-title");
const errorText = document.getElementById("error-text");
const emptyState = document.getElementById("empty-state");
const resultsWrap = document.getElementById("results-table-wrap");
const resultsHeaderRow = document.getElementById("results-header-row");
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
const buildSuggestionDialog = document.getElementById("build-suggestion-dialog");
const buildSuggestionBackdrop = document.getElementById("build-suggestion-backdrop");
const buildSuggestionAutoImportButton = document.getElementById(
  "build-suggestion-auto-import",
);
const buildSuggestionCloseButton = document.getElementById("build-suggestion-close");
const buildSuggestionChampionPortrait = document.getElementById(
  "build-suggestion-champion-portrait",
);
const buildSuggestionChampionIcon = document.getElementById("build-suggestion-champion-icon");
const buildSuggestionChampionRank = document.getElementById("build-suggestion-champion-rank");
const buildSuggestionTitle = document.getElementById("build-suggestion-title");
const buildSuggestionMeta = document.getElementById("build-suggestion-meta");
const buildSuggestionCounterFilter = document.getElementById(
  "build-suggestion-counter-filter",
);
const buildSuggestionCounterFilterSticky = buildSuggestionCounterFilter.closest(
  ".build-counter-filter-sticky",
);
const buildSuggestionCounterFilterOrientationButton = document.getElementById(
  "build-suggestion-counter-filter-orientation",
);
const buildSuggestionTabs = document.getElementById("build-suggestion-tabs");
const buildSuggestionErrors = document.getElementById("build-suggestion-errors");
const buildSuggestionBody = document.getElementById("build-suggestion-body");
const buildSuggestionScroll = buildSuggestionModal.querySelector(".build-modal-scroll");

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
    state.championById.set(champion.id, champion);
    state.championByKey.set(String(champion.key), champion);
    state.championByName.set(normalizeText(champion.name), champion);
  });
  await loadAppConfig();
  initializeRankFilterOptions();
  initializeLaneOpponentWeightOptions();

  wirePicker("allies");
  wirePicker("enemies");

  rankFilterSelect.addEventListener("change", handleRankFilterChange);
  laneOpponentWeightSelect.addEventListener("change", handleLaneOpponentWeightChange);
  resultsRoleSelect.addEventListener("change", handleResultsRoleChange);
  fetchButton.addEventListener("click", handleFetchSuggestions);
  autoImportButton.addEventListener("click", handleStartAutoImport);
  buildSuggestionAutoImportButton.addEventListener("click", handleStartAutoImport);
  resetButton.addEventListener("click", handleResetDraft);
  closeButton.addEventListener("click", handleCloseApp);
  sortSelect.addEventListener("change", handleSkillLevelChange);
  buildSuggestionBackdrop.addEventListener("click", closeBuildSuggestionModal);
  buildSuggestionCloseButton.addEventListener("click", closeBuildSuggestionModal);
  buildSuggestionCounterFilterOrientationButton.addEventListener(
    "click",
    handleBuildCounterFilterOrientationToggle,
  );
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

function buildAllyRequestSelections() {
  return state.allies.map((champion) => {
    const selection = {
      champion: champion.name,
    };

    if (champion.role) {
      selection.role = champion.role;
    }

    return selection;
  });
}

function buildEnemyRequestSelections(enemies = state.enemies) {
  return enemies.map((champion) => {
    const selection = {
      champion: champion.name,
    };
    const role = normalizeRole(champion.role);
    if (role) {
      selection.role = role;
    }

    return selection;
  });
}

function getCurrentSuggestionCacheKey() {
  return buildSuggestionCacheKey(
    state.rankFilter,
    state.allies,
    state.enemies,
    isDraftProjectionModeActive()
      ? DEFAULT_LANE_OPPONENT_WEIGHT
      : state.laneOpponentWeight,
  );
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
  selectResultRole(selectedRole);
  return selectedRole;
}

function selectResultRole(nextRole) {
  const selectedRole = normalizeRole(nextRole) || DEFAULT_TARGET_ROLE;
  const previousRole = state.selectedResultRole;

  state.selectedResultRole = selectedRole;
  state.laneOpponentWeight = getLaneOpponentWeightAfterRoleChange(
    state.laneOpponentWeight,
    previousRole,
    selectedRole,
  );

  const currentBundle = getCurrentResultsBundle();
  if (currentBundle) {
    currentBundle.selectedRole = selectedRole;
  }
}

function getRankFilterDisplayLabel() {
  return getRankFilterLabel(state.rankFilter);
}

function initializeRankFilterOptions() {
  rankFilterSelect.innerHTML = getRankFilterOptions()
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
}

function initializeLaneOpponentWeightOptions() {
  const optionsMarkup = getLaneOpponentWeightOptions()
    .map((option) => `<option value="${option.value}">Lane Weight ${option.label}</option>`)
    .join("");

  laneOpponentWeightSelect.innerHTML = optionsMarkup;
}

function renderControls() {
  const selectedRole = syncSelectedResultRole();
  const availableRoleOptions = getAvailableResultRoleOptions();
  const isDraftProjectionMode = isDraftProjectionModeActive();
  const currentBundle = getCurrentResultsBundle();
  const isFirstPickBundle = currentBundle?.mode === "firstPick";

  rankFilterSelect.value = state.rankFilter;
  rankFilterSelect.disabled = isInteractionLocked();
  laneOpponentWeightSelect.value = String(state.laneOpponentWeight);
  laneOpponentWeightSelect.disabled = isInteractionLocked();
  resultsRoleSelect.innerHTML = availableRoleOptions
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  resultsRoleSelect.value = selectedRole;
  resultsRoleSelect.disabled =
    isInteractionLocked() || isDraftProjectionMode || availableRoleOptions.length === 0;
  resultsRoleControl.classList.toggle("hidden", isDraftProjectionMode);
  sortControl.classList.toggle("hidden", isDraftProjectionMode || isFirstPickBundle);

  allyRoleTitle.textContent = "Assign known roles";
  resultsTitle.textContent = isDraftProjectionMode
    ? "Projected win rate"
    : isFirstPickBundle
      ? `${getRoleLabel(selectedRole)} first-pick tier list`
      : `${getRoleLabel(selectedRole)} recommendations`;
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
  renderBanSuggestions();
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

    if (side === "enemies") {
      renderEnemyRoleAssignments(picker.selected, selectedChampions);
      renderSuggestions(side);
      return;
    }

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
      chip.setAttribute("aria-label", `Remove ${champion.name}`);
      chip.addEventListener("click", () => removeChampion(side, champion.id));
      picker.selected.appendChild(chip);
    }
  }

  renderSuggestions(side);
}

function renderEnemyRoleAssignments(container, enemies) {
  container.classList.add("enemy-role-list");

  for (const enemy of enemies) {
    const row = document.createElement("div");
    row.className = "role-row enemy-role-row";

    const main = document.createElement("div");
    main.className = "role-row-main";
    main.innerHTML = `
      <img src="${enemy.icon}" alt="${enemy.name}" width="36" height="36" />
      <span class="role-row-name">${enemy.name}</span>
    `;

    const select = document.createElement("select");
    select.className = "lane-select enemy-lane-select";
    select.disabled = isInteractionLocked();
    select.setAttribute("aria-label", `Assign enemy lane for ${enemy.name}`);
    select.innerHTML = '<option value="">Assign lane</option>' + buildRoleOptionsMarkup();
    select.value = normalizeRole(enemy.role) || "";
    select.addEventListener("change", (event) =>
      assignEnemyRole(enemy.id, event.target.value),
    );

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "role-remove-action";
    removeButton.disabled = isInteractionLocked();
    removeButton.title = `Remove ${enemy.name}`;
    removeButton.setAttribute("aria-label", `Remove ${enemy.name}`);
    removeButton.innerHTML = '<span aria-hidden="true">&times;</span>';
    removeButton.addEventListener("click", () => removeChampion("enemies", enemy.id));

    const controls = document.createElement("div");
    controls.className = "role-row-controls";
    controls.appendChild(select);
    controls.appendChild(removeButton);

    row.appendChild(main);
    row.appendChild(controls);
    container.appendChild(row);
  }
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
    const buildTooltipId = `build-tooltip-${ally.id}`;
    const buildButtonWrap = document.createElement("span");
    buildButtonWrap.className = "role-build-action-wrap";
    if (buildAction.disabledReason) {
      buildButtonWrap.classList.add("role-build-action-wrap--disabled");
      buildButtonWrap.tabIndex = 0;
      buildButtonWrap.setAttribute("aria-label", buildAction.tooltipText);
      buildButton.setAttribute("aria-describedby", buildTooltipId);
    }
    const buildTooltip = document.createElement("span");
    buildTooltip.id = buildTooltipId;
    buildTooltip.className = "role-build-tooltip";
    buildTooltip.setAttribute("role", "tooltip");
    buildTooltip.textContent = buildAction.tooltipText;
    buildButton.addEventListener("click", () => handleOpenBuildSuggestions(ally.id));
    buildButtonWrap.appendChild(buildButton);
    buildButtonWrap.appendChild(buildTooltip);
    controls.appendChild(buildButtonWrap);
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
    requestKey: "",
    enemies: [],
    selectedCounterChampionKeys: [],
    counterFilterMode: "automatic",
    counterFilterOrientation: DEFAULT_BUILD_COUNTER_FILTER_ORIENTATION,
    automaticFilterApplied: false,
    automaticFilterReason: "",
    payload: null,
    error: "",
    activeTab: DEFAULT_BUILD_SUGGESTION_TAB,
    itemRecommendationScopes: createDefaultItemRecommendationScopes(),
    runeRecommendationScopes: createDefaultRuneRecommendationScopes(),
    runeImportStatesByPageKey: {},
  };
}

function createDefaultItemRecommendationScopes() {
  return {
    highestWin: DEFAULT_ITEM_RECOMMENDATION_SCOPE,
    mostPicked: DEFAULT_ITEM_RECOMMENDATION_SCOPE,
  };
}

function createDefaultRuneRecommendationScopes() {
  return {
    highestWin: DEFAULT_RUNE_RECOMMENDATION_SCOPE,
    mostPicked: DEFAULT_RUNE_RECOMMENDATION_SCOPE,
  };
}

function createInitialAutoImportState() {
  return {
    active: false,
    allyHovers: [],
    assignedRole: "",
    champSelectPhase: "unknown",
    lastAppliedSignature: "",
    lastPollStartedAt: 0,
    lastUpdatedAt: "",
    message: "",
    polling: false,
    queueDescription: "",
    requested: false,
    source: "",
    sessionId: "",
    status: "idle",
    statusPolling: false,
    statusTimerId: null,
    timerId: null,
    unavailableChampionKeys: [],
  };
}

function canOpenBuildSuggestionsForAlly(ally) {
  return Boolean(ally?.role) && state.enemies.length > 0 && !isInteractionLocked();
}

function getLiveGameParticipant(selection) {
  const championKey = selection?.key == null ? "" : String(selection.key);
  return championKey ? state.liveGame.playersByChampionKey[championKey] || null : null;
}

function mergeLiveGameParticipant(selection) {
  const liveParticipant = getLiveGameParticipant(selection);
  if (!liveParticipant) {
    return selection;
  }

  return {
    ...selection,
    ...liveParticipant,
    role: normalizeRole(liveParticipant.role) || selection.role || "",
  };
}

function mergeLiveGameParticipantForAutomaticFilter(selection) {
  const liveParticipant = getLiveGameParticipant(selection);
  if (!liveParticipant) {
    return selection;
  }

  return {
    ...selection,
    ...liveParticipant,
    role: normalizeRole(liveParticipant.role) || "",
  };
}

function normalizeBuildGoldRank(value) {
  const rank = Number(value);
  return Number.isInteger(rank) && rank >= 1 && rank <= 10 ? rank : null;
}

function getVisibleBuildGoldRank(participant) {
  return resolveVisibleBuildGoldRank(participant?.buildGoldRank, {
    liveGameActive: state.liveGame.active,
    liveGameComplete: state.liveGame.complete,
  });
}

function formatLiveBuildGold(value) {
  const gold = Number(value);
  return Number.isFinite(gold) && gold >= 0
    ? `${Math.round(gold).toLocaleString()} gold in items`
    : "";
}

function getBuildGoldRankDescription(participant) {
  const rank = getVisibleBuildGoldRank(participant);
  if (!rank) {
    return "";
  }

  const goldDescription = formatLiveBuildGold(participant?.buildGold);
  return `Build gold rank ${rank}${goldDescription ? `, ${goldDescription}` : ""}`;
}

function resolveCurrentAutomaticBuildCounterFilter(ally, enemies) {
  return resolveAutomaticBuildCounterFilter(
    mergeLiveGameParticipantForAutomaticFilter(ally),
    enemies.map(mergeLiveGameParticipantForAutomaticFilter),
    {
      liveGameActive: state.liveGame.active,
      liveGameComplete: state.liveGame.complete,
    },
  );
}

function getBuildSuggestionAction(ally) {
  return getBuildSuggestionActionState({
    ally,
    enemyCount: state.enemies.length,
    loading: state.loading,
    shuttingDown: state.shuttingDown,
  });
}

async function handleOpenBuildSuggestions(allyId) {
  if (state.shuttingDown) {
    return;
  }

  const ally = state.allies.find((entry) => entry.id === allyId);
  if (!canOpenBuildSuggestionsForAlly(ally)) {
    return;
  }

  const rankFilter = state.rankFilter;
  const enemySelections = state.enemies.map((enemy) => ({ ...enemy }));
  const automaticFilter = resolveCurrentAutomaticBuildCounterFilter(ally, enemySelections);
  const initiallyFilteredEnemies = filterBuildCounterEnemies(
    enemySelections.map(mergeLiveGameParticipant),
    automaticFilter.selectedChampionKeys,
  );
  const cacheKey = initiallyFilteredEnemies.length > 0
    ? buildBuildSuggestionCacheKey(rankFilter, ally, initiallyFilteredEnemies)
    : "";
  const cachedPayload = cacheKey ? state.buildSuggestionCache[cacheKey] || null : null;

  state.buildSuggestionModal = {
    open: true,
    loading: Boolean(cacheKey && !cachedPayload),
    allyId,
    cacheKey,
    requestKey: cacheKey || "live-filter-empty",
    enemies: enemySelections,
    selectedCounterChampionKeys: automaticFilter.selectedChampionKeys,
    counterFilterMode: "automatic",
    counterFilterOrientation: DEFAULT_BUILD_COUNTER_FILTER_ORIENTATION,
    automaticFilterApplied: automaticFilter.applied,
    automaticFilterReason: automaticFilter.reason,
    payload: cachedPayload,
    error: "",
    activeTab: DEFAULT_BUILD_SUGGESTION_TAB,
    itemRecommendationScopes: createDefaultItemRecommendationScopes(),
    runeRecommendationScopes: createDefaultRuneRecommendationScopes(),
    runeImportStatesByPageKey: {},
  };
  renderBuildSuggestionModal();
  await loadBuildSuggestionForCurrentCounterFilter();
}

function getBuildSuggestionFilteredEnemies(modalState = state.buildSuggestionModal) {
  const enemies = modalState.enemies.map(mergeLiveGameParticipant);
  return filterBuildCounterEnemies(
    enemies,
    modalState.selectedCounterChampionKeys,
  );
}

async function loadBuildSuggestionForCurrentCounterFilter() {
  const modalState = state.buildSuggestionModal;
  const ally = state.allies.find((entry) => entry.id === modalState.allyId) || null;
  if (!modalState.open || !ally) {
    return;
  }

  const enemySelections = getBuildSuggestionFilteredEnemies(modalState);
  if (enemySelections.length === 0) {
    modalState.cacheKey = "";
    modalState.requestKey = "live-filter-empty";
    modalState.payload = null;
    modalState.loading = false;
    modalState.error = "";
    renderBuildSuggestionModal();
    return;
  }

  const cacheKey = buildBuildSuggestionCacheKey(
    state.rankFilter,
    ally,
    enemySelections,
  );
  const cachedPayload = state.buildSuggestionCache[cacheKey] || null;

  modalState.cacheKey = cacheKey;
  modalState.requestKey = cacheKey;
  modalState.payload = cachedPayload || modalState.payload;
  modalState.loading = !cachedPayload;
  modalState.error = "";
  renderBuildSuggestionModal();

  if (cachedPayload) {
    return;
  }

  let requestPromise = state.buildSuggestionRequestsByKey[cacheKey];
  if (!requestPromise) {
    requestPromise = fetchBuildSuggestionPayload({
      ally,
      cacheKey,
      enemySelections,
      rankFilter: state.rankFilter,
    });
    state.buildSuggestionRequestsByKey[cacheKey] = requestPromise;
  }

  const outcome = await requestPromise;
  if (state.buildSuggestionRequestsByKey[cacheKey] === requestPromise) {
    delete state.buildSuggestionRequestsByKey[cacheKey];
  }

  if (
    !state.buildSuggestionModal.open ||
    state.buildSuggestionModal.requestKey !== cacheKey
  ) {
    return;
  }

  state.buildSuggestionModal.loading = false;
  if (outcome.payload) {
    state.buildSuggestionModal.payload = outcome.payload;
  }
  state.buildSuggestionModal.error = outcome.error;
  renderBuildSuggestionModal();
}

async function fetchBuildSuggestionPayload({
  ally,
  cacheKey,
  enemySelections,
  rankFilter,
}) {
  try {
    const { response, payload } = await postJson("/build-suggestions", {
      rankFilter,
      ally: {
        champion: ally.name,
        role: ally.role,
      },
      enemies: buildEnemyRequestSelections(enemySelections),
    });
    updateLolalyticsRequestStats(payload?.requestStats);
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load build recommendations.");
    }

    state.buildSuggestionCache[cacheKey] = payload;
    return {
      payload,
      error: "",
    };
  } catch (error) {
    return {
      payload: null,
      error: error.message || "Failed to load build recommendations.",
    };
  }
}

function handleBuildCounterFilterToggle(championKey) {
  const modalState = state.buildSuggestionModal;
  if (!modalState.open || state.shuttingDown) {
    return;
  }

  modalState.selectedCounterChampionKeys = toggleBuildCounterFilter(
    modalState.selectedCounterChampionKeys,
    championKey,
    modalState.enemies.map((enemy) => enemy.key),
  );
  modalState.counterFilterMode = "manual";
  modalState.automaticFilterApplied = false;
  modalState.automaticFilterReason = "";
  void loadBuildSuggestionForCurrentCounterFilter();
}

function handleClearBuildCounterFilter() {
  if (!state.buildSuggestionModal.open || state.shuttingDown) {
    return;
  }

  state.buildSuggestionModal.selectedCounterChampionKeys =
    state.buildSuggestionModal.enemies.map((enemy) => String(enemy.key));
  state.buildSuggestionModal.counterFilterMode = "manual";
  state.buildSuggestionModal.automaticFilterApplied = false;
  state.buildSuggestionModal.automaticFilterReason = "";
  void loadBuildSuggestionForCurrentCounterFilter();
}

function handleBuildCounterFilterOrientationToggle() {
  const modalState = state.buildSuggestionModal;
  if (!modalState.open || state.shuttingDown) {
    return;
  }

  modalState.counterFilterOrientation = toggleBuildCounterFilterOrientation(
    modalState.counterFilterOrientation,
  );
  renderBuildSuggestionModal();
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

  const champion = state.championById.get(championId);
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

  let roleLikelihoodsByRole = null;
  if (side === "allies" || side === "enemies") {
    roleLikelihoodsByRole = await loadAllyRoleLikelihoodsForChampion(selectedChampion);
  }
  if (side === "allies") {
    applySuggestedAllyRole(champion.id, roleLikelihoodsByRole);
    applyAutoAssignedLastAllyRole();
  } else if (side === "enemies") {
    applyAutomaticEnemyRoleAssignments();
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
  } else if (side === "enemies") {
    selected.role = "";
    selected.roleManuallyAssigned = false;
  }

  if (options.liveCellId != null) {
    selected.liveCellId = options.liveCellId;
  }

  if (options.autoImported) {
    selected.autoImported = true;
  }
  if (options.temporary) {
    selected.temporary = true;
  }

  return selected;
}

function removeChampion(side, championId) {
  if (isInteractionLocked()) {
    return;
  }

  state[side] = state[side].filter((champion) => champion.id !== championId);
  if (side === "enemies") {
    applyAutomaticEnemyRoleAssignments();
  }
  closeBuildSuggestionModal();
  clearStatus();
  renderAll();
}

function findChampionForResult(result) {
  const resultKey = String(getResultKey(result) || "");
  const resultName = normalizeText(getResultName(result));

  return (
    state.championByKey.get(resultKey) ||
    state.championByName.get(resultName) ||
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

function assignEnemyRole(championId, role) {
  if (isInteractionLocked()) {
    return;
  }

  state.enemies = resolveEnemyRoleSelection(
    state.enemies,
    championId,
    role,
  );
  closeBuildSuggestionModal();
  clearStatus();
  renderAll();
}

function applyAutomaticEnemyRoleAssignments() {
  state.enemies = assignEnemyRoles(
    state.enemies,
    getCachedAllyRoleLikelihoodsByChampionKey(),
  );
}

async function ensureEnemyRoleAssignmentsLoaded() {
  if (state.enemies.length === 0) {
    return;
  }

  try {
    await ensureAllyRoleLikelihoodsLoaded(state.rankFilter);
  } catch (_error) {
    // Stable fallback roles keep the draft usable if lane likelihoods are unavailable.
  }

  applyAutomaticEnemyRoleAssignments();
  renderPicker("enemies");
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
  state.autoImport.message = "Looking for an active League draft or game...";
  state.banSuggestions = reconcileBanSuggestionState(state.banSuggestions, {
    active: false,
  });
  renderActionState();
  renderAutoImportBanner();
  renderBanSuggestions();

  await pollLiveDraftImport();
}

async function pollLiveDraftImport() {
  if (!state.autoImport.requested || state.autoImport.polling || state.shuttingDown) {
    return;
  }

  state.autoImport.lastPollStartedAt = Date.now();
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

    await handleLiveDraftImportPayload(payload);
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

async function pollLiveDraftStatus() {
  if (
    !state.autoImport.requested ||
    state.autoImport.source !== "live_game" ||
    state.autoImport.statusPolling ||
    state.shuttingDown
  ) {
    return;
  }

  state.autoImport.statusPolling = true;
  let requiresFullPoll = false;

  try {
    const response = await fetch("/live-draft?statusOnly=1", {
      cache: "no-store",
    });
    const payload = await parseJsonSafely(response);
    const nextSessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";
    const sessionChanged = Boolean(
      nextSessionId &&
      state.autoImport.sessionId &&
      nextSessionId !== state.autoImport.sessionId,
    );

    requiresFullPoll =
      !response.ok ||
      payload?.status !== "active" ||
      payload?.source !== "live_game" ||
      sessionChanged;
  } catch (_error) {
    requiresFullPoll = true;
  } finally {
    state.autoImport.statusPolling = false;
  }

  if (requiresFullPoll && !state.autoImport.polling) {
    stopAutoImportPolling();
    await pollLiveDraftImport();
    return;
  }

  scheduleAutoImportStatusPoll();
}

async function handleLiveDraftImportPayload(payload) {
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
  state.autoImport.source = ["champ_select", "transition", "live_game"].includes(
    payload.source,
  )
    ? payload.source
    : "champ_select";
  state.autoImport.message =
    payload.message || "Champion picks are automatically being imported from the League Client.";
  state.autoImport.champSelectPhase =
    typeof payload.champSelectPhase === "string" ? payload.champSelectPhase : "unknown";
  state.autoImport.allyHovers = Array.isArray(payload.allyHovers) ? payload.allyHovers : [];
  state.autoImport.unavailableChampionKeys = Array.isArray(payload.unavailableChampionKeys)
    ? payload.unavailableChampionKeys
    : [];
  state.autoImport.sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  state.autoImport.assignedRole = normalizeRole(payload.assignedRole) || "";
  state.autoImport.queueDescription =
    typeof payload?.queue?.description === "string" ? payload.queue.description : "";
  state.autoImport.lastUpdatedAt =
    typeof payload.fetchedAt === "string" ? payload.fetchedAt : new Date().toISOString();
  syncBanSuggestions();

  let shouldRefreshSuggestions = false;
  if (state.autoImport.source === "transition") {
    return;
  }

  const nextSignature = buildLiveDraftSignature(payload);
  if (state.autoImport.source === "live_game") {
    applyLiveGameState(payload);
    const snapshotComplete = state.liveGame.latestRosterComplete === true;
    shouldRefreshSuggestions = applyLiveDraftImport(payload, {
      preserveMissing: !snapshotComplete,
      source: "live_game",
    });
    state.autoImport.lastAppliedSignature = nextSignature;
    await ensureEnemyRoleAssignmentsLoaded();
    await refreshBuildSuggestionAutomaticFilter();
  } else {
    state.liveGame = createInitialLiveGameState();
    if (nextSignature && nextSignature !== state.autoImport.lastAppliedSignature) {
      shouldRefreshSuggestions = applyLiveDraftImport(payload, {
        source: "champ_select",
      });
      state.autoImport.lastAppliedSignature = nextSignature;
      await ensureEnemyRoleAssignmentsLoaded();
    }
  }

  const assignedRole = getAutoImportSuggestedRole();
  if (assignedRole) {
    state.selectedResultRole = assignedRole;
    const currentBundle = getCurrentResultsBundle();
    if (currentBundle?.roles?.includes(assignedRole)) {
      currentBundle.selectedRole = assignedRole;
    }
  }

  if (shouldRefreshSuggestions) {
    await refreshAutoImportSuggestions();
  }
}

function applyLiveGameState(payload) {
  state.liveGame = reconcileLiveGameState(state.liveGame, payload, { normalizeRole });
}

async function refreshBuildSuggestionAutomaticFilter() {
  const modalState = state.buildSuggestionModal;
  if (!modalState.open) {
    return;
  }

  const ally = state.allies.find((entry) => entry.id === modalState.allyId) || null;
  if (!ally) {
    closeBuildSuggestionModal();
    return;
  }

  modalState.enemies = state.enemies.map((enemy) => ({ ...enemy }));
  const automaticFilter = resolveCurrentAutomaticBuildCounterFilter(
    ally,
    modalState.enemies,
  );
  modalState.selectedCounterChampionKeys = automaticFilter.selectedChampionKeys;
  modalState.counterFilterMode = "automatic";
  modalState.automaticFilterApplied = automaticFilter.applied;
  modalState.automaticFilterReason = automaticFilter.reason;
  await loadBuildSuggestionForCurrentCounterFilter();
}

function syncBanSuggestions() {
  state.banSuggestions = reconcileBanSuggestionState(state.banSuggestions, {
    active: state.autoImport.active,
    champSelectPhase: state.autoImport.champSelectPhase,
    hovers: state.autoImport.allyHovers,
    rankFilter: state.rankFilter,
    sessionId: state.autoImport.sessionId,
    unavailableChampionKeys: state.autoImport.unavailableChampionKeys,
  });
  renderBanSuggestions();

  if (!state.banSuggestions.visible || !state.banSuggestions.loading) {
    return;
  }

  const key = state.banSuggestions.activeKey;
  const requestVersion = state.banSuggestions.requestVersion;
  const requestIdentity = [
    state.autoImport.sessionId,
    key,
    requestVersion,
  ].join("|");
  if (state.banSuggestionRequestsByKey[requestIdentity]) {
    return;
  }

  const requestPromise = (async () => {
    try {
      const { response, payload: suggestionPayload } = await postJson("/ban-suggestions", {
        rankFilter: state.rankFilter,
        hovers: state.autoImport.allyHovers.map((hover) => ({
          champion: hover.champion,
          role: hover.role,
        })),
        unavailableChampionKeys: state.banSuggestions.unavailableChampionKeys,
      });
      updateLolalyticsRequestStats(suggestionPayload?.requestStats);
      if (!response.ok) {
        throw new Error(
          suggestionPayload.error || "Failed to load ban recommendations.",
        );
      }

      state.banSuggestions = completeBanSuggestionRequest(state.banSuggestions, {
        key,
        payload: suggestionPayload,
        requestVersion,
      });
    } catch (error) {
      state.banSuggestions = failBanSuggestionRequest(state.banSuggestions, {
        error: error.message || "Failed to load ban recommendations.",
        key,
        requestVersion,
      });
    } finally {
      delete state.banSuggestionRequestsByKey[requestIdentity];
      renderBanSuggestions();
      renderResultsRequestStat();
    }
  })();

  state.banSuggestionRequestsByKey[requestIdentity] = requestPromise;
}

async function refreshAutoImportSuggestions() {
  if (!state.autoImport.active || state.shuttingDown) {
    return;
  }

  await handleFetchSuggestions();
}

function applyLiveDraftImport(
  payload,
  { preserveMissing = false, source = "champ_select" } = {},
) {
  const previousSuggestionCacheKey = getCurrentSuggestionCacheKey();
  const liveAllies = normalizeLiveDraftSelections(payload.allies, "allies", { source });
  const liveEnemies = normalizeLiveDraftSelections(payload.enemies, "enemies", { source });
  const liveAllyKeys = new Set(liveAllies.map((ally) => String(ally.key)));
  const liveEnemyKeys = new Set(liveEnemies.map((enemy) => String(enemy.key)));

  if (source === "live_game" && !preserveMissing) {
    state.allies = reconcileCompleteLiveGameSelections(
      state.allies,
      liveAllies,
      "allies",
    );
    state.enemies = reconcileCompleteLiveGameSelections(
      state.enemies,
      liveEnemies,
      "enemies",
    );
  } else {
    if (!preserveMissing) {
      state.allies = removeStaleAutoImportedSelections(state.allies, liveAllies);
      state.enemies = removeStaleAutoImportedSelections(state.enemies, liveEnemies);
    }
    state.enemies = state.enemies.filter((enemy) => !liveAllyKeys.has(String(enemy.key)));
    state.allies = state.allies.filter((ally) => !liveEnemyKeys.has(String(ally.key)));

    liveAllies.forEach((liveAlly) => upsertLiveDraftSelection("allies", liveAlly, liveAllyKeys));
    liveEnemies.forEach((liveEnemy) => upsertLiveDraftSelection("enemies", liveEnemy, liveEnemyKeys));
  }

  state.allies = trimLiveDraftSelectionsToLimit(state.allies, limits.allies);
  state.enemies = trimLiveDraftSelectionsToLimit(state.enemies, limits.enemies);
  clearManualRolesConflictingWithLiveRoles();
  const nextSuggestionCacheKey = getCurrentSuggestionCacheKey();
  const didChangeSuggestionDraft = nextSuggestionCacheKey !== previousSuggestionCacheKey;
  if (didChangeSuggestionDraft) {
    closeBuildSuggestionModal();
  }

  return didChangeSuggestionDraft;
}

function normalizeLiveDraftSelections(entries = [], side, { source = "champ_select" } = {}) {
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

    const champion = state.championByKey.get(championKey);
    if (!champion) {
      continue;
    }

    const selection = createSelectedChampion(champion, side, {
      autoImported: true,
      liveCellId: Number.isInteger(Number(entry.cellId)) ? Number(entry.cellId) : null,
      temporary: Boolean(entry.temporary),
    });
    if (side === "allies" || source === "live_game") {
      selection.role = normalizeRole(entry.role) || "";
    }
    if (source === "live_game") {
      const buildGold = Number(entry.buildGold);
      selection.liveGameParticipant = true;
      selection.buildGold = Number.isFinite(buildGold) && buildGold >= 0 ? buildGold : 0;
      selection.buildGoldRank = normalizeBuildGoldRank(entry.buildGoldRank);
      selection.hasCompletedFirstItem =
        typeof entry.hasCompletedFirstItem === "boolean"
          ? entry.hasCompletedFirstItem
          : null;
      if (side === "enemies") {
        selection.roleAutoImported = Boolean(selection.role);
        selection.roleManuallyAssigned = false;
      }
    }

    seenChampionKeys.add(championKey);
    selections.push(selection);
  }

  return selections;
}

function reconcileCompleteLiveGameSelections(currentSelections, liveSelections, side) {
  return liveSelections.map((liveSelection) => {
    const currentSelection = currentSelections.find(
      (selection) => String(selection.key) === String(liveSelection.key),
    );
    const nextSelection = {
      ...(currentSelection || {}),
      ...liveSelection,
    };

    nextSelection.role = liveSelection.role || currentSelection?.role || "";
    if (side === "enemies") {
      nextSelection.roleAutoImported = Boolean(liveSelection.role);
      nextSelection.roleManuallyAssigned = false;
    }

    return nextSelection;
  });
}

function removeStaleAutoImportedSelections(selections, liveSelections) {
  const liveCellIds = new Set(
    liveSelections
      .map((selection) => selection.liveCellId)
      .filter((liveCellId) => liveCellId != null),
  );
  const liveChampionKeys = new Set(liveSelections.map((selection) => String(selection.key)));

  return selections.filter((selection) => {
    if (!selection.autoImported) {
      return true;
    }

    if (selection.liveCellId != null) {
      return liveCellIds.has(selection.liveCellId);
    }

    return liveChampionKeys.has(String(selection.key));
  });
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
    } else if (liveSelection.liveGameParticipant) {
      nextSelection.role = liveSelection.role || selections[targetIndex].role || "";
      nextSelection.roleAutoImported = Boolean(liveSelection.role);
      nextSelection.roleManuallyAssigned = false;
    } else {
      const isSameChampion =
        String(selections[targetIndex].key) === String(liveSelection.key);
      nextSelection.role = isSameChampion ? selections[targetIndex].role || "" : "";
      nextSelection.roleManuallyAssigned =
        isSameChampion && Boolean(selections[targetIndex].roleManuallyAssigned);
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
  state.autoImport.allyHovers = [];
  state.autoImport.assignedRole = "";
  state.autoImport.champSelectPhase = "unknown";
  state.autoImport.queueDescription = "";
  state.autoImport.source = "";
  state.autoImport.lastUpdatedAt = new Date().toISOString();
  state.autoImport.reason = reason;
  state.autoImport.sessionId = "";
  state.autoImport.unavailableChampionKeys = [];
  state.liveGame = createInitialLiveGameState();
  if (state.buildSuggestionModal.open) {
    state.buildSuggestionModal.selectedCounterChampionKeys =
      state.buildSuggestionModal.enemies.map((enemy) => String(enemy.key));
    state.buildSuggestionModal.counterFilterMode = "automatic";
    state.buildSuggestionModal.automaticFilterApplied = false;
    state.buildSuggestionModal.automaticFilterReason = "";
    void loadBuildSuggestionForCurrentCounterFilter();
  }
  state.banSuggestions = reconcileBanSuggestionState(state.banSuggestions, {
    active: false,
  });
  renderBanSuggestions();
}

function scheduleAutoImportPoll() {
  stopAutoImportPolling();
  if (!state.autoImport.requested || state.autoImport.status !== "active" || state.shuttingDown) {
    return;
  }

  const useLiveGameCadence =
    state.autoImport.source === "live_game" && state.liveGame.rosterComplete;
  const intervalMs = useLiveGameCadence
    ? LIVE_GAME_POLL_INTERVAL_MS
    : AUTO_IMPORT_POLL_INTERVAL_MS;
  const elapsedMs =
    useLiveGameCadence && state.autoImport.lastPollStartedAt > 0
      ? Date.now() - state.autoImport.lastPollStartedAt
      : 0;
  const delayMs = Math.max(250, intervalMs - elapsedMs);

  state.autoImport.timerId = window.setTimeout(pollLiveDraftImport, delayMs);
  if (useLiveGameCadence) {
    scheduleAutoImportStatusPoll();
  }
}

function scheduleAutoImportStatusPoll() {
  stopAutoImportStatusPolling();
  if (
    !state.autoImport.requested ||
    state.autoImport.source !== "live_game" ||
    !state.liveGame.rosterComplete ||
    state.shuttingDown
  ) {
    return;
  }

  state.autoImport.statusTimerId = window.setTimeout(
    pollLiveDraftStatus,
    AUTO_IMPORT_POLL_INTERVAL_MS,
  );
}

function stopAutoImportPolling() {
  if (state.autoImport.timerId) {
    window.clearTimeout(state.autoImport.timerId);
    state.autoImport.timerId = null;
  }

  stopAutoImportStatusPolling();
}

function stopAutoImportStatusPolling() {
  if (!state.autoImport.statusTimerId) {
    return;
  }

  window.clearTimeout(state.autoImport.statusTimerId);
  state.autoImport.statusTimerId = null;
}

async function handleFetchSuggestions() {
  if (isInteractionLocked()) {
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

  try {
    const rankFilter = state.rankFilter;
    const allies = [...state.allies];
    const enemies = [...state.enemies];
    const allySelections = buildAllyRequestSelections();
    const enemyRequestSelections = buildEnemyRequestSelections();
    const canShareOneResultAcrossWeights = enemies.length === 0;
    const requestedLaneWeights = canShareOneResultAcrossWeights
      ? [state.laneOpponentWeight]
      : LANE_OPPONENT_WEIGHTS;
    const outcomes = await Promise.all(
      requestedLaneWeights.map(async (laneOpponentWeight) => {
        try {
          const { response, payload } = await postJson("/suggest", {
            rankFilter,
            laneOpponentWeight,
            allies: allySelections,
            enemies: enemyRequestSelections,
          });
          updateLolalyticsRequestStats(payload?.requestStats);
          if (!response.ok) {
            throw new Error(
              payload.error ||
                `Failed to fetch ${getRankFilterDisplayLabel().toLowerCase()} role suggestions.`,
            );
          }

          return { laneOpponentWeight, payload, error: "" };
        } catch (error) {
          return {
            laneOpponentWeight,
            payload: null,
            error:
              error.message ||
              `Failed to fetch ${getRankFilterDisplayLabel().toLowerCase()} role suggestions.`,
          };
        }
      }),
    );
    const successfulOutcomes = outcomes.filter((outcome) => outcome.payload);
    const selectedRole = syncSelectedResultRole();

    successfulOutcomes.forEach((outcome) => {
      const weightsToCache = canShareOneResultAcrossWeights
        ? LANE_OPPONENT_WEIGHTS
        : [outcome.laneOpponentWeight];
      weightsToCache.forEach((laneOpponentWeight) => {
        const variantCacheKey = buildSuggestionCacheKey(
          rankFilter,
          allies,
          enemies,
          laneOpponentWeight,
        );
        state.resultsCache[variantCacheKey] = buildResultsBundle(
          outcome.payload,
          availableRoleValues,
          selectedRole,
        );
      });
    });

    const activeOutcome = outcomes.find(
      (outcome) => outcome.laneOpponentWeight === state.laneOpponentWeight,
    );
    if (!state.resultsCache[cacheKey]) {
      throw new Error(
        activeOutcome?.error ||
          `Failed to fetch ${getRankFilterDisplayLabel().toLowerCase()} role suggestions.`,
      );
    }

    const failedWeights = outcomes
      .filter((outcome) => outcome.error)
      .map((outcome) => `×${outcome.laneOpponentWeight}`);
    if (failedWeights.length > 0) {
      setError(`Could not cache Lane Weight ${formatList(failedWeights)}. Retry to load them.`);
    }
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

  try {
    const { response, payload } = await postJson("/draft-outlook", {
      rankFilter: state.rankFilter,
      allies: buildAllyRequestSelections(),
      enemies: buildEnemyRequestSelections(),
    });
    updateLolalyticsRequestStats(payload?.requestStats);
    if (!response.ok) {
      throw new Error(payload.error || "Failed to project the current draft win rates.");
    }

    state.resultsCache[cacheKey] = buildDraftProjectionBundle(payload);
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
  selectResultRole(DEFAULT_TARGET_ROLE);
  state.autoImport.lastAppliedSignature = "";
  pickers.allies.input.value = "";
  pickers.enemies.input.value = "";
  closeBuildSuggestionModal();
  clearStatus();
  renderAll();
}

function handleSkillLevelChange(event) {
  state.skillLevelSortMode = normalizeSkillLevelSortMode(event.target.value);
  renderResults();
}

function handleResultSortModeChange(value) {
  state.resultSortMode = normalizeResultSortMode(value);
  renderResultsPreservingScrollPosition();
}

function handleFirstPickSortModeChange(value) {
  state.firstPickSortMode = normalizeFirstPickSortMode(value);
  renderResultsPreservingScrollPosition();
}

function renderResultsPreservingScrollPosition() {
  const scrollLeft = window.scrollX;
  const scrollTop = window.scrollY;

  renderResults();
  window.scrollTo(scrollLeft, scrollTop);
}

function handleRankFilterChange(event) {
  const normalizedRankFilter = normalizeRankFilter(event.target.value) || DEFAULT_RANK_FILTER;
  if (normalizedRankFilter === state.rankFilter) {
    return;
  }

  state.rankFilter = normalizedRankFilter;
  closeBuildSuggestionModal();
  clearStatus();
  syncBanSuggestions();
  renderAll();
  void ensureEnemyRoleAssignmentsLoaded();
}

function handleLaneOpponentWeightChange(event) {
  const normalizedWeight =
    normalizeLaneOpponentWeight(event.target.value) || DEFAULT_LANE_OPPONENT_WEIGHT;
  if (normalizedWeight === state.laneOpponentWeight) {
    return;
  }

  state.laneOpponentWeight = normalizedWeight;
  const currentBundle = getCurrentResultsBundle();
  if (currentBundle) {
    currentBundle.selectedRole = state.selectedResultRole;
  }
  clearStatus();
  renderAll();
}

function handleResultsRoleChange(event) {
  const normalizedRole = normalizeRole(event.target.value) || DEFAULT_TARGET_ROLE;
  if (normalizedRole === state.selectedResultRole) {
    return;
  }

  selectResultRole(normalizedRole);

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
  renderAll();

  try {
    const { response, payload } = await postJson("/shutdown", null, {
      contentType: null,
      headers: {
        "x-shutdown-token": state.shutdownToken,
      },
    });
    if (!response.ok) {
      throw new Error(payload.error || "Failed to stop the app.");
    }
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
  const displayedAlly = ally ? mergeLiveGameParticipant(ally) : null;
  const payload = modalState.payload;
  const preservedScrollTop = modalState.open ? buildSuggestionScroll.scrollTop : 0;

  buildSuggestionModal.classList.toggle("hidden", !modalState.open);
  buildSuggestionModal.setAttribute("aria-hidden", modalState.open ? "false" : "true");
  const counterFilterOrientation = normalizeBuildCounterFilterOrientation(
    modalState.counterFilterOrientation,
  );
  const counterFilterIsVertical =
    counterFilterOrientation === VERTICAL_BUILD_COUNTER_FILTER_ORIENTATION;
  const counterFilterOrientationTarget = counterFilterIsVertical
    ? DEFAULT_BUILD_COUNTER_FILTER_ORIENTATION
    : VERTICAL_BUILD_COUNTER_FILTER_ORIENTATION;
  const counterFilterOrientationLabel =
    `Switch counter filter to ${counterFilterOrientationTarget} orientation`;
  buildSuggestionCounterFilter.classList.toggle(
    "build-counter-filter--vertical",
    counterFilterIsVertical,
  );
  buildSuggestionCounterFilterSticky.classList.toggle(
    "build-counter-filter-sticky--vertical",
    counterFilterIsVertical,
  );
  buildSuggestionCounterFilterOrientationButton.classList.toggle(
    "build-counter-filter-orientation-toggle--vertical",
    counterFilterIsVertical,
  );
  buildSuggestionCounterFilterOrientationButton.setAttribute(
    "aria-label",
    counterFilterOrientationLabel,
  );
  buildSuggestionCounterFilterOrientationButton.title = counterFilterOrientationLabel;
  buildSuggestionCounterFilterOrientationButton.disabled = state.shuttingDown;

  if (!modalState.open) {
    buildSuggestionChampionPortrait.classList.add("hidden");
    buildSuggestionChampionIcon.src = "";
    buildSuggestionChampionIcon.alt = "";
    buildSuggestionChampionPortrait.removeAttribute("title");
    buildSuggestionChampionRank.classList.add("hidden");
    buildSuggestionChampionRank.textContent = "";
    buildSuggestionTitle.textContent = "Build Recommendation";
    buildSuggestionMeta.textContent = "";
    buildSuggestionTabs.innerHTML = "";
    buildSuggestionErrors.innerHTML = "";
    buildSuggestionBody.innerHTML = "";
    buildSuggestionCounterFilter.innerHTML = "";
    buildSuggestionBody.classList.remove("build-modal-body--refreshing");
    buildSuggestionBody.removeAttribute("aria-busy");
    buildSuggestionScroll.scrollTop = 0;
    return;
  }

  if (displayedAlly?.icon) {
    const rank = getVisibleBuildGoldRank(displayedAlly);
    const rankDescription = getBuildGoldRankDescription(displayedAlly);
    buildSuggestionChampionPortrait.classList.remove("hidden");
    buildSuggestionChampionIcon.src = displayedAlly.icon;
    buildSuggestionChampionIcon.alt = rankDescription
      ? `${displayedAlly.name}, ${rankDescription}`
      : displayedAlly.name;
    if (rank) {
      buildSuggestionChampionRank.classList.remove("hidden");
      buildSuggestionChampionRank.textContent = String(rank);
      buildSuggestionChampionPortrait.title = rankDescription;
    } else {
      buildSuggestionChampionRank.classList.add("hidden");
      buildSuggestionChampionRank.textContent = "";
      buildSuggestionChampionPortrait.removeAttribute("title");
    }
  } else {
    buildSuggestionChampionPortrait.classList.add("hidden");
    buildSuggestionChampionIcon.src = "";
    buildSuggestionChampionIcon.alt = "";
    buildSuggestionChampionPortrait.removeAttribute("title");
    buildSuggestionChampionRank.classList.add("hidden");
    buildSuggestionChampionRank.textContent = "";
  }

  buildSuggestionTitle.textContent = ally
    ? [ally.name, ally.role ? getRoleLabel(ally.role) : "", "Build Recommendation"]
        .filter(Boolean)
        .join(" ")
    : "Build Recommendation";
  renderBuildSuggestionCounterFilter(modalState);
  buildSuggestionMeta.textContent = buildBuildSuggestionMetaText(
    ally,
    payload,
    getBuildSuggestionFilteredEnemies(modalState).length,
  );
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
  const isRefreshingExistingPayload = modalState.loading && Boolean(payload);
  buildSuggestionBody.classList.toggle(
    "build-modal-body--refreshing",
    isRefreshingExistingPayload,
  );
  buildSuggestionBody.setAttribute("aria-busy", modalState.loading ? "true" : "false");
  if (!isRefreshingExistingPayload) {
    buildSuggestionBody.innerHTML = modalState.loading && !payload
      ? '<div class="build-empty-state">Fetching build recommendations from Lolalytics...</div>'
      : modalState.error && !payload
        ? '<div class="build-empty-state">The build recommendation request failed.</div>'
        : renderBuildSuggestionBody(payload, modalState.activeTab, {
            itemRecommendationScopes: modalState.itemRecommendationScopes,
            runeRecommendationScopes: modalState.runeRecommendationScopes,
            runeImportStatesByPageKey: modalState.runeImportStatesByPageKey,
          });
    if (payload && !modalState.loading) {
      wireBuildSuggestionItemScopeButtons();
      wireBuildSuggestionRuneScopeButtons();
      wireBuildSuggestionRuneImportButtons(payload);
    }
  }
  buildSuggestionScroll.scrollTop = preservedScrollTop;
  buildSuggestionDialog.scrollTop = 0;
}

function renderBuildSuggestionCounterFilter(modalState) {
  const enemies = Array.isArray(modalState.enemies)
    ? modalState.enemies.map(mergeLiveGameParticipant)
    : [];
  const liveGameVisibility = {
    liveGameActive: state.liveGame.active,
    liveGameComplete: state.liveGame.complete,
  };
  const highestRankedEnemyChampionKey = resolveHighestRankedEnemyChampionKey(
    enemies,
    liveGameVisibility,
  );
  const buildGoldScoreboard = resolveBuildGoldScoreboard(
    state.allies.map(getLiveGameParticipant),
    state.enemies.map(getLiveGameParticipant),
    liveGameVisibility,
  );
  const allyBuildGold = formatBuildGoldThousands(buildGoldScoreboard.allyBuildGold);
  const enemyBuildGold = formatBuildGoldThousands(buildGoldScoreboard.enemyBuildGold);
  const buildGoldScoreboardLabel = buildGoldScoreboard.available
    ? `Team build gold. Enemies ${enemyBuildGold}; allies ${allyBuildGold}.`
    : `Team build gold unavailable. Enemies ${enemyBuildGold}; allies ${allyBuildGold}.`;
  const availableKeys = enemies.map((enemy) => String(enemy.key));
  const availableKeySet = new Set(availableKeys);
  const selectedKeys = new Set(
    modalState.selectedCounterChampionKeys
      .map((key) => String(key))
      .filter((key) => availableKeySet.has(key)),
  );
  if (selectedKeys.size === 0) {
    availableKeys.forEach((key) => selectedKeys.add(key));
  }
  const hasExcludedEnemies = selectedKeys.size < availableKeys.length;

  const automaticLabel =
    modalState.counterFilterMode === "automatic" && modalState.automaticFilterApplied
      ? modalState.automaticFilterReason === "lane"
        ? " · Live Lane"
        : modalState.automaticFilterReason === "top-half"
          ? " · Live Top 5"
          : ""
      : "";

  buildSuggestionCounterFilter.innerHTML = `
    <span class="build-counter-filter-label">Counter Filter${automaticLabel}</span>
    <div class="build-counter-filter-controls">
      <div class="build-counter-filter-portraits">
        <button
          type="button"
          class="build-counter-filter-clear"
          aria-label="Clear counter filter"
          title="${hasExcludedEnemies ? "Include all enemies" : "All enemies are already included"}"
          ${state.shuttingDown || !hasExcludedEnemies ? "disabled" : ""}
        >
          <span aria-hidden="true">&times;</span>
        </button>
        ${enemies
          .map((enemy) => {
            const championKey = String(enemy.key);
            const isSelected = selectedKeys.has(championKey);
            const isExcluded = !isSelected;
            const rank = getVisibleBuildGoldRank(enemy);
            const rankDescription = getBuildGoldRankDescription(enemy);
            const isHighestRankedEnemy =
              championKey === highestRankedEnemyChampionKey;
            const highestRankedEnemyDescription = isHighestRankedEnemy
              ? "Highest enemy build gold"
              : "";
            const buildGoldDescription = [
              rankDescription,
              highestRankedEnemyDescription,
            ].filter(Boolean).join(". ");
            const toggleDescription = isSelected
              ? `Remove ${enemy.name} from the counter filter`
              : `Add ${enemy.name} to the counter filter`;
            return `
              <button
                type="button"
                class="build-counter-filter-champion${
                  isSelected ? " build-counter-filter-champion--selected" : ""
                }${isExcluded ? " build-counter-filter-champion--excluded" : ""}${
                  isHighestRankedEnemy
                    ? " build-counter-filter-champion--highest-build-gold"
                    : ""
                }"
                data-counter-champion-key="${escapeHtml(championKey)}"
                aria-label="${escapeHtml(
                  buildGoldDescription
                    ? `${toggleDescription}. ${buildGoldDescription}`
                    : toggleDescription,
                )}"
                aria-pressed="${isSelected ? "true" : "false"}"
                title="${escapeHtml(
                  [enemy.name, rankDescription, highestRankedEnemyDescription]
                    .filter(Boolean)
                    .join(" · "),
                )}"
                ${state.shuttingDown ? "disabled" : ""}
              >
                <img src="${enemy.icon}" alt="" width="36" height="36" />
                ${
                  rank
                    ? `<span class="build-gold-rank-badge" aria-hidden="true">${rank}</span>`
                    : ""
                }
              </button>
            `;
          })
          .join("")}
      </div>
      <div
        class="build-team-gold-scoreboard${
          buildGoldScoreboard.available ? "" : " build-team-gold-scoreboard--unavailable"
        }"
        role="group"
        aria-label="${escapeHtml(buildGoldScoreboardLabel)}"
        title="${escapeHtml(buildGoldScoreboardLabel)}"
      >
        <span class="build-team-gold-value build-team-gold-value--enemy" aria-hidden="true">${enemyBuildGold}</span>
        <span class="build-team-gold-divider" aria-hidden="true">:</span>
        <span class="build-team-gold-value build-team-gold-value--ally" aria-hidden="true">${allyBuildGold}</span>
        <span class="build-team-gold-coin" aria-hidden="true">G</span>
      </div>
    </div>
  `;

  buildSuggestionCounterFilter
    .querySelectorAll("[data-counter-champion-key]")
    .forEach((button) => {
      button.addEventListener("click", () =>
        handleBuildCounterFilterToggle(button.dataset.counterChampionKey),
      );
    });
  const clearButton = buildSuggestionCounterFilter.querySelector(
    ".build-counter-filter-clear",
  );
  if (clearButton) {
    clearButton.addEventListener("click", handleClearBuildCounterFilter);
  }
}

function wireBuildSuggestionItemScopeButtons() {
  buildSuggestionBody.querySelectorAll("[data-item-scope-tone]").forEach((button) => {
    button.addEventListener("click", () => {
      const recommendationKey =
        button.dataset.itemScopeTone === "highest-win" ? "highestWin" : "mostPicked";
      const currentScope = normalizeItemRecommendationScope(
        state.buildSuggestionModal.itemRecommendationScopes?.[recommendationKey],
      );
      const nextScope =
        currentScope === LANE_OPPONENT_ITEM_RECOMMENDATION_SCOPE
          ? DEFAULT_ITEM_RECOMMENDATION_SCOPE
          : LANE_OPPONENT_ITEM_RECOMMENDATION_SCOPE;

      state.buildSuggestionModal.itemRecommendationScopes = {
        ...state.buildSuggestionModal.itemRecommendationScopes,
        [recommendationKey]: nextScope,
      };
      renderBuildSuggestionModal();
    });
  });
}

function wireBuildSuggestionRuneScopeButtons() {
  buildSuggestionBody.querySelectorAll("[data-rune-scope-tone]").forEach((button) => {
    button.addEventListener("click", () => {
      const recommendationKey =
        button.dataset.runeScopeTone === "highest-win" ? "highestWin" : "mostPicked";
      const currentScope = normalizeRuneRecommendationScope(
        state.buildSuggestionModal.runeRecommendationScopes?.[recommendationKey],
      );
      const nextScope =
        currentScope === LANE_OPPONENT_RUNE_RECOMMENDATION_SCOPE
          ? DEFAULT_RUNE_RECOMMENDATION_SCOPE
          : LANE_OPPONENT_RUNE_RECOMMENDATION_SCOPE;

      state.buildSuggestionModal.runeRecommendationScopes = {
        ...state.buildSuggestionModal.runeRecommendationScopes,
        [recommendationKey]: nextScope,
      };
      renderBuildSuggestionModal();
    });
  });
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

  const requestKey = modalState.requestKey;
  setBuildSuggestionRuneImportState(pageKey, {
    status: "importing",
    message: "Importing runes into the League Client...",
  });

  try {
    const { response, payload: importPayload } = await postJson("/rune-import", {
      champion: ally.name,
      page,
    });
    if (!response.ok || importPayload?.status !== "imported") {
      throw new Error(
        importPayload?.message ||
          importPayload?.error ||
          "Failed to import runes into the League Client.",
      );
    }

    if (!isCurrentBuildSuggestionRuneImportTarget(requestKey, pageKey)) {
      return;
    }

    setBuildSuggestionRuneImportState(pageKey, {
      status: "success",
      message: importPayload.message || "Imported runes into the League Client.",
    });
  } catch (error) {
    if (!isCurrentBuildSuggestionRuneImportTarget(requestKey, pageKey)) {
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
  const recommendations = [
    ...getRecommendedRunePages(
      payload?.runes?.highestWinPage,
      payload?.runes?.mostPickedPage,
    ),
    ...getRecommendedRunePages(
      payload?.runes?.laneOpponents?.highestWinPage,
      payload?.runes?.laneOpponents?.mostPickedPage,
    ),
  ];

  return recommendations.find((page) => getRunePageRecommendationKey(page) === pageKey) || null;
}

function isCurrentBuildSuggestionRuneImportTarget(requestKey, pageKey) {
  return (
    state.buildSuggestionModal.open &&
    state.buildSuggestionModal.requestKey === requestKey &&
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

function buildBuildSuggestionMetaText(ally, payload, filteredEnemyCount = 0) {
  const parts = [];
  const payloadEnemyCount = Number(payload?.summary?.enemyCount) || 0;
  const displayedEnemyCount = filteredEnemyCount || payloadEnemyCount;
  const payloadMatchesDisplayedEnemies =
    payloadEnemyCount > 0 && payloadEnemyCount === displayedEnemyCount;

  if (ally?.role) {
    parts.push(getRoleLabel(ally.role));
  }

  parts.push(getRankFilterDisplayLabel());

  if (displayedEnemyCount > 0) {
    parts.push(
      `${displayedEnemyCount} ${displayedEnemyCount === 1 ? "enemy" : "enemies"}`,
    );
  }

  if (payloadMatchesDisplayedEnemies && payload?.summary?.sourceMatchups) {
    parts.push(
      `${payload.summary.sourceMatchups} ${
        payload.summary.sourceMatchups === 1 ? "matchup" : "matchups"
      }`,
    );
  }

  if (payloadMatchesDisplayedEnemies && payload?.summary?.lastUpdatedAt) {
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
  const isFirstPickBundle = currentBundle?.mode === "firstPick";
  const currentMeta = currentBundle?.metaByRole?.[selectedRole] || null;
  const currentResults = currentBundle?.resultsByRole?.[selectedRole] || [];
  const activeDraftSortMode = getActiveDraftSortMode(
    state.resultSortMode,
    state.skillLevelSortMode,
  );
  const visibleResults = sortResults(
    getVisibleResults(currentResults),
    isFirstPickBundle ? state.firstPickSortMode : activeDraftSortMode,
  );
  const topProjectedWinRateKeys = isFirstPickBundle
    ? new Set()
    : getTopResultKeys(
        visibleResults,
        state.skillLevelSortMode,
        DRAFT_TOP_RESULT_LIMIT,
      );
  const topProjectedAgencyKeys = isFirstPickBundle
    ? new Set()
    : getTopResultKeys(
        visibleResults,
        PROJECTED_AGENCY_SORT_MODE,
        DRAFT_TOP_RESULT_LIMIT,
      );
  const topProjectedWinRateKeysAtEverySkillLevel = isFirstPickBundle
    ? new Set()
    : getTopProjectedWinRateKeysAtEverySkillLevel(
        visibleResults,
        DRAFT_TOP_RESULT_LIMIT,
      );

  resultsBody.innerHTML = "";
  partialFailures.innerHTML = "";
  draftProjectionWrap.innerHTML = "";
  renderResultsTableHeader(
    isFirstPickBundle,
    state.skillLevelSortMode,
    state.resultSortMode,
  );
  sortSelect.value = state.skillLevelSortMode;
  sortSelect.disabled =
    state.loading ||
    state.shuttingDown ||
    isDraftProjectionBundle ||
    isFirstPickBundle ||
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
  resultsMeta.textContent = "";

  if (isFirstPickBundle) {
    renderFirstPickRows(visibleResults, selectedRole);
    renderPartialFailures(currentMeta?.partialFailures || []);
    return;
  }

  visibleResults.forEach((result, index) => {
    const resultKey = getResultKey(result) || "";
    const resultName = getResultName(result);
    const liveWinRate = Number(result.winRate);
    const projectedWinRate = getSkillAdjustedProjectedWinRate(
      result,
      state.skillLevelSortMode,
    );
    const projectedAgency = getProjectedAgency(result);
    const isTopProjectedWinRate = topProjectedWinRateKeys.has(resultKey);
    const isTopProjectedAgency = topProjectedAgencyKeys.has(resultKey);
    const isTopProjectedWinRateAtEverySkillLevel =
      topProjectedWinRateKeysAtEverySkillLevel.has(resultKey);
    const topOptionTone = getDraftHighlightTone(
      isTopProjectedAgency,
      isTopProjectedWinRate,
      isTopProjectedWinRateAtEverySkillLevel,
    );
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
      topOptionTone === "overlap",
      "overlap",
    );
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
          </span>
        </div>
      </td>
      <td class="projected-skill-rate ${projectedWinRateClassName}">${formatProjectedRateWithBase(projectedWinRate, liveWinRate)}</td>
      <td class="${projectedAgencyClassName}">
        <div class="result-agency-cell">
          <span class="result-agency-score">${formatAgencyWithBreakdown(projectedAgency, result.synergyScore, result.counterScore)}</span>
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

function renderResultsTableHeader(
  isFirstPickBundle = false,
  skillLevelSortMode = DEFAULT_SORT_MODE,
  resultSortMode = PROJECTED_WIN_RATE_SORT_MODE,
) {
  if (isFirstPickBundle) {
    resultsHeaderRow.innerHTML = `
      <th>Rank</th>
      <th>Champion</th>
      <th>
        <button
          type="button"
          class="${getFirstPickSortButtonClassName(PBI_SORT_MODE)}"
          data-first-pick-sort="${PBI_SORT_MODE}"
          title="Sort by PBI"
          aria-label="Sort by PBI"
        >
          PBI
        </button>
      </th>
      <th>
        <button
          type="button"
          class="${getFirstPickSortButtonClassName(WIN_RATE_SORT_MODE)}"
          data-first-pick-sort="${WIN_RATE_SORT_MODE}"
          title="Sort by base win rate"
          aria-label="Sort by base win rate"
        >
          Base Win Rate
        </button>
      </th>
      <th class="results-action-header" aria-label="Add champion"></th>
    `;
    resultsHeaderRow.querySelectorAll("[data-first-pick-sort]").forEach((button) => {
      button.disabled = state.loading || state.shuttingDown;
      button.addEventListener("click", () =>
        handleFirstPickSortModeChange(button.dataset.firstPickSort),
      );
    });
    return;
  }

  const projectedWinRateColumn = getProjectedWinRateColumn(skillLevelSortMode);

  resultsHeaderRow.innerHTML = `
    <th>Rank</th>
    <th>
      <button
        type="button"
        class="${getResultSortButtonClassName(CHAMPION_SORT_MODE, resultSortMode)}"
        data-result-sort="${CHAMPION_SORT_MODE}"
        title="Sort by champion name"
        aria-label="Sort by champion name"
        aria-pressed="${resultSortMode === CHAMPION_SORT_MODE}"
      >
        Champion
      </button>
    </th>
    <th class="projected-skill-header">
      <button
        type="button"
        class="${getResultSortButtonClassName(PROJECTED_WIN_RATE_SORT_MODE, resultSortMode)}"
        data-result-sort="${PROJECTED_WIN_RATE_SORT_MODE}"
        title="${escapeHtml(projectedWinRateColumn.title)} Sort by this value."
        aria-label="Sort by Projected Win Rate"
        aria-pressed="${resultSortMode === PROJECTED_WIN_RATE_SORT_MODE}"
      >
        Projected Win Rate
      </button>
    </th>
    <th class="projected-agency-header">
      <button
        type="button"
        class="${getResultSortButtonClassName(PROJECTED_AGENCY_SORT_MODE, resultSortMode)}"
        data-result-sort="${PROJECTED_AGENCY_SORT_MODE}"
        title="Sort by Projected Agency"
        aria-label="Sort by Projected Agency, Synergy plus Counter"
        aria-pressed="${resultSortMode === PROJECTED_AGENCY_SORT_MODE}"
      >
        Projected Agency <span class="projected-agency-detail">(Synergy + Counter)</span>
      </button>
    </th>
  `;
  resultsHeaderRow.querySelectorAll("[data-result-sort]").forEach((button) => {
    button.disabled = state.loading || state.shuttingDown;
    button.addEventListener("click", () =>
      handleResultSortModeChange(button.dataset.resultSort),
    );
  });
}

function renderFirstPickRows(visibleResults, selectedRole) {
  const topPbiKeys = getTopResultKeys(
    visibleResults,
    PBI_SORT_MODE,
    DEFAULT_TOP_RESULT_LIMIT,
  );
  const topWinRateKeys = getTopResultKeys(
    visibleResults,
    WIN_RATE_SORT_MODE,
    DEFAULT_TOP_RESULT_LIMIT,
  );

  visibleResults.forEach((result, index) => {
    const resultKey = getResultKey(result) || "";
    const resultName = getResultName(result);
    const isTopPbi = topPbiKeys.has(resultKey);
    const isTopWinRate = topWinRateKeys.has(resultKey);
    const topOptionTone = getFirstPickTopOptionTone(isTopPbi, isTopWinRate);
    const rowClassNames = [];

    if (topOptionTone) {
      rowClassNames.push("top-option", `top-option--${topOptionTone}`);
    }

    const pbiClassName = getMetricClassName(
      [],
      isTopPbi,
      topOptionTone === "overlap" ? "overlap" : "pbi",
    );
    const winRateClassName = getMetricClassName(
      [],
      isTopWinRate,
      topOptionTone === "overlap" ? "overlap" : "winrate",
    );
    const selectForDraftHelperText = getSelectResultForDraftHelperText(selectedRole, result);
    const selectForDraftDescription = selectForDraftHelperText
      ? selectForDraftHelperText
      : `Add ${resultName} to the allied draft as ${getRoleLabel(selectedRole)}.`;
    const selectForDraftDisabled = Boolean(selectForDraftHelperText);

    const row = document.createElement("tr");
    row.className = rowClassNames.join(" ");
    row.innerHTML = `
      <td class="rank-cell">${index + 1}</td>
      <td>
        <div class="support-cell">
          <img src="${result.icon}" alt="${resultName}" width="36" height="36" />
          <span class="support-name">${resultName}</span>
        </div>
      </td>
      <td class="${pbiClassName}">${formatPbi(getPbi(result))}</td>
      <td class="${winRateClassName}">${formatRate(getWinRate(result))}</td>
      <td class="result-action-cell">
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
  const mode = payload?.mode === "firstPick" ? "firstPick" : "suggestions";
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
    mode,
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
    return 'Click "Fetch Suggestions" before adding champions to load first-pick tier lists by role.';
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

function updateLolalyticsRequestStats(requestStats = null) {
  const lifetimeAccessCount = Number(requestStats?.lolalyticsLifetimeAccessCount);
  if (Number.isFinite(lifetimeAccessCount)) {
    state.lolalyticsLifetimeAccessCount = Math.max(
      state.lolalyticsLifetimeAccessCount,
      0,
      lifetimeAccessCount,
    );
    renderResultsRequestStat();
  }
}

function formatLolalyticsAccessStat(accessCount) {
  return `Total Lolalytics live hits since server start: ${Math.max(0, accessCount)}.`;
}

function formatLolalyticsDataWindow(days) {
  const normalizedDays = Math.max(1, Math.round(Number(days) || 30));
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

function renderBanSuggestions() {
  const banState = state.banSuggestions;
  if (!banState.visible) {
    banSuggestions.classList.add("hidden");
    banSuggestionsList.innerHTML = "";
    banSuggestionsStatus.textContent = "";
    return;
  }

  banSuggestions.classList.remove("hidden");
  const roleOptions = getTargetRoleOptions().map((option) => ({
    ...option,
    label: option.value === "bottom" ? "ADC" : option.label,
  }));

  if (banState.loading && !banState.payload) {
    banSuggestionsStatus.textContent = "Ranking counters and PBI fallbacks...";
    banSuggestionsList.innerHTML = roleOptions
      .map(
        (option) => `
          <article class="ban-suggestion">
            <span class="ban-suggestion-role">${escapeHtml(option.label)}</span>
            <p class="ban-suggestion-placeholder">Finding the best ban...</p>
          </article>
        `,
      )
      .join("");
    return;
  }

  if (banState.error) {
    banSuggestionsStatus.textContent = "Ban data unavailable";
    banSuggestionsList.innerHTML = roleOptions
      .map(
        (option) => `
          <article class="ban-suggestion">
            <span class="ban-suggestion-role">${escapeHtml(option.label)}</span>
            <p class="ban-suggestion-placeholder">${escapeHtml(banState.error)}</p>
          </article>
        `,
      )
      .join("");
    return;
  }

  const suggestionsByRole = new Map(
    (Array.isArray(banState.payload?.suggestions) ? banState.payload.suggestions : []).map(
      (suggestion) => [normalizeRole(suggestion?.role), suggestion],
    ),
  );
  const counterCount = Number(banState.payload?.summary?.counterSuggestionCount || 0);
  banSuggestionsStatus.textContent =
    counterCount > 0
      ? `${counterCount} hover ${counterCount === 1 ? "counter" : "counters"}; PBI elsewhere.`
      : "Highest PBI pick for every lane.";
  banSuggestionsList.innerHTML = roleOptions
    .map((option) => renderBanSuggestion(option, suggestionsByRole.get(option.value) || null))
    .join("");
}

function renderBanSuggestion(roleOption, suggestion) {
  if (!suggestion) {
    return `
      <article class="ban-suggestion">
        <span class="ban-suggestion-role">${escapeHtml(roleOption.label)}</span>
        <p class="ban-suggestion-placeholder">Recommendation unavailable.</p>
      </article>
    `;
  }

  const strategyText =
    suggestion.strategy === "counter" && suggestion.hoveredChampion
      ? `Counter to ${suggestion.hoveredChampion}`
      : "Highest PBI for this lane";

  return `
    <article class="ban-suggestion" data-role="${escapeHtml(roleOption.value)}">
      <span class="ban-suggestion-role">${escapeHtml(roleOption.label)}</span>
      <div class="ban-suggestion-champion">
        <img
          src="${escapeHtml(suggestion.icon)}"
          alt="${escapeHtml(suggestion.champion)}"
          width="42"
          height="42"
        />
        <strong title="${escapeHtml(suggestion.champion)}">${escapeHtml(suggestion.champion)}</strong>
      </div>
      <p class="ban-suggestion-reason">${escapeHtml(strategyText)}</p>
    </article>
  `;
}

function buildAutoImportBannerMessage() {
  const parts = [state.autoImport.message].filter(Boolean);

  if (state.autoImport.status === "active") {
    if (state.autoImport.queueDescription) {
      parts.push(`${state.autoImport.queueDescription}.`);
    }

    if (state.autoImport.champSelectPhase === "ban") {
      parts.push("Ban recommendations are active.");
    } else {
      const assignedRole = normalizeRole(state.autoImport.assignedRole);
      if (assignedRole && getAutoImportSuggestedRole()) {
        parts.push(`Showing ${getRoleLabel(assignedRole)} suggestions.`);
      }
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

function formatRate(value) {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }

  return `${Number(value).toFixed(2)}%`;
}

function formatProjectedRateWithBase(projectedWinRate, baseWinRate) {
  return `${formatRate(projectedWinRate)} <span class="metric-detail">(${formatRate(baseWinRate)})</span>`;
}

function formatAgencyWithBreakdown(projectedAgency, synergyScore, counterScore) {
  const numericCounterScore = Number(counterScore || 0);
  const operator = numericCounterScore < 0 ? "-" : "+";

  return `${formatScore(projectedAgency)} <span class="metric-detail">(${formatScore(synergyScore)} ${operator} ${formatScore(Math.abs(numericCounterScore))})</span>`;
}

function formatPbi(value) {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }

  return Number(value).toFixed(0);
}

function isLowWinRate(value) {
  return Number.isFinite(Number(value)) && Number(value) <= MIN_PROJECTED_WIN_RATE;
}

function isNegativeScore(value) {
  return Number.isFinite(Number(value)) && Number(value) < 0;
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

function normalizeSkillLevelSortMode(value) {
  if (
    value === PROJECTED_WIN_RATE_SORT_MODE ||
    value === PROJECTED_WIN_RATE_LOW_SKILL_SORT_MODE ||
    value === PROJECTED_WIN_RATE_HIGH_SKILL_SORT_MODE
  ) {
    return value;
  }

  return DEFAULT_SORT_MODE;
}

function normalizeResultSortMode(value) {
  if (
    value === CHAMPION_SORT_MODE ||
    value === PROJECTED_WIN_RATE_SORT_MODE ||
    value === PROJECTED_AGENCY_SORT_MODE
  ) {
    return value;
  }

  return PROJECTED_WIN_RATE_SORT_MODE;
}

function getActiveDraftSortMode(resultSortMode, skillLevelSortMode) {
  return resultSortMode === PROJECTED_WIN_RATE_SORT_MODE
    ? skillLevelSortMode
    : resultSortMode;
}

function getProjectedWinRateColumn(skillLevelSortMode) {
  if (skillLevelSortMode === PROJECTED_WIN_RATE_LOW_SKILL_SORT_MODE) {
    return {
      label: "Projected Win Rate",
      title:
        "Projected Win Rate minus the Best Worldwide on Champion delta for the selected rank and role.",
    };
  }

  if (skillLevelSortMode === PROJECTED_WIN_RATE_HIGH_SKILL_SORT_MODE) {
    return {
      label: "Projected Win Rate",
      title:
        "Projected Win Rate plus the Best Worldwide on Champion delta for the selected rank and role.",
    };
  }

  return {
    label: "Projected Win Rate",
    title: "Projected Win Rate with no skill adjustment.",
  };
}

function getResultSortButtonClassName(sortMode, activeSortMode) {
  return [
    "results-sort-button",
    activeSortMode === sortMode ? "results-sort-button--active" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeFirstPickSortMode(value) {
  if (value === PBI_SORT_MODE || value === WIN_RATE_SORT_MODE) {
    return value;
  }

  return DEFAULT_FIRST_PICK_SORT_MODE;
}

function getFirstPickTopOptionTone(isTopPbi, isTopWinRate) {
  if (isTopPbi && isTopWinRate) {
    return "overlap";
  }

  if (isTopPbi) {
    return "pbi";
  }

  if (isTopWinRate) {
    return "winrate";
  }

  return "";
}

function getFirstPickSortButtonClassName(sortMode) {
  return [
    "results-sort-button",
    state.firstPickSortMode === sortMode ? "results-sort-button--active" : "",
  ]
    .filter(Boolean)
    .join(" ");
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
  laneOpponentWeightSelect.disabled = state.loading || state.shuttingDown;
  resultsRoleSelect.disabled =
    state.loading || state.shuttingDown || isDraftProjectionMode || availableRoleCount === 0;
  fetchButton.disabled =
    state.loading || state.shuttingDown || (!isDraftProjectionMode && availableRoleCount === 0);
  fetchButton.textContent =
    state.loading ? "Fetching..." : isDraftProjectionMode ? "Who will win?" : "Fetch Suggestions";

  const autoImportDisabled = state.loading || state.shuttingDown || autoImportBusy;
  const autoImportButtonText = getAutoImportButtonText();
  [autoImportButton, buildSuggestionAutoImportButton].forEach((button) => {
    button.disabled = autoImportDisabled;
    button.textContent = autoImportButtonText;
  });
  resetButton.disabled = state.loading || state.shuttingDown;
  closeButton.hidden = !state.canShutdown;
  closeButton.disabled = state.loading || state.shuttingDown || !state.shutdownToken;
  closeButton.setAttribute("aria-label", state.shuttingDown ? "Stopping app" : "Stop app");
  closeButton.setAttribute("title", state.shuttingDown ? "Stopping app" : "Stop app");
  sortSelect.disabled =
    state.loading ||
    state.shuttingDown ||
    isDraftProjectionMode ||
    getCurrentResultsBundle()?.mode === "firstPick" ||
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

async function postJson(path, body = null, options = {}) {
  const headers = {
    ...(options.contentType === null ? {} : { "content-type": "application/json" }),
    ...(options.headers || {}),
  };
  const response = await fetch(path, {
    method: "POST",
    headers,
    ...(body == null ? {} : { body: JSON.stringify(body) }),
  });

  return {
    response,
    payload: await parseJsonSafely(response),
  };
}
