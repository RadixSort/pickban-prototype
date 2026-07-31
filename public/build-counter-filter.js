(function initializeBuildCounterFilter(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.buildCounterFilter = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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

  return {
    filterBuildCounterEnemies,
    toggleBuildCounterFilter,
  };
});
