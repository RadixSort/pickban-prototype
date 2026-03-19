/**
 * Counter matchup win rates arrive from the enemy champion's perspective.
 * Flip them so projected win rate is always measured for the candidate pick.
 */
function orientEnemyMatchupWinRate(winRate) {
  if (!Number.isFinite(winRate)) {
    return null;
  }

  return 100 - winRate;
}

module.exports = {
  orientEnemyMatchupWinRate,
};
