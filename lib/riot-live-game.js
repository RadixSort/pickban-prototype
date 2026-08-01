"use strict";

const http = require("http");
const https = require("https");

const DEFAULT_LIVE_CLIENT_DATA_URL = "https://127.0.0.1:2999";
const LIVE_CLIENT_DATA_TIMEOUT_MS = 2500;
const PLAYER_LIST_PATH = "/liveclientdata/playerlist";
const ACTIVE_PLAYER_NAME_PATH = "/liveclientdata/activeplayername";
const LIVE_CHAMPION_TOKEN_ALIASES = new Map([
  ["monkeyking", "wukong"],
]);

/**
 * Pull the two smallest Live Client Data resources needed to identify the
 * local team and evaluate every inventory. The returned snapshot deliberately
 * excludes Riot IDs, summoner names, and every other player identifier.
 */
async function fetchLiveGameSnapshot({
  championByName = new Map(),
  championByRawToken = new Map(),
  championBySlug = new Map(),
  env = process.env,
  legendaryItemIds = new Set(),
  normalizeRole,
  requestJson = requestLiveClientDataJson,
  timeoutMs = LIVE_CLIENT_DATA_TIMEOUT_MS,
} = {}) {
  const baseUrl = resolveLiveClientDataBaseUrl(env);
  const [players, activePlayerName] = await Promise.all([
    requestJson(PLAYER_LIST_PATH, { baseUrl, timeoutMs }),
    requestJson(ACTIVE_PLAYER_NAME_PATH, { baseUrl, timeoutMs }),
  ]);
  const snapshot = buildLiveGameSnapshot({
    activePlayerName,
    championByName,
    championByRawToken,
    championBySlug,
    legendaryItemIds,
    normalizeRole,
    players,
  });

  return {
    ...snapshot,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Normalize a Live Client Data player list into the app's two draft sides.
 * Gold ranks are assigned before champion resolution so a newly released or
 * otherwise unknown champion still occupies the correct global rank.
 */
function buildLiveGameSnapshot({
  activePlayerName,
  championByName = new Map(),
  championByRawToken = new Map(),
  championBySlug = new Map(),
  legendaryItemIds = new Set(),
  normalizeRole,
  players = [],
} = {}) {
  const livePlayers = Array.isArray(players) ? players : [];
  const rankedPlayers = rankLivePlayersByBuildGold(livePlayers, { legendaryItemIds });
  const localPlayerIndex = findLocalPlayerIndex(livePlayers, activePlayerName);

  if (localPlayerIndex === -1) {
    return buildUnavailableSnapshot("local_player_not_found", livePlayers.length);
  }

  const localTeam = normalizeTeam(livePlayers[localPlayerIndex]?.team);
  if (!localTeam) {
    return buildUnavailableSnapshot("local_team_not_found", livePlayers.length);
  }

  const allies = [];
  const enemies = [];
  let omittedParticipantCount = 0;

  livePlayers.forEach((player, sourceIndex) => {
    const champion = resolveLiveChampion(player, {
      championByName,
      championByRawToken,
      championBySlug,
    });
    const team = normalizeTeam(player?.team);
    if (!champion || !team) {
      omittedParticipantCount += 1;
      return;
    }

    const participant = buildNormalizedParticipant({
      champion,
      isLocalPlayer: sourceIndex === localPlayerIndex,
      metrics: rankedPlayers[sourceIndex],
      normalizeRole,
      player,
    });

    if (team === localTeam) {
      allies.push(participant);
    } else {
      enemies.push(participant);
    }
  });

  return {
    status: "active",
    active: true,
    complete: omittedParticipantCount === 0,
    reason: "",
    allies,
    enemies,
    totalPlayerCount: livePlayers.length,
    resolvedPlayerCount: allies.length + enemies.length,
    omittedParticipantCount,
  };
}

function buildUnavailableSnapshot(reason, totalPlayerCount) {
  return {
    status: "unavailable",
    active: false,
    complete: false,
    reason,
    allies: [],
    enemies: [],
    totalPlayerCount,
    resolvedPlayerCount: 0,
    omittedParticipantCount: totalPlayerCount,
  };
}

function buildNormalizedParticipant({
  champion,
  isLocalPlayer,
  metrics,
  normalizeRole,
  player,
}) {
  return {
    champion: typeof champion?.name === "string" ? champion.name : "",
    championKey: champion?.key == null ? "" : String(champion.key),
    championId: typeof champion?.id === "string" ? champion.id : "",
    icon: typeof champion?.icon === "string" ? champion.icon : "",
    role: normalizeLivePosition(player?.position, normalizeRole),
    isLocalPlayer,
    items: metrics?.items || [],
    buildGold: Number(metrics?.buildGold || 0),
    buildGoldRank: Number(metrics?.buildGoldRank || 0),
    hasCompletedFirstItem: Boolean(metrics?.hasCompletedFirstItem),
  };
}

/**
 * Return privacy-safe inventory metrics in the original player-list order.
 * Equal gold values receive consecutive ordinal ranks in input order.
 */
function rankLivePlayersByBuildGold(players = [], { legendaryItemIds = new Set() } = {}) {
  const livePlayers = Array.isArray(players) ? players : [];
  const metrics = livePlayers.map((player, sourceIndex) => {
    const items = normalizeLiveItems(player?.items);
    return {
      sourceIndex,
      items,
      buildGold: sumNormalizedItemGold(items),
      buildGoldRank: 0,
      hasCompletedFirstItem: hasCompletedFirstItem(items, legendaryItemIds),
    };
  });

  [...metrics]
    .sort(
      (left, right) =>
        right.buildGold - left.buildGold || left.sourceIndex - right.sourceIndex,
    )
    .forEach((entry, rankIndex) => {
      entry.buildGoldRank = rankIndex + 1;
    });

  return metrics;
}

function normalizeLiveItems(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map(normalizeLiveItem)
    .filter(Boolean);
}

function normalizeLiveItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const itemId = normalizeItemId(item.itemID ?? item.itemId ?? item.id);
  const price = normalizeNonnegativeNumber(item.price);
  const count = normalizePositiveNumber(item.count, 1);

  return {
    itemId,
    count,
    price,
    consumable: item.consumable === true,
  };
}

function calculateBuildGold(items = []) {
  return sumNormalizedItemGold(normalizeLiveItems(items));
}

function sumNormalizedItemGold(items) {
  return items.reduce((total, item) => {
    const itemGold = item.price * item.count;
    if (!Number.isFinite(itemGold) || itemGold < 0) {
      return total;
    }

    const nextTotal = total + itemGold;
    return Number.isFinite(nextTotal) ? nextTotal : total;
  }, 0);
}

function hasCompletedFirstItem(items = [], legendaryItemIds = new Set()) {
  if (!(legendaryItemIds instanceof Set) || legendaryItemIds.size === 0) {
    return false;
  }

  // This intentionally reflects current ownership rather than purchase
  // history, so selling every Legendary item restores pre-item filtering on
  // the next live snapshot.
  return normalizeLiveItems(items).some(
    (item) =>
      !item.consumable &&
      item.itemId != null &&
      (legendaryItemIds.has(item.itemId) || legendaryItemIds.has(String(item.itemId))),
  );
}

/**
 * Build a Legendary ID set from the patch-current Riot item catalog. Prefer an
 * explicit Legendary classification when one exists; the LCU catalog normally
 * omits it, so otherwise identify eligible terminal recipe outputs. Price is
 * intentionally irrelevant (notably, low-cost Legendary items still count).
 */
function buildLegendaryItemIdSet(itemCatalog) {
  const legendaryItemIds = new Set();

  for (const [fallbackId, item] of collectItemCatalogEntries(itemCatalog)) {
    if (!isLegendaryCatalogItem(item)) {
      continue;
    }

    const itemId = normalizeItemId(item?.itemID ?? item?.itemId ?? item?.id ?? fallbackId);
    if (itemId != null) {
      legendaryItemIds.add(itemId);
    }
  }

  return legendaryItemIds;
}

function isLegendaryCatalogItem(item) {
  if (isExplicitlyLegendaryItem(item)) {
    return true;
  }
  if (!item || typeof item !== "object" || isExcludedLegendaryItemCategory(item)) {
    return false;
  }
  const specialRecipe = Number(item.specialRecipe);
  const hasSpecialRecipe = Number.isFinite(specialRecipe) && specialRecipe > 0;
  const hasComponentSource = hasCatalogReferences(item.from);
  const hasFurtherUpgrade =
    hasCatalogReferences(item.to) || hasCatalogReferences(item.into);
  if (isUnfinishedSupportQuestItem(item, { hasComponentSource, hasSpecialRecipe })) {
    return false;
  }
  if ((!hasComponentSource && !hasSpecialRecipe) || hasFurtherUpgrade) {
    return false;
  }

  const explicitlyUnavailable =
    item.inStore === false ||
    item.purchasable === false ||
    item.gold?.purchasable === false;
  return !explicitlyUnavailable || hasSpecialRecipe;
}

function isUnfinishedSupportQuestItem(
  item,
  { hasComponentSource = false, hasSpecialRecipe = false } = {},
) {
  if (!hasSpecialRecipe || hasComponentSource) {
    return false;
  }

  const categories = [
    ...(Array.isArray(item?.categories) ? item.categories : []),
    ...(Array.isArray(item?.tags) ? item.tags : []),
  ].map(normalizeCatalogCategory);
  const hasGoldGeneration = categories.some(
    (category) => category.includes("goldper") || category.includes("goldgeneration"),
  );
  const hasSupportIdentity = categories.some((category) =>
    ["lane", "support", "vision"].includes(category),
  );

  return hasGoldGeneration && hasSupportIdentity;
}

function isExcludedLegendaryItemCategory(item) {
  const excludedCategories = new Set([
    "boot",
    "boots",
    "consumable",
    "consumables",
    "trinket",
    "trinkets",
  ]);
  const categories = [
    ...(Array.isArray(item?.categories) ? item.categories : []),
    ...(Array.isArray(item?.tags) ? item.tags : []),
  ];

  return categories.some((category) =>
    excludedCategories.has(normalizeCatalogCategory(category)),
  );
}

function normalizeCatalogCategory(value) {
  if (value && typeof value === "object") {
    return normalizeCatalogCategory(value.name ?? value.value ?? value.label ?? null);
  }

  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z]/g, "")
    : "";
}

