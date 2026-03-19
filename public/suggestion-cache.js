(function initializeSuggestionCache(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./roles.js"));
    return;
  }

  globalScope.suggestionCache = factory(globalScope.roles || {});
})(typeof globalThis !== "undefined" ? globalThis : this, (roles = {}) => {
  const normalizeRole =
    typeof roles.normalizeRole === "function"
      ? roles.normalizeRole
      : (value) => (typeof value === "string" ? value.trim().toLowerCase() : null);

  function buildSuggestionCacheKey(rankFilter = "", allies = [], enemies = []) {
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
      .map((enemy) => getChampionKey(enemy))
      .filter(Boolean)
      .sort();

    return `rank=${normalizedRankFilter}|allies=${allyEntries.join(",")}|enemies=${enemyEntries.join(",")}`;
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
