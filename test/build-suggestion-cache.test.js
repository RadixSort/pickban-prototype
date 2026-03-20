const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBuildSuggestionCacheKey,
} = require("../public/build-suggestion-cache.js");

test("buildBuildSuggestionCacheKey is stable across enemy order", () => {
  const firstKey = buildBuildSuggestionCacheKey(
    "gold_plus",
    {
      key: 103,
      role: "middle",
    },
    [{ key: 64 }, { key: 89 }],
  );
  const secondKey = buildBuildSuggestionCacheKey(
    "gold_plus",
    {
      key: 103,
      role: "middle",
    },
    [{ key: 89 }, { key: 64 }],
  );

  assert.equal(firstKey, secondKey);
});

test("buildBuildSuggestionCacheKey changes when the ally role changes", () => {
  const before = buildBuildSuggestionCacheKey("emerald_plus", { key: 103, role: "middle" }, []);
  const after = buildBuildSuggestionCacheKey("emerald_plus", { key: 103, role: "support" }, []);

  assert.notEqual(before, after);
});
