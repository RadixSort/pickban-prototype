(function initializeRuneMetadata(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.runeMetadata = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const RUNE_STYLE_DEFINITIONS = [
    {
      styleId: 8000,
      key: "Precision",
      name: "Precision",
      icon: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7201_Precision.png",
      slots: [
        [8005, 8008, 8021, 8010],
        [9101, 9111, 8009],
        [9104, 9105, 9103],
        [8014, 8017, 8299],
      ],
    },
    {
      styleId: 8100,
      key: "Domination",
      name: "Domination",
      icon: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7200_Domination.png",
      slots: [
        [8112, 8128, 9923],
        [8126, 8139, 8143],
        [8137, 8140, 8141],
        [8135, 8105, 8106],
      ],
    },
    {
      styleId: 8200,
      key: "Sorcery",
      name: "Sorcery",
      icon: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7202_Sorcery.png",
      slots: [
        [8214, 8229, 8230, 8992],
        [8224, 8226, 8275],
        [8210, 8234, 8233],
        [8237, 8232, 8236],
      ],
    },
    {
      styleId: 8400,
      key: "Resolve",
      name: "Resolve",
      icon: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7204_Resolve.png",
      slots: [
        [8437, 8439, 8465],
        [8446, 8463, 8401],
        [8429, 8444, 8473],
        [8451, 8453, 8242],
      ],
    },
    {
      styleId: 8300,
      key: "Inspiration",
      name: "Inspiration",
      icon: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7203_Whimsy.png",
      slots: [
        [8351, 8360, 8369],
        [8306, 8304, 8321],
        [8313, 8352, 8345],
        [8347, 8410, 8316],
      ],
    },
  ];

  // Stat shards are not included in Riot's rune-tree definitions. Keep their
  // legal row positions here so histogram-built recommendations can assemble
  // an importable page without relying on a prebuilt page sample. Armor and
  // magic-resist IDs remain for older payloads that can still be cached.
  const RUNE_STAT_MOD_DEFINITIONS = [
    { id: 5005, slotIndexes: [0] },
    { id: 5007, slotIndexes: [0] },
    { id: 5008, slotIndexes: [0, 1] },
    { id: 5010, slotIndexes: [1] },
    { id: 5001, slotIndexes: [1, 2] },
    { id: 5011, slotIndexes: [2] },
    { id: 5013, slotIndexes: [2] },
    { id: 5002, slotIndexes: [1, 2] },
    { id: 5003, slotIndexes: [1, 2] },
  ];

  const STAT_MOD_ICON_BASE_URL = "https://cdn5.lolalytics.com/statmod";
  const RUNE_ICON_BASE_URL = "https://cdn5.lolalytics.com/rune";
  const runeStyleById = new Map();
  const runeDefinitionById = new Map();
  const statModDefinitionById = new Map(
    RUNE_STAT_MOD_DEFINITIONS.map((definition) => [definition.id, definition]),
  );

  RUNE_STYLE_DEFINITIONS.forEach((style) => {
    runeStyleById.set(style.styleId, style);
    style.slots.forEach((slotRuneIds, slotIndex) => {
      slotRuneIds.forEach((runeId) => {
        runeDefinitionById.set(runeId, {
          runeId,
          styleId: style.styleId,
          styleKey: style.key,
          styleName: style.name,
          slotIndex,
          isKeystone: slotIndex === 0,
        });
      });
    });
  });

  function getRuneDefinition(value) {
    const runeId = normalizeNumericId(value);
    return runeId == null ? null : runeDefinitionById.get(runeId) || null;
  }

  function getRuneStyle(value) {
    const styleId = normalizeNumericId(value);
    return styleId == null ? null : runeStyleById.get(styleId) || null;
  }

  function getStatModDefinition(value) {
    const statModId = normalizeNumericId(value);
    return statModId == null ? null : statModDefinitionById.get(statModId) || null;
  }

  function listRuneStyles() {
    return RUNE_STYLE_DEFINITIONS.map((style) => ({ ...style }));
  }

  function buildRuneIconUrl(value, size = 68) {
    const runeId = normalizeNumericId(value);
    return runeId == null ? "" : `${RUNE_ICON_BASE_URL}${size}/${runeId}.webp`;
  }

  function buildStatModIconUrl(value, size = 32) {
    const statModId = normalizeNumericId(value);
    return statModId == null ? "" : `${STAT_MOD_ICON_BASE_URL}${size}/${statModId}.webp`;
  }

  function buildRuneStyleIconUrl(value) {
    return getRuneStyle(value)?.icon || "";
  }

  function normalizeNumericId(value) {
    const numericValue = Number(value);
    return Number.isInteger(numericValue) ? numericValue : null;
  }

  return {
    RUNE_STAT_MOD_DEFINITIONS,
    RUNE_STYLE_DEFINITIONS,
    buildRuneIconUrl,
    buildRuneStyleIconUrl,
    buildStatModIconUrl,
    getRuneDefinition,
    getRuneStyle,
    getStatModDefinition,
    listRuneStyles,
  };
});
