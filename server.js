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
  normalizeDraftProjectionRequest,
  normalizeChampionName,
} = require("./lib/request-normalization.js");
const {
  buildDraftProjection,
  hasUsableDraftProjection,
} = require("./lib/draft-projection.js");
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
  buildDraftProjectionPayload,
  buildRoleSuggestionResponse,
  collectSuccessfulMatchupBuilds,
  hasUsableBuildSuggestions,
  normalizeSuggestRequest,
} = require("./lib/server-route-helpers.js");
const {
  buildTargetRoleRowResults,
  buildTargetRoleRowResultsWithFallback,
  getTargetRoleRowResult,
} = require("./lib/target-role-row-results.js");

const app = express();
const publicDir = path.join(__dirname, "public");
const champions = require(path.join(publicDir, "champions.json"));
const {
  ROLE_OPTIONS,
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
const { buildSuggestionCacheKey } = require(path.join(publicDir, "suggestion-cache.js"));
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
const tierListRowsCache = new Map();
const eligibleTierStatsCache = new Map();
const allyRoleLikelihoodsCache = new Map();
const normalizedMatchupBuildCache = new Map();
const buildSuggestionQueryCache = new Map();
const draftProjectionQueryCache = new Map();
const resolvedQwikPayloadCache = new WeakMap();
const extractedRoleValuesCache = new WeakMap();
const lolalyticsBuildDataCache = new WeakMap();
const lolalyticsRequestStatsStorage = new AsyncLocalStorage();
let lolalyticsLifetimeAccessCount = 0;
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
    requestStats: buildLolalyticsRequestStats(),
  });
});

