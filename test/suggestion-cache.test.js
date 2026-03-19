const test = require("node:test");
const assert = require("node:assert/strict");

const { buildSuggestionCacheKey } = require("../public/suggestion-cache.js");

test("buildSuggestionCacheKey is stable across ally and enemy order", () => {
  const firstKey = buildSuggestionCacheKey(
    "gold_plus",
    [
      { key: 22, role: "support" },
      { key: 51, role: "" },
    ],
    [{ key: 40 }, { key: 89 }],
  );
  const secondKey = buildSuggestionCacheKey(
    "gold_plus",
    [
      { key: 51, role: "" },
      { key: 22, role: "support" },
    ],
    [{ key: 89 }, { key: 40 }],
  );

  assert.equal(firstKey, secondKey);
});

test("buildSuggestionCacheKey changes when an ally role assignment changes", () => {
  const before = buildSuggestionCacheKey("emerald_plus", [{ key: 22, role: "" }], []);
  const after = buildSuggestionCacheKey("emerald_plus", [{ key: 22, role: "support" }], []);

  assert.notEqual(before, after);
});

test("buildSuggestionCacheKey changes when a champion is added or removed", () => {
  const before = buildSuggestionCacheKey("all", [{ key: 22, role: "" }], [{ key: 40 }]);
  const after = buildSuggestionCacheKey("all", [{ key: 22, role: "" }], [{ key: 40 }, { key: 89 }]);

  assert.notEqual(before, after);
});
