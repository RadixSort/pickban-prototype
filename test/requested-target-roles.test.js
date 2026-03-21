const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeRequestedTargetRoles,
  resolveRequestedTargetRoles,
} = require("../lib/requested-target-roles.js");

test("normalizeRequestedTargetRoles deduplicates valid role aliases", () => {
  assert.deepEqual(normalizeRequestedTargetRoles(["sup", "support", "bot"]), [
    "support",
    "bottom",
  ]);
});

test("resolveRequestedTargetRoles defaults to all unassigned ally roles", () => {
  assert.deepEqual(
    resolveRequestedTargetRoles({
      allies: [
        { champion: "Ashe", role: "support" },
        { champion: "Jarvan IV", role: "jungle" },
      ],
    }),
    ["top", "middle", "bottom"],
  );
});

test("resolveRequestedTargetRoles rejects ally-assigned target roles", () => {
  assert.throws(
    () =>
      resolveRequestedTargetRoles({
        allies: [{ champion: "Leona", role: "support" }],
        role: "support",
      }),
    /assigned to an allied champion/i,
  );
});

test("resolveRequestedTargetRoles supports explicit multi-role requests", () => {
  assert.deepEqual(
    resolveRequestedTargetRoles({
      allies: [{ champion: "Nami", role: "support" }],
      roles: ["top", "mid", "bot"],
    }),
    ["top", "middle", "bottom"],
  );
});

test("resolveRequestedTargetRoles returns no roles when every allied role is assigned", () => {
  assert.deepEqual(
    resolveRequestedTargetRoles({
      allies: [
        { champion: "Darius", role: "top" },
        { champion: "Jarvan IV", role: "jungle" },
        { champion: "Ahri", role: "middle" },
        { champion: "Miss Fortune", role: "bottom" },
        { champion: "Leona", role: "support" },
      ],
    }),
    [],
  );
});
