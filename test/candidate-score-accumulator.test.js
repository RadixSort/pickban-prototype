const test = require("node:test");
const assert = require("node:assert/strict");

const {
  addCounterRow,
  addSynergyRow,
  createCandidateScoreAccumulator,
  finalizeCandidateScores,
} = require("../lib/candidate-score-accumulator.js");

test("candidate score accumulator flips enemy-facing counter values", () => {
  const accumulator = createCandidateScoreAccumulator({
    key: "117",
    name: "Lulu",
    icon: "/icons/lulu.png",
  });

  addSynergyRow(accumulator, { value: 60, winRate: 57 });
  addSynergyRow(accumulator, { value: 54, winRate: Number.NaN });
  addCounterRow(accumulator, { value: -40, winRate: 48 }, (winRate) => 100 - winRate);

  assert.deepEqual(finalizeCandidateScores(accumulator), {
    synergyScore: 57,
    counterScore: 40,
    projectedWinRate: 54.5,
    projectedAgency: 48.5,
  });
});

test("candidate score accumulator defaults missing averages to zero", () => {
  const accumulator = createCandidateScoreAccumulator();

  assert.deepEqual(finalizeCandidateScores(accumulator), {
    synergyScore: 0,
    counterScore: 0,
    projectedWinRate: 0,
    projectedAgency: 0,
  });
});