app.get("/ally-role-likelihoods", async (request, response) =>
  lolalyticsRequestStatsStorage.run(createLolalyticsRequestStats(), async () => {
    try {
      const rankFilter = normalizeRankFilter(request.query?.rankFilter) || DEFAULT_RANK_FILTER;
      const championRoleLikelihoods = await fetchAllyRoleLikelihoods(rankFilter);

      response.set("Cache-Control", "no-store");
      response.json({
        rankFilter,
        championRoleLikelihoods,
        requestStats: buildLolalyticsRequestStats(),
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      response.status(statusCode).json({
        error: error.message || "Unexpected server error.",
        requestStats: buildLolalyticsRequestStats(),
      });
    }
  }),
);

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

      if (targetRoles.length === 0) {
        return response.status(400).json({
          error:
            "All five allied roles are already assigned. Remove one ally or clear a role to fetch suggestions.",
          requestStats: buildLolalyticsRequestStats(),
        });
      }

      const roleSuggestions = await buildSuggestionsForRoles({
        allies,
        enemies,
        rankFilter,
        selectedChampionKeys,
        targetRoles,
      });

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

app.post("/draft-outlook", async (request, response) =>
  lolalyticsRequestStatsStorage.run(createLolalyticsRequestStats(), async () => {
    try {
      const normalizedRequest = normalizeDraftProjectionRequest(request.body, {
        championByName,
        defaultRankFilter: DEFAULT_RANK_FILTER,
        normalizeRankFilter,
        normalizeRole,
        createError: createHttpError,
      });
      const cacheKey = buildSuggestionCacheKey(
        normalizedRequest.rankFilter,
        normalizedRequest.allies,
        normalizedRequest.enemies,
      );
      const cachedPayload = getCachedData(draftProjectionQueryCache, cacheKey);
      if (cachedPayload) {
        return response.json({
          ...cachedPayload,
          requestStats: buildLolalyticsRequestStats(),
        });
      }

      const [
        allySynergyResults,
        enemyCounterResults,
      ] = await Promise.all([
        buildDraftSynergyResults(normalizedRequest.allies, normalizedRequest.rankFilter),
        buildDraftCounterResults(
          normalizedRequest.allies,
          normalizedRequest.enemies,
          normalizedRequest.rankFilter,
        ),
      ]);
      const projection = buildDraftProjection({
        allySynergyResults,
        enemyCounterResults,
      });

      if (!hasUsableDraftProjection(projection)) {
        return response.status(502).json({
          error:
            "No projected draft win-rate data was returned from Lolalytics for the selected team compositions.",
          request: {
            allies: normalizedRequest.allies.map(({ champion, role }) => ({
              champion: champion.name,
              championKey: String(champion.key),
              role,
            })),
            enemies: normalizedRequest.enemies.map((champion) => champion.name),
            rankFilter: normalizedRequest.rankFilter,
          },
          summary: {
            allyCount: normalizedRequest.allies.length,
            enemyCount: normalizedRequest.enemies.length,
            synergyMatchupCount: projection.synergyMatchupCount,
            counterMatchupCount: projection.counterMatchupCount,
            sourceMatchups: projection.sourceMatchups,
            projectedWinRateMatchupCount: projection.projectedWinRateMatchupCount,
            partialFailures: projection.partialFailures,
          },
          requestStats: buildLolalyticsRequestStats(),
        });
      }

      const payload = buildDraftProjectionPayload({
        normalizedRequest,
        projection,
        requestStats: buildLolalyticsRequestStats(),
      });

      setCachedData(draftProjectionQueryCache, cacheKey, payload);
      response.json(payload);
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

      const isGenericBuildLookup = normalizedRequest.enemies.length === 0;
      let matchupBuilds = [];
      let partialFailures = [];

      if (isGenericBuildLookup) {
        matchupBuilds = [
          await fetchNormalizedChampionBuildData({
            allyChampion: normalizedRequest.ally.champion,
            rankFilter: normalizedRequest.rankFilter,
            role: normalizedRequest.ally.role,
          }),
        ];
      } else {
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
        ({ matchupBuilds, partialFailures } = collectSuccessfulMatchupBuilds(
          matchupResults,
          normalizedRequest.enemies,
        ));
      }

      if (matchupBuilds.length === 0) {
        return response.status(502).json({
          error: isGenericBuildLookup
            ? "No build recommendation data was returned from Lolalytics for the selected ally and role."
            : "No build recommendation data was returned from Lolalytics for the selected ally, role, and enemies.",
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
            "Lolalytics returned matchup data, but it did not include usable build recommendations.",
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

/**
 * Fetch every upstream input required for the requested target roles, then
 * return one fulfilled or rejected suggestion outcome per role.
 *
 * Shared upstream fetches are resolved once and then re-used across roles so
 * `/suggest` can stay efficient when the UI asks for multiple open roles.
 */
async function buildSuggestionsForRoles({
  allies,
  enemies,
  rankFilter,
  selectedChampionKeys,
  targetRoles,
}) {
  const eligibleTierStatsResultsPromise = Promise.allSettled(
    targetRoles.map((targetRole) => fetchEligibleTierStats(targetRole, rankFilter)),
  );
  const allyTargetRoleRowResultsPromise = Promise.all(
    allies.map(({ champion, role }) =>
      fetchRoleSynergyRowResults(champion, role, targetRoles, rankFilter),
    ),
  );
  const enemyTargetRoleRowResultsPromise = Promise.all(
    enemies.map((champion) => fetchRoleCounterRowResults(champion, targetRoles, rankFilter)),
  );
  const [
    eligibleTierStatsResults,
    allyTargetRoleRowResults,
    enemyTargetRoleRowResults,
  ] = await Promise.all([
    eligibleTierStatsResultsPromise,
    allyTargetRoleRowResultsPromise,
    enemyTargetRoleRowResultsPromise,
  ]);

  return targetRoles.map((targetRole, index) =>
    buildSuggestionOutcome({
      allies,
      enemies,
      rankFilter,
      selectedChampionKeys,
      targetRole,
      eligibleTierStatsResult: eligibleTierStatsResults[index],
      allyTargetRoleRowResults,
      enemyTargetRoleRowResults,
    }),
  );
}

function buildSuggestionOutcome({
  allies,
  enemies,
  rankFilter,
  selectedChampionKeys,
  targetRole,
  eligibleTierStatsResult,
  allyTargetRoleRowResults,
  enemyTargetRoleRowResults,
}) {
  if (eligibleTierStatsResult.status !== "fulfilled") {
    return {
      status: "rejected",
      reason: eligibleTierStatsResult.reason,
    };
  }

  const allyResults = allyTargetRoleRowResults.map((targetRoleRowResults) =>
    createRowPromiseResult(getTargetRoleRowResult(targetRoleRowResults, targetRole)),
  );
  const enemyResults = enemyTargetRoleRowResults.map((targetRoleRowResults) =>
    createRowPromiseResult(getTargetRoleRowResult(targetRoleRowResults, targetRole)),
  );
  const {
    partialFailures,
    results,
  } = buildRoleSuggestionResults({
    allyResults,
    enemyResults,
    eligibleTierStats: eligibleTierStatsResult.value,
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

    return {
      status: "rejected",
      reason: error,
    };
  }

  return {
    status: "fulfilled",
    value: {
      results,
      meta,
    },
  };
}

async function buildDraftSynergyResults(allies, rankFilter) {
  const teammatesByAlly = allies.map((ally) =>
    allies.filter((teammate) => teammate.champion.key !== ally.champion.key),
  );
  const allyTargetRoleRowResults = await Promise.all(
    allies.map((ally, index) =>
      fetchRoleSynergyRowResults(
        ally.champion,
        ally.role,
        teammatesByAlly[index].map((teammate) => teammate.role),
        rankFilter,
      ),
    ),
  );

  return allies.flatMap((ally, allyIndex) =>
    teammatesByAlly[allyIndex].map((teammate) =>
      buildDraftSynergyResult(
        ally,
        teammate,
        getTargetRoleRowResult(allyTargetRoleRowResults[allyIndex], teammate.role),
      ),
    ),
  );
}

async function buildDraftCounterResults(allies, enemies, rankFilter) {
  const enemyTargetRoleRowResults = await Promise.all(
    enemies.map((enemyChampion) =>
      fetchRoleCounterRowResults(
        enemyChampion,
        allies.map((ally) => ally.role),
        rankFilter,
      ),
    ),
  );

  return allies.flatMap((ally) =>
    enemies.map((enemyChampion, enemyIndex) =>
      buildDraftCounterResult(
        ally,
        enemyChampion,
        getTargetRoleRowResult(enemyTargetRoleRowResults[enemyIndex], ally.role),
      ),
    ),
  );
}

function buildDraftSynergyResult(ally, teammate, targetRoleRowResult) {
  if (targetRoleRowResult.status !== "fulfilled") {
    return {
      status: "rejected",
      reason: targetRoleRowResult.reason,
    };
  }

  const row = targetRoleRowResult.value.get(String(teammate.champion.key));
  if (!row) {
    return {
      status: "rejected",
      reason: createHttpError(
        502,
        `Lolalytics returned no ${getRoleLabel(teammate.role).toLowerCase()} synergy row for ${ally.champion.name} ${getRoleLabel(ally.role)} with ${teammate.champion.name}.`,
      ),
    };
  }

  return {
    status: "fulfilled",
    value: {
      row,
    },
  };
}

function buildDraftCounterResult(ally, enemyChampion, targetRoleRowResult) {
  if (targetRoleRowResult.status !== "fulfilled") {
    return {
      status: "rejected",
      reason: targetRoleRowResult.reason,
    };
  }

  const row = targetRoleRowResult.value.get(String(ally.champion.key));
  if (!row) {
    return {
      status: "rejected",
      reason: createHttpError(
        502,
        `Lolalytics returned no ${getRoleLabel(ally.role).toLowerCase()} counter row for ${ally.champion.name} into ${enemyChampion.name}.`,
      ),
    };
  }

  return {
    status: "fulfilled",
    value: {
      row,
    },
  };
}

function createRowPromiseResult(targetRoleRowResult) {
  if (targetRoleRowResult.status !== "fulfilled") {
    return {
      status: "rejected",
      reason: targetRoleRowResult.reason,
    };
  }

  return {
    status: "fulfilled",
    value: {
      rows: targetRoleRowResult.value,
    },
  };
}

async function fetchRoleCounterRowResults(champion, targetRoles, rankFilter) {
  return buildTargetRoleRowResults(targetRoles, (requestedTargetRoles) =>
    fetchRoleCounterRowsByTargetRole(champion, requestedTargetRoles, rankFilter),
  );
}

/**
 * Prefer role-specific ally synergy rows when an ally role is known, but fall
 * back to Lolalytics `lane=all` rows for any target roles that are missing or
 * failed under the role-specific query.
 */
async function fetchRoleSynergyRowResults(champion, allyRole, targetRoles, rankFilter) {
  if (!allyRole) {
    return buildTargetRoleRowResults(targetRoles, (requestedTargetRoles) =>
      fetchRoleSynergyRowsByTargetRoleForLane(champion, "all", requestedTargetRoles, rankFilter),
    );
  }

  return buildTargetRoleRowResultsWithFallback(targetRoles, {
    fetchPrimaryRowsByTargetRoles: (requestedTargetRoles) =>
      fetchRoleSynergyRowsByTargetRoleForLane(
        champion,
        allyRole,
        requestedTargetRoles,
        rankFilter,
      ),
    fetchFallbackRowsByTargetRoles: (requestedTargetRoles) =>
      fetchRoleSynergyRowsByTargetRoleForLane(champion, "all", requestedTargetRoles, rankFilter),
  });
}

async function fetchRoleCounterRowsByTargetRole(champion, targetRoles, rankFilter) {
  const payload = await fetchLolalyticsBuildData(champion.id, rankFilter);
  return extractRequestedRoleValues(payload?.enemy, targetRoles, 2);
}

async function fetchRoleSynergyRowsByTargetRoleForLane(
  champion,
  allyRole,
  targetRoles,
  rankFilter,
) {
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
  return extractRequestedRoleValues(payload?.team, targetRoles, 3);
}

function extractRequestedRoleValues(rowsByTargetRole, targetRoles, valueIndex) {
  const extractedRowsByTargetRole = new Map();

  for (const targetRole of targetRoles) {
    extractedRowsByTargetRole.set(
      targetRole,
      extractRoleValues(rowsByTargetRole?.[targetRole], valueIndex),
    );
  }

  return extractedRowsByTargetRole;
}

async function fetchEligibleTierStats(targetRole, rankFilter) {
  const roleLabel = getRoleLabel(targetRole).toLowerCase();
  const tierListUrl = buildTierListUrl(targetRole, rankFilter);
  const cachedEligibleRoleTierStats = getCachedData(eligibleTierStatsCache, tierListUrl);
  if (cachedEligibleRoleTierStats) {
    return cachedEligibleRoleTierStats;
  }

  const rows = await fetchTierListRows(targetRole, rankFilter);
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

async function fetchTierListRows(targetRole, rankFilter) {
  const roleLabel = getRoleLabel(targetRole).toLowerCase();
  const tierListUrl = buildTierListUrl(targetRole, rankFilter);
  const cachedRows = getCachedData(tierListRowsCache, tierListUrl);
  if (cachedRows) {
    return cachedRows;
  }

  const html = await fetchLolalyticsText(tierListUrl, `${roleLabel} tier list`);
  const rows = extractTierListRows(html);
  if (rows.length === 0) {
    throw createHttpError(502, `Lolalytics ${roleLabel} tier list was missing champion rows.`);
  }

  setCachedData(tierListRowsCache, tierListUrl, rows);
  return rows;
}

async function fetchAllyRoleLikelihoods(rankFilter) {
  const normalizedRankFilter = normalizeRankFilter(rankFilter) || DEFAULT_RANK_FILTER;
  const cachedLikelihoods = getCachedData(allyRoleLikelihoodsCache, normalizedRankFilter);
  if (cachedLikelihoods) {
    return cachedLikelihoods;
  }

  const rowsByRole = await Promise.all(
    ROLE_OPTIONS.map(async (option) => ({
      role: option.value,
      rows: await fetchTierListRows(option.value, normalizedRankFilter),
    })),
  );
  const championRoleLikelihoods = {};

  for (const entry of rowsByRole) {
    for (const row of entry.rows) {
      const champion =
        championBySlug.get(row.slug) ||
        championByName.get(normalizeChampionName(row.name));
      if (!champion) {
        continue;
      }

      const championKey = String(champion.key);
      championRoleLikelihoods[championKey] ||= {};
      championRoleLikelihoods[championKey][entry.role] = {
        lanePercent: row.lanePercent,
        pickRate: row.pickRate,
        winRate: row.winRate,
      };
    }
  }

  setCachedData(allyRoleLikelihoodsCache, normalizedRankFilter, championRoleLikelihoods);
  return championRoleLikelihoods;
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

async function fetchNormalizedChampionBuildData({
  allyChampion,
  rankFilter,
  role,
}) {
  const payload = await fetchLolalyticsChampionBuildPayload(
    allyChampion.id,
    role,
    rankFilter,
  );
  const {
    buildLoader,
    metadataLoader,
  } = extractLolalyticsChampionBuildLoaders(payload, allyChampion.name);

  return parseLolalyticsMatchupBuildData(buildLoader, metadataLoader, {
    fetchedAt: new Date().toISOString(),
  });
}

async function fetchLolalyticsChampionBuildPayload(allySlug, role, rankFilter) {
  const searchParams = buildLolalyticsSearchParams(
    {
      lane: role,
      patch: PATCH_WINDOW,
    },
    rankFilter,
    { includeDefaultTier: true },
  );

  return fetchLolalyticsJson(
    `${LOLALYTICS_BASE_URL}/lol/${allySlug}/build/q-data.json?${searchParams.toString()}`,
    `${allySlug} ${role || "all"} build q-data`,
  );
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

function extractLolalyticsChampionBuildLoaders(payload, allyName) {
  const root = resolveQwikPayload(payload);
  const buildLoader = findLoader(root.loaders, isMatchupBuildLoader);
  const metadataLoader = findLoader(root.loaders, isMatchupMetadataLoader);

  if (!buildLoader || !metadataLoader) {
    throw createHttpError(
      502,
      `Lolalytics build data for ${allyName} was missing rune or item metadata.`,
    );
  }

  return {
    buildLoader,
    metadataLoader,
  };
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

/**
 * Shared live-resource fetcher with TTL caching and in-flight request
 * coalescing. If multiple handlers ask for the same Lolalytics URL at once,
 * they all await the same pending promise instead of duplicating the fetch.
 */
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
  lolalyticsLifetimeAccessCount += 1;
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
    lolalyticsLifetimeAccessCount: Number(lolalyticsLifetimeAccessCount || 0),
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
