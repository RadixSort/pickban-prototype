(function initializeSuggestionFilters(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./result-ranking.js"));
    return;
  }

  globalScope.suggestionFilters = factory(globalScope.resultRanking || {});
})(typeof globalThis !== "undefined" ? globalThis : this, (resultRanking) => {
  const {
    getProjectedWinRate = () => 0,
    PROJECTED_WIN_RATE_SORT_MODE = "projectedWinRate",
    sortResults = (results = []) => [...results],
  } = resultRanking;
  const MIN_PROJECTED_WIN_RATE = 50;
  const MINIMUM_VISIBLE_SUGGESTIONS = 10;

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
    minimumVisibleSuggestions = MINIMUM_VISIBLE_SUGGESTIONS,
  ) {
    const eligibleResults = results.filter(
      (result) => getProjectedWinRate(result) >= minimumProjectedWinRate,
    );

    if (eligibleResults.length >= minimumVisibleSuggestions) {
      return eligibleResults;
    }

    const eligibleResultKeys = new Set(
      eligibleResults
        .map((result) => result?.candidateKey ?? result?.supportKey)
        .filter((resultKey) => resultKey != null)
        .map((resultKey) => String(resultKey)),
    );
    const eligibleResultSet = new Set(eligibleResults);
    const additionalResults = [];

    for (const result of sortResults(results, PROJECTED_WIN_RATE_SORT_MODE)) {
      const resultKey = result?.candidateKey ?? result?.supportKey;
      const normalizedResultKey = resultKey == null ? null : String(resultKey);

      if (
        eligibleResultSet.has(result) ||
        (normalizedResultKey != null && eligibleResultKeys.has(normalizedResultKey))
      ) {
        continue;
      }

      additionalResults.push(result);
      if (eligibleResults.length + additionalResults.length >= minimumVisibleSuggestions) {
        break;
      }
    }

    return [...eligibleResults, ...additionalResults];
  }

  function getVisibleSuggestionResults(results = [], selectedChampionKeys = new Set()) {
    return filterLowProjectedWinRateResults(
      filterUnavailableResults(results, selectedChampionKeys),
    );
  }

  return {
    MINIMUM_VISIBLE_SUGGESTIONS,
    MIN_PROJECTED_WIN_RATE,
    buildSelectedChampionKeys,
    filterLowProjectedWinRateResults,
    filterUnavailableResults,
    getChampionKeyFromSelection,
    getVisibleSuggestionResults,
  };
});