function hasCatalogReferences(value) {
  if (Array.isArray(value)) {
    return value.some((entry) => entry != null && String(entry).trim() !== "");
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  return value != null && String(value).trim() !== "";
}

function collectItemCatalogEntries(itemCatalog) {
  if (Array.isArray(itemCatalog)) {
    return itemCatalog.map((item) => [null, item]);
  }

  if (!itemCatalog || typeof itemCatalog !== "object") {
    return [];
  }

  if (Array.isArray(itemCatalog.items)) {
    return itemCatalog.items.map((item) => [null, item]);
  }

  for (const candidate of [itemCatalog.items, itemCatalog.data]) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return Object.entries(candidate);
    }
  }

  return Object.entries(itemCatalog);
}

function isExplicitlyLegendaryItem(item) {
  if (!item || typeof item !== "object") {
    return false;
  }

  const explicitClassifications = [
    item.rarity,
    item.itemRarity,
    item.tier,
    item.itemTier,
    ...(Array.isArray(item.categories) ? item.categories : []),
    ...(Array.isArray(item.tags) ? item.tags : []),
    item.classification?.rarity,
    item.classification?.tier,
    item.shop?.rarity,
    item.shop?.tier,
  ];

  return explicitClassifications.some(
    (classification) => normalizeItemClassification(classification) === "legendary",
  );
}

