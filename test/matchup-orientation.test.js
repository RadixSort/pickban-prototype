const test = require("node:test");
const assert = require("node:assert/strict");

const { orientEnemyMatchupWinRate } = require("../lib/matchup-orientation.js");

test("orientEnemyMatchupWinRate flips enemy-facing win rates to the candidate perspective", () => {
  assert.equal(orientEnemyMatchupWinRate(52.8), 47.2);
  assert.equal(orientEnemyMatchupWinRate(50), 50);
});

test("orientEnemyMatchupWinRate returns null for non-finite values", () => {
  assert.equal(orientEnemyMatchupWinRate(null), null);
  assert.equal(orientEnemyMatchupWinRate(Number.NaN), null);
});
