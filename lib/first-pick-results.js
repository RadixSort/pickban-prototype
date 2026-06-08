const {
  PBI_SORT_MODE,
  sortResults,
} = require("../public/result-ranking.js");

/**
 * Build first-pick options directly from role tier-list stats.
 *
 * This path is intentionally separate from draft-aware suggestions because an
 * empty draft has no ally synergy or enemy counter rows to aggregate.
 */
function buildFirstPickTierListResults({
  eligibleTierStats = new Map(),
  selectedChampionKeys = new Set(),
  targetRole = "",
  championByKey = new Map(),
} = {}) {
  const results = [];

  for (const stats of eligibleTierStats.values()) {
    const candidateKey = String(stats?.candidateKey || "");
    const pbi = toFiniteNumber(stats?.pbi);
    const winRate = toFiniteNumber(stats?.winRate);
    if (!candidateKey || selectedChampionKeys.has(candidateKey) || pbi == null || winRate == null) {
      continue;
    }

    const champion = championByKey.get(candidateKey) || {};
    const candidateName = stats.candidate || champion.name || "";
    if (!candidateName) {
      continue;
    }

    results.push({
      candidate: candidateName,
      candidateKey,
      support: candidateName,
      supportKey: candidateKey,
      icon: champion.icon || "",
      role: targetRole,
      pbi,
      winRate,
      lanePercent: stats.lanePercent,
      pickRate: stats.pickRate,
    });
  }

  return {
    partialFailures: [],
    results: sortResults(results, PBI_SORT_MODE),
  };
}

function buildFirstPickMeta(rankFilter, targetRole, partialFailures = []) {
  return {
    rankFilter,
    role: targetRole,
    allyCount: 0,
    enemyCount: 0,
    assignedRoleCount: 0,
    resultMode: "firstPick",
    partialFailures,
  };
}

function toFiniteNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

module.exports = {
  buildFirstPickMeta,
  buildFirstPickTierListResults,
};
