const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeAllySelections,
  normalizeBuildSuggestionRequest,
  normalizeDraftProjectionRequest,
  normalizeChampionSelections,
  normalizeRequestedRankFilter,
  validateAllyRoleAssignments,
  validateNoOpposingChampionSelections,
} = require("../lib/request-normalization.js");
const {
  DEFAULT_RANK_FILTER,
  normalizeRankFilter,
} = require("../public/rank-filters.js");
const { normalizeRole } = require("../public/roles.js");

const championByName = new Map([
  ["darius", { key: "122", id: "darius", name: "Darius" }],
  ["ahri", { key: "103", id: "ahri", name: "Ahri" }],
  ["jarvaniv", { key: "59", id: "jarvaniv", name: "Jarvan IV" }],
  ["leona", { key: "89", id: "leona", name: "Leona" }],
  ["jinx", { key: "222", id: "jinx", name: "Jinx" }],
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

test("validateNoOpposingChampionSelections rejects champions selected on both sides", () => {
  assert.throws(
    () =>
      validateNoOpposingChampionSelections(
        [{ champion: championByName.get("ahri"), role: "middle" }],
        [championByName.get("ahri")],
      ),
    /cannot appear on both allied and enemy sides/i,
  );
});

test("normalizeBuildSuggestionRequest validates ally role, enemies, and rank filter", () => {
  const request = normalizeBuildSuggestionRequest(
    {
      rankFilter: "diamond+",
      ally: {
        champion: "Ahri",
        role: "mid",
      },
      enemies: ["Jarvan IV", "Miss Fortune", "Leona", "Jinx", "Darius"],
    },
    {
      championByName,
      defaultRankFilter: DEFAULT_RANK_FILTER,
      normalizeRankFilter,
      normalizeRole,
    },
  );

  assert.deepEqual(request, {
    rankFilter: "diamond_plus",
    ally: {
      champion: championByName.get("ahri"),
      role: "middle",
    },
    enemies: [
      championByName.get("jarvaniv"),
      championByName.get("missfortune"),
      championByName.get("leona"),
      championByName.get("jinx"),
      championByName.get("darius"),
    ],
  });
});

test("normalizeBuildSuggestionRequest requires a full enemy team", () => {
  assert.throws(
    () =>
      normalizeBuildSuggestionRequest(
        {
          ally: {
            champion: "Ahri",
            role: "mid",
          },
          enemies: [],
        },
        {
          championByName,
          defaultRankFilter: DEFAULT_RANK_FILTER,
          normalizeRankFilter,
          normalizeRole,
        },
      ),
    /exactly 5 enemy champions/i,
  );
});

test("normalizeBuildSuggestionRequest rejects missing ally role and opposing picks", () => {
  assert.throws(
    () =>
      normalizeBuildSuggestionRequest(
        {
          ally: {
            champion: "Ahri",
          },
          enemies: ["Jarvan IV"],
        },
        {
          championByName,
          defaultRankFilter: DEFAULT_RANK_FILTER,
          normalizeRankFilter,
          normalizeRole,
        },
      ),
    /ally\.role/i,
  );

  assert.throws(
    () =>
      normalizeBuildSuggestionRequest(
        {
          ally: {
            champion: "Ahri",
            role: "mid",
          },
          enemies: ["Ahri", "Jarvan IV", "Miss Fortune", "Leona", "Jinx"],
        },
        {
          championByName,
          defaultRankFilter: DEFAULT_RANK_FILTER,
          normalizeRankFilter,
          normalizeRole,
        },
      ),
    /cannot appear on both allied and enemy sides/i,
  );
});

test("normalizeDraftProjectionRequest requires five allies with assigned roles", () => {
  const request = normalizeDraftProjectionRequest(
    {
      rankFilter: "emerald_plus",
      allies: [
        { champion: "Darius", role: "top" },
        { champion: "Jarvan IV", role: "jungle" },
        { champion: "Ahri", role: "mid" },
        { champion: "Miss Fortune", role: "bot" },
        { champion: "Leona", role: "support" },
      ],
      enemies: ["Jinx"],
    },
    {
      championByName,
      defaultRankFilter: DEFAULT_RANK_FILTER,
      normalizeRankFilter,
      normalizeRole,
    },
  );

  assert.equal(request.rankFilter, "emerald_plus");
  assert.equal(request.allies.length, 5);
  assert.equal(request.enemies.length, 1);

  assert.throws(
    () =>
      normalizeDraftProjectionRequest(
        {
          allies: [
            { champion: "Darius", role: "top" },
            { champion: "Jarvan IV", role: "jungle" },
            { champion: "Ahri", role: "mid" },
            { champion: "Miss Fortune", role: "bot" },
          ],
        },
        {
          championByName,
          defaultRankFilter: DEFAULT_RANK_FILTER,
          normalizeRankFilter,
          normalizeRole,
        },
      ),
    /exactly 5 allied champions/i,
  );

  assert.throws(
    () =>
      normalizeDraftProjectionRequest(
        {
          allies: [
            { champion: "Darius", role: "top" },
            { champion: "Jarvan IV", role: "jungle" },
            { champion: "Ahri", role: "mid" },
            { champion: "Miss Fortune", role: "bot" },
            { champion: "Leona" },
          ],
        },
        {
          championByName,
          defaultRankFilter: DEFAULT_RANK_FILTER,
          normalizeRankFilter,
          normalizeRole,
        },
      ),
    /assign all five allied roles/i,
  );
});
