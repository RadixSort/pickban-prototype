const { AsyncLocalStorage } = require("async_hooks");
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { version: appVersion } = require("./package.json");
const {
  buildEligibleTierStats,
  extractTierListRows,
} = require("./lib/lolalytics-tier-list.js");
const {
  normalizeBuildSuggestionRequest,
  normalizeChampionName,
} = require("./lib/request-normalization.js");
const {
  buildBuildSuggestionResults,
} = require("./lib/build-suggestion-results.js");
const {
  parseLolalyticsMatchupBuildData,
} = require("./lib/lolalytics-build-parser.js");
const {
  resolveQwikPayload: resolveRawQwikPayload,
} = require("./lib/qwik-payload.js");
const {
  buildRoleSuggestionResults,
  buildSuggestionMeta,
} = require("./lib/role-suggestion-results.js");
const {
  buildBuildSuggestionsPayload,
  buildRoleSuggestionResponse,
  collectSuccessfulMatchupBuilds,
  hasUsableBuildSuggestions,
  normalizeSuggestRequest,
} = require("./lib/server-route-helpers.js");

const app = express();
const publicDir = path.join(__dirname, "public");
const champions = require(path.join(publicDir, "champions.json"));
const {
  getRoleLabel,
  normalizeRole,
} = require(path.join(publicDir, "roles.js"));
const {
  DEFAULT_RANK_FILTER,
  getLolalyticsDataTierQueryValue,
  getLolalyticsTierQueryValue,
  normalizeRankFilter,
} = require(path.join(publicDir, "rank-filters.js"));
const {
  resolveRequestedTargetRoles,
} = require("./lib/requested-target-roles.js");
const { buildSelectedChampionKeys } = require(path.join(publicDir, "suggestion-filters.js"));
const { buildBuildSuggestionCacheKey } = require(path.join(
  publicDir,
  "build-suggestion-cache.js",
));

const PORT = process.env.PORT || 3000;
const PATCH_WINDOW = "7";
const QUEUE = "ranked";
const REGION = "all";
const MIN_ROLE_TIER_LIST_PICK_RATE = 0.5;
const MIN_ROLE_TIER_LIST_LANE_PERCENT = 10;
const LOLALYTICS_BASE_URL = normalizeBaseUrl(
  process.env.LOLALYTICS_BASE_URL,
  "https://lolalytics.com",
);
const LOLALYTICS_MEGA_URL = normalizeBaseUrl(
  process.env.LOLALYTICS_MEGA_URL,
  "https://a1.lolalytics.com/mega/",
  { requireTrailingSlash: true },
);
const REQUEST_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const SHUTDOWN_GRACE_PERIOD_MS = 1000;

const requestCache = new Map();
const eligibleTierStatsCache = new Map();
const normalizedMatchupBuildCache = new Map();
const buildSuggestionQueryCache = new Map();
const resolvedQwikPayloadCache = new WeakMap();
const extractedRoleValuesCache = new WeakMap();
const lolalyticsBuildDataCache = new WeakMap();
const lolalyticsRequestStatsStorage = new AsyncLocalStorage();
const shutdownToken = crypto.randomBytes(24).toString("hex");
const openSockets = new Set();
let server;
let shuttingDown = false;
let forcedShutdownTimer = null;

const championByKey = new Map(
  champions.map((champion) => [String(champion.key), champion]),
);
const championBySlug = new Map(champions.map((champion) => [champion.id, champion]));
const championByName = new Map(
  champions.map((champion) => [normalizeChampionName(champion.name), champion]),
);

app.use(express.json());
app.use(
  express.static(publicDir, {
    etag: false,
    lastModified: false,
    setHeaders(response) {
      response.setHeader("Cache-Control", "no-store");
    },
  }),
);

app.get("/app-config", (_request, response) => {
  response.set("Cache-Control", "no-store");
  response.json({
    version: appVersion,
    canShutdown: true,
    shutdownToken,
  });
});

