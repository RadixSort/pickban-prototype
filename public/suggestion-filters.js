(function initializeSuggestionFilters(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./result-ranking.js"));
    return;
  }

  globalScope.suggestionFilters = factory(globalScope.resultRanking || {});
})(typeof globalThis !== "undefined" ? globalThis : this, (resultRanking) => {
  const MIN_PROJECTED_WIN_RATE = 50;

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

  function filterLowProjectedWinRateResults(
    results = [],
    minimumProjectedWinRate = MIN_PROJECTED_WIN_RATE,
  ) {
    void minimumProjectedWinRate;

    // Retained for compatibility now that low projected win-rate results stay visible.
    return [...results];
  }

  function filterNegativeProjectedAgencyResults(results = []) {
    return results.filter((result) => {
      if (!result || typeof result !== "object") {
        return true;
      }

      return !isNegativeFiniteScore(result.projectedAgency);
    });
  }

  function isNegativeFiniteScore(value) {
    if (value == null || value === "") {
      return false;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue < 0;
  }

  /**
   * Keep draft-eligible rows with non-negative projected agency visible. The UI
   * highlights low projected win-rate results instead of removing them.
   */
  function getVisibleSuggestionResults(results = [], selectedChampionKeys = new Set()) {
    return filterNegativeProjectedAgencyResults(
      filterUnavailableResults(results, selectedChampionKeys),
    );
  }

  return {
    MIN_PROJECTED_WIN_RATE,
    buildSelectedChampionKeys,
    filterLowProjectedWinRateResults,
    filterNegativeProjectedAgencyResults,
    filterUnavailableResults,
    getChampionKeyFromSelection,
    getVisibleSuggestionResults,
  };
});
