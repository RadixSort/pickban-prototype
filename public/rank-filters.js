(function initializeRankFilters(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.rankFilters = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_RANK_FILTER = "emerald_plus";
  const RANK_FILTER_OPTIONS = [
    { value: "all", label: "All Ranks", tierQueryValue: "all" },
    { value: "gold_plus", label: "Gold+", tierQueryValue: "gold_plus" },
    { value: "platinum_plus", label: "Platinum+", tierQueryValue: "platinum_plus" },
    { value: "emerald_plus", label: "Emerald+", tierQueryValue: null },
    { value: "diamond_plus", label: "Diamond+", tierQueryValue: "diamond_plus" },
    { value: "d2_plus", label: "D2+", tierQueryValue: "d2_plus" },
  ];

  const rankFilterByValue = new Map(RANK_FILTER_OPTIONS.map((option) => [option.value, option]));
  const rankFilterAliases = new Map([
    ["all", "all"],
    ["allranks", "all"],
    ["all_ranks", "all"],
    ["gold", "gold_plus"],
    ["gold+", "gold_plus"],
    ["goldplus", "gold_plus"],
    ["gold_plus", "gold_plus"],
    ["platinum", "platinum_plus"],
    ["platinum+", "platinum_plus"],
    ["platinumplus", "platinum_plus"],
    ["platinum_plus", "platinum_plus"],
    ["emerald", "emerald_plus"],
    ["emerald+", "emerald_plus"],
    ["emeraldplus", "emerald_plus"],
    ["emerald_plus", "emerald_plus"],
    ["diamond", "diamond_plus"],
    ["diamond+", "diamond_plus"],
    ["diamondplus", "diamond_plus"],
    ["diamond_plus", "diamond_plus"],
    ["d2", "d2_plus"],
    ["d2+", "d2_plus"],
    ["d2plus", "d2_plus"],
    ["d2_plus", "d2_plus"],
  ]);

  function normalizeRankFilter(value) {
    if (value == null) {
      return null;
    }

    if (typeof value !== "string") {
      return null;
    }

    const compactValue = value.trim().toLowerCase().replace(/\s+/g, "_");
    const compactAlias = compactValue.replace(/_/g, "");

    return rankFilterByValue.has(compactValue)
      ? compactValue
      : rankFilterAliases.get(compactValue) || rankFilterAliases.get(compactAlias) || null;
  }

  function getRankFilterLabel(value) {
    const normalized = normalizeRankFilter(value) || DEFAULT_RANK_FILTER;
    return rankFilterByValue.get(normalized)?.label || "Emerald+";
  }

  function getRankFilterOptions() {
    return RANK_FILTER_OPTIONS.map(({ value, label }) => ({
      value,
      label,
    }));
  }

  function getLolalyticsTierQueryValue(value) {
    const normalized = normalizeRankFilter(value) || DEFAULT_RANK_FILTER;
    return rankFilterByValue.get(normalized)?.tierQueryValue ?? null;
  }

  function getLolalyticsDataTierQueryValue(value) {
    return normalizeRankFilter(value) || DEFAULT_RANK_FILTER;
  }

  return {
    DEFAULT_RANK_FILTER,
    RANK_FILTER_OPTIONS,
    getLolalyticsDataTierQueryValue,
    getLolalyticsTierQueryValue,
    getRankFilterLabel,
    getRankFilterOptions,
    normalizeRankFilter,
  };
});