function normalizeItemClassification(value) {
  if (value && typeof value === "object") {
    return normalizeItemClassification(
      value.name ?? value.value ?? value.label ?? value.id ?? null,
    );
  }

  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z]/g, "")
    : "";
}

function resolveLiveChampion(
  player,
  {
    championByName = new Map(),
    championByRawToken = new Map(),
    championBySlug = new Map(),
  } = {},
) {
  const displayToken = normalizeChampionToken(player?.championName);
  const rawToken = extractRawChampionToken(player?.rawChampionName);
  const displayCandidates = expandLiveChampionTokenAliases(displayToken);
  const rawCandidates = expandLiveChampionTokenAliases(rawToken);

  for (const [lookup, candidates] of [
    [championByName, displayCandidates],
    [championByRawToken, rawCandidates],
    [championBySlug, [...displayCandidates, ...rawCandidates]],
    [championByName, rawCandidates],
    [championByRawToken, displayCandidates],
  ]) {
    for (const candidate of candidates) {
      const champion = getLookupValue(lookup, candidate);
      if (champion) {
        return champion;
      }
    }
  }

  return null;
}

function expandLiveChampionTokenAliases(token) {
  if (!token) {
    return [];
  }

  const alias = LIVE_CHAMPION_TOKEN_ALIASES.get(token);
  return alias && alias !== token ? [token, alias] : [token];
}

