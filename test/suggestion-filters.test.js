const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSelectedChampionKeys,
  filterLowProjectedWinRateResults,
  filterNegativeMatchupScoreResults,
  filterUnavailableResults,
  getVisibleSuggestionResults,
} = require("../public/suggestion-filters.js");

function createResult(candidateKey, projectedWinRate, projectedAgency = 0) {
  return {
    candidate: `Champion ${candidateKey}`,
    candidateKey,
    projectedAgency,
    projectedWinRate,
  };
}

test("buildSelectedChampionKeys supports frontend and server selection shapes", () => {
  const selectedChampionKeys = buildSelectedChampionKeys(
    [
      { key: 22, name: "Ashe" },
      { champion: { key: 51, name: "Caitlyn" }, lane: "bottom" },
    ],
    [
      { key: "40", name: "Janna" },
      { champion: { key: 89, name: "Leona" } },
      null,
      {},
    ],
  );

  assert.deepEqual(
    Array.from(selectedChampionKeys).sort((left, right) => left.localeCompare(right)),
    ["22", "40", "51", "89"],
  );
});

test("filterUnavailableResults removes champions already confirmed in the draft", () => {
  const selectedChampionKeys = buildSelectedChampionKeys(
    [{ key: 63, name: "Brand" }],
    [{ champion: { key: 40, name: "Janna" } }],
  );

  const results = [
    { candidate: "Brand", candidateKey: 63, finalScore: 9.1 },
    { candidate: "Thresh", candidateKey: 412, finalScore: 8.7 },
    { candidate: "Janna", candidateKey: "40", finalScore: 8.4 },
    { candidate: "Nami", candidateKey: 267, finalScore: 8.1 },
  ];

  assert.deepEqual(filterUnavailableResults(results, selectedChampionKeys), [
    { candidate: "Thresh", candidateKey: 412, finalScore: 8.7 },
    { candidate: "Nami", candidateKey: 267, finalScore: 8.1 },
  ]);
});

test("filterUnavailableResults leaves legacy rows without a candidate key untouched", () => {
  const filteredResults = filterUnavailableResults(
    [
      { support: "Mystery Support", finalScore: 5.2 },
      { support: "Lulu", supportKey: 117, finalScore: 7.4 },
    ],
    new Set(["117"]),
  );

  assert.deepEqual(filteredResults, [{ support: "Mystery Support", finalScore: 5.2 }]);
});

test("filterUnavailableResults still supports legacy supportKey rows", () => {
  const filteredResults = filterUnavailableResults(
    [
      { support: "Lulu", supportKey: 117, finalScore: 7.4 },
      { support: "Nami", supportKey: 267, finalScore: 7.2 },
    ],
    new Set(["267"]),
  );

  assert.deepEqual(filteredResults, [{ support: "Lulu", supportKey: 117, finalScore: 7.4 }]);
});

test("filterLowProjectedWinRateResults keeps sub-50 projected win rates visible", () => {
  const filteredResults = filterLowProjectedWinRateResults([
    createResult(1, 55.4),
    createResult(2, 54.8),
    createResult(3, 53.9),
    createResult(4, 53.4),
    createResult(5, 52.7),
    createResult(6, 52.1),
    createResult(7, 51.6),
    createResult(8, 51.1),
    createResult(9, 50.6),
    createResult(10, 50.0),
    createResult(11, 49.9),
    createResult(12, 48.3),
  ]);

  assert.deepEqual(
    filteredResults.map((result) => result.candidateKey),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
});

test("filterNegativeMatchupScoreResults removes results when either matchup score is negative", () => {
  const filteredResults = filterNegativeMatchupScoreResults([
    { candidateKey: 1, synergyScore: 1.2, counterScore: 0.4 },
    { candidateKey: 2, synergyScore: -0.1, counterScore: 2.1 },
    { candidateKey: 3, synergyScore: 0.8, counterScore: -0.2 },
    { candidateKey: 4, synergyScore: -0.3, counterScore: -0.4 },
    { candidateKey: 5, synergyScore: 0, counterScore: 0 },
    { candidateKey: 6 },
    { candidateKey: 7, synergyScore: "invalid", counterScore: 0.5 },
    { candidateKey: 8, synergyScore: "0.5", counterScore: "-0.1" },
  ]);

  assert.deepEqual(
    filteredResults.map((result) => result.candidateKey),
    [1, 5, 6, 7],
  );
});

test("getVisibleSuggestionResults keeps all available results including sub-50 projected win rates", () => {
  const visibleResults = getVisibleSuggestionResults([
    createResult(1, 49.2, 0.1),
    createResult(2, 60.8, 0.2),
    createResult(3, 55.7, 0.3),
    createResult(4, 49.9, 0.4),
    createResult(5, 58.6, 0.5),
    createResult(6, 57.4, 0.6),
    createResult(7, 54.2, 0.7),
    createResult(8, 56.3, 0.8),
    createResult(9, 53.1, 0.9),
    createResult(10, 48.6, 1.0),
    createResult(11, 52.4, 1.1),
    createResult(12, 51.5, 1.2),
  ]);

  assert.deepEqual(
    visibleResults.map((result) => result.candidateKey),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
});

test("getVisibleSuggestionResults excludes selected champions and negative matchup scores", () => {
  const visibleResults = getVisibleSuggestionResults(
    [
      { candidateKey: 1, synergyScore: 0.4, counterScore: 0.2 },
      { candidateKey: 2, synergyScore: -0.1, counterScore: 0.3 },
      { candidateKey: 3, synergyScore: 0.2, counterScore: -0.1 },
      { candidateKey: 4, synergyScore: 0, counterScore: 0 },
    ],
    new Set(["1"]),
  );

  assert.deepEqual(
    visibleResults.map((result) => result.candidateKey),
    [4],
  );
});
