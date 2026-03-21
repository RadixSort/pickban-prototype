"use strict";

const {
  addCounterRow,
  addSynergyRow,
  createCandidateScoreAccumulator,
  finalizeCandidateScores,
} = require("./candidate-score-accumulator.js");
const { orientEnemyMatchupWinRate } = require("./matchup-orientation.js");

/**
 * Collapse settled ally-synergy and enemy-counter results into one
 * draft-level projection for `/draft-outlook`.
 *
 * The input is already in promise-settled form so this function can preserve
 * partial failures while still producing a degraded projection whenever at
 * least one matchup contributes a win-rate sample.
 */
function buildDraftProjection({
  allySynergyResults = [],
  enemyCounterResults = [],
} = {}) {
  const projectionAccumulator = createCandidateScoreAccumulator({
    key: "__draft__",
    name: "Allied draft",
    icon: "",
  });
  const partialFailures = [];
  let synergyMatchupCount = 0;
  let counterMatchupCount = 0;

  allySynergyResults.forEach((result) => {
    if (result.status !== "fulfilled") {
      partialFailures.push(getFailureMessage(result.reason));
      return;
    }

    addSynergyRow(projectionAccumulator, result.value?.row);
    synergyMatchupCount += 1;
  });

  enemyCounterResults.forEach((result) => {
    if (result.status !== "fulfilled") {
      partialFailures.push(getFailureMessage(result.reason));
      return;
    }

    addCounterRow(projectionAccumulator, result.value?.row, orientEnemyMatchupWinRate);
    counterMatchupCount += 1;
  });

  const finalizedProjection = finalizeCandidateScores(projectionAccumulator);
  const projectedWinRateMatchupCount = projectionAccumulator.projectedWinRateCount;
  const allyWinRate =
    projectedWinRateMatchupCount > 0
      ? clampWinRate(finalizedProjection.projectedWinRate)
      : null;

  return {
    allyWinRate,
    enemyWinRate:
      projectedWinRateMatchupCount > 0 ? clampWinRate(100 - allyWinRate) : null,
    synergyScore: finalizedProjection.synergyScore,
    counterScore: finalizedProjection.counterScore,
    projectedAgency: finalizedProjection.projectedAgency,
    synergyMatchupCount,
    counterMatchupCount,
    sourceMatchups: synergyMatchupCount + counterMatchupCount,
    projectedWinRateMatchupCount,
    partialFailures,
  };
}

function hasUsableDraftProjection(projection = {}) {
  return projection.projectedWinRateMatchupCount > 0 && Number.isFinite(projection.allyWinRate);
}

function clampWinRate(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

function getFailureMessage(reason) {
  if (typeof reason?.message === "string" && reason.message.trim() !== "") {
    return reason.message;
  }

  return "Unexpected server error.";
}

module.exports = {
  buildDraftProjection,
  hasUsableDraftProjection,
};