function extractRawChampionToken(value) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue) {
    return "";
  }

  const displayNameMatch = rawValue.match(/(?:^|_)displayname_(.+)$/i);
  return normalizeChampionToken(displayNameMatch?.[1] || rawValue);
}

function normalizeChampionToken(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
}

function getLookupValue(lookup, key) {
  if (!lookup || !key) {
    return null;
  }

  if (typeof lookup.get === "function") {
    return lookup.get(key) || null;
  }

  return typeof lookup === "object" ? lookup[key] || null : null;
}

function normalizeLivePosition(value, normalizeRole) {
  const position = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!position || position === "none" || position === "invalid") {
    return null;
  }

  if (position === "utility") {
    return "support";
  }

  return typeof normalizeRole === "function" ? normalizeRole(position) : null;
}

/**
 * Match identity fields in descending authority without returning an identity
 * in the normalized snapshot.
 */
function findLocalPlayerIndex(players = [], activePlayerName = null) {
  if (!Array.isArray(players) || players.length === 0) {
    return -1;
  }

  const activeIdentities = getActivePlayerIdentityCandidates(activePlayerName);
  if (activeIdentities.length === 0) {
    return -1;
  }

  const identityReaders = [
    (player) => player?.riotId,
    (player) => buildStructuredRiotId(player?.riotIdGameName, player?.riotIdTagLine),
    (player) => player?.summonerName,
  ];

  for (const readIdentity of identityReaders) {
    const matchingIndex = players.findIndex((player) => {
      const playerIdentity = normalizePlayerIdentity(readIdentity(player));
      return playerIdentity && activeIdentities.includes(playerIdentity);
    });
    if (matchingIndex !== -1) {
      return matchingIndex;
    }
  }

  return -1;
}

function getActivePlayerIdentityCandidates(activePlayerName) {
  const candidates =
    activePlayerName && typeof activePlayerName === "object"
      ? [
          activePlayerName.riotId,
          buildStructuredRiotId(
            activePlayerName.riotIdGameName,
            activePlayerName.riotIdTagLine,
          ),
          activePlayerName.summonerName,
          activePlayerName.name,
        ]
      : [activePlayerName];

  return [...new Set(candidates.map(normalizePlayerIdentity).filter(Boolean))];
}

function buildStructuredRiotId(gameName, tagLine) {
  const normalizedGameName = typeof gameName === "string" ? gameName.trim() : "";
  const normalizedTagLine = typeof tagLine === "string" ? tagLine.trim() : "";
  return normalizedGameName && normalizedTagLine
    ? `${normalizedGameName}#${normalizedTagLine}`
    : "";
}