app.post("/suggest", async (request, response) =>
  lolalyticsRequestStatsStorage.run(createLolalyticsRequestStats(), async () => {
    try {
      const {
        rankFilter,
        allies,
        enemies,
        targetRoles,
        selectedChampionKeys,
      } = normalizeSuggestRequest(request.body, {
        championByName,
        defaultRankFilter: DEFAULT_RANK_FILTER,
        normalizeRankFilter,
        normalizeRole,
        createError: createHttpError,
        resolveRequestedTargetRoles,
        buildSelectedChampionKeys,
      });

      if (allies.length === 0 && enemies.length === 0) {
        return response.status(400).json({
          error: "Choose at least one allied or enemy champion before fetching suggestions.",
          requestStats: buildLolalyticsRequestStats(),
        });
      }

      const roleSuggestions = await Promise.allSettled(
        targetRoles.map((targetRole) =>
          buildSuggestionsForRole({
            allies,
            enemies,
            rankFilter,
            selectedChampionKeys,
            targetRole,
          }),
        ),
      );

      const { statusCode, payload } = buildRoleSuggestionResponse({
        targetRoles,
        roleSuggestions,
        rankFilter,
        allies,
        enemies,
        requestStats: buildLolalyticsRequestStats(),
        buildSuggestionMeta,
      });

      response.status(statusCode).json(payload);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      response.status(statusCode).json({
        error: error.message || "Unexpected server error.",
        requestStats: buildLolalyticsRequestStats(),
      });
    }
  }),
);

app.post("/shutdown", (request, response) => {
  if (!isAuthorizedShutdownRequest(request)) {
    return response.status(403).json({
      error: "Only the local app page can stop this server.",
    });
  }

  if (shuttingDown) {
    return response.status(202).json({
      message: "App shutdown is already in progress.",
    });
  }

  response.json({
    message: "PickBan is closing. You can close this browser tab.",
  });

  setImmediate(() => {
    beginShutdown("browser close request");
  });
});

app.post("/build-suggestions", async (request, response) =>
  lolalyticsRequestStatsStorage.run(createLolalyticsRequestStats(), async () => {
    try {
      const normalizedRequest = normalizeBuildSuggestionRequest(request.body, {
        championByName,
        defaultRankFilter: DEFAULT_RANK_FILTER,
        normalizeRankFilter,
        normalizeRole,
        createError: createHttpError,
      });
      const aggregatedCacheKey = buildBuildSuggestionCacheKey(
        normalizedRequest.rankFilter,
        {
          key: normalizedRequest.ally.champion.key,
          role: normalizedRequest.ally.role,
        },
        normalizedRequest.enemies,
      );
      const cachedPayload = getCachedData(buildSuggestionQueryCache, aggregatedCacheKey);
      if (cachedPayload) {
        return response.json(cachedPayload);
      }

      const matchupResults = await Promise.allSettled(
        normalizedRequest.enemies.map((enemyChampion) =>
          fetchNormalizedMatchupBuildData({
            allyChampion: normalizedRequest.ally.champion,
            enemyChampion,
            rankFilter: normalizedRequest.rankFilter,
            role: normalizedRequest.ally.role,
          }),
        ),
      );
      const { matchupBuilds, partialFailures } = collectSuccessfulMatchupBuilds(
        matchupResults,
        normalizedRequest.enemies,
      );

      if (matchupBuilds.length === 0) {
        return response.status(502).json({
          error:
            "No rune or boots data was returned from Lolalytics for the selected ally, role, and enemies.",
          summary: {
            enemyCount: normalizedRequest.enemies.length,
            sourceMatchups: 0,
            lastUpdatedAt: new Date().toISOString(),
            partialFailures,
          },
        });
      }

      const aggregatedResults = buildBuildSuggestionResults({
        matchupBuilds,
      });
      const payload = buildBuildSuggestionsPayload({
        normalizedRequest,
        aggregatedResults,
        sourceMatchups: matchupBuilds.length,
        partialFailures,
      });

      if (!hasUsableBuildSuggestions(payload)) {
        return response.status(502).json({
          error:
            "Lolalytics returned matchup data, but it did not include usable rune or boots suggestions.",
          request: payload.request,
          summary: payload.summary,
        });
      }

      setCachedData(buildSuggestionQueryCache, aggregatedCacheKey, payload);
      response.json(payload);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      response.status(statusCode).json({
        error: error.message || "Unexpected server error.",
      });
    }
  }),
);

