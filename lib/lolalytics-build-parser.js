const {
  buildRuneIconUrl,
  buildRuneStyleIconUrl,
  buildStatModIconUrl,
  getRuneDefinition,
  getRuneStyle,
  listRuneStyles,
} = require("../public/rune-metadata.js");

const ITEM_ICON_BASE_URL = "https://cdn5.lolalytics.com/item64";
const COMPLETED_BOOT_IDS = new Set([3005, 3006, 3009, 3020, 3047, 3111, 3117, 3158]);
const COMPLETED_BOOT_NAME_PATTERN =
  /(greaves|shoes|treads|steelcaps|symbiotic soles|boots of swiftness|ionian boots|mobility boots)/i;
const STAT_MOD_ID_MIN = 5000;
const STAT_MOD_ID_MAX = 5999;

function parseLolalyticsMatchupBuildData(buildLoader, metadataLoader, options = {}) {
  if (!buildLoader || typeof buildLoader !== "object") {
    throw new Error("Build loader is required to parse matchup build data.");
  }

  const runeNamesById = metadataLoader?.runes || {};
  const itemNamesById = metadataLoader?.items || {};
  const totalGames = toNumber(buildLoader?.header?.n);
  const runeStats = buildLoader?.runes?.stats || {};
  const fetchedAt =
    typeof options.fetchedAt === "string" && options.fetchedAt ? options.fetchedAt : new Date().toISOString();

  const primaryStyleOptions = new Map();
  const secondaryStyleSelectionTotals = new Map();
  const primarySlotOptions = createSlotOptionMaps();
  const secondarySlotOptions = createSlotOptionMaps();
  const statOptions = new Map();

  Object.entries(runeStats).forEach(([rawId, rawEntries]) => {
    const optionId = toNumber(rawId);
    if (!optionId || !Array.isArray(rawEntries)) {
      return;
    }

    if (isStatModId(optionId)) {
      const statEntry = normalizeRuneStatEntry(rawEntries[0]);
      if (statEntry.games > 0) {
        addOptionRecord(statOptions, {
          id: optionId,
          icon: buildStatModIconUrl(optionId),
          name: getMetadataName(optionId, runeNamesById, `Stat Mod ${optionId}`),
          games: statEntry.games,
          wins: statEntry.wins,
        });
      }
      return;
    }

    const runeDefinition = getRuneDefinition(optionId);
    if (!runeDefinition) {
      return;
    }

    const primaryEntry = normalizeRuneStatEntry(rawEntries[0]);
    if (primaryEntry.games > 0) {
      addOptionRecord(primarySlotOptions[runeDefinition.slotIndex], {
        id: optionId,
        icon: buildRuneIconUrl(optionId),
        name: getMetadataName(optionId, runeNamesById, `Rune ${optionId}`),
        styleId: runeDefinition.styleId,
        styleName: runeDefinition.styleName,
        games: primaryEntry.games,
        wins: primaryEntry.wins,
      });

      if (runeDefinition.slotIndex === 0) {
        addOptionRecord(primaryStyleOptions, {
          id: runeDefinition.styleId,
          icon: buildRuneStyleIconUrl(runeDefinition.styleId),
          name: runeDefinition.styleName,
          games: primaryEntry.games,
          wins: primaryEntry.wins,
        });
      }
    }

    const secondaryEntry = normalizeRuneStatEntry(rawEntries[1]);
    if (!runeDefinition.isKeystone && secondaryEntry.games > 0) {
      addOptionRecord(secondarySlotOptions[runeDefinition.slotIndex], {
        id: optionId,
        icon: buildRuneIconUrl(optionId),
        name: getMetadataName(optionId, runeNamesById, `Rune ${optionId}`),
        styleId: runeDefinition.styleId,
        styleName: runeDefinition.styleName,
        games: secondaryEntry.games,
        wins: secondaryEntry.wins,
      });
      addOptionRecord(secondaryStyleSelectionTotals, {
        id: runeDefinition.styleId,
        icon: buildRuneStyleIconUrl(runeDefinition.styleId),
        name: runeDefinition.styleName,
        games: secondaryEntry.games,
        wins: secondaryEntry.wins,
      });
    }
  });

  const secondaryStyleOptions = new Map();
  secondaryStyleSelectionTotals.forEach((record, styleId) => {
    secondaryStyleOptions.set(styleId, {
      ...record,
      games: record.games / 2,
      wins: record.wins / 2,
    });
  });

  return {
    allyChampionKey: String(buildLoader?.header?.cid ?? ""),
    enemyChampionKey: String(buildLoader?.header?.vs ?? ""),
    role: buildLoader?.header?.lane || null,
    enemyRole: buildLoader?.header?.vsLane || buildLoader?.header?.defaultVsLane || null,
    totalGames,
    fetchedAt,
    runes: {
      primaryStyleOptions: [...primaryStyleOptions.values()],
      secondaryStyleOptions: [...secondaryStyleOptions.values()],
      primarySlotOptions: primarySlotOptions.map((slotOptions) => [...slotOptions.values()]),
      secondarySlotOptions: secondarySlotOptions.map((slotOptions) => [...slotOptions.values()]),
      statOptions: [...statOptions.values()],
      pageCandidates: collectPageCandidates(buildLoader?.summary, runeNamesById, totalGames),
    },
    boots: collectBootOptions(buildLoader?.boots, itemNamesById),
  };
}

