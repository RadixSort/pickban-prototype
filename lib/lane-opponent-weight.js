"use strict";

const {
  DEFAULT_LANE_OPPONENT_WEIGHT,
  normalizeLaneOpponentWeight,
  rolesShareLane,
} = require("../public/lane-opponent-weight.js");

/**
 * Return every inferred same-lane enemy. Bottom and Support share one lane.
 * When inference finds none, choose one enemy by explicit lane likelihood and
 * stable fallback signals so off-meta drafts always have a lane opponent.
 */
function findLaneOpponentIndexes(
  entries = [],
  {
    targetRole = null,
    getOpponentRole = () => null,
    getLaneOpponentLikelihood = () => null,
    getFallbackScore = () => null,
    getStableKey = (_entry, index) => String(index),
  } = {},
) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const sameLaneIndexes = new Set();

  normalizedEntries.forEach((entry, index) => {
    if (rolesShareLane(targetRole, getOpponentRole(entry, index))) {
      sameLaneIndexes.add(index);
    }
  });

  if (sameLaneIndexes.size > 0 || normalizedEntries.length === 0) {
    return sameLaneIndexes;
  }

  let mostLikelyIndex = 0;
  for (let index = 1; index < normalizedEntries.length; index += 1) {
    if (
      compareLaneOpponentCandidates(
        normalizedEntries[index],
        index,
        normalizedEntries[mostLikelyIndex],
        mostLikelyIndex,
        {
          getLaneOpponentLikelihood,
          getFallbackScore,
          getStableKey,
        },
      ) < 0
    ) {
      mostLikelyIndex = index;
    }
  }

  return new Set([mostLikelyIndex]);
}

function expandEntriesByLaneOpponentWeight(
  entries = [],
  {
    laneOpponentWeight = DEFAULT_LANE_OPPONENT_WEIGHT,
    ...laneOpponentOptions
  } = {},
) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const normalizedWeight =
    normalizeLaneOpponentWeight(laneOpponentWeight) || DEFAULT_LANE_OPPONENT_WEIGHT;
  const laneOpponentIndexes = findLaneOpponentIndexes(
    normalizedEntries,
    laneOpponentOptions,
  );
  const expandedEntries = [];

  normalizedEntries.forEach((entry, index) => {
    const contributionCount = laneOpponentIndexes.has(index) ? normalizedWeight : 1;
    for (let contribution = 0; contribution < contributionCount; contribution += 1) {
      expandedEntries.push(entry);
    }
  });

  return expandedEntries;
}

function compareLaneOpponentCandidates(
  left,
  leftIndex,
  right,
  rightIndex,
  {
    getLaneOpponentLikelihood,
    getFallbackScore,
    getStableKey,
  },
) {
  return (
    toSortableNumber(getLaneOpponentLikelihood(right, rightIndex)) -
      toSortableNumber(getLaneOpponentLikelihood(left, leftIndex)) ||
    toSortableNumber(getFallbackScore(right, rightIndex)) -
      toSortableNumber(getFallbackScore(left, leftIndex)) ||
    String(getStableKey(left, leftIndex) ?? leftIndex).localeCompare(
      String(getStableKey(right, rightIndex) ?? rightIndex),
    ) ||
    leftIndex - rightIndex
  );
}

function toSortableNumber(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return Number.NEGATIVE_INFINITY;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : Number.NEGATIVE_INFINITY;
}

module.exports = {
  expandEntriesByLaneOpponentWeight,
  findLaneOpponentIndexes,
};