server = app.listen(PORT, () => {
  console.log(
    `PickBan prototype running at http://localhost:${getListeningPort(server, PORT)}`,
  );
  console.log("Press Ctrl+C in this terminal or use the in-app top-right close button to stop it.");
});

server.on("connection", (socket) => {
  openSockets.add(socket);
  socket.on("close", () => {
    openSockets.delete(socket);
  });
});

process.on("SIGINT", () => {
  if (shuttingDown) {
    process.exit(1);
  }

  beginShutdown("Ctrl+C");
});

process.on("SIGTERM", () => {
  beginShutdown("SIGTERM");
});

async function buildSuggestionsForRole({
  allies,
  enemies,
  rankFilter,
  selectedChampionKeys,
  targetRole,
}) {
  const eligibleRoleTierStatsPromise = fetchEligibleTierStats(targetRole, rankFilter);
  const allyResultsPromise = Promise.allSettled(
    allies.map(async ({ champion, role }) => ({
      champion,
      role,
      rows: await fetchRoleSynergyRows(champion, role, targetRole, rankFilter),
    })),
  );
  const enemyResultsPromise = Promise.allSettled(
    enemies.map(async (champion) => ({
      champion,
      rows: await fetchRoleCounterRows(champion, targetRole, rankFilter),
    })),
  );
  const [
    eligibleRoleTierStats,
    allyResults,
    enemyResults,
  ] = await Promise.all([
    eligibleRoleTierStatsPromise,
    allyResultsPromise,
    enemyResultsPromise,
  ]);
  const {
    partialFailures,
    results,
  } = buildRoleSuggestionResults({
    allyResults,
    enemyResults,
    eligibleTierStats: eligibleRoleTierStats,
    selectedChampionKeys,
    targetRole,
    championByKey,
  });

  const meta = buildSuggestionMeta(rankFilter, targetRole, allies, enemies, partialFailures);

  if (results.length === 0) {
    const error = createHttpError(
      502,
      `No ${getRoleLabel(targetRole).toLowerCase()} data was returned from Lolalytics for the selected champions.`,
    );
    error.meta = meta;
    throw error;
  }

  return {
    results,
    meta,
  };
}

async function fetchRoleCounterRows(champion, targetRole, rankFilter) {
  const payload = await fetchLolalyticsBuildData(champion.id, rankFilter);
  return extractRoleValues(payload?.enemy?.[targetRole], 2);
}

async function fetchRoleSynergyRows(champion, allyRole, targetRole, rankFilter) {
  if (!allyRole) {
    return fetchRoleSynergyRowsForRole(champion, "all", targetRole, rankFilter);
  }

  try {
    const rows = await fetchRoleSynergyRowsForRole(champion, allyRole, targetRole, rankFilter);
    if (rows.size > 0) {
      return rows;
    }
  } catch (error) {
    return fetchRoleSynergyRowsForRole(champion, "all", targetRole, rankFilter);
  }

  return fetchRoleSynergyRowsForRole(champion, "all", targetRole, rankFilter);
}

async function fetchRoleSynergyRowsForRole(champion, allyRole, targetRole, rankFilter) {
  const searchParams = buildLolalyticsSearchParams(
    {
      ep: "build-team",
      v: "1",
      patch: PATCH_WINDOW,
      c: champion.id,
      lane: allyRole,
      queue: QUEUE,
      region: REGION,
    },
    rankFilter,
    { includeDefaultTier: true },
  );
  const payload = await fetchLolalyticsMegaJson(
    `?${searchParams.toString()}`,
    `${champion.name} ${allyRole} synergy`,
  );
  return extractRoleValues(payload?.team?.[targetRole], 3);
}