function createSlotOptionMaps() {
  return [new Map(), new Map(), new Map(), new Map()];
}

function collectPageCandidates(summary, runeNamesById, totalGames) {
  const pickPage = normalizePageCandidate(summary?.pick?.runes, "pick", runeNamesById, totalGames);
  const winPage = normalizePageCandidate(summary?.win?.runes, "win", runeNamesById, totalGames);
  const pageCandidates = [];
  const seenPageKeys = new Set();

  if (pickPage) {
    pageCandidates.push(pickPage);
    seenPageKeys.add(pickPage.pageKey);
  }

  if (isIndependentWinPageCandidate(winPage, pickPage) && !seenPageKeys.has(winPage.pageKey)) {
    pageCandidates.push(winPage);
  }

  return pageCandidates;
}

function normalizePageCandidate(pageSummary, sourceType, runeNamesById, totalGames) {
  if (!pageSummary || typeof pageSummary !== "object") {
    return null;
  }

  const primaryRuneIds = normalizeIdList(pageSummary?.set?.pri);
  const secondaryRuneIds = normalizeIdList(pageSummary?.set?.sec);
  const modifierIds = normalizeIdList(pageSummary?.set?.mod);

  if (primaryRuneIds.length < 4 || secondaryRuneIds.length < 2) {
    return null;
  }

  const primaryStyleId = getRuneDefinition(primaryRuneIds[0])?.styleId || null;
  const secondaryStyleId = getRuneDefinition(secondaryRuneIds[0])?.styleId || null;
  if (!primaryStyleId || !secondaryStyleId) {
    return null;
  }

  const games = toNumber(pageSummary?.n);
  const wins = calculateWins(games, pageSummary?.wr);
  const pageKey = buildPageKey(primaryStyleId, primaryRuneIds, secondaryStyleId, secondaryRuneIds, modifierIds);

  return {
    pageKey,
    sourceType,
    games,
    wins,
    winRate: calculateRate(wins, games),
    pickRate: calculateRate(games, totalGames),
    primaryStyleId,
    secondaryStyleId,
    primaryRuneIds,
    secondaryRuneIds,
    modifierIds,
    primaryRunes: primaryRuneIds.map((runeId) => createRuneSelection(runeId, runeNamesById)),
    secondaryRunes: secondaryRuneIds.map((runeId) => createRuneSelection(runeId, runeNamesById)),
    modifiers: modifierIds.map((modifierId) => createStatSelection(modifierId, runeNamesById)),
  };
}

function createRuneSelection(runeId, runeNamesById) {
  const runeDefinition = getRuneDefinition(runeId);
  return {
    id: runeId,
    icon: buildRuneIconUrl(runeId),
    name: getMetadataName(runeId, runeNamesById, `Rune ${runeId}`),
    styleId: runeDefinition?.styleId || null,
    styleName: runeDefinition?.styleName || null,
    slotIndex: runeDefinition?.slotIndex ?? null,
  };
}

