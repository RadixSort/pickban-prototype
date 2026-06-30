(function initializeResultRanking(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.resultRanking = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const CHAMPION_SORT_MODE = "champion";
  const PROJECTED_AGENCY_SORT_MODE = "projectedAgency";
  const PROJECTED_WIN_RATE_HIGH_SKILL_SORT_MODE = "projectedWinRateHighSkill";
  const PROJECTED_WIN_RATE_LOW_SKILL_SORT_MODE = "projectedWinRateLowSkill";
  const PROJECTED_WIN_RATE_SORT_MODE = "projectedWinRate";
  const PBI_SORT_MODE = "pbi";
  const WIN_RATE_SORT_MODE = "winRate";
  const DEFAULT_SORT_MODE = PROJECTED_WIN_RATE_SORT_MODE;
  const DEFAULT_FIRST_PICK_SORT_MODE = PBI_SORT_MODE;
  const DEFAULT_TOP_RESULT_LIMIT = 5;
  const DRAFT_TOP_RESULT_LIMIT = 10;

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

  function getProjectedWinRateLowSkill(result) {
    return toFiniteNumber(result?.projectedWinRateLowSkill) ?? getProjectedWinRate(result);
  }

  function getProjectedWinRateHighSkill(result) {
    return toFiniteNumber(result?.projectedWinRateHighSkill) ?? getProjectedWinRate(result);
  }

  function getSkillAdjustedProjectedWinRate(result, skillLevelSortMode) {
    if (skillLevelSortMode === PROJECTED_WIN_RATE_LOW_SKILL_SORT_MODE) {
      return getProjectedWinRateLowSkill(result);
    }

    if (skillLevelSortMode === PROJECTED_WIN_RATE_HIGH_SKILL_SORT_MODE) {
      return getProjectedWinRateHighSkill(result);
    }

    return getProjectedWinRate(result);
  }

  function getPbi(result) {
    return toFiniteNumber(result?.pbi) ?? 0;
  }

  function getWinRate(result) {
    return toFiniteNumber(result?.winRate) ?? 0;
  }

  function getSynergyScore(result) {
    return toFiniteNumber(result?.synergyScore) ?? 0;
  }

  function getCounterScore(result) {
    return toFiniteNumber(result?.counterScore) ?? 0;
  }

  function compareByProjectedAgency(left, right) {
    return compareByProjectedAgencyMetric(
      left,
      right,
      getProjectedAgency,
      getProjectedWinRate,
    );
  }

  function compareByProjectedAgencyMetric(
    left,
    right,
    getAgencyValue,
    getWinRateValue,
  ) {
    const agencyDifference = getAgencyValue(right) - getAgencyValue(left);
    if (agencyDifference !== 0) {
      return agencyDifference;
    }

    const projectedWinRateDifference = getWinRateValue(right) - getWinRateValue(left);
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
    return compareByProjectedWinRateMetric(
      left,
      right,
      getProjectedWinRate,
      getProjectedAgency,
    );
  }

  function compareByProjectedWinRateLowSkill(left, right) {
    return compareByProjectedWinRateMetric(
      left,
      right,
      getProjectedWinRateLowSkill,
      getProjectedAgency,
    );
  }

  function compareByProjectedWinRateHighSkill(left, right) {
    return compareByProjectedWinRateMetric(
      left,
      right,
      getProjectedWinRateHighSkill,
      getProjectedAgency,
    );
  }

  function compareByProjectedWinRateMetric(
    left,
    right,
    getMetricValue,
    getAgencyValue,
  ) {
    const projectedWinRateDifference = getMetricValue(right) - getMetricValue(left);
    if (projectedWinRateDifference !== 0) {
      return projectedWinRateDifference;
    }

    const agencyDifference = getAgencyValue(right) - getAgencyValue(left);
    if (agencyDifference !== 0) {
      return agencyDifference;
    }

    const counterDifference = getNumericCounterScore(right) - getNumericCounterScore(left);
    if (counterDifference !== 0) {
      return counterDifference;
    }

    return compareSupportNames(left, right);
  }

  function compareByChampion(left, right) {
    return compareSupportNames(left, right);
  }

  function compareByPbi(left, right) {
    const pbiDifference = getPbi(right) - getPbi(left);
    if (pbiDifference !== 0) {
      return pbiDifference;
    }

    const winRateDifference = getWinRate(right) - getWinRate(left);
    if (winRateDifference !== 0) {
      return winRateDifference;
    }

    return compareSupportNames(left, right);
  }

  function compareByWinRate(left, right) {
    const winRateDifference = getWinRate(right) - getWinRate(left);
    if (winRateDifference !== 0) {
      return winRateDifference;
    }

    const pbiDifference = getPbi(right) - getPbi(left);
    if (pbiDifference !== 0) {
      return pbiDifference;
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
    const normalizedLimit = Number(limit);
    if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) {
      return new Set();
    }

    const comparator = getSortComparator(sortMode);
    const bestResultByKey = new Map();

    for (const result of results) {
      const resultKey = getResultKey(result);
      if (resultKey == null) {
        continue;
      }

      const existingResult = bestResultByKey.get(resultKey);
      if (!existingResult || comparator(result, existingResult) < 0) {
        bestResultByKey.set(resultKey, result);
      }
    }

    const topResults = [];

    for (const result of bestResultByKey.values()) {
      insertTopResult(topResults, result, comparator, normalizedLimit);
    }

    const topResultKeys = new Set();

    for (const result of topResults) {
      topResultKeys.add(getResultKey(result));
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

  function getTopProjectedWinRateKeysAtEverySkillLevel(
    results = [],
    limit = DRAFT_TOP_RESULT_LIMIT,
  ) {
    const topKeysBySkillLevel = [
      PROJECTED_WIN_RATE_LOW_SKILL_SORT_MODE,
      PROJECTED_WIN_RATE_SORT_MODE,
      PROJECTED_WIN_RATE_HIGH_SKILL_SORT_MODE,
    ].map((sortMode) => getTopResultKeys(results, sortMode, limit));

    return new Set(
      [...topKeysBySkillLevel[0]].filter((resultKey) =>
        topKeysBySkillLevel.slice(1).every((topKeys) => topKeys.has(resultKey)),
      ),
    );
  }

  function getDraftHighlightTone(
    isTopProjectedAgency,
    isTopProjectedWinRate,
    isTopProjectedWinRateAtEverySkillLevel,
  ) {
    if (isTopProjectedAgency && isTopProjectedWinRateAtEverySkillLevel) {
      return "overlap";
    }

    if (isTopProjectedWinRate) {
      return "winrate";
    }

    return "";
  }

  function getSortComparator(sortMode) {
    if (sortMode === CHAMPION_SORT_MODE) {
      return compareByChampion;
    }

    if (sortMode === PBI_SORT_MODE) {
      return compareByPbi;
    }

    if (sortMode === WIN_RATE_SORT_MODE) {
      return compareByWinRate;
    }

    if (sortMode === PROJECTED_AGENCY_SORT_MODE) {
      return compareByProjectedAgency;
    }

    if (sortMode === PROJECTED_WIN_RATE_LOW_SKILL_SORT_MODE) {
      return compareByProjectedWinRateLowSkill;
    }

    if (sortMode === PROJECTED_WIN_RATE_HIGH_SKILL_SORT_MODE) {
      return compareByProjectedWinRateHighSkill;
    }

    return compareByProjectedWinRate;
  }

  function insertTopResult(results, candidate, comparator, limit) {
    let insertIndex = results.length;

    for (let index = 0; index < results.length; index += 1) {
      if (comparator(candidate, results[index]) < 0) {
        insertIndex = index;
        break;
      }
    }

    if (insertIndex >= limit) {
      if (results.length < limit) {
        results.push(candidate);
      }
      return;
    }

    results.splice(insertIndex, 0, candidate);
    if (results.length > limit) {
      results.pop();
    }
  }

  function compareSupportNames(left, right) {
    return getResultName(left).localeCompare(getResultName(right));
  }

  function getNumericCounterScore(result) {
    return getCounterScore(result);
  }

  function toFiniteNumber(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return numericValue;
  }

  return {
    CHAMPION_SORT_MODE,
    DEFAULT_FIRST_PICK_SORT_MODE,
    DEFAULT_TOP_RESULT_LIMIT,
    DEFAULT_SORT_MODE,
    DRAFT_TOP_RESULT_LIMIT,
    PBI_SORT_MODE,
    PROJECTED_AGENCY_SORT_MODE,
    PROJECTED_WIN_RATE_HIGH_SKILL_SORT_MODE,
    PROJECTED_WIN_RATE_LOW_SKILL_SORT_MODE,
    PROJECTED_WIN_RATE_SORT_MODE,
    WIN_RATE_SORT_MODE,
    average,
    compareByChampion,
    compareByPbi,
    compareByProjectedAgency,
    compareByProjectedWinRateHighSkill,
    compareByProjectedWinRateLowSkill,
    compareByProjectedWinRate,
    compareByWinRate,
    getCounterScore,
    getDraftHighlightTone,
    getPbi,
    getProjectedAgency,
    getProjectedWinRateHighSkill,
    getProjectedWinRateLowSkill,
    getProjectedWinRate,
    getResultKey,
    getResultName,
    getSkillAdjustedProjectedWinRate,
    getSynergyScore,
    getTopProjectedWinRateKeysAtEverySkillLevel,
    getTopResultKeys,
    getTopSupportKeys,
    getWinRate,
    sortResults,
  };
});
