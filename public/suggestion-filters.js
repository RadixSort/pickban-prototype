(function initializeSuggestionFilters(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.suggestionFilters = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function getChampionKeyFromSelection(selection) {
    if (!selection || typeof selection !== "object") {
      return null;
    }

    if (selection.key != null) {
      return String(selection.key);
    }

    if (
      selection.champion &&
      typeof selection.champion === "object" &&
      selection.champion.key != null
    ) {
      return String(selection.champion.key);
    }

    return null;
  }

  function buildSelectedChampionKeys(allies = [], enemies = []) {
    const selectedChampionKeys = new Set();

    for (const selection of [...allies, ...enemies]) {
      const championKey = getChampionKeyFromSelection(selection);
      if (championKey != null) {
        selectedChampionKeys.add(championKey);
      }
    }

    return selectedChampionKeys;
  }

  function filterUnavailableResults(results = [], selectedChampionKeys = new Set()) {
    return results.filter((result) => {
      if (!result || typeof result !== "object") {
        return true;
      }

      const resultKey = result.candidateKey ?? result.supportKey;
      if (resultKey == null) {
        return true;
      }

      return !selectedChampionKeys.has(String(resultKey));
    });
  }

  return {
    buildSelectedChampionKeys,
    filterUnavailableResults,
    getChampionKeyFromSelection,
  };
});
