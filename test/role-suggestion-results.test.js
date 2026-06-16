const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRoleSuggestionResults,
  buildSuggestionMeta,
} = require("../lib/role-suggestion-results.js");

const championByKey = new Map([
  ["111", { key: "111", name: "Nautilus", icon: "nautilus.webp" }],
  ["222", { key: "222", name: "Thresh", icon: "thresh.webp" }],
  ["333", { key: "333", name: "Leona", icon: "leona.webp" }],
]);

test("buildRoleSuggestionResults aggregates ally and enemy scores, filters picks, and preserves failures", () => {
  const roleSuggestionResults = buildRoleSuggestionResults({
    allyResults: [
      {
        status: "fulfilled",
        value: {
          rows: new Map([
            ["111", { value: 54, winRate: 52 }],
            ["222", { value: 52, winRate: 51 }],
          ]),
        },
      },
      {
        status: "rejected",
        reason: new Error("Ahri synergy data was unavailable."),
      },
    ],
    enemyResults: [
      {
        status: "fulfilled",
        value: {
          rows: new Map([
            ["111", { value: -48, winRate: 53 }],
            ["333", { value: -51, winRate: null }],
          ]),
        },
      },
      {
        status: "rejected",
        reason: {},
      },
    ],
    eligibleTierStats: new Map([
      ["111", { lanePercent: 90, pickRate: 12, winRate: 51.2 }],
      ["333", { lanePercent: 88, pickRate: 9, winRate: 50.5 }],
    ]),
    selectedChampionKeys: new Set(["333"]),
    targetRole: "support",
    championByKey,
  });

  assert.deepEqual(roleSuggestionResults.partialFailures, [
    "Ahri synergy data was unavailable.",
    "Unexpected server error.",
  ]);
  assert.deepEqual(roleSuggestionResults.results, [
    {
      candidate: "Nautilus",
      candidateKey: "111",
      support: "Nautilus",
      supportKey: "111",
      icon: "nautilus.webp",
      role: "support",
      synergyScore: 54,
      counterScore: -48,
      projectedWinRate: 49.5,
      projectedAgency: 3,
      finalScore: 3,
      lanePercent: 90,
      pickRate: 12,
      winRate: 51.2,
    },
  ]);
});

test("buildRoleSuggestionResults defaults to projected win rate ordering", () => {
  const roleSuggestionResults = buildRoleSuggestionResults({
    allyResults: [
      {
        status: "fulfilled",
        value: {
          rows: new Map([
            ["111", { value: 52, winRate: 55 }],
            ["222", { value: 58, winRate: 53 }],
          ]),
        },
      },
    ],
    enemyResults: [
      {
        status: "fulfilled",
        value: {
          rows: new Map([
            ["111", { value: 50, winRate: 49 }],
            ["222", { value: 50, winRate: 52 }],
          ]),
        },
      },
    ],
    eligibleTierStats: new Map([
      ["111", { lanePercent: 90, pickRate: 12, winRate: 51.2 }],
      ["222", { lanePercent: 88, pickRate: 9, winRate: 50.5 }],
    ]),
    selectedChampionKeys: new Set(),
    targetRole: "support",
    championByKey,
  });

  assert.deepEqual(
    roleSuggestionResults.results.map((result) => result.candidate),
    ["Nautilus", "Thresh"],
  );
});

test("buildRoleSuggestionResults throws when matchup rows reference missing champion metadata", () => {
  assert.throws(
    () =>
      buildRoleSuggestionResults({
        allyResults: [
          {
            status: "fulfilled",
            value: {
              rows: new Map([["999", { value: 54, winRate: 52 }]]),
            },
          },
        ],
        enemyResults: [],
        eligibleTierStats: new Map(),
        selectedChampionKeys: new Set(),
        targetRole: "support",
        championByKey,
      }),
    /missing local metadata/i,
  );
});

test("buildSuggestionMeta reports draft counts and assigned roles", () => {
  assert.deepEqual(
    buildSuggestionMeta(
      "diamond_plus",
      "middle",
      [
        { champion: { name: "Ahri" }, role: "middle" },
        { champion: { name: "Jarvan IV" }, role: null },
      ],
      [{ name: "Leona" }],
      ["Partial failure"],
    ),
    {
      rankFilter: "diamond_plus",
      role: "middle",
      allyCount: 2,
      enemyCount: 1,
      assignedRoleCount: 1,
      partialFailures: ["Partial failure"],
    },
  );
});
