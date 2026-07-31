const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assignEnemyRoles,
  resolveEnemyRoleSelection,
} = require("../public/enemy-role-assignments.js");

const likelihoodsByChampionKey = {
  103: {
    middle: { lanePercent: 80, pickRate: 10, winRate: 52 },
    support: { lanePercent: 20, pickRate: 2, winRate: 49 },
  },
  99: {
    middle: { lanePercent: 70, pickRate: 8, winRate: 51 },
    support: { lanePercent: 60, pickRate: 7, winRate: 50 },
  },
};

test("assignEnemyRoles keeps automatic assignments unique", () => {
  const assignments = assignEnemyRoles(
    [
      { id: "ahri", key: "103", role: "" },
      { id: "lux", key: "99", role: "" },
    ],
    likelihoodsByChampionKey,
  );

  assert.deepEqual(
    assignments.map((enemy) => [enemy.id, enemy.role]),
    [
      ["ahri", "middle"],
      ["lux", "support"],
    ],
  );
});

test("assignEnemyRoles gives a contested lane to the higher-probability champion", () => {
  const assignments = assignEnemyRoles(
    [
      { id: "ahri", key: "103", role: "" },
      { id: "lux", key: "99", role: "" },
    ],
    {
      103: {
        middle: { lanePercent: 80, pickRate: 10, winRate: 52 },
        support: { lanePercent: 20, pickRate: 2, winRate: 49 },
      },
      99: {
        middle: { lanePercent: 90, pickRate: 8, winRate: 51 },
        support: { lanePercent: 60, pickRate: 7, winRate: 50 },
      },
    },
  );

  assert.deepEqual(
    assignments.map((enemy) => [enemy.id, enemy.role]),
    [
      ["ahri", "support"],
      ["lux", "middle"],
    ],
  );
});

test("assignEnemyRoles preserves explicit user choices", () => {
  const assignments = assignEnemyRoles(
    [
      { id: "ahri", key: "103", role: "support", roleManuallyAssigned: true },
      { id: "lux", key: "99", role: "middle", roleManuallyAssigned: false },
    ],
    likelihoodsByChampionKey,
  );

  assert.deepEqual(
    assignments.map((enemy) => [
      enemy.id,
      enemy.role,
      enemy.roleManuallyAssigned,
    ]),
    [
      ["ahri", "support", true],
      ["lux", "middle", false],
    ],
  );
});

test("resolveEnemyRoleSelection permits a manual duplicate without moving other enemies", () => {
  const assignments = resolveEnemyRoleSelection(
    [
      { id: "ahri", key: "103", role: "middle", roleManuallyAssigned: false },
      { id: "lux", key: "99", role: "support", roleManuallyAssigned: true },
    ],
    "ahri",
    "support",
  );

  assert.deepEqual(
    assignments.map((enemy) => [
      enemy.id,
      enemy.role,
      enemy.roleManuallyAssigned,
    ]),
    [
      ["ahri", "support", true],
      ["lux", "support", true],
    ],
  );
});

test("assignEnemyRoles uses a stable fallback without likelihood data", () => {
  const assignments = assignEnemyRoles([
    { id: "one", key: "1", role: "" },
    { id: "two", key: "2", role: "" },
  ]);

  assert.deepEqual(
    assignments.map((enemy) => enemy.role),
    ["top", "jungle"],
  );
});
