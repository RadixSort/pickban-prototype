"use strict";

const {
  isCompletedBootItem,
  parseLolalyticsMatchupBuildData,
} = require("./lolalytics-build-parser.js");

const ITEM_SLOT_COUNT = 6;
const ITEM_OPTION_KEYS = [
  "item_options_1",
  "item_options_2",
  "item_options_3",
  "item_options_4",
];
const UGG_PRELOADED_STATE_MARKER = "window.__REACTN_PRELOADED_STATE__";
const UGG_ROLE_BY_LOCAL_ROLE = {
  top: "top",
  jungle: "jungle",
  middle: "mid",
  mid: "mid",
  bottom: "adc",
  bot: "adc",
  adc: "adc",
  support: "support",
};
const UGG_RANK_BY_LOCAL_RANK = {
  all: "overall",
  gold_plus: "gold",
  platinum_plus: "platinum_plus",
  emerald_plus: "emerald_plus",
  diamond_plus: "diamond_plus",
  d2_plus: "diamond_2_plus",
};
const SPELL_NAMES_BY_ID = {
  1: "Cleanse",
  3: "Exhaust",
  4: "Flash",
  6: "Ghost",
  7: "Heal",
  11: "Smite",
  12: "Teleport",
  13: "Clarity",
  14: "Ignite",
  21: "Barrier",
  32: "Mark",
};

function parseUggBuildPage(html = "", options = {}) {
  const state = extractUggPageState(html);
  const roleStats = findUggRoleBuildStats(state, options);
  if (!roleStats) {
    throw new Error("U.GG build page did not include usable role build data.");
  }

  const itemNamesById = extractUggItemNames(state);
  const rowsBySlot = Array.from({ length: ITEM_SLOT_COUNT }, () => []);
  const boots = [];
  const bootItemIds = new Set();
  const coreIds = normalizeIdList(roleStats.rec_core_items?.ids);
  const coreGames = toNumber(roleStats.rec_core_items?.matches);
  const coreWinRate = toNumber(roleStats.rec_core_items?.win_rate);

  coreIds.forEach((itemId, index) => {
    const row = [itemId, coreWinRate, 0, coreGames, null];
    addUggItemRow({ rowsBySlot, boots, bootItemIds, row, itemNamesById, slotIndex: index });
  });

  ITEM_OPTION_KEYS.forEach((key, optionIndex) => {
    const slotIndex = coreIds.length + optionIndex;
    const optionsForSlot = Array.isArray(roleStats[key]) ? roleStats[key] : [];
    optionsForSlot.forEach((entry) => {
      const itemId = toNumber(entry?.id);
      const games = toNumber(entry?.matches);
      if (!itemId || games <= 0) {
        return;
      }

      const row = [itemId, toNumber(entry?.win_rate), 0, games, null];
      addUggItemRow({ rowsBySlot, boots, bootItemIds, row, itemNamesById, slotIndex });
    });
  });

  normalizeUggItemOptions(roleStats.t3_boots_options).forEach((entry) => {
    const itemId = toNumber(entry?.id);
    const games = toNumber(entry?.matches);
    if (!itemId || games <= 0) {
      return;
    }

    addUggBootRow(boots, bootItemIds, [itemId, toNumber(entry?.win_rate), 0, games, null]);
  });

  const spells = buildUggSpellRows(roleStats.rec_summoner_spells);
  const totalGames = Math.max(
    toNumber(roleStats.matches),
    coreGames,
    ...rowsBySlot.flat().map((row) => toNumber(row[3])),
    ...boots.map((row) => toNumber(row[3])),
    ...spells.map((row) => toNumber(row[3])),
    0,
  );

  if (totalGames <= 0) {
    throw new Error("U.GG build page did not include usable build rows.");
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
    spells,
    boots,
  };

  rowsBySlot.forEach((rows, index) => {
    buildLoader[`item${index + 1}`] = rows;
  });

  return parseLolalyticsMatchupBuildData(
    buildLoader,
    {
      items: itemNamesById,
      spells: SPELL_NAMES_BY_ID,
    },
    options,
  );
}

function addUggItemRow({ rowsBySlot, boots, bootItemIds, row, itemNamesById, slotIndex }) {
  const itemId = toNumber(row?.[0]);
  const itemName = itemNamesById[String(itemId)] || "";
  if (isCompletedBootItem(itemId, itemName)) {
    addUggBootRow(boots, bootItemIds, row);
    return;
  }

  if (slotIndex >= 0 && slotIndex < rowsBySlot.length) {
    rowsBySlot[slotIndex].push(row);
  }
}

