const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeAllySelections,
  normalizeChampionSelections,
  normalizeRequestedRankFilter,
  validateAllyRoleAssignments,
} = require("../lib/request-normalization.js");
const {
  DEFAULT_RANK_FILTER,
  normalizeRankFilter,
} = require("../public/rank-filters.js");
const { normalizeRole } = require("../public/roles.js");

const championByName = new Map([
  ["ahri", { key: "103", id: "ahri", name: "Ahri" }],
  ["jarvaniv", { key: "59", id: "jarvaniv", name: "Jarvan IV" }],
  ["missfortune", { key: "21", id: "missfortune", name: "Miss Fortune" }],
]);

test("normalizeAllySelections parses ally objects, normalizes roles, and deduplicates champions", () => {
  const allies = normalizeAllySelections(
    [
      { champion: "Ahri", role: "mid" },
      { name: "Jarvan IV", lane: "jg" },
      "Miss Fortune",
      { champion: "Ahri", role: "support" },
    ],
    {
      championByName,
      maxCount: 4,
      label: "allies",
      normalizeRole,
    },
  );

  assert.deepEqual(allies, [
    { champion: championByName.get("ahri"), role: "middle" },
    { champion: championByName.get("jarvaniv"), role: "jungle" },
    { champion: championByName.get("missfortune"), role: null },
  ]);
});

test("normalizeChampionSelections rejects invalid enemy payloads and unknown champions", () => {
  assert.throws(
    () =>
      normalizeChampionSelections("Ahri", {
        championByName,
        maxCount: 5,
        label: "enemies",
      }),
    /must be an array/i,
  );

  assert.throws(
    () =>
      normalizeChampionSelections(["Unknown"], {
        championByName,
        maxCount: 5,
        label: "enemies",
      }),
    /unknown champion/i,
  );
});

test("normalizeRequestedRankFilter defaults and rejects unsupported rank filters", () => {
  assert.equal(
    normalizeRequestedRankFilter("", {
      defaultRankFilter: DEFAULT_RANK_FILTER,
      normalizeRankFilter,
    }),
    DEFAULT_RANK_FILTER,
  );

  assert.throws(
    () =>
      normalizeRequestedRankFilter("challenger_only", {
        defaultRankFilter: DEFAULT_RANK_FILTER,
        normalizeRankFilter,
      }),
    /invalid rank filter/i,
  );
});

test("validateAllyRoleAssignments rejects duplicate normalized roles", () => {
  assert.throws(
    () =>
      validateAllyRoleAssignments([
        { champion: championByName.get("ahri"), role: "middle" },
        { champion: championByName.get("jarvaniv"), role: "middle" },
      ]),
    /same role to multiple allied champions/i,
  );
});
