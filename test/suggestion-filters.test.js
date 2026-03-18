const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSelectedChampionKeys,
  filterUnavailableResults,
} = require("../public/suggestion-filters.js");

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
