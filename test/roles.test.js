const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_TARGET_ROLE,
  getAutoAssignableAllyRole,
  getAssignableAllyRoleOptions,
  getRoleLabel,
  getSuggestedAllyRole,
  getUnassignedTargetRoleOptions,
  normalizeRole,
  resolveAllyRoleAssignment,
} = require("../public/roles.js");

test("normalizeRole supports frontend labels and backend aliases", () => {
  assert.equal(normalizeRole("support"), "support");
  assert.equal(normalizeRole("sup"), "support");
  assert.equal(normalizeRole("utility"), "support");
  assert.equal(normalizeRole("mid"), "middle");
  assert.equal(normalizeRole("adc"), "bottom");
  assert.equal(normalizeRole("unknown"), null);
});

test("getAssignableAllyRoleOptions excludes the target role", () => {
  assert.deepEqual(
    getAssignableAllyRoleOptions("support").map((option) => option.value),
    ["top", "jungle", "middle", "bottom"],
  );

  assert.deepEqual(
    getAssignableAllyRoleOptions("middle").map((option) => option.value),
    ["top", "jungle", "bottom", "support"],
  );
});

test("getRoleLabel falls back to the default target role label", () => {
  assert.equal(DEFAULT_TARGET_ROLE, "support");
  assert.equal(getRoleLabel("bottom"), "Bot");
  assert.equal(getRoleLabel("nonsense"), "Support");
});

test("getUnassignedTargetRoleOptions excludes ally-assigned roles", () => {
  assert.deepEqual(
    getUnassignedTargetRoleOptions([
      { champion: "Ashe", role: "support" },
      { champion: "Jarvan IV", lane: "jg" },
      { champion: "Smolder", role: "" },
    ]).map((option) => option.value),
    ["top", "middle", "bottom"],
  );
});

test("getSuggestedAllyRole assigns the first remaining role for the selected ally", () => {
  assert.equal(
    getSuggestedAllyRole(
      [
        { id: "1", champion: "Darius", role: "top" },
        { id: "2", champion: "Jarvan IV", role: "jungle" },
        { id: "3", champion: "Ahri", role: "" },
      ],
      "3",
    ),
    "middle",
  );
});

test("getSuggestedAllyRole ignores other unassigned allies when suggesting a new pick", () => {
  assert.equal(
    getSuggestedAllyRole(
      [
        { id: "1", champion: "Darius", role: "" },
        { id: "2", champion: "Jarvan IV", role: "jungle" },
        { id: "3", champion: "Ahri", role: "" },
        { id: "4", champion: "Leona", role: "support" },
      ],
      "3",
    ),
    "top",
  );
});

test("getSuggestedAllyRole prefers the highest remaining Lolalytics lane share", () => {
  assert.equal(
    getSuggestedAllyRole(
      [
        { id: "1", champion: "Darius", role: "top" },
        { id: "2", champion: "Ahri", role: "" },
      ],
      "2",
      {
        middle: { lanePercent: 78.4, pickRate: 9.2, winRate: 51.3 },
        support: { lanePercent: 8.1, pickRate: 1.1, winRate: 49.7 },
      },
    ),
    "middle",
  );
});

test("getSuggestedAllyRole skips taken roles even when they are the most likely lane", () => {
  assert.equal(
    getSuggestedAllyRole(
      [
        { id: "1", champion: "Jarvan IV", role: "jungle" },
        { id: "2", champion: "Ahri", role: "" },
      ],
      "2",
      {
        jungle: { lanePercent: 89.4, pickRate: 12.7, winRate: 52.1 },
        middle: { lanePercent: 71.2, pickRate: 10.5, winRate: 51.6 },
        support: { lanePercent: 6.4, pickRate: 0.8, winRate: 48.9 },
      },
    ),
    "middle",
  );
});

test("resolveAllyRoleAssignment swaps roles when a taken lane is selected", () => {
  assert.deepEqual(
    resolveAllyRoleAssignment(
      [
        { id: "1", champion: "Darius", role: "top" },
        { id: "2", champion: "Jarvan IV", role: "jungle" },
        { id: "3", champion: "Ahri", role: "middle" },
      ],
      "3",
      "top",
    ).map((ally) => ({ id: ally.id, role: ally.role })),
    [
      { id: "1", role: "middle" },
      { id: "2", role: "jungle" },
      { id: "3", role: "top" },
    ],
  );
});

test("resolveAllyRoleAssignment reassigns a displaced ally to an open lane", () => {
  assert.deepEqual(
    resolveAllyRoleAssignment(
      [
        { id: "1", key: "122", champion: "Darius", role: "top" },
        { id: "2", key: "59", champion: "Jarvan IV", role: "jungle" },
        { id: "3", key: "103", champion: "Ahri", role: "" },
        { id: "4", key: "89", champion: "Leona", role: "support" },
      ],
      "3",
      "top",
      {
        122: {
          bottom: { lanePercent: 72.1, pickRate: 3.4, winRate: 52.7 },
          middle: { lanePercent: 18.8, pickRate: 1.1, winRate: 49.2 },
        },
      },
    ).map((ally) => ({ id: ally.id, role: ally.role })),
    [
      { id: "1", role: "bottom" },
      { id: "2", role: "jungle" },
      { id: "3", role: "top" },
      { id: "4", role: "support" },
    ],
  );
});

test("getAutoAssignableAllyRole returns the last remaining role only for a full team", () => {
  assert.deepEqual(
    getAutoAssignableAllyRole([
      { id: "1", champion: "Darius", role: "top" },
      { id: "2", champion: "Jarvan IV", role: "jungle" },
      { id: "3", champion: "Ahri", role: "middle" },
      { id: "4", champion: "Miss Fortune", role: "bottom" },
      { id: "5", champion: "Leona", role: "" },
    ]),
    {
      ally: { id: "5", champion: "Leona", role: "" },
      allyIndex: 4,
      role: "support",
    },
  );

  assert.equal(
    getAutoAssignableAllyRole([
      { id: "1", champion: "Darius", role: "top" },
      { id: "2", champion: "Jarvan IV", role: "jungle" },
      { id: "3", champion: "Ahri", role: "middle" },
      { id: "4", champion: "Miss Fortune", role: "" },
    ]),
    null,
  );

  assert.equal(
    getAutoAssignableAllyRole([
      { id: "1", champion: "Darius", role: "top" },
      { id: "2", champion: "Jarvan IV", role: "jungle" },
      { id: "3", champion: "Ahri", role: "" },
      { id: "4", champion: "Miss Fortune", role: "bottom" },
      { id: "5", champion: "Leona", role: "" },
    ]),
    null,
  );
});
