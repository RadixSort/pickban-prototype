(function initializeBuildSuggestionCache(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./roles.js"));
    return;
  }

  globalScope.buildSuggestionCache = factory(globalScope.roles || {});
})(typeof globalThis !== "undefined" ? globalThis : this, (roles = {}) => {
  const normalizeRole =
    typeof roles.normalizeRole === "function"
      ? roles.normalizeRole
      : (value) => (typeof value === "string" ? value.trim().toLowerCase() : null);

  /**
   * Cache build suggestions by the inputs that change the server response:
   * rank filter, one ally champion plus assigned role, and the enemy set.
   */
  function buildBuildSuggestionCacheKey(rankFilter = "", ally = null, enemies = []) {
    const normalizedRankFilter =
      typeof rankFilter === "string" && rankFilter.trim() ? rankFilter.trim().toLowerCase() : "";
    const allyChampionKey = getChampionKey(ally);
    const allyRole = normalizeRole(ally?.role ?? ally?.lane ?? ally?.assignedRole ?? null) || "";
    const enemyEntries = enemies
      .map((enemy) => getChampionKey(enemy))
      .filter(Boolean)
      .sort();

    return `rank=${normalizedRankFilter}|ally=${allyChampionKey || ""}:${allyRole}|enemies=${enemyEntries.join(",")}`;
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
