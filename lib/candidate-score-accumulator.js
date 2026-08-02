"use strict";

/**
 * Create the mutable running-total structure used while aggregating one role's
 * ally synergy rows and enemy counter rows.
 */
function createCandidateScoreAccumulator(candidate = {}) {
  return {
    key: candidate.key,
    name: candidate.name,
    icon: candidate.icon,
    synergyTotal: 0,
    synergyCount: 0,
    counterTotal: 0,
    counterCount: 0,
    projectedWinRateTotal: 0,
    projectedWinRateCount: 0,
  };
}

function addSynergyRow(accumulator, row = {}) {
  if (Number.isFinite(row.value)) {
    accumulator.synergyTotal += row.value;
    accumulator.synergyCount += 1;
  }

  if (Number.isFinite(row.winRate)) {
    accumulator.projectedWinRateTotal += row.winRate;
    accumulator.projectedWinRateCount += 1;
  }
}

function addCounterRow(
  accumulator,
  row = {},
  orientEnemyMatchupWinRate = defaultOrientation,
  scoreWeight = 1,
) {
  if (Number.isFinite(row.value)) {
    const normalizedScoreWeight = Number.isFinite(scoreWeight) ? scoreWeight : 1;
    accumulator.counterTotal += row.value * normalizedScoreWeight;
    accumulator.counterCount += 1;
  }

  const projectedWinRate = orientEnemyMatchupWinRate(row.winRate);
  if (Number.isFinite(projectedWinRate)) {
    accumulator.projectedWinRateTotal += projectedWinRate;
    accumulator.projectedWinRateCount += 1;
  }
}

/**
 * Convert the running totals into the response-facing score fields.
 */
function finalizeCandidateScores(accumulator = {}) {
  const synergyScore = computeAverage(accumulator.synergyTotal, accumulator.synergyCount);
  const counterScore = computeAverage(accumulator.counterTotal, accumulator.counterCount);
  const projectedWinRate = computeAverage(
    accumulator.projectedWinRateTotal,
    accumulator.projectedWinRateCount,
  );

  return {
    synergyScore,
    counterScore,
    projectedWinRate,
    projectedAgency: synergyScore + counterScore,
  };
}

function computeAverage(total, count) {
  return count > 0 ? total / count : 0;
}

function defaultOrientation(value) {
  return value;
}

module.exports = {
  addCounterRow,
  addSynergyRow,
  createCandidateScoreAccumulator,
  finalizeCandidateScores,
};
