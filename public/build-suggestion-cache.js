(function initializeBuildSuggestionCache(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./roles.js"),
      require("./lane-opponent-weight.js"),
    );
    return;
  }

  globalScope.buildSuggestionCache = factory(
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
   * Cache build suggestions by the inputs that change the server response:
   * rank filter, lane-opponent weight, one assigned ally, and the enemy set.
   */
  function buildBuildSuggestionCacheKey(
    rankFilter = "",
    ally = null,
    enemies = [],
    laneOpponentWeight = defaultLaneOpponentWeight,
  ) {
    const normalizedRankFilter =
      typeof rankFilter === "string" && rankFilter.trim() ? rankFilter.trim().toLowerCase() : "";
    const allyChampionKey = getChampionKey(ally);
    const allyRole = normalizeRole(ally?.role ?? ally?.lane ?? ally?.assignedRole ?? null) || "";
    const enemyEntries = enemies
      .map((enemy) => getChampionKey(enemy))
      .filter(Boolean)
      .sort();
    const normalizedLaneOpponentWeight =
      normalizeLaneOpponentWeight(laneOpponentWeight) || defaultLaneOpponentWeight;

    return `rank=${normalizedRankFilter}|laneWeight=${normalizedLaneOpponentWeight}|ally=${allyChampionKey || ""}:${allyRole}|enemies=${enemyEntries.join(",")}`;
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
    buildBuildSuggestionCacheKey,
  };
});
