const test = require("node:test");
const assert = require("node:assert/strict");

const {
  average,
  DEFAULT_FIRST_PICK_SORT_MODE,
  DEFAULT_SORT_MODE,
  DEFAULT_TOP_RESULT_LIMIT,
  PBI_SORT_MODE,
  PROJECTED_AGENCY_SORT_MODE,
  PROJECTED_WIN_RATE_SORT_MODE,
  WIN_RATE_SORT_MODE,
  getPbi,
  getProjectedAgency,
  getProjectedWinRate,
  getResultKey,
  getResultName,
  getTopResultKeys,
  getWinRate,
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

test("first-pick metric helpers default to 0 when missing", () => {
  assert.equal(getPbi({ pbi: 24 }), 24);
  assert.equal(getPbi({}), 0);
  assert.equal(getWinRate({ winRate: 53.5 }), 53.5);
  assert.equal(getWinRate({}), 0);
});

test("sortResults defaults to projected win rate ordering", () => {
  const ranked = sortResults([
    { candidate: "Thresh", candidateKey: 412, projectedAgency: 4.2, projectedWinRate: 51.4 },
    { candidate: "Nautilus", candidateKey: 111, projectedAgency: 1.3, projectedWinRate: 53.1 },
    { candidate: "Leona", candidateKey: 89, projectedAgency: 2.8, projectedWinRate: 52.2 },
  ]);

  assert.equal(DEFAULT_SORT_MODE, PROJECTED_WIN_RATE_SORT_MODE);
  assert.notEqual(DEFAULT_SORT_MODE, PROJECTED_AGENCY_SORT_MODE);
  assert.deepEqual(
    ranked.map((result) => result.candidate),
    ["Nautilus", "Leona", "Thresh"],
  );
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

test("sortResults ranks first-pick PBI with win rate as the first tie-breaker", () => {
  const ranked = sortResults(
    [
      { candidate: "Bard", candidateKey: 432, pbi: 4, winRate: 52.3 },
      { candidate: "Thresh", candidateKey: 412, pbi: 24, winRate: 53.5 },
      { candidate: "Seraphine", candidateKey: 147, pbi: 24, winRate: 53.7 },
    ],
    PBI_SORT_MODE,
  );

  assert.equal(DEFAULT_FIRST_PICK_SORT_MODE, PBI_SORT_MODE);
  assert.deepEqual(
    ranked.map((result) => result.candidate),
    ["Seraphine", "Thresh", "Bard"],
  );
});

test("sortResults ranks first-pick win rate with PBI as the first tie-breaker", () => {
  const ranked = sortResults(
    [
      { candidate: "Bard", candidateKey: 432, pbi: 4, winRate: 52.3 },
      { candidate: "Thresh", candidateKey: 412, pbi: 24, winRate: 53.5 },
      { candidate: "Seraphine", candidateKey: 147, pbi: 19, winRate: 53.5 },
    ],
    WIN_RATE_SORT_MODE,
  );

  assert.deepEqual(
    ranked.map((result) => result.candidate),
    ["Thresh", "Seraphine", "Bard"],
  );
});

test("getTopResultKeys returns the top five projected win-rate keys by default", () => {
  const topResultKeys = getTopResultKeys(
    [
      { candidate: "Milio", candidateKey: 902, projectedAgency: 0.5, projectedWinRate: 56.1 },
      { candidate: "Soraka", candidateKey: 16, projectedAgency: 0.8, projectedWinRate: 55.2 },
      { support: "Leona", projectedAgency: 1.7, projectedWinRate: 52.4 },
      { candidate: "Rakan", candidateKey: "497", projectedAgency: 1.4, projectedWinRate: 54.1 },
      { candidate: "Taric", candidateKey: 44, projectedAgency: 1.1, projectedWinRate: 53.0 },
      { candidate: "Braum", candidateKey: 201, projectedAgency: 2.2, projectedWinRate: 52.8 },
      { candidate: "Lulu", candidateKey: 117, projectedAgency: 2.0, projectedWinRate: 52.1 },
    ],
    PROJECTED_WIN_RATE_SORT_MODE,
  );

  assert.equal(DEFAULT_TOP_RESULT_LIMIT, 5);
  assert.deepEqual(Array.from(topResultKeys), ["902", "16", "497", "44", "201"]);
});

test("getTopResultKeys returns the top five projected agency keys by default", () => {
  const topResultKeys = getTopResultKeys(
    [
      { candidate: "Milio", candidateKey: 902, projectedAgency: 0.5, projectedWinRate: 56.1 },
      { candidate: "Soraka", candidateKey: 16, projectedAgency: 0.8, projectedWinRate: 55.2 },
      { support: "Leona", projectedAgency: 1.7, projectedWinRate: 52.4 },
      { candidate: "Rakan", candidateKey: "497", projectedAgency: 1.4, projectedWinRate: 54.1 },
      { candidate: "Taric", candidateKey: 44, projectedAgency: 1.1, projectedWinRate: 53.0 },
      { candidate: "Braum", candidateKey: 201, projectedAgency: 2.2, projectedWinRate: 52.8 },
      { candidate: "Lulu", candidateKey: 117, projectedAgency: 2.0, projectedWinRate: 52.1 },
    ],
    PROJECTED_AGENCY_SORT_MODE,
  );

  assert.deepEqual(Array.from(topResultKeys), ["201", "117", "497", "44", "16"]);
});

test("sortResults uses counter score and then alphabetical order to break complete ties", () => {
  const ranked = sortResults(
    [
      { candidate: "Zyra", candidateKey: 143, projectedAgency: 1.1, projectedWinRate: 53, counterScore: 0.4 },
      { candidate: "Braum", candidateKey: 201, projectedAgency: 1.1, projectedWinRate: 53, counterScore: 0.8 },
      { candidate: "Alistar", candidateKey: 12, projectedAgency: 1.1, projectedWinRate: 53, counterScore: 0.8 },
    ],
    "projectedAgency",
  );

  assert.deepEqual(
    ranked.map((result) => result.candidate),
    ["Alistar", "Braum", "Zyra"],
  );
});

test("result helpers support legacy rows and unknown sort modes", () => {
  assert.equal(getResultKey({ supportKey: 40 }), "40");
  assert.equal(getResultKey({}), null);
  assert.equal(getResultName({ support: "Janna" }), "Janna");
  assert.equal(getResultName({}), "");

  const topResultKeys = getTopResultKeys(
    [
      { support: "No key row", projectedAgency: 9.9, projectedWinRate: 40 },
      { candidate: "Lulu", candidateKey: 117, projectedAgency: 2.2, projectedWinRate: 52 },
      { candidate: "Nami", candidateKey: 267, projectedAgency: 3.1, projectedWinRate: 51 },
    ],
    "unknown-sort-mode",
    5,
  );

  assert.deepEqual(Array.from(topResultKeys), ["117", "267"]);
});

test("getTopResultKeys keeps the best-scoring row for duplicate candidate keys", () => {
  const topResultKeys = getTopResultKeys(
    [
      { candidate: "Lulu", candidateKey: 117, projectedAgency: 0.2, projectedWinRate: 49.5 },
      { candidate: "Lulu", candidateKey: 117, projectedAgency: 1.6, projectedWinRate: 53.7 },
      { candidate: "Nami", candidateKey: 267, projectedAgency: 1.4, projectedWinRate: 54.1 },
      { candidate: "Soraka", candidateKey: 16, projectedAgency: 1.2, projectedWinRate: 55.5 },
    ],
    "projectedAgency",
    2,
  );

  assert.deepEqual(Array.from(topResultKeys), ["117", "267"]);
});