function createStatSelection(statId, runeNamesById) {
  return {
    id: statId,
    icon: buildStatModIconUrl(statId),
    name: getMetadataName(statId, runeNamesById, `Stat Mod ${statId}`),
  };
}

function isIndependentWinPageCandidate(winPage, pickPage) {
  if (!winPage) {
    return false;
  }

  if (!pickPage) {
    return true;
  }

  if (winPage.pageKey === pickPage.pageKey) {
    return true;
  }

  return winPage.games !== pickPage.games || winPage.winRate !== pickPage.winRate;
}

function collectBootOptions(bootRows, itemNamesById) {
  if (!Array.isArray(bootRows)) {
    return [];
  }

  return bootRows
    .map((row) => normalizeBootRow(row, itemNamesById))
    .filter(Boolean);
}

function normalizeBootRow(row, itemNamesById) {
  if (!Array.isArray(row) || row.length < 4) {
    return null;
  }

  const itemId = toNumber(row[0]);
  const games = toNumber(row[3]);
  const itemName = getMetadataName(itemId, itemNamesById, `Item ${itemId}`);

  if (!itemId || games <= 0 || !isCompletedBootItem(itemId, itemName)) {
    return null;
  }

  const wins = calculateWins(games, row[1]);

  return {
    itemId,
    icon: buildItemIconUrl(itemId),
    name: itemName,
    games,
    wins,
  };
}

function isCompletedBootItem(itemId, itemName) {
  if (COMPLETED_BOOT_IDS.has(toNumber(itemId))) {
    return true;
  }

  const normalizedName = typeof itemName === "string" ? itemName.trim() : "";
  if (!normalizedName || normalizedName.toLowerCase() === "boots") {
    return false;
  }

  return COMPLETED_BOOT_NAME_PATTERN.test(normalizedName);
}

function buildPageKey(primaryStyleId, primaryRuneIds, secondaryStyleId, secondaryRuneIds, modifierIds) {
  return [
    `priStyle=${primaryStyleId}`,
    `pri=${primaryRuneIds.join("-")}`,
    `secStyle=${secondaryStyleId}`,
    `sec=${secondaryRuneIds.join("-")}`,
    `mods=${modifierIds.join("-")}`,
  ].join("|");
}

function addOptionRecord(map, record) {
  const existing = map.get(record.id);
  if (existing) {
    existing.games += record.games;
    existing.wins += record.wins;
    return;
  }

  map.set(record.id, { ...record });
}

function normalizeRuneStatEntry(entry) {
  if (!Array.isArray(entry) || entry.length < 3) {
    return {
      games: 0,
      wins: 0,
    };
  }

  const games = toNumber(entry[2]);
  return {
    games,
    wins: calculateWins(games, entry[1]),
  };
}

function getMetadataName(id, metadataLookup, fallbackName) {
  const value = metadataLookup?.[String(id)];
  return typeof value === "string" && value.trim() ? value : fallbackName;
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => toNumber(entry)).filter((entry) => entry > 0);
}

function calculateWins(games, winRate) {
  const numericGames = toNumber(games);
  const numericWinRate = Number(winRate);
  if (numericGames <= 0 || !Number.isFinite(numericWinRate)) {
    return 0;
  }

  return numericGames * (numericWinRate / 100);
}

function calculateRate(part, total) {
  const numericPart = Number(part);
  const numericTotal = Number(total);
  if (!Number.isFinite(numericPart) || !Number.isFinite(numericTotal) || numericTotal <= 0) {
    return 0;
  }

  return (numericPart / numericTotal) * 100;
}

function buildItemIconUrl(itemId) {
  return `${ITEM_ICON_BASE_URL}/${itemId}.webp`;
}

function isStatModId(value) {
  return value >= STAT_MOD_ID_MIN && value <= STAT_MOD_ID_MAX;
}

function toNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

module.exports = {
  buildPageKey,
  isCompletedBootItem,
  parseLolalyticsMatchupBuildData,
};
