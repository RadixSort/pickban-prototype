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

test("buildBuildSuggestionCacheKey changes when an enemy role changes", () => {
  const ally = { key: 103, role: "middle" };
  const before = buildBuildSuggestionCacheKey(
    "emerald_plus",
    ally,
    [{ key: 89, role: "support" }],
  );
  const after = buildBuildSuggestionCacheKey(
    "emerald_plus",
    ally,
    [{ key: 89, role: "top" }],
  );

  assert.notEqual(before, after);
});

test("buildBuildSuggestionCacheKey changes with the filtered enemy subset", () => {
  const ally = { key: 103, role: "middle" };
  const before = buildBuildSuggestionCacheKey(
    "emerald_plus",
    ally,
    [{ key: 89 }],
  );
  const after = buildBuildSuggestionCacheKey(
    "emerald_plus",
    ally,
    [{ key: 89 }, { key: 222 }],
  );

  assert.notEqual(before, after);
});

test("buildBuildSuggestionCacheKey separates complete auto-import requests", () => {
  const ally = { key: 103, role: "middle" };
  const enemies = [{ key: 89 }, { key: 222 }];
  const partialKey = buildBuildSuggestionCacheKey("emerald_plus", ally, enemies);
  const completeKey = buildBuildSuggestionCacheKey(
    "emerald_plus",
    ally,
    enemies,
    { requireCompleteMatchups: true },
  );

  assert.notEqual(partialKey, completeKey);
  assert.match(completeKey, /\|complete=1$/);
});