function normalizePlayerIdentity(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeTeam(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeItemId(value) {
  const itemId = Number(value);
  return Number.isInteger(itemId) && itemId > 0 ? itemId : null;
}

function normalizeNonnegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function resolveLiveClientDataBaseUrl(env = process.env) {
  const configuredUrl =
    typeof env?.PICKBAN_LIVE_CLIENT_DATA_URL === "string"
      ? env.PICKBAN_LIVE_CLIENT_DATA_URL.trim()
      : "";
  const parsedUrl = new URL(configuredUrl || DEFAULT_LIVE_CLIENT_DATA_URL);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Live Client Data URL must use HTTP or HTTPS.");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("Live Client Data URL must not include credentials.");
  }

  return parsedUrl.origin;
}

function requestLiveClientDataJson(
  resourcePath,
  {
    baseUrl = DEFAULT_LIVE_CLIENT_DATA_URL,
    timeoutMs = LIVE_CLIENT_DATA_TIMEOUT_MS,
  } = {},
) {
  const requestUrl = new URL(resourcePath, `${String(baseUrl).replace(/\/+$/, "")}/`);
  const transport = requestUrl.protocol === "http:" ? http : https;
  const requestOptions = buildLiveClientRequestOptions(requestUrl);

  return new Promise((resolve, reject) => {
    const request = transport.request(requestOptions, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(
            `Live Client Data request failed for ${resourcePath} with status ${response.statusCode}.`,
          );
          error.statusCode = response.statusCode;
          error.resourcePath = resourcePath;
          reject(error);
          return;
        }

        try {
          resolve(responseBody ? JSON.parse(responseBody) : null);
        } catch (error) {
          error.resourcePath = resourcePath;
          reject(error);
        }
      });
    });

    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      const error = new Error(`Timed out while connecting to Live Client Data at ${resourcePath}.`);
      error.code = "ETIMEDOUT";
      error.resourcePath = resourcePath;
      request.destroy(error);
    });
    request.end();
  });
}

function buildLiveClientRequestOptions(requestUrl) {
  const parsedUrl = requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl));
  const requestOptions = {
    hostname: stripIpv6Brackets(parsedUrl.hostname),
    port: parsedUrl.port || undefined,
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    method: "GET",
    headers: {
      accept: "application/json",
    },
  };

  if (parsedUrl.protocol === "https:") {
    requestOptions.rejectUnauthorized = !isLoopbackHostname(parsedUrl.hostname);
  }

  return requestOptions;
}

function isLoopbackHostname(hostname) {
  const normalizedHostname = stripIpv6Brackets(String(hostname || "").trim().toLowerCase());
  return (
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "localhost" ||
    normalizedHostname === "::1"
  );
}

function stripIpv6Brackets(hostname) {
  return String(hostname || "").replace(/^\[|\]$/g, "");
}

module.exports = {
  ACTIVE_PLAYER_NAME_PATH,
  DEFAULT_LIVE_CLIENT_DATA_URL,
  LIVE_CLIENT_DATA_TIMEOUT_MS,
  PLAYER_LIST_PATH,
  buildLegendaryItemIdSet,
  buildLiveClientRequestOptions,
  buildLiveGameSnapshot,
  calculateBuildGold,
  extractRawChampionToken,
  fetchLiveGameSnapshot,
  findLocalPlayerIndex,
  hasCompletedFirstItem,
  isExplicitlyLegendaryItem,
  isLegendaryCatalogItem,
  isLoopbackHostname,
  normalizeChampionToken,
  normalizeLiveItem,
  normalizeLiveItems,
  normalizeLivePosition,
  rankLivePlayersByBuildGold,
  requestLiveClientDataJson,
  resolveLiveChampion,
  resolveLiveClientDataBaseUrl,
};
