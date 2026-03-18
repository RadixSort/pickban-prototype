function orientEnemyMatchupWinRate(winRate) {
  if (!Number.isFinite(winRate)) {
    return null;
  }

  return 100 - winRate;
}

module.exports = {
  orientEnemyMatchupWinRate,
};
