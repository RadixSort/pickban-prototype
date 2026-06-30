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
const { resolveQwikPayload } = require("./qwik-payload.js");

const ITEM_ICON_BASE_URL = "https://cdn5.lolalytics.com/item64";
const COMPLETED_BOOT_IDS = new Set([3005, 3006, 3008, 3009, 3020, 3047, 3111, 3117, 3158, 3170]);
const COMPLETED_BOOT_NAME_PATTERN =
  /(armored advance|boots|crushers|dynamism|greaves|lucidity|shoes|soles|steelcaps|swiftmarch|treads|zephyr)/i;
const ITEM_SLOT_KEYS = ["item1", "item2", "item3", "item4", "item5", "item6"];
const STAT_MOD_ID_MIN = 5000;
const STAT_MOD_ID_MAX = 5999;
const RENDERED_IMAGE_MARKER = "__LOLALYTICS_IMAGE__";
const SUMMONER_SPELL_ID_BY_NAME = new Map([
  ["barrier", 21],
  ["cleanse", 1],
  ["exhaust", 3],
  ["flash", 4],
  ["ghost", 6],
  ["heal", 7],
  ["ignite", 14],
  ["mark", 32],
  ["smite", 11],
  ["teleport", 12],
]);

/**
 * Normalize one Lolalytics matchup build payload into the local structure used
 * by `/build-suggestions` aggregation and rendering.
 *
 * The parser keeps exact rune-page candidates, summoner-spell set options,
 * first-maxed skill options, grouped slot options, ordered completed-item
 * options, and only completed boots so later aggregation can combine multiple
 * enemy matchups without re-reading the raw Qwik payload.
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
    startingItems: {
      options: collectStartingItemOptions(buildLoader?.startingItems, itemNamesById, totalGames),
    },
    skills: {
      options: collectSkillPriorityOptions(
        buildLoader?.skillOrders ?? buildLoader?.skillOrder ?? buildLoader?.skills,
        buildLoader?.summary,
        totalGames,
      ),
    },
    items: {
      slotOptions: collectItemSlotOptions(buildLoader, itemNamesById),
      mostPickedSlotOptions: collectItemSummarySlotOptions(
        buildLoader?.summary?.pick?.items,
        itemNamesById,
        buildLoader?.itemMinuteById,
      ),
      highestWinSlotOptions: collectItemSummarySlotOptions(
        buildLoader?.summary?.win?.items,
        itemNamesById,
        buildLoader?.itemMinuteById,
      ),
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

function parseLolalyticsRenderedBuildPage(html = "", options = {}) {
  const lines = normalizeRenderedBuildLines(html);
  const qwikBuildData = extractRenderedQwikBuildData(html);
  const renderedStartingItems =
    qwikBuildData?.startingItems || extractRenderedStartingItemRows(lines);
  const renderedItems = qwikBuildData?.items || extractRenderedCoreBuildItems(lines);
  const renderedSpells = qwikBuildData?.spells || extractRenderedSummonerSpellRows(lines);
  const renderedSkillOrders =
    qwikBuildData?.skillOrders || extractRenderedSkillOrderRows(lines);
  const metadata = mergeRenderedMetadata(
    extractRenderedImageMetadata(lines),
    qwikBuildData?.metadata,
  );
  const totalGames = Math.max(
    ...renderedStartingItems.map((row) => toNumber(row[3])),
    ...renderedItems.rowsBySlot.flat().map((row) => toNumber(row[3])),
    ...renderedItems.boots.map((row) => toNumber(row[3])),
    ...renderedSpells.map((row) => toNumber(row[3])),
    ...renderedSkillOrders.map((row) => toNumber(row[3])),
    toNumber(qwikBuildData?.totalGames),
    0,
  );

  if (totalGames <= 0) {
    throw new Error("Lolalytics rendered build page did not include usable build rows.");
  }

  const buildLoader = {
    header: {
      cid: options.allyChampionKey,
      vs: options.enemyChampionKey,
      lane: options.role || null,
      vsLane: options.enemyRole || null,
      n: totalGames,
    },
    runes: {
      stats: {},
    },
    summary: qwikBuildData?.summary || {},
    spells: renderedSpells,
    startingItems: renderedStartingItems,
    skillOrders: renderedSkillOrders,
    boots: renderedItems.boots,
    itemMinuteById: qwikBuildData?.itemMinuteById || {},
  };

  renderedItems.rowsBySlot.forEach((rows, index) => {
    buildLoader[`item${index + 1}`] = rows;
  });

  return parseLolalyticsMatchupBuildData(buildLoader, metadata, options);
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

function normalizeRenderedBuildLines(html) {
  if (typeof html !== "string" || html.trim() === "") {
    return [];
  }

  const withImageMarkers = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const attributes = parseHtmlAttributes(tag);
    const src = decodeHtmlEntity(attributes.src || attributes["data-src"] || "");
    const alt = decodeHtmlEntity(attributes.alt || "");
    const itemId = matchFirst(src, /\/item(?:\d+)?\/(\d+)\.webp/i);
    const spellId =
      matchFirst(src, /\/spell(?:\d+)?\/(\d+)\.webp/i) ||
      getSummonerSpellIdByName(alt);
    const abilityKey = itemId || spellId ? null : getAbilityKeyFromImage(src, alt);
    const kind = itemId ? "item" : spellId ? "spell" : abilityKey ? "ability" : "image";
    const markerId = itemId || spellId || abilityKey || "";

    return `\n${RENDERED_IMAGE_MARKER}|${kind}|${markerId}|${alt}\n`;
  });

  return withImageMarkers
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .split(/\r?\n/)
    .map((line) => decodeHtmlEntity(line).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractRenderedQwikBuildData(html) {
  const snapshot = parseRenderedQwikSnapshot(html);
  if (!snapshot) {
    return null;
  }

  const buildData = resolveRenderedQwikBuildData(snapshot);
  if (!buildData) {
    return null;
  }

  const rowsBySlot = collectQwikItemRowsBySlot(buildData);
  const boots = normalizeQwikRowList(buildData.boots);
  const spells = normalizeQwikRowList(buildData.spells);
  const startingItems = normalizeQwikRowList(buildData.startSet);
  const skillOrders = collectQwikSkillOrderRows(buildData);

  if (
    rowsBySlot.every((rows) => rows.length === 0) &&
    boots.length === 0 &&
    spells.length === 0 &&
    startingItems.length === 0 &&
    skillOrders.length === 0
  ) {
    return null;
  }

  return {
    totalGames: toNumber(buildData?.header?.n || buildData?.n),
    summary: buildData.summary && typeof buildData.summary === "object" ? buildData.summary : {},
    spells,
    startingItems,
    skillOrders,
    items: {
      rowsBySlot,
      boots,
    },
    itemMinuteById: buildQwikItemMinuteLookup(buildData),
    metadata: {
      items: extractQwikItemNames(snapshot, collectQwikItemIds(buildData)),
    },
  };
}

function parseRenderedQwikSnapshot(html) {
  const match = String(html || "").match(
    /<script\b(?=[^>]*\btype\s*=\s*(["'])qwik\/json\1)[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) {
    return null;
  }

  try {
    const snapshot = JSON.parse(match[2]);
    return snapshot && Array.isArray(snapshot.objs) ? snapshot : null;
  } catch (_error) {
    return null;
  }
}

function resolveRenderedQwikBuildData(snapshot) {
  for (let index = 0; index < snapshot.objs.length; index += 1) {
    const rawObject = snapshot.objs[index];
    if (!isRenderedQwikBuildRecord(rawObject)) {
      continue;
    }

    try {
      const resolved = resolveQwikPayload({
        _objs: snapshot.objs,
        _entry: index.toString(36),
      });
      if (isResolvedRenderedQwikBuildRecord(resolved)) {
        return resolved;
      }
    } catch (_error) {
      continue;
    }
  }

  return null;
}

function isRenderedQwikBuildRecord(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, "header") &&
      Object.prototype.hasOwnProperty.call(value, "summary") &&
      (
        Object.prototype.hasOwnProperty.call(value, "startSet") ||
        Object.prototype.hasOwnProperty.call(value, "item1") ||
        Object.prototype.hasOwnProperty.call(value, "boots") ||
        Object.prototype.hasOwnProperty.call(value, "spells")
      ),
  );
}

function isResolvedRenderedQwikBuildRecord(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.header &&
      typeof value.header === "object" &&
      value.summary &&
      typeof value.summary === "object",
  );
}

function collectQwikItemRowsBySlot(buildData) {
  return ITEM_SLOT_KEYS.map((slotKey) => normalizeQwikRowList(buildData?.[slotKey]));
}

function normalizeQwikRowList(value) {
  return Array.isArray(value) ? value.filter((row) => Array.isArray(row)) : [];
}

function collectQwikSkillOrderRows(buildData) {
  if (!buildData || typeof buildData !== "object") {
    return [];
  }

  const candidateKeys = [
    "skillOrder",
    "skillOrders",
    "skills",
    "skill",
    "abilityOrder",
    "abilityOrders",
    "abilities",
  ];
  const visitedKeys = new Set();

  for (const key of candidateKeys) {
    visitedKeys.add(key);
    const rows = normalizeSkillPriorityRows(buildData[key]);
    if (rows.length > 0) {
      return rows;
    }
  }

  for (const [key, value] of Object.entries(buildData)) {
    if (visitedKeys.has(key) || !/(?:skill|abilit)/i.test(key)) {
      continue;
    }

    const rows = normalizeSkillPriorityRows(value);
    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
}

function buildQwikItemMinuteLookup(buildData) {
  const recordsById = new Map();
  const recordsBySlot = new Map();
  const addRecord = (itemId, purchaseMinute, games, slotIndex = null) => {
    if (!itemId || purchaseMinute <= 0) {
      return;
    }

    const existing = recordsById.get(itemId);
    if (!existing || games > existing.games) {
      recordsById.set(itemId, {
        games,
        purchaseMinute,
      });
    }

    if (slotIndex == null) {
      return;
    }

    const slotKey = buildItemMinuteSlotKey(slotIndex, itemId);
    const existingSlotRecord = recordsBySlot.get(slotKey);
    if (!existingSlotRecord || games > existingSlotRecord.games) {
      recordsBySlot.set(slotKey, {
        games,
        purchaseMinute,
      });
    }
  };
  const addRows = (rows, slotIndex = null) => {
    if (!Array.isArray(rows)) {
      return;
    }

    rows.forEach((row) => {
      if (!Array.isArray(row)) {
        return;
      }

      const itemId = toNumber(row[0]);
      const games = toNumber(row[3]);
      const purchaseMinute = toNumber(row[4]);
      addRecord(itemId, purchaseMinute, games, slotIndex);
    });
  };

  addRows(buildData?.item);
  addRows(buildData?.popularItem);
  addRows(buildData?.winningItem);
  for (let slotIndex = 1; slotIndex <= ITEM_SLOT_KEYS.length; slotIndex += 1) {
    addRows(buildData?.boots, slotIndex);
  }
  ITEM_SLOT_KEYS.forEach((slotKey, index) => addRows(buildData?.[slotKey], index + 1));
  addSummaryItemMinutes(buildData?.summary?.pick?.items);
  addSummaryItemMinutes(buildData?.summary?.win?.items);

  const lookup = {
    byId: {},
    bySlot: {},
  };
  recordsById.forEach((record, itemId) => {
    lookup.byId[itemId] = record.purchaseMinute;
  });
  recordsBySlot.forEach((record, slotKey) => {
    lookup.bySlot[slotKey] = record.purchaseMinute;
  });
  return lookup;

  function addSummaryItemMinutes(itemSummary) {
    if (!itemSummary || typeof itemSummary !== "object") {
      return;
    }

    let nonBootSlotIndex = 1;
    ITEM_SLOT_KEYS.forEach((slotKey, summaryIndex) => {
      const entries = normalizeItemSummaryEntries(itemSummary[slotKey]);
      if (entries.length === 0) {
        return;
      }

      const summarySlotIndex = summaryIndex + 1;
      const nonBootEntries = entries.filter((entry) => !isCompletedBootItem(entry.id));
      if (nonBootEntries.length === 0) {
        addSummaryEntryMinutes(entries, buildData?.boots, summarySlotIndex);
        return;
      }

      addSummaryEntryMinutes(
        nonBootEntries,
        buildData?.[`item${nonBootSlotIndex}`],
        summarySlotIndex,
      );
      nonBootSlotIndex += 1;
    });
  }

  function addSummaryEntryMinutes(entries, rows, summarySlotIndex) {
    if (!Array.isArray(rows)) {
      return;
    }

    entries.forEach((entry) => {
      const matchingRow = rows.find((row) => Array.isArray(row) && toNumber(row[0]) === entry.id);
      if (!matchingRow) {
        return;
      }

      addRecord(
        entry.id,
        toNumber(matchingRow[4]),
        toNumber(matchingRow[3]),
        summarySlotIndex,
      );
    });
  }
}

function buildItemMinuteSlotKey(slotIndex, itemId) {
  return `${slotIndex}:${itemId}`;
}

function collectQwikItemIds(buildData) {
  const itemIds = new Set();
  const addItemId = (itemId) => {
    const normalizedItemId = toNumber(itemId);
    if (normalizedItemId > 0) {
      itemIds.add(normalizedItemId);
    }
  };
  const addRows = (rows) => {
    if (Array.isArray(rows)) {
      rows.forEach((row) => {
        if (Array.isArray(row)) {
          addItemId(row[0]);
        }
      });
    }
  };
  const addSummary = (itemSummary) => {
    if (!itemSummary || typeof itemSummary !== "object") {
      return;
    }

    normalizeItemSummaryEntries(itemSummary.start).forEach((entry) => {
      if (Array.isArray(entry.set)) {
        entry.set.forEach(addItemId);
      }
    });
    ITEM_SLOT_KEYS.forEach((slotKey) => {
      normalizeItemSummaryEntries(itemSummary[slotKey]).forEach((entry) => addItemId(entry.id));
    });
  };

  addRows(buildData?.item);
  addRows(buildData?.popularItem);
  addRows(buildData?.winningItem);
  addRows(buildData?.boots);
  addRows(buildData?.startItem);
  addRows(buildData?.startSet);
  ITEM_SLOT_KEYS.forEach((slotKey) => addRows(buildData?.[slotKey]));
  addSummary(buildData?.summary?.pick?.items);
  addSummary(buildData?.summary?.win?.items);

  return itemIds;
}

function extractQwikItemNames(snapshot, itemIds = new Set()) {
  let bestNames = {};
  let bestMatchCount = 0;

  for (let index = 0; index < snapshot.objs.length; index += 1) {
    const rawObject = snapshot.objs[index];
    if (!rawObject || typeof rawObject !== "object" || Array.isArray(rawObject)) {
      continue;
    }

    const numericKeys = Object.keys(rawObject).filter((key) => /^\d+$/.test(key));
    if (
      itemIds.size > 0 &&
      !numericKeys.some((key) => itemIds.has(toNumber(key)))
    ) {
      continue;
    }

    try {
      const resolved = resolveQwikPayload({
        _objs: snapshot.objs,
        _entry: index.toString(36),
      });
      const names = {};

      numericKeys.forEach((key) => {
        if (typeof resolved?.[key] === "string" && resolved[key].trim()) {
          names[key] = resolved[key];
        }
      });

      const matchCount = itemIds.size > 0
        ? Object.keys(names).filter((key) => itemIds.has(toNumber(key))).length
        : Object.keys(names).length;
      if (matchCount > bestMatchCount) {
        bestNames = names;
        bestMatchCount = matchCount;
      }
    } catch (_error) {
      continue;
    }
  }

  return bestNames;
}

function mergeRenderedMetadata(...metadataSources) {
  const merged = {
    items: {},
    spells: {},
  };

  metadataSources.forEach((metadata) => {
    if (!metadata || typeof metadata !== "object") {
      return;
    }

    Object.assign(merged.items, metadata.items || {});
    Object.assign(merged.spells, metadata.spells || {});
  });

  return merged;
}

function extractRenderedCoreBuildItems(lines) {
  const rowsBySlot = Array.from({ length: ITEM_SLOT_KEYS.length }, () => []);
  const boots = [];
  const startIndex = lines.findIndex((line) => line === "Core Build");
  if (startIndex === -1) {
    return {
      rowsBySlot,
      boots,
    };
  }

  const endIndex = findNextLineIndex(lines, startIndex + 1, (line) =>
    /^LEGEND:?$/i.test(line) || line === "Click Items Below to Filter Builds by Item and Item Buy Position",
  );
  const section = lines.slice(startIndex + 1, endIndex === -1 ? lines.length : endIndex);
  const firstExplicitSlotIndex = findNextLineIndex(section, 0, (line) => /^Item\s+4$/i.test(line));
  const coreStats = findNextRenderedStats(
    section,
    0,
    firstExplicitSlotIndex === -1 ? section.length : firstExplicitSlotIndex,
  );
  let currentSlot = 1;

  for (let index = 0; index < section.length; index += 1) {
    const explicitSlotMatch = section[index].match(/^Item\s+([1-6])$/i);
    if (explicitSlotMatch) {
      currentSlot = Number(explicitSlotMatch[1]);
      continue;
    }

    const image = parseRenderedImageMarker(section[index]);
    if (!image || image.kind !== "item" || !image.id) {
      continue;
    }

    const stats =
      findNextRenderedStats(section, index + 1, findNextRenderedItemBoundary(section, index + 1)) ||
      (currentSlot < 4 ? coreStats : null);
    if (!stats) {
      continue;
    }

    const row = [image.id, stats.winRate, 0, stats.games, null];
    if (isCompletedBootItem(image.id, image.name)) {
      boots.push(row);
    } else if (currentSlot >= 1 && currentSlot <= rowsBySlot.length) {
      rowsBySlot[currentSlot - 1].push(row);
    }

    if (currentSlot < 4) {
      currentSlot += 1;
    }
  }

  return {
    rowsBySlot,
    boots,
  };
}

function extractRenderedStartingItemRows(lines) {
  const rows = [];

  for (let startIndex = 0; startIndex < lines.length; startIndex += 1) {
    if (!/^Starting (?:Build|Items?)$/i.test(lines[startIndex])) {
      continue;
    }

    const endIndex = findNextLineIndex(lines, startIndex + 1, (line) =>
      /^Core Build$/i.test(line) ||
      /^Summoner Spells$/i.test(line) ||
      /^Skill Order$/i.test(line) ||
      /^Primary Runes$/i.test(line) ||
      /^Highest Win Build$/i.test(line) ||
      /^Most Common Build$/i.test(line),
    );
    const section = lines.slice(startIndex + 1, endIndex === -1 ? lines.length : endIndex);
    let currentItemIds = [];

    for (let index = 0; index < section.length; index += 1) {
      const image = parseRenderedImageMarker(section[index]);
      if (image?.kind === "item" && image.id) {
        currentItemIds.push(image.id);
        continue;
      }

      const stats = findNextRenderedStats(
        section,
        index,
        findNextRenderedItemBoundary(section, index),
      );
      if (!stats || currentItemIds.length === 0) {
        continue;
      }

      rows.push([currentItemIds.join("_"), stats.winRate, 0, stats.games]);
      currentItemIds = [];
    }
  }

  return rows;
}

function extractRenderedSummonerSpellRows(lines) {
  const startIndex = lines.findIndex((line) => line === "Summoner Spells");
  if (startIndex === -1) {
    return [];
  }

  const endIndex = findNextLineIndex(lines, startIndex + 1, (line) =>
    line === "Skill Order" || line === "Primary Runes",
  );
  const section = lines.slice(startIndex + 1, endIndex === -1 ? lines.length : endIndex);
  const spellIds = [];

  for (const line of section) {
    const image = parseRenderedImageMarker(line);
    if (!image) {
      continue;
    }

    const spellId = image.kind === "spell" ? image.id : getSummonerSpellIdByName(image.name);
    if (spellId && !spellIds.includes(spellId)) {
      spellIds.push(spellId);
    }

    if (spellIds.length >= 2) {
      break;
    }
  }

  if (spellIds.length !== 2) {
    return [];
  }

  const stats = findNextRenderedStats(section, 0, section.length);
  if (!stats) {
    return [];
  }

  return [[spellIds.join("_"), stats.winRate, 0, stats.games]];
}

function extractRenderedSkillOrderRows(lines) {
  const rows = [];

  for (let startIndex = 0; startIndex < lines.length; startIndex += 1) {
    if (lines[startIndex] !== "Skill Order") {
      continue;
    }

    const endIndex = findNextLineIndex(lines, startIndex + 1, (line) =>
      line === "Skill Order" ||
      line === "Summoner Spells" ||
      /^Starting (?:Build|Items?)$/i.test(line) ||
      line === "Core Build" ||
      line === "Primary Runes" ||
      line === "Highest Win Build" ||
      line === "Most Common Build",
    );
    const section = lines.slice(startIndex + 1, endIndex === -1 ? lines.length : endIndex);
    const stats = findNextRenderedStats(section, 0, section.length);
    if (!stats) {
      continue;
    }

    const abilitySequence = section
      .map((line) => {
        const image = parseRenderedImageMarker(line);
        return image?.abilityKey || normalizeAbilityKey(line);
      })
      .filter(Boolean);
    if (!getFirstMaxedAbility(abilitySequence)) {
      continue;
    }

    rows.push([abilitySequence.join("_"), stats.winRate, 0, stats.games]);
  }

  return rows;
}

function extractRenderedImageMetadata(lines) {
  const metadata = {
    items: {},
    spells: {},
  };

  lines.forEach((line) => {
    const image = parseRenderedImageMarker(line);
    if (!image?.id || !image.name) {
      return;
    }

    if (image.kind === "item") {
      metadata.items[String(image.id)] = image.name;
      return;
    }

    if (image.kind === "spell") {
      metadata.spells[String(image.id)] = image.name;
    }
  });

  return metadata;
}

function findNextRenderedItemBoundary(lines, startIndex) {
  const boundaryIndex = findNextLineIndex(lines, startIndex, (line) => {
    if (/^Item\s+[1-6]$/i.test(line) || /^OR$/i.test(line)) {
      return true;
    }

    const image = parseRenderedImageMarker(line);
    return Boolean(image?.kind === "item");
  });

  return boundaryIndex === -1 ? lines.length : boundaryIndex;
}

function findNextRenderedStats(lines, startIndex, endIndex) {
  const boundedEndIndex = Math.min(lines.length, endIndex == null || endIndex < 0 ? lines.length : endIndex);

  for (let index = startIndex; index < boundedEndIndex; index += 1) {
    const combinedStats = parseRenderedStatsLine(lines[index]);
    if (combinedStats) {
      return combinedStats;
    }

    const splitStats = parseSplitRenderedStatsLines(lines, index, boundedEndIndex);
    if (splitStats) {
      return splitStats;
    }

    const winRate = parsePercentLine(lines[index]);
    if (winRate == null) {
      continue;
    }

    for (let nextIndex = index + 1; nextIndex < Math.min(index + 4, boundedEndIndex); nextIndex += 1) {
      const games = parseGamesLine(lines[nextIndex]);
      if (games > 0) {
        return {
          winRate,
          games,
        };
      }
    }
  }

  return null;
}

function parseRenderedStatsLine(line) {
  const match = String(line || "").match(/(\d+(?:\.\d+)?)%\s+Win Rate\s+([\d,]+)\s+Games/i);
  if (!match) {
    return null;
  }

  return {
    winRate: Number(match[1]),
    games: parseGamesLine(match[2]),
  };
}

function parseSplitRenderedStatsLines(lines, index, endIndex) {
  const winRate = parseNumericLine(lines[index]);
  if (winRate == null) {
    return null;
  }

  const percentLabel = String(lines[index + 1] || "").trim();
  if (!/^%\s*(?:Win Rate)?$/i.test(percentLabel) || index + 2 >= endIndex) {
    return null;
  }

  const games = parseGamesLine(lines[index + 2]);
  if (games <= 0) {
    return null;
  }

  return {
    winRate,
    games,
  };
}

function parsePercentLine(line) {
  const match = String(line || "").match(/^(\d+(?:\.\d+)?)%$/);
  return match ? Number(match[1]) : null;
}

function parseNumericLine(line) {
  const match = String(line || "").trim().match(/^(\d+(?:\.\d+)?)$/);
  return match ? Number(match[1]) : null;
}

function parseGamesLine(line) {
  const normalizedLine = String(line || "").replace(/,/g, "").trim();
  const match = normalizedLine.match(/^(\d+)(?:\s+Games?)?$/i);
  return match ? Number(match[1]) : 0;
}

function parseRenderedImageMarker(line) {
  if (!String(line || "").startsWith(`${RENDERED_IMAGE_MARKER}|`)) {
    return null;
  }

  const [, kind, rawId, ...nameParts] = line.split("|");
  const id = toNumber(rawId);
  return {
    id: id > 0 ? id : null,
    kind,
    name: nameParts.join("|"),
    abilityKey: kind === "ability" ? normalizeAbilityKey(rawId) : null,
  };
}

function getAbilityKeyFromImage(src, alt) {
  const normalizedAlt = String(alt || "").trim();
  const altMatch = normalizedAlt.match(/(?:^|[\s([])([QWE])(?:$|[\s)\]-])/i);
  if (altMatch) {
    return normalizeAbilityKey(altMatch[1]);
  }

  const normalizedSrc = String(src || "").split(/[?#]/, 1)[0];
  const srcMatch =
    normalizedSrc.match(/(?:^|[\/_-])([QWE])(?:[._-]|$)/i) ||
    normalizedSrc.match(/([QWE])\.(?:avif|jpe?g|png|webp)$/i);
  return srcMatch ? normalizeAbilityKey(srcMatch[1]) : null;
}

function normalizeAbilityKey(value) {
  const normalizedValue = String(value || "").trim().toUpperCase();
  return normalizedValue === "Q" || normalizedValue === "W" || normalizedValue === "E"
    ? normalizedValue
    : null;
}

function parseHtmlAttributes(tag) {
  const attributes = {};
  const attributePattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

  for (const match of tag.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  }

  return attributes;
}

function findNextLineIndex(lines, startIndex, predicate) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (predicate(lines[index], index)) {
      return index;
    }
  }

  return -1;
}

function getSummonerSpellIdByName(value) {
  const normalizedName = normalizeMetadataName(value);
  return SUMMONER_SPELL_ID_BY_NAME.get(normalizedName) || null;
}

function decodeHtmlEntity(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
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

function collectStartingItemOptions(startingItemRows, itemNamesById, totalGames) {
  if (!Array.isArray(startingItemRows)) {
    return [];
  }

  return startingItemRows
    .map((row) => normalizeStartingItemRow(row, itemNamesById, totalGames))
    .filter(Boolean);
}

function collectSkillPriorityOptions(skillOrderRows, summary, totalGames) {
  const rowOptions = normalizeSkillPriorityRows(skillOrderRows)
    .map((row) => normalizeSkillPriorityRow(row, totalGames))
    .filter(Boolean);
  if (rowOptions.length > 0) {
    return mergeSkillPriorityOptions(rowOptions);
  }

  const summaryOptions = [summary?.pick, summary?.win]
    .flatMap((summaryGroup) => {
      const skillSummary = getSkillPrioritySummary(summaryGroup);
      return normalizeSkillPriorityRows(skillSummary)
        .map((row) => normalizeSkillPriorityRow(row, totalGames))
        .filter(Boolean);
    });
  return mergeSkillPriorityOptions(summaryOptions);
}

function getSkillPrioritySummary(summaryGroup) {
  if (!summaryGroup || typeof summaryGroup !== "object") {
    return null;
  }

  for (const key of [
    "skillOrder",
    "skillOrders",
    "skills",
    "skill",
    "abilityOrder",
    "abilityOrders",
    "abilities",
  ]) {
    if (summaryGroup[key] != null) {
      return summaryGroup[key];
    }
  }

  return null;
}

function normalizeSkillPriorityRows(value) {
  const rows = [];
  const seenObjects = new WeakSet();

  function visit(candidate) {
    if (candidate == null) {
      return;
    }

    if (typeof candidate === "object") {
      if (seenObjects.has(candidate)) {
        return;
      }
      seenObjects.add(candidate);
    }

    if (isSkillPriorityRow(candidate)) {
      rows.push(candidate);
      return;
    }

    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }

    if (typeof candidate === "object") {
      Object.values(candidate).forEach(visit);
    }
  }

  visit(value);
  return rows;
}

function isSkillPriorityRow(value) {
  const rawOrder = getSkillOrderValue(value);
  const games = Array.isArray(value)
    ? toNumber(value[3] ?? value[2])
    : toNumber(value?.n ?? value?.games);
  return games > 0 && Boolean(getFirstMaxedAbility(rawOrder));
}

function normalizeSkillPriorityRow(row, totalGames) {
  const rawOrder = getSkillOrderValue(row);
  const abilityKey = getFirstMaxedAbility(rawOrder);
  const games = Array.isArray(row)
    ? toNumber(row[3] ?? row[2])
    : toNumber(row?.n ?? row?.games);
  const winRate = Array.isArray(row)
    ? toNumber(row[1])
    : toNumber(row?.wr ?? row?.winRate);
  if (!abilityKey || games <= 0) {
    return null;
  }

  const sequence = normalizeSkillSequence(rawOrder);
  return {
    id: abilityKey,
    abilityKey,
    name: abilityKey,
    orderKey: sequence.join(""),
    games,
    wins: calculateWins(games, winRate),
    pickRate: toNumber(Array.isArray(row) ? row[2] : row?.pickRate) ||
      calculateRate(games, totalGames),
  };
}

function getSkillOrderValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const order =
    value.set ??
    value.order ??
    value.sequence ??
    value.skills ??
    value.ids ??
    value.maxOrder ??
    value.maxPriority ??
    value.abilityOrder;
  if (order && typeof order === "object" && !Array.isArray(order)) {
    return order.skills ?? order.order ?? order.ids ?? order.sequence ?? null;
  }

  return order;
}

function mergeSkillPriorityOptions(options) {
  const recordsByAbility = new Map();
  const seenOrderKeys = new Set();

  options.forEach((option) => {
    if (!option?.abilityKey) {
      return;
    }

    const orderKey = option.orderKey || option.abilityKey;
    const dedupeKey = `${orderKey}:${option.games}:${option.wins}`;
    if (seenOrderKeys.has(dedupeKey)) {
      return;
    }
    seenOrderKeys.add(dedupeKey);

    const existing = recordsByAbility.get(option.abilityKey);
    if (existing) {
      existing.games += toNumber(option.games);
      existing.wins += toNumber(option.wins);
      return;
    }

    recordsByAbility.set(option.abilityKey, {
      id: option.abilityKey,
      abilityKey: option.abilityKey,
      name: option.abilityKey,
      games: toNumber(option.games),
      wins: toNumber(option.wins),
    });
  });

  return [...recordsByAbility.values()];
}

function getFirstMaxedAbility(value) {
  const sequence = normalizeSkillSequence(value);
  if (sequence.length === 0) {
    return null;
  }

  if (sequence.length <= 3 && new Set(sequence).size === sequence.length) {
    return sequence[0];
  }

  const ranks = { Q: 0, W: 0, E: 0 };
  for (const abilityKey of sequence) {
    ranks[abilityKey] += 1;
    if (ranks[abilityKey] >= 5) {
      return abilityKey;
    }
  }

  return sequence[0];
}

function normalizeSkillSequence(value) {
  const rawTokens = collectRawAbilityTokens(value);
  const usesZeroBasedSlots = rawTokens.some((token) => token === 0);

  return rawTokens
    .map((token) => {
      const abilityKey = normalizeAbilityKey(token);
      if (abilityKey) {
        return abilityKey;
      }

      if (!Number.isInteger(token)) {
        return null;
      }

      if (usesZeroBasedSlots) {
        return ["Q", "W", "E"][token] || null;
      }

      return [null, "Q", "W", "E"][token] || null;
    })
    .filter(Boolean);
}

function collectRawAbilityTokens(value) {
  if (Array.isArray(value)) {
    return value.flatMap(collectRawAbilityTokens);
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? [value] : [];
  }

  if (typeof value !== "string") {
    return [];
  }

  const normalizedValue = value.trim().toUpperCase();
  const letterTokens = normalizedValue.match(/[QWE]/g);
  if (letterTokens?.length) {
    return letterTokens;
  }

  if (/^[0-4]+$/.test(normalizedValue)) {
    return [...normalizedValue].map(Number);
  }

  return (normalizedValue.match(/\d+/g) || []).map(Number);
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

function normalizeStartingItemRow(row, itemNamesById, totalGames) {
  if (!Array.isArray(row) || row.length < 4) {
    return null;
  }

  const itemIds = normalizeItemSetIds(row[0]);
  const games = toNumber(row[3]);
  if (itemIds.length === 0 || games <= 0) {
    return null;
  }

  const wins = calculateWins(games, row[1]);
  return {
    setKey: buildItemSetKey(itemIds),
    itemIds,
    games,
    wins,
    winRate: calculateRate(wins, games),
    pickRate: calculateRate(games, totalGames),
    selections: itemIds.map((itemId) => createItemSelection(itemId, itemNamesById)),
  };
}

function createSummonerSpellSelection(spellId, spellNamesById) {
  return {
    id: spellId,
    icon: buildSummonerSpellIconUrl(spellId),
    name: getMetadataName(spellId, spellNamesById, `Spell ${spellId}`),
  };
}

function createItemSelection(itemId, itemNamesById) {
  return {
    itemId,
    id: itemId,
    icon: buildItemIconUrl(itemId),
    name: getMetadataName(itemId, itemNamesById, `Item ${itemId}`),
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

function collectItemSummarySlotOptions(itemSummary, itemNamesById, itemMinuteById = {}) {
  if (!itemSummary || typeof itemSummary !== "object") {
    return ITEM_SLOT_KEYS.map(() => []);
  }

  return ITEM_SLOT_KEYS.map((slotKey, index) => {
    return normalizeItemSummaryEntries(itemSummary[slotKey])
      .map((entry) =>
        normalizeItemSummaryEntry(entry, itemNamesById, index + 1, itemMinuteById),
      )
      .filter(Boolean);
  });
}

function normalizeItemSummaryEntries(value) {
  return Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === "object")
    : value && typeof value === "object"
      ? [value]
      : [];
}

function normalizeItemSummaryEntry(entry, itemNamesById, slotIndex, itemMinuteById) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const itemId = toNumber(entry.id ?? entry.itemId);
  const games = toNumber(entry.n ?? entry.games);
  if (!itemId || games <= 0) {
    return null;
  }

  const purchaseMinute = toNumber(
    entry.purchaseMinute ??
      entry.minute ??
      itemMinuteById?.bySlot?.[buildItemMinuteSlotKey(slotIndex, itemId)] ??
      itemMinuteById?.byId?.[String(itemId)] ??
      itemMinuteById?.[String(itemId)] ??
      itemMinuteById?.[itemId],
  );
  const hasPurchaseMinute = purchaseMinute > 0;
  const wins = calculateWins(games, entry.wr ?? entry.winRate);

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

function buildItemSetKey(itemIds) {
  return normalizeItemSetIds(itemIds).join("-");
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

function normalizeItemSetIds(value) {
  const normalizedIds = Array.isArray(value)
    ? value.map((entry) => toNumber(entry))
    : typeof value === "string"
      ? value.split(/[^0-9]+/).map((entry) => toNumber(entry))
      : [];

  return normalizedIds.filter((entry) => entry > 0);
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

function matchFirst(value, pattern) {
  const match = String(value || "").match(pattern);
  return match ? match[1] : null;
}

function normalizeMetadataName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

module.exports = {
  buildPageKey,
  isCompletedBootItem,
  parseLolalyticsMatchupBuildData,
  parseLolalyticsRenderedBuildPage,
  parseLolalyticsRuneBuildData,
};
