"use strict";

const { normalizeRole } = require("../public/roles.js");

const SHARED_BOTTOM_LANE_ROLES = new Set(["bottom", "support"]);

/**
 * Counter matchups outside the candidate's expected lane contribute half
 * weight. Bottom and Support share a lane, so that pairing stays full weight.
 * Missing role metadata remains full weight instead of guessing.
 */
function getCounterScoreWeight(candidateRole, opponentRole) {
  const normalizedCandidateRole = normalizeRole(candidateRole);
  const normalizedOpponentRole = normalizeRole(opponentRole);

  if (!normalizedCandidateRole || !normalizedOpponentRole) {
    return 1;
  }

  if (normalizedCandidateRole === normalizedOpponentRole) {
    return 1;
  }

  if (
    SHARED_BOTTOM_LANE_ROLES.has(normalizedCandidateRole) &&
    SHARED_BOTTOM_LANE_ROLES.has(normalizedOpponentRole)
  ) {
    return 1;
  }

  return 0.5;
}

module.exports = {
  getCounterScoreWeight,
};