async function fetchEligibleTierStats(targetRole, rankFilter) {
  const roleLabel = getRoleLabel(targetRole).toLowerCase();
  const tierListUrl = buildTierListUrl(targetRole, rankFilter);
  const cachedEligibleRoleTierStats = getCachedData(eligibleTierStatsCache, tierListUrl);
  if (cachedEligibleRoleTierStats) {
    return cachedEligibleRoleTierStats;
  }

  const html = await fetchLolalyticsText(tierListUrl, `${roleLabel} tier list`);
  const rows = extractTierListRows(html);
  if (rows.length === 0) {
    throw createHttpError(502, `Lolalytics ${roleLabel} tier list was missing champion rows.`);
  }

  const eligibleRoleTierStats = buildEligibleTierStats(
    rows,
    championBySlug,
    championByName,
    {
      minLanePercent: MIN_ROLE_TIER_LIST_LANE_PERCENT,
      minPickRate: MIN_ROLE_TIER_LIST_PICK_RATE,
    },
  );

  if (eligibleRoleTierStats.size === 0) {
    throw createHttpError(502, `Lolalytics ${roleLabel} tier list returned no eligible picks.`);
  }

  setCachedData(eligibleTierStatsCache, tierListUrl, eligibleRoleTierStats);
  return eligibleRoleTierStats;
}

async function fetchLolalyticsBuildData(slug, rankFilter) {
  const searchParams = buildLolalyticsSearchParams(
    {
      patch: PATCH_WINDOW,
    },
    rankFilter,
    { includeDefaultTier: true },
  );
  const payload = await fetchLolalyticsJson(
    `${LOLALYTICS_BASE_URL}/lol/${slug}/build/q-data.json?${searchParams.toString()}`,
    `${slug} build q-data`,
  );
  const cachedBuildData = lolalyticsBuildDataCache.get(payload);
  if (cachedBuildData) {
    return cachedBuildData;
  }

  const root = resolveQwikPayload(payload);
  const buildData = findLoader(root.loaders, isChampionBuildLoader);

  if (!buildData) {
    throw createHttpError(502, `Lolalytics build data for ${slug} was missing matchup rows.`);
  }

  lolalyticsBuildDataCache.set(payload, buildData);
  return buildData;
}

async function fetchNormalizedMatchupBuildData({
  allyChampion,
  enemyChampion,
  rankFilter,
  role,
}) {
  const cacheKey = buildMatchupBuildCacheKey(
    allyChampion.key,
    role,
    enemyChampion.key,
    rankFilter,
  );
  const cached = getCachedData(normalizedMatchupBuildCache, cacheKey);
  if (cached) {
    return cached;
  }

  const payload = await fetchLolalyticsMatchupBuildPayload(
    allyChampion.id,
    enemyChampion.id,
    role,
    rankFilter,
  );
  const {
    buildLoader,
    metadataLoader,
  } = extractLolalyticsMatchupBuildLoaders(payload, allyChampion.name, enemyChampion.name);
  const parsedBuildData = parseLolalyticsMatchupBuildData(buildLoader, metadataLoader, {
    fetchedAt: new Date().toISOString(),
  });

  setCachedData(normalizedMatchupBuildCache, cacheKey, parsedBuildData);
  return parsedBuildData;
}

async function fetchLolalyticsMatchupBuildPayload(allySlug, enemySlug, role, rankFilter) {
  const searchParams = buildLolalyticsSearchParams(
    {
      lane: role,
      patch: PATCH_WINDOW,
    },
    rankFilter,
    { includeDefaultTier: true },
  );

  return fetchLolalyticsJson(
    `${LOLALYTICS_BASE_URL}/lol/${allySlug}/vs/${enemySlug}/build/q-data.json?${searchParams.toString()}`,
    `${allySlug} vs ${enemySlug} ${role} build q-data`,
  );
}

