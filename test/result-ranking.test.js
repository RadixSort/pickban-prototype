const test = require("node:test");
const assert = require("node:assert/strict");

const {
  average,
  getProjectedAgency,
  getProjectedWinRate,
  getTopResultKeys,
  sortResults,
} = require("../public/result-ranking.js");

test("average ignores non-numeric values and returns 0 for empty input", () => {
  assert.equal(average([]), 0);
  assert.equal(average([50, "51", Number.NaN, null]), 50.5);
});

test("projected agency falls back to legacy finalScore", () => {
  assert.equal(getProjectedAgency({ projectedAgency: 1.25, finalScore: 9.9 }), 1.25);
  assert.equal(getProjectedAgency({ finalScore: 2.5 }), 2.5);
  assert.equal(getProjectedAgency({}), 0);
});

test("projected win rate defaults to 0 when missing", () => {
  assert.equal(getProjectedWinRate({ projectedWinRate: 53.14 }), 53.14);
  assert.equal(getProjectedWinRate({}), 0);
});

test("sortResults ranks projected agency with projected win rate as the first tie-breaker", () => {
  const ranked = sortResults(
    [
      { candidate: "Lulu", candidateKey: 117, projectedAgency: 1.1, projectedWinRate: 53.2 },
      { candidate: "Nami", candidateKey: 267, projectedAgency: 1.1, projectedWinRate: 54.1 },
      { candidate: "Alistar", candidateKey: 12, projectedAgency: 0.5, projectedWinRate: 55.0 },
    ],
    "projectedAgency",
  );

  assert.deepEqual(
    ranked.map((result) => result.candidate),
    ["Nami", "Lulu", "Alistar"],
  );
});

test("sortResults ranks projected win rate with projected agency as the first tie-breaker", () => {
  const ranked = sortResults(
    [
      { candidate: "Janna", candidateKey: 40, projectedAgency: 1.6, projectedWinRate: 53.8 },
      { candidate: "Thresh", candidateKey: 412, projectedAgency: 1.2, projectedWinRate: 53.8 },
      { candidate: "Braum", candidateKey: 201, projectedAgency: 1.9, projectedWinRate: 52.2 },
    ],
    "projectedWinRate",
  );

  assert.deepEqual(
    ranked.map((result) => result.candidate),
    ["Janna", "Thresh", "Braum"],
  );
});

test("getTopResultKeys returns the top two ranked candidate keys for the selected sort mode", () => {
  const topResultKeys = getTopResultKeys(
    [
      { candidate: "Soraka", candidateKey: 16, projectedAgency: 0.8, projectedWinRate: 55.2 },
      { support: "Leona", projectedAgency: 1.7, projectedWinRate: 52.4 },
      { candidate: "Rakan", candidateKey: "497", projectedAgency: 1.4, projectedWinRate: 54.1 },
      { candidate: "Taric", candidateKey: 44, projectedAgency: 1.1, projectedWinRate: 53.0 },
    ],
    "projectedWinRate",
    2,
  );

  assert.deepEqual(Array.from(topResultKeys), ["16", "497"]);
});
