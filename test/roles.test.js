const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_TARGET_ROLE,
  getAutoAssignableAllyRole,
  getAssignableAllyRoleOptions,
  getRoleLabel,
  getUnassignedTargetRoleOptions,
  normalizeRole,
} = require("../public/roles.js");

test("normalizeRole supports frontend labels and backend aliases", () => {
  assert.equal(normalizeRole("support"), "support");
  assert.equal(normalizeRole("sup"), "support");
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
