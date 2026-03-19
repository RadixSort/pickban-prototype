(function initializeResultRanking(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.resultRanking = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_SORT_MODE = "projectedAgency";
  const PROJECTED_WIN_RATE_SORT_MODE = "projectedWinRate";
  const DEFAULT_TOP_RESULT_LIMIT = 3;

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

  function getResultKey(result) {
    if (!result || typeof result !== "object") {
      return null;
    }

    if (result.candidateKey != null) {
      return String(result.candidateKey);
    }

    if (result.supportKey != null) {
      return String(result.supportKey);
    }

    return null;
  }

  function getResultName(result) {
    if (!result || typeof result !== "object") {
      return "";
    }

    return String(result.candidate || result.support || "");
  }

  function getTopResultKeys(
    results = [],
    sortMode = DEFAULT_SORT_MODE,
    limit = DEFAULT_TOP_RESULT_LIMIT,
  ) {
    const topResultKeys = new Set();

    for (const result of sortResults(results, sortMode)) {
      const resultKey = getResultKey(result);
      if (resultKey == null) {
        continue;
      }

      topResultKeys.add(resultKey);
      if (topResultKeys.size >= limit) {
        break;
      }
    }

    return topResultKeys;
  }

  function getTopSupportKeys(
    results = [],
    sortMode = DEFAULT_SORT_MODE,
    limit = DEFAULT_TOP_RESULT_LIMIT,
  ) {
    return getTopResultKeys(results, sortMode, limit);
  }

  function getSortComparator(sortMode) {
    if (sortMode === PROJECTED_WIN_RATE_SORT_MODE) {
      return compareByProjectedWinRate;
    }

    return compareByProjectedAgency;
  }

  function compareSupportNames(left, right) {
    return getResultName(left).localeCompare(getResultName(right));
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
    DEFAULT_TOP_RESULT_LIMIT,
    DEFAULT_SORT_MODE,
    PROJECTED_WIN_RATE_SORT_MODE,
    average,
    compareByProjectedAgency,
    compareByProjectedWinRate,
    getProjectedAgency,
    getProjectedWinRate,
    getResultKey,
    getResultName,
    getTopResultKeys,
    getTopSupportKeys,
    sortResults,
  };
});
