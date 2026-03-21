const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTargetRoleRowResults,
  buildTargetRoleRowResultsWithFallback,
  getTargetRoleRowResult,
} = require("../lib/target-role-row-results.js");

test("buildTargetRoleRowResults batches one fetch across unique target roles", async () => {
  let fetchCount = 0;

  const targetRoleRowResults = await buildTargetRoleRowResults(
    ["support", "bottom", "support"],
    async (targetRoles) => {
      fetchCount += 1;
      assert.deepEqual(targetRoles, ["support", "bottom"]);

      return new Map([
        ["support", new Map([["111", { value: 60 }]])],
        ["bottom", new Map([["222", { value: 55 }]])],
      ]);
    },
  );

  assert.equal(fetchCount, 1);
  assert.equal(getTargetRoleRowResult(targetRoleRowResults, "support").status, "fulfilled");
  assert.equal(getTargetRoleRowResult(targetRoleRowResults, "support").value.size, 1);
  assert.equal(getTargetRoleRowResult(targetRoleRowResults, "bottom").status, "fulfilled");
  assert.equal(getTargetRoleRowResult(targetRoleRowResults, "bottom").value.size, 1);
});

test("buildTargetRoleRowResultsWithFallback only retries missing target roles", async () => {
  const fallbackCalls = [];

  const targetRoleRowResults = await buildTargetRoleRowResultsWithFallback(
    ["support", "bottom"],
    {
      fetchPrimaryRowsByTargetRoles: async () =>
        new Map([
          ["support", new Map([["111", { value: 60 }]])],
          ["bottom", new Map()],
        ]),
      fetchFallbackRowsByTargetRoles: async (targetRoles) => {
        fallbackCalls.push(targetRoles);
        throw new Error("Fallback failed.");
      },
    },
  );

  assert.deepEqual(fallbackCalls, [["bottom"]]);
  assert.equal(getTargetRoleRowResult(targetRoleRowResults, "support").status, "fulfilled");
  assert.equal(getTargetRoleRowResult(targetRoleRowResults, "support").value.size, 1);
  assert.equal(getTargetRoleRowResult(targetRoleRowResults, "bottom").status, "rejected");
  assert.match(
    getTargetRoleRowResult(targetRoleRowResults, "bottom").reason.message,
    /fallback failed/i,
  );
});

test("buildTargetRoleRowResultsWithFallback uses the fallback source when the primary fetch fails", async () => {
  let fallbackCount = 0;

  const targetRoleRowResults = await buildTargetRoleRowResultsWithFallback(
    ["support", "bottom"],
    {
      fetchPrimaryRowsByTargetRoles: async () => {
        throw new Error("Primary failed.");
      },
      fetchFallbackRowsByTargetRoles: async (targetRoles) => {
        fallbackCount += 1;
        assert.deepEqual(targetRoles, ["support", "bottom"]);

        return new Map(
          targetRoles.map((targetRole) => [
            targetRole,
            new Map([[targetRole, { value: 50 }]]),
          ]),
        );
      },
    },
  );

  assert.equal(fallbackCount, 1);
  assert.equal(getTargetRoleRowResult(targetRoleRowResults, "support").status, "fulfilled");
  assert.equal(getTargetRoleRowResult(targetRoleRowResults, "bottom").status, "fulfilled");
  assert.equal(getTargetRoleRowResult(targetRoleRowResults, "support").value.size, 1);
  assert.equal(getTargetRoleRowResult(targetRoleRowResults, "bottom").value.size, 1);
});
