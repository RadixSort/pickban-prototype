(function initializeBuildCounterFilter(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./lane-opponent-weight.js"));
    return;
  }

  globalScope.buildCounterFilter = factory(globalScope.laneOpponentWeight || {});
})(typeof globalThis !== "undefined" ? globalThis : this, (laneOpponentWeight = {}) => {
  const rolesShareLane =
    typeof laneOpponentWeight.rolesShareLane === "function"
      ? laneOpponentWeight.rolesShareLane
      : () => false;

  function formatBuildGoldThousands(value) {
    const gold = Number(value);
    const safeGold = Number.isFinite(gold) && gold >= 0 ? gold : 0;
    return `${(safeGold / 1000).toFixed(1)}k`;
  }

  /**
   * Every available enemy starts selected. Portraits toggle individual enemies,
   * while removing the final selected enemy restores the complete selection.
   * An empty incoming selection is treated as the complete selection so stale
   * or legacy popup state remains safe.
   */
  function toggleBuildCounterFilter(
    selectedChampionKeys = [],
    toggledChampionKey = null,
    availableChampionKeys = [],
  ) {
    const availableKeys = normalizeKeys(availableChampionKeys);
    const availableKeySet = new Set(availableKeys);
    const toggledKey = normalizeKey(toggledChampionKey);
    const selectedKeySet = new Set(
      normalizeKeys(selectedChampionKeys).filter((key) => availableKeySet.has(key)),
    );
    if (selectedKeySet.size === 0) {
      availableKeys.forEach((key) => selectedKeySet.add(key));
    }

    if (!toggledKey || !availableKeySet.has(toggledKey)) {
      return availableKeys.filter((key) => selectedKeySet.has(key));
    }

    if (selectedKeySet.has(toggledKey)) {
      selectedKeySet.delete(toggledKey);
      if (selectedKeySet.size === 0) {
        return availableKeys;
      }
    } else {
      selectedKeySet.add(toggledKey);
    }

    return availableKeys.filter((key) => selectedKeySet.has(key));
  }

  function filterBuildCounterEnemies(enemies = [], selectedChampionKeys = []) {
    if (!Array.isArray(enemies)) {
      return [];
    }

    const selectedKeySet = new Set(normalizeKeys(selectedChampionKeys));
    if (selectedKeySet.size === 0) {
      return enemies.slice();
    }

    return enemies.filter((enemy) => selectedKeySet.has(getChampionKey(enemy)));
  }

  /**
   * Derive the automatic live-game counter subset without changing the legacy
   * portrait-toggle rules. Before the allied builder finishes a first item,
   * lane opponents are included, except Jungle includes every enemy equally.
   * Afterwards, only opponents in the global top half by build-gold value are
   * included.
   *
   * Automatic filtering is all-or-nothing: incomplete live data falls back to
   * every available enemy. A legitimate post-item result with no enemy in the
   * global top five also falls back to every enemy.
   */
  function resolveAutomaticBuildCounterFilter(
    ally,
    enemies = [],
    {
      liveGameActive = false,
      liveGameComplete = false,
    } = {},
  ) {
    const normalizedEnemies = Array.isArray(enemies) ? enemies : [];
    const availableKeys = normalizeKeys(normalizedEnemies.map(getChampionKey));
    const fallback = () => ({
      applied: false,
      reason: null,
      selectedChampionKeys: availableKeys,
    });

    if (
      liveGameActive !== true ||
      liveGameComplete !== true ||
      !ally ||
      typeof ally !== "object" ||
      typeof ally.hasCompletedFirstItem !== "boolean" ||
      normalizedEnemies.length === 0 ||
      availableKeys.length !== normalizedEnemies.length
    ) {
      return fallback();
    }

    if (ally.hasCompletedFirstItem === true) {
      const rankedEnemies = normalizedEnemies.map((enemy) => ({
        championKey: getChampionKey(enemy),
        rank: normalizeBuildGoldRank(enemy?.buildGoldRank),
      }));
      if (rankedEnemies.some((enemy) => enemy.rank == null)) {
        return fallback();
      }

      const selectedChampionKeys = rankedEnemies
        .filter((enemy) => enemy.rank <= 5)
        .map((enemy) => enemy.championKey);
      if (selectedChampionKeys.length === 0) {
        return fallback();
      }

      return {
        applied: true,
        reason: "top-half",
        selectedChampionKeys,
      };
    }

    const allyRole = getParticipantRole(ally);
    if (!isValidRole(allyRole)) {
      return fallback();
    }
    if (rolesShareLane(allyRole, "jungle")) {
      return fallback();
    }

    const enemyRoles = normalizedEnemies.map(getParticipantRole);
    if (enemyRoles.some((role) => !isValidRole(role))) {
      return fallback();
    }

    const selectedChampionKeys = normalizedEnemies
      .filter((_enemy, index) => rolesShareLane(allyRole, enemyRoles[index]))
      .map(getChampionKey);
    if (selectedChampionKeys.length === 0) {
      return fallback();
    }

    return {
      applied: true,
      reason: "lane",
      selectedChampionKeys,
    };
  }

  function normalizeKeys(values) {
    if (!Array.isArray(values)) {
      return [];
    }

    return [...new Set(values.map(normalizeKey).filter(Boolean))];
  }

  function normalizeKey(value) {
    if (value == null || value === "") {
      return "";
    }

    return String(value);
  }

  function getChampionKey(enemy) {
    return normalizeKey(enemy?.key ?? enemy?.championKey ?? enemy?.champion?.key ?? null);
  }

  function getParticipantRole(participant) {
    return participant?.role ?? participant?.lane ?? null;
  }

  function isValidRole(role) {
    return rolesShareLane(role, role);
  }

  function normalizeBuildGoldRank(value) {
    if (value == null || value === "" || typeof value === "boolean") {
      return null;
    }

    const numericValue = Number(value);
    return Number.isInteger(numericValue) && numericValue >= 1 && numericValue <= 10
      ? numericValue
      : null;
  }

  function resolveVisibleBuildGoldRank(
    value,
    { liveGameActive = false, liveGameComplete = false } = {},
  ) {
    return liveGameActive === true && liveGameComplete === true
      ? normalizeBuildGoldRank(value)
      : null;
  }

  /**
   * Build-gold ranks are global across both teams, so the strongest enemy is
   * the enemy with the lowest valid global rank, not necessarily global rank 1.
   */
  function resolveHighestRankedEnemyChampionKey(
    enemies = [],
    { liveGameActive = false, liveGameComplete = false } = {},
  ) {
    if (
      liveGameActive !== true ||
      liveGameComplete !== true ||
      !Array.isArray(enemies) ||
      enemies.length === 0
    ) {
      return "";
    }

    const rankedEnemies = enemies.map((enemy) => ({
      championKey: getChampionKey(enemy),
      rank: normalizeBuildGoldRank(enemy?.buildGoldRank),
    }));
    if (
      rankedEnemies.some((enemy) => !enemy.championKey || enemy.rank == null) ||
      new Set(rankedEnemies.map((enemy) => enemy.championKey)).size !== rankedEnemies.length
    ) {
      return "";
    }

    const highestRankedEnemy = rankedEnemies.reduce(
      (highest, enemy) =>
        !highest || enemy.rank < highest.rank ? enemy : highest,
      null,
    );
    return highestRankedEnemy.championKey;
  }

  /**
   * Team build-gold totals are meaningful only when the browser has a complete
   * live snapshot. Requiring a valid value for every roster participant also
   * prevents stale metrics copied onto draft selections from leaking into the
   * scoreboard during a game transition.
   */
  function resolveBuildGoldScoreboard(
    allies = [],
    enemies = [],
    { liveGameActive = false, liveGameComplete = false } = {},
  ) {
    const unavailable = {
      available: false,
      allyBuildGold: 0,
      enemyBuildGold: 0,
    };

    if (
      liveGameActive !== true ||
      liveGameComplete !== true ||
      !Array.isArray(allies) ||
      !Array.isArray(enemies) ||
      allies.length === 0 ||
      enemies.length === 0
    ) {
      return unavailable;
    }

    const allyBuildGoldValues = allies.map(getParticipantBuildGold);
    const enemyBuildGoldValues = enemies.map(getParticipantBuildGold);
    if (
      allyBuildGoldValues.some((value) => value == null) ||
      enemyBuildGoldValues.some((value) => value == null)
    ) {
      return unavailable;
    }

    const allyBuildGold = allyBuildGoldValues.reduce((total, value) => total + value, 0);
    const enemyBuildGold = enemyBuildGoldValues.reduce((total, value) => total + value, 0);
    if (!Number.isFinite(allyBuildGold) || !Number.isFinite(enemyBuildGold)) {
      return unavailable;
    }

    return {
      available: true,
      allyBuildGold,
      enemyBuildGold,
    };
  }

  function getParticipantBuildGold(participant) {
    const value = participant?.buildGold;
    if (value == null || value === "" || typeof value === "boolean") {
      return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
  }

  return {
    filterBuildCounterEnemies,
    formatBuildGoldThousands,
    resolveBuildGoldScoreboard,
    resolveAutomaticBuildCounterFilter,
    resolveHighestRankedEnemyChampionKey,
    resolveVisibleBuildGoldRank,
    toggleBuildCounterFilter,
  };
});
