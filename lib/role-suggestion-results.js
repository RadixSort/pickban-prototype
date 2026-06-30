const {
  DEFAULT_SORT_MODE,
  sortResults,
} = require("../public/result-ranking.js");
const { orientEnemyMatchupWinRate } = require("./matchup-orientation.js");
const {
  addCounterRow,
  addSynergyRow,
  createCandidateScoreAccumulator,
  finalizeCandidateScores,
} = require("./candidate-score-accumulator.js");

/**
 * Merge fulfilled ally and enemy matchup rows into one ranked result set for a
 * single target role while preserving partial failure messages.
 */
function buildRoleSuggestionResults({
  allyResults = [],
  enemyResults = [],
  eligibleTierStats = new Map(),
  selectedChampionKeys = new Set(),
  targetRole,
  championByKey,
} = {}) {
  const partialFailures = [];
  const candidateScores = new Map();

  appendAllyScores(allyResults, candidateScores, championByKey, partialFailures);
  appendEnemyScores(enemyResults, candidateScores, championByKey, partialFailures);

  const rankedResults = [];

  for (const candidate of candidateScores.values()) {
    const candidateKey = String(candidate.key);
    if (selectedChampionKeys.has(candidateKey)) {
      continue;
    }

    const candidateResult = buildCandidateResult(candidate, eligibleTierStats, targetRole);
    if (candidateResult) {
      rankedResults.push(candidateResult);
    }
  }

  return {
    partialFailures,
    results: sortResults(rankedResults, DEFAULT_SORT_MODE),
  };
}

/**
 * Build the stable per-role metadata bundle returned alongside suggestion rows.
 */
function buildSuggestionMeta(rankFilter, targetRole, allies, enemies, partialFailures = []) {
  return {
    rankFilter,
    role: targetRole,
    allyCount: allies.length,
    enemyCount: enemies.length,
    assignedRoleCount: allies.filter((ally) => ally.role).length,
    partialFailures,
  };
}

function appendAllyScores(allyResults, candidateScores, championByKey, partialFailures) {
  for (const result of allyResults) {
    if (result.status !== "fulfilled") {
      partialFailures.push(getFailureMessage(result.reason));
      continue;
    }

    for (const [candidateKey, row] of result.value.rows) {
      const record = getCandidateRecord(candidateScores, candidateKey, championByKey);
      addSynergyRow(record, row);
    }
  }
}

function appendEnemyScores(enemyResults, candidateScores, championByKey, partialFailures) {
  for (const result of enemyResults) {
    if (result.status !== "fulfilled") {
      partialFailures.push(getFailureMessage(result.reason));
      continue;
    }

    for (const [candidateKey, row] of result.value.rows) {
      const record = getCandidateRecord(candidateScores, candidateKey, championByKey);
      addCounterRow(record, row, orientEnemyMatchupWinRate);
    }
  }
}

function buildCandidateResult(candidate, eligibleTierStats, targetRole) {
  const roleTierStats = eligibleTierStats.get(String(candidate.key));
  if (!roleTierStats) {
    return null;
  }

  const {
    synergyScore,
    counterScore,
    projectedWinRate,
    projectedAgency,
  } = finalizeCandidateScores(candidate);
  const bestWorldwideWinRateDelta = toFiniteNumber(
    roleTierStats.bestWorldwideWinRateDelta,
  );
  const skillAdjustedProjections =
    bestWorldwideWinRateDelta == null
      ? {}
      : {
          bestWorldwideWinRateDelta,
          projectedWinRateLowSkill: projectedWinRate - bestWorldwideWinRateDelta,
          projectedWinRateHighSkill: projectedWinRate + bestWorldwideWinRateDelta,
        };

  return {
    candidate: candidate.name,
    candidateKey: candidate.key,
    support: candidate.name,
    supportKey: candidate.key,
    icon: candidate.icon,
    role: targetRole,
    synergyScore,
    counterScore,
    projectedWinRate,
    projectedAgency,
    ...skillAdjustedProjections,
    finalScore: projectedAgency,
    lanePercent: roleTierStats.lanePercent,
    pickRate: roleTierStats.pickRate,
    winRate: roleTierStats.winRate,
  };
}

function toFiniteNumber(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getFailureMessage(reason) {
  if (typeof reason?.message === "string" && reason.message.trim() !== "") {
    return reason.message;
  }

  return "Unexpected server error.";
}

function getCandidateRecord(candidateScores, candidateKey, championByKey) {
  const existing = candidateScores.get(candidateKey);
  if (existing) {
    return existing;
  }

  const champion = championByKey.get(candidateKey);
  if (!champion) {
    throw createHttpError(500, `Missing local metadata for candidate champion ${candidateKey}.`);
  }

  const created = createCandidateScoreAccumulator(champion);

  candidateScores.set(candidateKey, created);
  return created;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  buildRoleSuggestionResults,
  buildSuggestionMeta,
};
