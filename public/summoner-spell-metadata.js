(function initializeSummonerSpellMetadata(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.summonerSpellMetadata = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const SUMMONER_SPELL_ICON_BASE_URL = "https://cdn5.lolalytics.com/spell64";

  const SUMMONER_SPELL_NAME_BY_ID = new Map([
    [1, "Cleanse"],
    [3, "Exhaust"],
    [4, "Flash"],
    [6, "Ghost"],
    [7, "Heal"],
    [11, "Smite"],
    [12, "Teleport"],
    [13, "Clarity"],
    [14, "Ignite"],
    [21, "Barrier"],
    [32, "Mark"],
    [39, "Mark"],
  ]);

  function buildSummonerSpellIconUrl(value) {
    const spellId = normalizeNumericId(value);
    if (spellId == null || !SUMMONER_SPELL_NAME_BY_ID.has(spellId)) {
      return "";
    }

    return `${SUMMONER_SPELL_ICON_BASE_URL}/${spellId}.webp`;
  }

  function getSummonerSpellName(value) {
    const spellId = normalizeNumericId(value);
    return spellId == null ? "" : SUMMONER_SPELL_NAME_BY_ID.get(spellId) || "";
  }

  function normalizeNumericId(value) {
    const numericValue = Number(value);
    return Number.isInteger(numericValue) ? numericValue : null;
  }

  return {
    buildSummonerSpellIconUrl,
    getSummonerSpellName,
  };
});