function extractLolalyticsMatchupBuildLoaders(payload, allyName, enemyName) {
  const root = resolveQwikPayload(payload);
  const buildLoader = findLoader(root.loaders, isMatchupBuildLoader);
  const metadataLoader = findLoader(root.loaders, isMatchupMetadataLoader);

  if (!buildLoader || !metadataLoader) {
    throw createHttpError(
      502,
      `Lolalytics matchup build data for ${allyName} vs ${enemyName} was missing rune or item metadata.`,
    );
  }

  return {
    buildLoader,
    metadataLoader,
  };
}

async function fetchLolalyticsMegaJson(query, label) {
  return fetchLolalyticsJson(`${LOLALYTICS_MEGA_URL}${query}`, label);
}

async function fetchLolalyticsJson(url, label) {
  return fetchLolalyticsResource(url, label, "json");
}

async function fetchLolalyticsText(url, label) {
  return fetchLolalyticsResource(url, label, "text");
}

function buildTierListUrl(targetRole, rankFilter) {
  const searchParams = buildLolalyticsSearchParams(
    {
      lane: targetRole,
      patch: PATCH_WINDOW,
      view: "grid",
    },
    rankFilter,
  );
  return `${LOLALYTICS_BASE_URL}/lol/tierlist/?${searchParams.toString()}`;
}

function buildLolalyticsSearchParams(params, rankFilter, options = {}) {
  const searchParams = new URLSearchParams(params);
  const tierQueryValue = options.includeDefaultTier
    ? getLolalyticsDataTierQueryValue(rankFilter)
    : getLolalyticsTierQueryValue(rankFilter);
  if (tierQueryValue) {
    searchParams.set("tier", tierQueryValue);
  }

  return searchParams;
}

async function fetchLolalyticsResource(url, label, responseType) {
  const cached = requestCache.get(url);
  if (cached) {
    if (cached.data != null && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    if (cached.promise) {
      return cached.promise;
    }

    requestCache.delete(url);
  }

  const requestPromise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      recordLolalyticsLiveAccess();
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "accept": "application/json,text/plain,*/*",
          "accept-language": "en-US,en;q=0.9",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "referer": "https://lolalytics.com/",
        },
      });

      if (!res.ok) {
        throw createHttpError(
          502,
          `Lolalytics request failed for ${label} with status ${res.status}.`,
        );
      }

      const data = responseType === "text" ? await res.text() : await res.json();
      requestCache.set(url, {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return data;
    } catch (error) {
      requestCache.delete(url);

      if (error.name === "AbortError") {
        throw createHttpError(504, `Timed out while fetching ${label} from Lolalytics.`);
      }

      if (error.statusCode) {
        throw error;
      }

      throw createHttpError(502, `Failed to fetch ${label} from Lolalytics.`);
    } finally {
      clearTimeout(timeout);
    }
  })();

  requestCache.set(url, {
    promise: requestPromise,
    expiresAt: Date.now() + REQUEST_TIMEOUT_MS,
  });

  return requestPromise;
}

function createLolalyticsRequestStats() {
  return {
    lolalyticsLiveAccessCount: 0,
  };
}

function recordLolalyticsLiveAccess() {
  const requestStats = lolalyticsRequestStatsStorage.getStore();
  if (!requestStats) {
    return;
  }

  requestStats.lolalyticsLiveAccessCount += 1;
}

function buildLolalyticsRequestStats() {
  const requestStats = lolalyticsRequestStatsStorage.getStore();
  return {
    lolalyticsLiveAccessCount: Number(requestStats?.lolalyticsLiveAccessCount || 0),
  };
}

function buildMatchupBuildCacheKey(allyChampionKey, role, enemyChampionKey, rankFilter) {
  return [
    `ally=${String(allyChampionKey || "")}`,
    `role=${String(role || "")}`,
    `enemy=${String(enemyChampionKey || "")}`,
    `rank=${String(rankFilter || "")}`,
    `patch=${PATCH_WINDOW}`,
  ].join("|");
}

function getCachedData(cache, key) {
  const cachedEntry = cache.get(key);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return cachedEntry.data;
}

