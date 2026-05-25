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

function parseLolalyticsRenderedBuildPage(html = "", options = {}) {
  const lines = normalizeRenderedBuildLines(html);
  const renderedItems = extractRenderedCoreBuildItems(lines);
  const renderedSpells = extractRenderedSummonerSpellRows(lines);
  const metadata = extractRenderedImageMetadata(lines);
  const totalGames = Math.max(
    ...renderedItems.rowsBySlot.flat().map((row) => toNumber(row[3])),
    ...renderedItems.boots.map((row) => toNumber(row[3])),
    ...renderedSpells.map((row) => toNumber(row[3])),
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
    summary: {},
    spells: renderedSpells,
    boots: renderedItems.boots,
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
    const kind = itemId ? "item" : spellId ? "spell" : "image";

    return `\n${RENDERED_IMAGE_MARKER}|${kind}|${itemId || spellId || ""}|${alt}\n`;
  });

  return withImageMarkers
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .split(/\r?\n/)
    .map((line) => decodeHtmlEntity(line).replace(/\s+/g, " ").trim())
    .filter(Boolean);
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
      currentSlot < 4
        ? coreStats
        : findNextRenderedStats(section, index + 1, findNextRenderedItemBoundary(section, index + 1));
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

    const winRate = parsePercentLine(lines[index]);
    if (winRate == null) {
      continue;
    }

    for (let nextIndex = index + 1; nextIndex < Math.min(index + 4, boundedEndIndex); nextIndex += 1) {
      const games = parseIntegerLine(lines[nextIndex]);
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
    games: parseIntegerLine(match[2]),
  };
}

function parsePercentLine(line) {
  const match = String(line || "").match(/^(\d+(?:\.\d+)?)%$/);
  return match ? Number(match[1]) : null;
}

function parseIntegerLine(line) {
  const normalizedLine = String(line || "").replace(/,/g, "").trim();
  return /^\d+$/.test(normalizedLine) ? Number(normalizedLine) : 0;
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
  };
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
