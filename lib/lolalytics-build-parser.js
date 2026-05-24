const {
  buildRuneIconUrl,
  buildRuneStyleIconUrl,
  buildStatModIconUrl,
  getRuneDefinition,
  getRuneStyle,
  listRuneStyles,
} = require("../public/rune-metadata.js");
const {
  buildSummonerSpellIconUrl,
} = require("./summoner-spell-metadata.js");

const ITEM_ICON_BASE_URL = "https://cdn5.lolalytics.com/item64";
const COMPLETED_BOOT_IDS = new Set([3005, 3006, 3009, 3020, 3047, 3111, 3117, 3158]);
const COMPLETED_BOOT_NAME_PATTERN =
  /(greaves|shoes|treads|steelcaps|symbiotic soles|boots of swiftness|ionian boots|mobility boots)/i;
const ITEM_SLOT_KEYS = ["item1", "item2", "item3", "item4", "item5", "item6"];
const STAT_MOD_ID_MIN = 5000;
const STAT_MOD_ID_MAX = 5999;

/**
 * Normalize one Lolalytics matchup build payload into the local structure used
 * by `/build-suggestions` aggregation and rendering.
 *
 * The parser keeps exact rune-page candidates, summoner-spell set options,
 * grouped slot options, ordered completed-item options, and only completed
 * boots so later aggregation can combine multiple enemy matchups without
 * re-reading the raw Qwik payload.
 */
function parseLolalyticsMatchupBuildData(buildLoader, metadataLoader, options = {}) {
  if (!buildLoader || typeof buildLoader !== "object") {
    throw new Error("Build loader is required to parse matchup build data.");
  }

  const runeNamesById = metadataLoader?.runes || {};
  const itemNamesById = metadataLoader?.items || {};
  const spellNamesById = metadataLoader?.spells || {};
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
    spells: {
      options: collectSummonerSpellOptions(
        buildLoader?.spells,
        buildLoader?.summary,
        spellNamesById,
        totalGames,
      ),
    },
    items: {
      slotOptions: collectItemSlotOptions(buildLoader, itemNamesById),
    },
    boots: collectBootOptions(buildLoader?.boots, itemNamesById),
  };
}

/**
 * Normalize the current Lolalytics mega rune endpoint into the same parsed
 * build shape used by the older q-data parser. The mega endpoint currently
 * exposes rune recommendations only; item, spell, and boot groups remain empty
 * unless Lolalytics adds those fields to the endpoint later.
 */
function parseLolalyticsRuneBuildData(payload, options = {}) {
  const buildLoader = buildLolalyticsRuneBuildLoader(payload, options);
  return parseLolalyticsMatchupBuildData(buildLoader, {}, options);
}

function buildLolalyticsRuneBuildLoader(payload, options = {}) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Lolalytics rune build data was missing a payload.");
  }

  const header = payload.header;
  const summary = payload.summary;
  const runePages = summary?.runes;
  if (!header || typeof header !== "object") {
    throw new Error("Lolalytics rune build data was missing a header.");
  }

  if (!summary || typeof summary !== "object" || !runePages || typeof runePages !== "object") {
    throw new Error("Lolalytics rune build data was missing rune summary data.");
  }

  const totalGames = toNumber(header.n);
  if (totalGames <= 0) {
    throw new Error("Lolalytics rune build data did not include a usable sample size.");
  }

  return {
    header: {
      cid: options.allyChampionKey,
      vs: options.enemyChampionKey,
      lane: options.role || header.lane || header.defaultLane || null,
      vsLane: options.enemyRole || null,
      n: totalGames,
    },
    runes: {
      stats: buildRuneStatsFromMegaSummary(summary),
    },
    summary: {
      pick: {
        runes: normalizeMegaRunePage(runePages.pick),
      },
      win: {
        runes: normalizeMegaRunePage(runePages.win),
      },
    },
  };
}

function buildRuneStatsFromMegaSummary(summary = {}) {
  const stats = {};

  addMegaRuneRows(stats, summary.pick?.pri, 0);
  addMegaRuneRows(stats, summary.pick?.sec, 1);
  addMegaRuneRows(stats, summary.pick?.mod, 0);
  addMegaRuneRows(stats, summary.win?.pri, 0);
  addMegaRuneRows(stats, summary.win?.sec, 1);
  addMegaRuneRows(stats, summary.win?.mod, 0);

  return stats;
}

function addMegaRuneRows(stats, rows, entryIndex) {
  if (!Array.isArray(rows)) {
    return;
  }

  for (const row of rows) {
    const normalizedRow = normalizeMegaRuneStatRow(row);
    if (!normalizedRow) {
      continue;
    }

    stats[normalizedRow.id] ||= [];
    const existing = stats[normalizedRow.id][entryIndex];
    if (!existing || normalizedRow.games > toNumber(existing[2])) {
      stats[normalizedRow.id][entryIndex] = [
        normalizedRow.pickRate,
        normalizedRow.winRate,
        normalizedRow.games,
      ];
    }
  }
}

function normalizeMegaRuneStatRow(row) {
  if (!Array.isArray(row) || row.length < 4) {
    return null;
  }

  const id = toNumber(row[0]);
  const winRate = toNumber(row[1]);
  const pickRate = toNumber(row[2]);
  const games = toNumber(row[3]);
  if (!id || games <= 0) {
    return null;
  }

  return {
    id,
    winRate,
    pickRate,
    games,
  };
}

