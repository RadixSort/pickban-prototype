(function initializeRankFilters(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.rankFilters = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_RANK_FILTER = "emerald_plus";
  const AUTO_IMPORT_BUILD_RANK_FILTER = "master_plus";
  const RANK_FILTER_OPTIONS = [
    { value: "all", label: "All Ranks" },
    { value: "gold_plus", label: "Gold+" },
    { value: "platinum_plus", label: "Platinum+" },
    { value: "emerald_plus", label: "Emerald+" },
    { value: "diamond_plus", label: "Diamond+" },
    { value: "d2_plus", label: "D2+" },
    { value: "master_plus", label: "Master+" },
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
    ["master", "master_plus"],
    ["master+", "master_plus"],
    ["masterplus", "master_plus"],
    ["master_plus", "master_plus"],
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

  /**
   * Return the requested rank followed by each supported lower-rank,
   * broader-population filter. Build recommendations use this order when a
   * complete imported enemy set is unavailable at the selected rank.
   */
  function getRankFilterFallbacks(value) {
    const normalized = normalizeRankFilter(value) || DEFAULT_RANK_FILTER;
    const requestedIndex = RANK_FILTER_OPTIONS.findIndex(
      (option) => option.value === normalized,
    );

    return RANK_FILTER_OPTIONS.slice(0, requestedIndex + 1)
      .map((option) => option.value)
      .reverse();
  }

  function getLolalyticsDataTierQueryValue(value) {
    return normalizeRankFilter(value) || DEFAULT_RANK_FILTER;
  }

  return {
    AUTO_IMPORT_BUILD_RANK_FILTER,
    DEFAULT_RANK_FILTER,
    RANK_FILTER_OPTIONS,
    getLolalyticsDataTierQueryValue,
    getRankFilterFallbacks,
    getRankFilterLabel,
    getRankFilterOptions,
    normalizeRankFilter,
  };
});
