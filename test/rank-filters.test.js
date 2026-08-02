const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_RANK_FILTER,
  getLolalyticsDataTierQueryValue,
  getRankFilterLabel,
  getRankFilterOptions,
  normalizeRankFilter,
} = require("../public/rank-filters.js");

test("normalizeRankFilter accepts supported dropdown values and aliases", () => {
  assert.equal(normalizeRankFilter("all"), "all");
  assert.equal(normalizeRankFilter("All Ranks"), "all");
  assert.equal(normalizeRankFilter("Gold+"), "gold_plus");
  assert.equal(normalizeRankFilter("Platinum+"), "platinum_plus");
  assert.equal(normalizeRankFilter("emerald_plus"), "emerald_plus");
  assert.equal(normalizeRankFilter("Diamond+"), "diamond_plus");
  assert.equal(normalizeRankFilter("D2+"), "d2_plus");
  assert.equal(normalizeRankFilter("Master+"), "master_plus");
});

test("getLolalyticsDataTierQueryValue keeps an explicit tier for data endpoints", () => {
  assert.equal(DEFAULT_RANK_FILTER, "emerald_plus");
  assert.equal(getLolalyticsDataTierQueryValue("emerald_plus"), "emerald_plus");
  assert.equal(getLolalyticsDataTierQueryValue("gold_plus"), "gold_plus");
  assert.equal(getLolalyticsDataTierQueryValue("platinum_plus"), "platinum_plus");
  assert.equal(getLolalyticsDataTierQueryValue("diamond_plus"), "diamond_plus");
  assert.equal(getLolalyticsDataTierQueryValue("d2_plus"), "d2_plus");
  assert.equal(getLolalyticsDataTierQueryValue("master_plus"), "master_plus");
  assert.equal(getLolalyticsDataTierQueryValue("all"), "all");
});

test("rank filter labels and options stay aligned with the supported dropdown choices", () => {
  assert.equal(getRankFilterLabel("all"), "All Ranks");
  assert.equal(getRankFilterLabel("gold_plus"), "Gold+");
  assert.equal(getRankFilterLabel("emerald_plus"), "Emerald+");
  assert.equal(getRankFilterLabel("master_plus"), "Master+");
  assert.deepEqual(getRankFilterOptions(), [
    { value: "all", label: "All Ranks" },
    { value: "gold_plus", label: "Gold+" },
    { value: "platinum_plus", label: "Platinum+" },
    { value: "emerald_plus", label: "Emerald+" },
    { value: "diamond_plus", label: "Diamond+" },
    { value: "d2_plus", label: "D2+" },
    { value: "master_plus", label: "Master+" },
  ]);
});