function normalizeMegaRunePage(page) {
  if (!page || typeof page !== "object") {
    return null;
  }

  return {
    wr: page.wr,
    n: page.n,
    set: page.set,
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

function collectSummonerSpellOptions(spellRows, summary, spellNamesById, totalGames) {
  const options = Array.isArray(spellRows)
    ? spellRows
        .map((row) => normalizeSummonerSpellRow(row, spellNamesById, totalGames))
        .filter(Boolean)
    : [];

  if (options.length > 0) {
    return options;
  }

  return collectSummonerSpellSummaryCandidates(summary, spellNamesById, totalGames);
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

function collectSummonerSpellSummaryCandidates(summary, spellNamesById, totalGames) {
  const pickSet = normalizeSummonerSpellSummary(summary?.pick?.sums, "pick", spellNamesById, totalGames);
  const winSet = normalizeSummonerSpellSummary(summary?.win?.sums, "win", spellNamesById, totalGames);
  const spellSetCandidates = [];
  const seenSetKeys = new Set();

  if (pickSet) {
    spellSetCandidates.push(pickSet);
    seenSetKeys.add(pickSet.setKey);
  }

  if (isIndependentSpellSetCandidate(winSet, pickSet) && !seenSetKeys.has(winSet?.setKey)) {
    spellSetCandidates.push(winSet);
  }

  return spellSetCandidates;
}

function normalizeSummonerSpellSummary(spellSummary, sourceType, spellNamesById, totalGames) {
  if (!spellSummary || typeof spellSummary !== "object") {
    return null;
  }

  const spellIds = normalizeSummonerSpellIds(spellSummary?.ids);
  if (spellIds.length !== 2) {
    return null;
  }

  const games = toNumber(spellSummary?.n);
  const wins = calculateWins(games, spellSummary?.wr);
  return {
    setKey: buildSummonerSpellSetKey(spellIds),
    sourceType,
    spellIds,
    games,
    wins,
    winRate: calculateRate(wins, games),
    pickRate: calculateRate(games, totalGames),
    selections: spellIds.map((spellId) => createSummonerSpellSelection(spellId, spellNamesById)),
  };
}

function normalizeSummonerSpellRow(row, spellNamesById, totalGames) {
  if (!Array.isArray(row) || row.length < 4) {
    return null;
  }

  const spellIds = normalizeSummonerSpellIds(row[0]);
  const games = toNumber(row[3]);
  if (spellIds.length !== 2 || games <= 0) {
    return null;
  }

  const wins = calculateWins(games, row[1]);
  return {
    setKey: buildSummonerSpellSetKey(spellIds),
    spellIds,
    games,
    wins,
    winRate: calculateRate(wins, games),
    pickRate: calculateRate(games, totalGames),
    selections: spellIds.map((spellId) => createSummonerSpellSelection(spellId, spellNamesById)),
  };
}

function createSummonerSpellSelection(spellId, spellNamesById) {
  return {
    id: spellId,
    icon: buildSummonerSpellIconUrl(spellId),
    name: getMetadataName(spellId, spellNamesById, `Spell ${spellId}`),
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

function isIndependentSpellSetCandidate(winSet, pickSet) {
  if (!winSet) {
    return false;
  }

  if (!pickSet) {
    return true;
  }

  if (winSet.setKey === pickSet.setKey) {
    return true;
  }

  return winSet.games !== pickSet.games || winSet.winRate !== pickSet.winRate;
}

function collectBootOptions(bootRows, itemNamesById) {
  if (!Array.isArray(bootRows)) {
    return [];
  }

  return bootRows
    .map((row) => normalizeBootRow(row, itemNamesById))
    .filter(Boolean);
}

function collectItemSlotOptions(buildLoader, itemNamesById) {
  return ITEM_SLOT_KEYS.map((slotKey, index) => {
    const slotRows = buildLoader?.[slotKey];
    if (!Array.isArray(slotRows)) {
      return [];
    }

    return slotRows
      .map((row) => normalizeItemRow(row, itemNamesById, index + 1))
      .filter(Boolean);
  });
}

function normalizeItemRow(row, itemNamesById, slotIndex) {
  if (!Array.isArray(row) || row.length < 4) {
    return null;
  }

  const itemId = toNumber(row[0]);
  const games = toNumber(row[3]);
  const purchaseMinute = toNumber(row[4]);

  if (!itemId || games <= 0) {
    return null;
  }

  const hasPurchaseMinute = purchaseMinute > 0;
  const wins = calculateWins(games, row[1]);

  return {
    itemId,
    slotIndex,
    icon: buildItemIconUrl(itemId),
    name: getMetadataName(itemId, itemNamesById, `Item ${itemId}`),
    games,
    wins,
    purchaseMinute: hasPurchaseMinute ? purchaseMinute : null,
    minuteTotal: hasPurchaseMinute ? purchaseMinute * games : 0,
    minuteGames: hasPurchaseMinute ? games : 0,
  };
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

function buildSummonerSpellSetKey(spellIds) {
  return normalizeSummonerSpellIds(spellIds).join("-");
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

function normalizeSummonerSpellIds(value) {
  const normalizedIds = Array.isArray(value)
    ? value.map((entry) => toNumber(entry))
    : typeof value === "string"
      ? value.split(/[^0-9]+/).map((entry) => toNumber(entry))
      : [];

  return normalizedIds
    .filter((entry) => entry > 0)
    .sort((left, right) => left - right)
    .slice(0, 2);
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
  parseLolalyticsRuneBuildData,
};
