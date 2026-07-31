const test = require("node:test");
const assert = require("node:assert/strict");

const {
  filterBuildCounterEnemies,
  toggleBuildCounterFilter,
} = require("../public/build-counter-filter.js");

const availableKeys = ["103", "99", "64"];

test("an empty legacy selection is treated as all enemies before toggling", () => {
  assert.deepEqual(
    toggleBuildCounterFilter([], "99", availableKeys),
    ["103", "64"],
  );
});

test("excluded portraits can be added back into the filter", () => {
  assert.deepEqual(
    toggleBuildCounterFilter(["103", "64"], "99", availableKeys),
    availableKeys,
  );
});

test("active portraits can be removed and the final removal restores all enemies", () => {
  assert.deepEqual(
    toggleBuildCounterFilter(availableKeys, "99", availableKeys),
    ["103", "64"],
  );
  assert.deepEqual(
    toggleBuildCounterFilter(["64"], "64", availableKeys),
    availableKeys,
  );
});

test("filterBuildCounterEnemies treats an empty selection as the full draft", () => {
  const enemies = availableKeys.map((key) => ({ key }));

  assert.deepEqual(filterBuildCounterEnemies(enemies, []), enemies);
  assert.deepEqual(
    filterBuildCounterEnemies(enemies, ["99", "64"]),
    [{ key: "99" }, { key: "64" }],
  );
});
