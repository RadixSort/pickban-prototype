(function initializeResultRanking(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.resultRanking = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_SORT_MODE = "projectedAgency";
  const PROJECTED_WIN_RATE_SORT_MODE = "projectedWinRate";

  function average(values = []) {
    let total = 0;
    let count = 0;

    for (const value of values) {
      if (typeof value !== "number" && typeof value !== "string") {
        continue;
      }

      if (typeof value === "string" && value.trim() === "") {
        continue;
      }

      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        continue;
      }

      total += numericValue;
      count += 1;
    }

    if (count === 0) {
      return 0;
    }

    return total / count;
  }

  function getProjectedAgency(result) {
    const projectedAgency = toFiniteNumber(result?.projectedAgency);
    if (projectedAgency != null) {
      return projectedAgency;
    }

    return toFiniteNumber(result?.finalScore) ?? 0;
  }

  function getProjectedWinRate(result) {
    return toFiniteNumber(result?.projectedWinRate) ?? 0;
  }

  function compareByProjectedAgency(left, right) {
    const agencyDifference = getProjectedAgency(right) - getProjectedAgency(left);
    if (agencyDifference !== 0) {
      return agencyDifference;
    }

    const projectedWinRateDifference = getProjectedWinRate(right) - getProjectedWinRate(left);
    if (projectedWinRateDifference !== 0) {
      return projectedWinRateDifference;
    }

    const counterDifference = getNumericCounterScore(right) - getNumericCounterScore(left);
    if (counterDifference !== 0) {
      return counterDifference;
    }

    return compareSupportNames(left, right);
  }

  function compareByProjectedWinRate(left, right) {
    const projectedWinRateDifference = getProjectedWinRate(right) - getProjectedWinRate(left);
    if (projectedWinRateDifference !== 0) {
      return projectedWinRateDifference;
    }

    const agencyDifference = getProjectedAgency(right) - getProjectedAgency(left);
    if (agencyDifference !== 0) {
      return agencyDifference;
    }

    const counterDifference = getNumericCounterScore(right) - getNumericCounterScore(left);
    if (counterDifference !== 0) {
      return counterDifference;
    }

    return compareSupportNames(left, right);
  }

  function sortResults(results = [], sortMode = DEFAULT_SORT_MODE) {
    return [...results].sort(getSortComparator(sortMode));
  }

  function getTopSupportKeys(results = [], sortMode = DEFAULT_SORT_MODE, limit = 2) {
    const topSupportKeys = new Set();

    for (const result of sortResults(results, sortMode)) {
      if (!result || result.supportKey == null) {
        continue;
      }

      topSupportKeys.add(String(result.supportKey));
      if (topSupportKeys.size >= limit) {
        break;
      }
    }

    return topSupportKeys;
  }

  function getSortComparator(sortMode) {
    if (sortMode === PROJECTED_WIN_RATE_SORT_MODE) {
      return compareByProjectedWinRate;
    }

    return compareByProjectedAgency;
  }

  function compareSupportNames(left, right) {
    return String(left?.support || "").localeCompare(String(right?.support || ""));
  }

  function getNumericCounterScore(result) {
    return toFiniteNumber(result?.counterScore) ?? 0;
  }

  function toFiniteNumber(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return numericValue;
  }

  return {
    DEFAULT_SORT_MODE,
    PROJECTED_WIN_RATE_SORT_MODE,
    average,
    compareByProjectedAgency,
    compareByProjectedWinRate,
    getProjectedAgency,
    getProjectedWinRate,
    getTopSupportKeys,
    sortResults,
  };
});
