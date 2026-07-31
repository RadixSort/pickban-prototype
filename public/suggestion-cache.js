(function initializeSuggestionCache(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./roles.js"),
      require("./lane-opponent-weight.js"),
    );
    return;
  }

  globalScope.suggestionCache = factory(
    globalScope.roles || {},
    globalScope.laneOpponentWeight || {},
  );
})(typeof globalThis !== "undefined" ? globalThis : this, (roles = {}, laneWeights = {}) => {
  const normalizeRole =
    typeof roles.normalizeRole === "function"
      ? roles.normalizeRole
      : (value) => (typeof value === "string" ? value.trim().toLowerCase() : null);
  const defaultLaneOpponentWeight = laneWeights.DEFAULT_LANE_OPPONENT_WEIGHT || 3;
  const normalizeLaneOpponentWeight =
    typeof laneWeights.normalizeLaneOpponentWeight === "function"
      ? laneWeights.normalizeLaneOpponentWeight
      : (value) => {
          const numericValue = Number(value);
          return [1, 2, 3, 4].includes(numericValue) ? numericValue : null;
        };

  /**
   * Cache frontend results by the full draft state that affects the payload:
   * rank filter, lane-opponent weight, and both teams' picks and roles.
   */
  function buildSuggestionCacheKey(
    rankFilter = "",
    allies = [],
    enemies = [],
    laneOpponentWeight = defaultLaneOpponentWeight,
  ) {
    const normalizedRankFilter =
      typeof rankFilter === "string" && rankFilter.trim() ? rankFilter.trim().toLowerCase() : "";
    const allyEntries = allies
      .map((ally) => {
        const championKey = getChampionKey(ally);
        if (!championKey) {
          return null;
        }

        const assignedRole = normalizeRole(ally?.role ?? ally?.lane ?? null) || "";
        return `${championKey}:${assignedRole}`;
      })
      .filter(Boolean)
      .sort();
    const enemyEntries = enemies
      .map((enemy) => {
        const championKey = getChampionKey(enemy);
        if (!championKey) {
          return null;
        }

        const assignedRole = normalizeRole(enemy?.role ?? enemy?.lane ?? null) || "";
        return `${championKey}:${assignedRole}`;
      })
      .filter(Boolean)
      .sort();
    const normalizedLaneOpponentWeight =
      normalizeLaneOpponentWeight(laneOpponentWeight) || defaultLaneOpponentWeight;

    return `rank=${normalizedRankFilter}|laneWeight=${normalizedLaneOpponentWeight}|allies=${allyEntries.join(",")}|enemies=${enemyEntries.join(",")}`;
  }

  function getChampionKey(selection) {
    if (!selection || typeof selection !== "object") {
      return null;
    }

    const value = selection.key ?? selection?.champion?.key ?? null;
    if (value == null || value === "") {
      return null;
    }

    return String(value);
  }

  return {
    buildSuggestionCacheKey,
  };
});
