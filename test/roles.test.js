const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_TARGET_ROLE,
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
