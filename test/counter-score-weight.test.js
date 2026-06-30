const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getCounterScoreWeight,
} = require("../lib/counter-score-weight.js");

test("counter score weight halves cross-lane opponent contributions", () => {
  assert.equal(getCounterScoreWeight("support", "jungle"), 0.5);
  assert.equal(getCounterScoreWeight("top", "middle"), 0.5);
});

test("counter score weight preserves same-lane and Bottom-Support contributions", () => {
  assert.equal(getCounterScoreWeight("jungle", "jungle"), 1);
  assert.equal(getCounterScoreWeight("support", "bottom"), 1);
  assert.equal(getCounterScoreWeight("bottom", "support"), 1);
});

test("counter score weight does not guess when a role is unavailable", () => {
  assert.equal(getCounterScoreWeight("support", null), 1);
  assert.equal(getCounterScoreWeight(null, "jungle"), 1);
});
