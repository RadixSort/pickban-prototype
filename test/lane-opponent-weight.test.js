const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_LANE_OPPONENT_WEIGHT,
  DEFAULT_LANE_OPPONENT_WEIGHT_BY_ROLE,
  getDefaultLaneOpponentWeightForRole,
  getLaneOpponentWeightAfterRoleChange,
  getLaneOpponentWeightOptions,
  normalizeLaneOpponentWeight,
  rolesShareLane,
} = require("../public/lane-opponent-weight.js");
const {
  expandEntriesByLaneOpponentWeight,
  findLaneOpponentIndexes,
} = require("../lib/lane-opponent-weight.js");

test("lane opponent weights expose only the supported UI options", () => {
  assert.equal(DEFAULT_LANE_OPPONENT_WEIGHT, 3);
  assert.deepEqual(getLaneOpponentWeightOptions(), [
    { value: 1, label: "×1" },
    { value: 2, label: "×2" },
    { value: 3, label: "×3" },
    { value: 4, label: "×4" },
  ]);
  assert.equal(normalizeLaneOpponentWeight("2"), 2);
  assert.equal(normalizeLaneOpponentWeight(3), 3);
  assert.equal(normalizeLaneOpponentWeight(true), null);
  assert.equal(normalizeLaneOpponentWeight(4), 4);
  assert.equal(normalizeLaneOpponentWeight(5), null);
});

test("lane opponent weight defaults follow the viewed role", () => {
  assert.deepEqual(DEFAULT_LANE_OPPONENT_WEIGHT_BY_ROLE, {
    top: 4,
    jungle: 2,
    middle: 3,
    bottom: 3,
    support: 2,
  });
  assert.equal(getDefaultLaneOpponentWeightForRole("sup"), 2);
  assert.equal(getDefaultLaneOpponentWeightForRole("jg"), 2);
  assert.equal(getDefaultLaneOpponentWeightForRole("bot"), 3);
  assert.equal(getDefaultLaneOpponentWeightForRole("mid"), 3);
  assert.equal(getDefaultLaneOpponentWeightForRole("top"), 4);
  assert.equal(getDefaultLaneOpponentWeightForRole("unknown"), 3);
});

test("manual lane weights hold until the viewed role has a different default", () => {
  assert.equal(getLaneOpponentWeightAfterRoleChange(4, "support", "jungle"), 4);
  assert.equal(getLaneOpponentWeightAfterRoleChange(1, "middle", "bottom"), 1);
  assert.equal(getLaneOpponentWeightAfterRoleChange(4, "jungle", "middle"), 3);
  assert.equal(getLaneOpponentWeightAfterRoleChange(1, "bottom", "top"), 4);
  assert.equal(getLaneOpponentWeightAfterRoleChange(1, "top", "support"), 2);
});

test("Bottom and Support are the same lane", () => {
  assert.equal(rolesShareLane("support", "bottom"), true);
  assert.equal(rolesShareLane("adc", "sup"), true);
  assert.equal(rolesShareLane("support", "jungle"), false);
});

test("lane inference selects every same-lane enemy", () => {
  const entries = [
    { role: "support" },
    { role: "bottom" },
    { role: "jungle" },
  ];

  assert.deepEqual(
    [...findLaneOpponentIndexes(entries, {
      targetRole: "support",
      getOpponentRole: (entry) => entry.role,
    })],
    [0, 1],
  );
});

test("off-meta drafts always select the most likely fallback lane opponent", () => {
  const entries = [
    { key: "vi", role: "jungle", likelihood: 4 },
    { key: "neeko", role: "middle", likelihood: 19 },
    { key: "sion", role: "top", likelihood: 2 },
  ];

  assert.deepEqual(
    [...findLaneOpponentIndexes(entries, {
      targetRole: "support",
      getOpponentRole: (entry) => entry.role,
      getLaneOpponentLikelihood: (entry) => entry.likelihood,
      getStableKey: (entry) => entry.key,
    })],
    [1],
  );
});

test("the selected multiplier controls lane-opponent contributions", () => {
  const entries = [
    { key: "lane", role: "middle" },
    { key: "other", role: "top" },
  ];

  for (const laneOpponentWeight of [1, 2, 3, 4]) {
    const expanded = expandEntriesByLaneOpponentWeight(entries, {
      laneOpponentWeight,
      targetRole: "middle",
      getOpponentRole: (entry) => entry.role,
    });

    assert.equal(
      expanded.filter((entry) => entry.key === "lane").length,
      laneOpponentWeight,
    );
    assert.equal(expanded.filter((entry) => entry.key === "other").length, 1);
  }
});