function setCachedData(cache, key, data) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function normalizeBaseUrl(value, fallback, { requireTrailingSlash = false } = {}) {
  const configuredValue =
    typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
  const trimmedValue = configuredValue.replace(/\/+$/, "");

  if (requireTrailingSlash) {
    return `${trimmedValue}/`;
  }

  return trimmedValue;
}

function resolveQwikPayload(payload) {
  if (!payload || !Array.isArray(payload._objs)) {
    throw createHttpError(502, "Lolalytics returned an unexpected q-data payload.");
  }

  const cachedResolvedPayload = resolvedQwikPayloadCache.get(payload);
  if (cachedResolvedPayload) {
    return cachedResolvedPayload;
  }

  const resolvedPayload = resolveRawQwikPayload(payload);
  resolvedQwikPayloadCache.set(payload, resolvedPayload);
  return resolvedPayload;
}

function findLoader(loaders, predicate) {
  for (const value of Object.values(loaders || {})) {
    if (predicate(value)) {
      return value;
    }
  }

  return null;
}

function isChampionBuildLoader(value) {
  return Boolean(value && typeof value === "object" && value.enemy && value.header);
}

function isMatchupBuildLoader(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.header &&
      value.summary &&
      value.runes &&
      value.boots,
  );
}

function isMatchupMetadataLoader(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.champions &&
      value.items &&
      value.runes,
  );
}

function extractRoleValues(rows, valueIndex) {
  if (!Array.isArray(rows)) {
    return new Map();
  }

  const cachedRoleValues = getCachedExtractedRoleValues(rows, valueIndex);
  if (cachedRoleValues) {
    return cachedRoleValues;
  }

  const roleValues = new Map();

  for (const row of rows) {
    if (!Array.isArray(row) || row.length <= valueIndex) {
      continue;
    }

    const candidateKey = String(row[0]);
    const value = row[valueIndex];
    const winRate = row[1];

    if (!Number.isFinite(value)) {
      continue;
    }

    if (!championByKey.has(candidateKey)) {
      continue;
    }

    roleValues.set(candidateKey, {
      value,
      winRate: Number.isFinite(winRate) ? winRate : null,
    });
  }

  setCachedExtractedRoleValues(rows, valueIndex, roleValues);
  return roleValues;
}

function getCachedExtractedRoleValues(rows, valueIndex) {
  const cachedByValueIndex = extractedRoleValuesCache.get(rows);
  if (!cachedByValueIndex) {
    return null;
  }

  return cachedByValueIndex.get(valueIndex) || null;
}

function setCachedExtractedRoleValues(rows, valueIndex, roleValues) {
  let cachedByValueIndex = extractedRoleValuesCache.get(rows);
  if (!cachedByValueIndex) {
    cachedByValueIndex = new Map();
    extractedRoleValuesCache.set(rows, cachedByValueIndex);
  }

  cachedByValueIndex.set(valueIndex, roleValues);
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getListeningPort(serverInstance, fallbackPort) {
  const address = serverInstance?.address();
  if (address && typeof address === "object" && address.port != null) {
    return address.port;
  }

  return fallbackPort;
}

function isAuthorizedShutdownRequest(request) {
  const requestToken = request.get("x-shutdown-token");
  const remoteAddress = request.socket?.remoteAddress || "";

  return requestToken === shutdownToken && isLoopbackAddress(remoteAddress);
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function beginShutdown(reason) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Shutting down PickBan prototype (${reason})...`);
  requestCache.clear();

  forcedShutdownTimer = setTimeout(() => {
    for (const socket of openSockets) {
      socket.destroy();
    }
  }, SHUTDOWN_GRACE_PERIOD_MS);

  if (typeof forcedShutdownTimer.unref === "function") {
    forcedShutdownTimer.unref();
  }

  server.close((error) => {
    clearTimeout(forcedShutdownTimer);

    if (error) {
      console.error("Failed to stop the PickBan prototype cleanly.", error);
      process.exit(1);
    }

    console.log("PickBan prototype stopped.");
    process.exit(0);
  });
}
