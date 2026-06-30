const test = require("node:test");
const assert = require("node:assert/strict");

const {
  addCounterRow,
  addSynergyRow,
  createCandidateScoreAccumulator,
  finalizeCandidateScores,
} = require("../lib/candidate-score-accumulator.js");

test("candidate score accumulator applies counter values directly to agency", () => {
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
    counterScore: -40,
    projectedWinRate: 54.5,
    projectedAgency: 17,
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

test("candidate score accumulator weights only the counter score contribution", () => {
  const accumulator = createCandidateScoreAccumulator();

  addCounterRow(accumulator, { value: 10, winRate: 48 }, (winRate) => 100 - winRate, 0.5);

  assert.deepEqual(finalizeCandidateScores(accumulator), {
    synergyScore: 0,
    counterScore: 5,
    projectedWinRate: 52,
    projectedAgency: 5,
  });
});