function addUggBootRow(boots, bootItemIds, row) {
  const itemId = toNumber(row?.[0]);
  if (!itemId || bootItemIds.has(itemId)) {
    return;
  }

  bootItemIds.add(itemId);
  boots.push(row);
}

function buildUggSpellRows(spellStats) {
  const spellIds = normalizeIdList(spellStats?.ids).slice(0, 2);
  const games = toNumber(spellStats?.matches);
  if (spellIds.length !== 2 || games <= 0) {
    return [];
  }

  return [[spellIds.join("_"), toNumber(spellStats?.win_rate), 0, games]];
}

function findUggRoleBuildStats(state, options = {}) {
  const rank = getUggRank(options.rankFilter);
  const role = getUggRole(options.role);
  const preferredKeys = [
    rank && role ? `world_${rank}_${role}` : null,
    role ? `world_emerald_plus_${role}` : null,
  ].filter(Boolean);

  for (const preferredKey of preferredKeys) {
    const stats = findUggStatsByKey(state, preferredKey);
    if (stats) {
      return stats;
    }
  }

  for (const value of Object.values(state || {})) {
    const data = value?.data;
    if (!data || typeof data !== "object") {
      continue;
    }

    for (const [key, stats] of Object.entries(data)) {
      if (key.startsWith("world_") && hasUggBuildStats(stats)) {
        return stats;
      }
    }
  }

  return null;
}

function findUggStatsByKey(state, key) {
  for (const value of Object.values(state || {})) {
    const stats = value?.data?.[key];
    if (hasUggBuildStats(stats)) {
      return stats;
    }
  }

  return null;
}

function hasUggBuildStats(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value.rec_core_items || value.rec_summoner_spells || value.item_options_1),
  );
}

function extractUggPageState(html) {
  const preloadedState = parseOptionalJsonObjectAfterMarker(html, UGG_PRELOADED_STATE_MARKER);
  const ssrData = parseOptionalJsonObjectAfterMarker(html, "window.__SSR_DATA__");
  const mergedState = {
    ...(preloadedState || {}),
    ...(ssrData || {}),
  };

  if (Object.keys(mergedState).length === 0) {
    throw new Error("U.GG build page did not include embedded state.");
  }

  return mergedState;
}

function parseOptionalJsonObjectAfterMarker(text, marker) {
  const jsonText = extractJsonObjectAfterMarker(text, marker, { required: false });
  if (!jsonText) {
    return null;
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`U.GG embedded state could not be parsed: ${error.message}`);
  }
}

function extractJsonObjectAfterMarker(text, marker, { required = true } = {}) {
  const source = String(text || "");
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    if (!required) {
      return null;
    }
    throw new Error("U.GG build page did not include preloaded state.");
  }

  const startIndex = source.indexOf("{", markerIndex + marker.length);
  if (startIndex === -1) {
    if (!required) {
      return null;
    }
    throw new Error("U.GG preloaded state did not include a JSON object.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error("U.GG preloaded state JSON object was incomplete.");
}

function extractUggItemNames(state) {
  const namesById = {};
  const prioritiesById = {};

  for (const [sourceKey, value] of Object.entries(state || {})) {
    const data = value?.data;
    if (!data || typeof data !== "object") {
      continue;
    }

    const priority = getUggItemMetadataPriority(sourceKey);
    for (const [id, item] of Object.entries(data)) {
      if (!/^\d+$/.test(id) || !item || typeof item.name !== "string") {
        continue;
      }

      if (priority <= 0 && !item.gold && item.image?.group !== "item") {
        continue;
      }

      if ((prioritiesById[id] ?? -1) > priority) {
        continue;
      }

      const name = decodeHtmlEntity(stripHtml(item.name)).trim();
      if (!name) {
        continue;
      }

      namesById[id] = name;
      prioritiesById[id] = priority;
    }
  }

  return namesById;
}

function getUggItemMetadataPriority(sourceKey) {
  const key = String(sourceKey || "");
  if (key.includes("/riot_static/") && key.includes("/items/")) {
    return 3;
  }

  if (key.includes("items.json")) {
    return 2;
  }

  if (key.includes("legacy-items")) {
    return 1;
  }

  return 0;
}

function normalizeUggItemOptions(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.values(value).filter((entry) => entry && typeof entry === "object");
  }

  return [];
}

function getUggRole(role) {
  return UGG_ROLE_BY_LOCAL_ROLE[String(role || "").toLowerCase()] || null;
}

function getUggRank(rankFilter) {
  return UGG_RANK_BY_LOCAL_RANK[String(rankFilter || "").toLowerCase()] || "emerald_plus";
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => toNumber(entry)).filter((entry) => entry > 0);
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, "");
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

function toNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

module.exports = {
  parseUggBuildPage,
};
