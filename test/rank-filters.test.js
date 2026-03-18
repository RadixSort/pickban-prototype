const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_RANK_FILTER,
  getLolalyticsTierQueryValue,
  getRankFilterLabel,
  getRankFilterOptions,
  normalizeRankFilter,
} = require("../public/rank-filters.js");

test("normalizeRankFilter accepts supported dropdown values and aliases", () => {
  assert.equal(normalizeRankFilter("all"), "all");
  assert.equal(normalizeRankFilter("All Ranks"), "all");
  assert.equal(normalizeRankFilter("Platinum+"), "platinum_plus");
  assert.equal(normalizeRankFilter("emerald_plus"), "emerald_plus");
  assert.equal(normalizeRankFilter("Diamond+"), "diamond_plus");
  assert.equal(normalizeRankFilter("D2+"), "d2_plus");
});

test("getLolalyticsTierQueryValue omits the Emerald+ default tier parameter", () => {
  assert.equal(DEFAULT_RANK_FILTER, "emerald_plus");
  assert.equal(getLolalyticsTierQueryValue("emerald_plus"), null);
  assert.equal(getLolalyticsTierQueryValue("platinum_plus"), "platinum_plus");
  assert.equal(getLolalyticsTierQueryValue("diamond_plus"), "diamond_plus");
  assert.equal(getLolalyticsTierQueryValue("d2_plus"), "d2_plus");
  assert.equal(getLolalyticsTierQueryValue("all"), "all");
});

test("rank filter labels and options stay aligned with the supported dropdown choices", () => {
  assert.equal(getRankFilterLabel("all"), "All Ranks");
  assert.equal(getRankFilterLabel("emerald_plus"), "Emerald+");
  assert.deepEqual(getRankFilterOptions(), [
    { value: "all", label: "All Ranks" },
    { value: "platinum_plus", label: "Platinum+" },
    { value: "emerald_plus", label: "Emerald+" },
    { value: "diamond_plus", label: "Diamond+" },
    { value: "d2_plus", label: "D2+" },
  ]);
});
