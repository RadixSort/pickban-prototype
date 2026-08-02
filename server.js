const { AsyncLocalStorage } = require("async_hooks");
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { version: appVersion } = require("./package.json");
const LOCAL_APP_HOST = "127.0.0.1";
const { createTtlCache } = require("./lib/ttl-cache.js");
const {
  buildEligibleTierStats,
  extractTierRowsFromMegaPayload,
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
  buildBanSuggestion,
  buildBanSuggestionCacheKey,
  normalizeBanSuggestionRequest,
} = require("./lib/ban-suggestion-results.js");
const {
  buildFirstPickMeta,
  buildFirstPickTierListResults,
} = require("./lib/first-pick-results.js");
const {
  parseLolalyticsRenderedBuildPage,
  parseLolalyticsRuneBuildData,
} = require("./lib/lolalytics-build-parser.js");
const {
  fetchLiveDraftImport,
  importRunePageIntoLeagueClient,
} = require("./lib/riot-live-draft.js");
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
  normalizeTargetRoles,
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
  BUILD_SUGGESTION_STARTING_RANK_FILTER,
  DEFAULT_RANK_FILTER,
  getLolalyticsDataTierQueryValue,
  getRankFilterFallbacks,
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
const LOLALYTICS_DATA_WINDOW_DAYS = 30;
const PATCH_WINDOW = String(LOLALYTICS_DATA_WINDOW_DAYS);
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
const CACHE_TTL_MS = 8 * 60 * 60 * 1000;
const SHUTDOWN_GRACE_PERIOD_MS = 1000;

const createServerCache = (maxEntries) =>
  createTtlCache({ maxEntries, ttlMs: CACHE_TTL_MS });
const requestCache = createServerCache(256);
const tierListRowsCache = createServerCache(64);
const eligibleTierStatsCache = createServerCache(64);
const allyRoleLikelihoodsCache = createServerCache(16);
const normalizedMatchupBuildCache = createServerCache(128);
const buildSuggestionQueryCache = createServerCache(64);
const draftProjectionQueryCache = createServerCache(64);
const banSuggestionQueryCache = createServerCache(64);
const extractedRoleValuesCache = new WeakMap();
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
    lolalyticsDataWindowDays: LOLALYTICS_DATA_WINDOW_DAYS,
    canShutdown: true,
    shutdownToken,
    requestStats: buildLolalyticsRequestStats(),
  });
});

app.get("/ally-role-likelihoods", withLolalyticsRequestStats(async (request, response) => {
  const rankFilter = normalizeRankFilter(request.query?.rankFilter) || DEFAULT_RANK_FILTER;
  const championRoleLikelihoods = await fetchAllyRoleLikelihoods(rankFilter);

  response.set("Cache-Control", "no-store");
  response.json({
    rankFilter,
    championRoleLikelihoods,
    requestStats: buildLolalyticsRequestStats(),
  });
}));

app.get("/live-draft", async (request, response) => {
  const payload = await fetchLiveDraftImport({
    championByKey,
    championByName,
    championBySlug,
    normalizeRole,
    statusOnly: request.query?.statusOnly === "1",
  });

  response.set("Cache-Control", "no-store");
  response.json(payload);
});

app.post("/rune-import", async (request, response) => {
  try {
    const champion = getKnownChampionFromImportRequest(request.body);
    const payload = await importRunePageIntoLeagueClient({
      championName: champion.name,
      runePage: request.body?.page ?? request.body?.runePage,
    });

    response
      .status(payload?.status === "imported" ? 200 : 409)
      .json(payload);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    response.status(statusCode).json({
      status: "error",
      active: false,
      imported: false,
      reason: error.reason || "rune_import_failed",
      error: error.message || "Unexpected server error.",
      message: error.message || "Unexpected server error.",
    });
  }
});

app.post("/ban-suggestions", withLolalyticsRequestStats(async (request, response) => {
  const normalizedRequest = normalizeBanSuggestionRequest(request.body, {
    championByKey,
    championByName,
    defaultRankFilter: DEFAULT_RANK_FILTER,
    normalizeChampionName,
    normalizeRankFilter,
    normalizeRole,
    roleOptions: ROLE_OPTIONS,
    createError: createHttpError,
  });
  const cacheKey = buildBanSuggestionCacheKey({
    hoversByRole: normalizedRequest.hoversByRole,
    patch: PATCH_WINDOW,
    rankFilter: normalizedRequest.rankFilter,
    roleOptions: ROLE_OPTIONS,
    unavailableChampionKeys: normalizedRequest.unavailableChampionKeys,
  });
  const cachedPayload = banSuggestionQueryCache.get(cacheKey);
  if (cachedPayload) {
    return response.json({
      ...cachedPayload,
      requestStats: buildLolalyticsRequestStats(),
    });
  }

  const selectedChampionKeys = new Set(
    Array.from(normalizedRequest.hoversByRole.values()).map((champion) => String(champion.key)),
  );
  for (const championKey of normalizedRequest.unavailableChampionKeys) {
    selectedChampionKeys.add(championKey);
  }
  const roleOutcomes = await Promise.all(
    ROLE_OPTIONS.map(({ value: role }) =>
      buildBanSuggestionForRole({
        hoverChampion: normalizedRequest.hoversByRole.get(role) || null,
        rankFilter: normalizedRequest.rankFilter,
        role,
        selectedChampionKeys,
      }),
    ),
  );
  const suggestions = roleOutcomes.map((outcome) => outcome.suggestion).filter(Boolean);
  const partialFailures = roleOutcomes.flatMap((outcome) => outcome.partialFailures);

  if (suggestions.length !== ROLE_OPTIONS.length) {
    throw createHttpError(
      502,
      "Lolalytics did not return a usable ban recommendation for every lane.",
    );
  }

  const payload = {
    mode: "ban",
    rankFilter: normalizedRequest.rankFilter,
    roles: ROLE_OPTIONS.map((option) => option.value),
    suggestions,
    summary: {
      hoverCount: normalizedRequest.hoversByRole.size,
      unavailableChampionCount: selectedChampionKeys.size,
      counterSuggestionCount: suggestions.filter((suggestion) => suggestion.strategy === "counter")
        .length,
      fallbackSuggestionCount: suggestions.filter((suggestion) => suggestion.strategy === "pbi")
        .length,
      partialFailures,
    },
  };

  banSuggestionQueryCache.set(cacheKey, payload);
  response.json({
    ...payload,
    requestStats: buildLolalyticsRequestStats(),
  });
}));

function getKnownChampionFromImportRequest(body = {}) {
  const championName = body?.champion ?? body?.championName;
  const champion = championByName.get(normalizeChampionName(championName));
  if (!champion) {
    throw createHttpError(400, "Choose a known allied champion before importing runes.");
  }

  return champion;
}

function withLolalyticsRequestStats(handler) {
  return async (request, response) =>
    lolalyticsRequestStatsStorage.run(createLolalyticsRequestStats(), async () => {
      try {
        await handler(request, response);
      } catch (error) {
        sendJsonError(response, error, {
          requestStats: buildLolalyticsRequestStats(),
        });
      }
    });
}

function sendJsonError(response, error, extraPayload = {}) {
  response.status(error.statusCode || 500).json({
    error: error.message || "Unexpected server error.",
    ...extraPayload,
  });
}

app.post("/suggest", withLolalyticsRequestStats(async (request, response) => {
  const {
    rankFilter,
    laneOpponentWeight,
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

  if (targetRoles.length === 0) {
    return response.status(400).json({
      error:
        "All five allied roles are already assigned. Remove one ally or clear a role to fetch suggestions.",
      requestStats: buildLolalyticsRequestStats(),
    });
  }

  const isFirstPickRequest = allies.length === 0 && enemies.length === 0;
  const roleSuggestions = isFirstPickRequest
    ? await buildFirstPickSuggestionsForRoles({
        rankFilter,
        selectedChampionKeys,
        targetRoles,
      })
    : await buildSuggestionsForRoles({
        allies,
        enemies,
        laneOpponentWeight,
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
    responseMode: isFirstPickRequest ? "firstPick" : "suggestions",
  });

  response.status(statusCode).json(payload);
}));

app.post("/draft-outlook", withLolalyticsRequestStats(async (request, response) => {
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
  const cachedPayload = draftProjectionQueryCache.get(cacheKey);
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
        enemies: normalizedRequest.enemies.map((champion) =>
          champion.role
            ? {
                champion: champion.name,
                championKey: String(champion.key),
                role: champion.role,
              }
            : champion.name,
        ),
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

  draftProjectionQueryCache.set(cacheKey, payload);
  response.json(payload);
}));

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

app.post("/build-suggestions", withLolalyticsRequestStats(async (request, response) => {
  const normalizedRequest = normalizeBuildSuggestionRequest(request.body, {
    championByName,
    defaultRankFilter: DEFAULT_RANK_FILTER,
    normalizeRankFilter,
    normalizeRole,
    createError: createHttpError,
  });
  const buildRequest = normalizedRequest.requireCompleteMatchups === true
    ? {
        ...normalizedRequest,
        rankFilter: BUILD_SUGGESTION_STARTING_RANK_FILTER,
      }
    : normalizedRequest;
  const aggregatedCacheKey = buildBuildSuggestionCacheKey(
    buildRequest.rankFilter,
    {
      key: buildRequest.ally.champion.key,
      role: buildRequest.ally.role,
    },
    buildRequest.enemies,
    {
      requireCompleteMatchups: buildRequest.requireCompleteMatchups === true,
    },
  );
  const cachedPayload = buildSuggestionQueryCache.get(aggregatedCacheKey);
  if (cachedPayload) {
    return response.json({
      ...cachedPayload,
      requestStats: buildLolalyticsRequestStats(),
    });
  }

  const matchupAttempt = await fetchBuildSuggestionMatchups(buildRequest);
  const {
    matchupBuilds,
    partialFailures,
    rankFilter: effectiveRankFilter,
    rankFiltersTried,
  } = matchupAttempt;
  const rankFilterFallback = buildRequest.requireCompleteMatchups === true
    ? {
        requestedRankFilter: buildRequest.rankFilter,
        effectiveRankFilter,
        rankFiltersTried,
      }
    : null;

  if (matchupBuilds.length === 0) {
    return response.status(502).json({
      error:
        "No build recommendation data was returned from Lolalytics for the selected ally, role, and enemies.",
      summary: {
        enemyCount: buildRequest.enemies.length,
        sourceMatchups: 0,
        lastUpdatedAt: new Date().toISOString(),
        partialFailures,
        ...(rankFilterFallback ? { rankFilterFallback } : {}),
      },
      requestStats: buildLolalyticsRequestStats(),
    });
  }

  const effectiveRequest = {
    ...buildRequest,
    rankFilter: effectiveRankFilter,
  };
  const matchupBuildsWithLaneLikelihoods = attachCachedLaneOpponentLikelihoods(
    matchupBuilds,
    effectiveRequest,
  );
  const aggregatedResults = buildBuildSuggestionResults({
    matchupBuilds: matchupBuildsWithLaneLikelihoods,
  });
  const payload = buildBuildSuggestionsPayload({
    normalizedRequest: effectiveRequest,
    aggregatedResults,
    sourceMatchups: matchupBuilds.length,
    partialFailures,
    rankFilterFallback,
  });

  if (!hasUsableBuildSuggestions(payload)) {
    return response.status(502).json({
      error:
        "Lolalytics returned build data, but it did not include usable build recommendations.",
      request: payload.request,
      summary: payload.summary,
      requestStats: buildLolalyticsRequestStats(),
    });
  }

  buildSuggestionQueryCache.set(aggregatedCacheKey, payload);
  response.json({
    ...payload,
    requestStats: buildLolalyticsRequestStats(),
  });
}));

async function fetchBuildSuggestionMatchups(normalizedRequest) {
  const rankFilters = normalizedRequest.requireCompleteMatchups === true
    ? getRankFilterFallbacks(normalizedRequest.rankFilter)
    : [normalizedRequest.rankFilter];
  const rankFiltersTried = [];
  let bestAttempt = null;

  for (const rankFilter of rankFilters) {
    const matchupResults = await Promise.allSettled(
      normalizedRequest.enemies.map((enemyChampion) =>
        fetchNormalizedMatchupBuildData({
          allyChampion: normalizedRequest.ally.champion,
          enemyChampion,
          rankFilter,
          role: normalizedRequest.ally.role,
        }),
      ),
    );
    const attempt = {
      ...collectSuccessfulMatchupBuilds(matchupResults, normalizedRequest.enemies),
      rankFilter,
    };
    rankFiltersTried.push(rankFilter);

    if (isBetterBuildMatchupAttempt(attempt, bestAttempt)) {
      bestAttempt = attempt;
    }

    if (
      attempt.matchupBuilds.length === normalizedRequest.enemies.length &&
      hasUsableBuildMatchupAttempt(attempt, normalizedRequest)
    ) {
      bestAttempt = attempt;
      break;
    }
  }

  return {
    ...(bestAttempt || {
      matchupBuilds: [],
      partialFailures: [],
      rankFilter: normalizedRequest.rankFilter,
    }),
    rankFiltersTried,
  };
}

function hasUsableBuildMatchupAttempt(attempt, normalizedRequest) {
  if (!attempt || attempt.matchupBuilds.length === 0) {
    return false;
  }

  const aggregatedResults = buildBuildSuggestionResults({
    matchupBuilds: attempt.matchupBuilds,
  });
  const payload = buildBuildSuggestionsPayload({
    normalizedRequest: {
      ...normalizedRequest,
      rankFilter: attempt.rankFilter,
    },
    aggregatedResults,
    sourceMatchups: attempt.matchupBuilds.length,
    partialFailures: attempt.partialFailures,
  });

  return hasUsableBuildSuggestions(payload);
}

function isBetterBuildMatchupAttempt(candidate, current) {
  if (!current) {
    return true;
  }

  const candidateMatchupCount = candidate?.matchupBuilds?.length || 0;
  const currentMatchupCount = current?.matchupBuilds?.length || 0;
  return candidateMatchupCount >= currentMatchupCount;
}

function attachCachedLaneOpponentLikelihoods(matchupBuilds, normalizedRequest) {
  const role = normalizeRole(normalizedRequest?.ally?.role);
  const rankFilter = normalizedRequest?.rankFilter;

  return matchupBuilds.map((matchup) => {
    const championKey = String(matchup?.enemyChampionKey || "");
    const requestedEnemyRole = normalizeRole(
      normalizedRequest?.enemies?.find(
        (enemyChampion) => String(enemyChampion?.key || "") === championKey,
      )?.role,
    );
    const laneOpponentLikelihood = getCachedLaneOpponentLikelihood(
      championKey,
      role,
      rankFilter,
    );
    const normalizedMatchup = requestedEnemyRole
      ? {
          ...matchup,
          enemyRole: requestedEnemyRole,
        }
      : matchup;

    return laneOpponentLikelihood != null
      ? {
          ...normalizedMatchup,
          laneOpponentLikelihood,
        }
      : normalizedMatchup;
  });
}

function getCachedLaneOpponentLikelihood(championKey, role, rankFilter) {
  const normalizedRole = normalizeRole(role);
  const normalizedChampionKey = String(championKey || "");
  if (!normalizedRole || !normalizedChampionKey || !rankFilter) {
    return null;
  }

  const cachedRoleLikelihoods = allyRoleLikelihoodsCache.get(rankFilter) || {};
  const cachedTierRows =
    tierListRowsCache.get(buildTierListDataUrl(normalizedRole, rankFilter)) || [];
  const laneOpponentLikelihood =
    cachedRoleLikelihoods?.[normalizedChampionKey]?.[normalizedRole]?.lanePercent ??
    cachedTierRows.find(
      (row) => String(row?.championKey || "") === normalizedChampionKey,
    )?.lanePercent;
  const numericLikelihood = Number(laneOpponentLikelihood);

  return Number.isFinite(numericLikelihood) ? numericLikelihood : null;
}

server = app.listen(PORT, LOCAL_APP_HOST, () => {
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
 * Fetch tier data for each requested target role, then fetch matchup inputs
 * only for roles whose tier data can produce recommendations.
 *
 * Shared upstream fetches are resolved once and then re-used across roles so
 * `/suggest` can stay efficient when the UI asks for multiple open roles.
 */
async function buildSuggestionsForRoles({
  allies,
  enemies,
  laneOpponentWeight,
  rankFilter,
  selectedChampionKeys,
  targetRoles,
}) {
  const eligibleTierStatsResults = await Promise.allSettled(
    targetRoles.map((targetRole) => fetchEligibleTierStats(targetRole, rankFilter)),
  );
  const fetchableTargetRoles = targetRoles.filter(
    (_targetRole, index) => eligibleTierStatsResults[index]?.status === "fulfilled",
  );
  let allyTargetRoleRowResults = [];
  let enemyTargetRoleRowResults = [];

  if (fetchableTargetRoles.length > 0) {
    [
      allyTargetRoleRowResults,
      enemyTargetRoleRowResults,
    ] = await Promise.all([
      Promise.all(
        allies.map(({ champion, role }) =>
          fetchRoleSynergyRowResults(champion, role, fetchableTargetRoles, rankFilter),
        ),
      ),
      Promise.all(
        enemies.map((champion) =>
          fetchTargetRoleCounterRowResults(champion, fetchableTargetRoles, rankFilter),
        ),
      ),
    ]);
  }

  return targetRoles.map((targetRole, index) =>
    buildSuggestionOutcome({
      allies,
      enemies,
      laneOpponentWeight,
      rankFilter,
      selectedChampionKeys,
      targetRole,
      eligibleTierStatsResult: eligibleTierStatsResults[index],
      allyTargetRoleRowResults,
      enemyTargetRoleRowResults,
    }),
  );
}

async function buildFirstPickSuggestionsForRoles({
  rankFilter,
  selectedChampionKeys,
  targetRoles,
}) {
  const eligibleTierStatsResults = await Promise.allSettled(
    targetRoles.map((targetRole) => fetchEligibleTierStats(targetRole, rankFilter)),
  );

  return targetRoles.map((targetRole, index) =>
    buildFirstPickSuggestionOutcome({
      rankFilter,
      selectedChampionKeys,
      targetRole,
      eligibleTierStatsResult: eligibleTierStatsResults[index],
    }),
  );
}

async function buildBanSuggestionForRole({
  hoverChampion,
  rankFilter,
  role,
  selectedChampionKeys,
}) {
  const eligibleTierStats = await fetchEligibleTierStats(role, rankFilter);
  const fallbackOutcome = buildFirstPickTierListResults({
    eligibleTierStats,
    selectedChampionKeys,
    targetRole: role,
    championByKey,
  });
  const partialFailures = [];
  let counterResults = [];

  if (hoverChampion) {
    try {
      const counterRows = await fetchRoleCounterRowsForTargetRole(
        hoverChampion,
        role,
        rankFilter,
      );
      const counterOutcome = buildRoleSuggestionResults({
        allyResults: [],
        enemyResults: [
          {
            status: "fulfilled",
            value: {
              rows: counterRows,
            },
          },
        ],
        eligibleTierStats,
        selectedChampionKeys,
        targetRole: role,
        championByKey,
      });
      counterResults = counterOutcome.results;
      partialFailures.push(...counterOutcome.partialFailures);

      if (counterResults.length === 0) {
        partialFailures.push(
          `No ${getRoleLabel(role).toLowerCase()} counter rows were available for ${hoverChampion.name}; used the PBI fallback.`,
        );
      }
    } catch (error) {
      partialFailures.push(
        `${hoverChampion.name} ${getRoleLabel(role)} counter data was unavailable; used the PBI fallback. ${error.message || ""}`.trim(),
      );
    }
  }

  return {
    suggestion: buildBanSuggestion({
      counterResults,
      fallbackResults: fallbackOutcome.results,
      hoverChampion,
      role,
    }),
    partialFailures,
  };
}

function buildFirstPickSuggestionOutcome({
  rankFilter,
  selectedChampionKeys,
  targetRole,
  eligibleTierStatsResult,
}) {
  if (eligibleTierStatsResult.status !== "fulfilled") {
    return {
      status: "rejected",
      reason: eligibleTierStatsResult.reason,
    };
  }

  const {
    partialFailures,
    results,
  } = buildFirstPickTierListResults({
    eligibleTierStats: eligibleTierStatsResult.value,
    selectedChampionKeys,
    targetRole,
    championByKey,
  });
  const meta = buildFirstPickMeta(rankFilter, targetRole, partialFailures);

  if (results.length === 0) {
    const error = createHttpError(
      502,
      `No ${getRoleLabel(targetRole).toLowerCase()} tier-list data was returned from Lolalytics for first pick.`,
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

function buildSuggestionOutcome({
  allies,
  enemies,
  laneOpponentWeight,
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
  const enemyResults = enemyTargetRoleRowResults.map((targetRoleRowResults, index) => {
    const enemyChampion = enemies[index];
    return createRowPromiseResult(
      getTargetRoleRowResult(targetRoleRowResults, targetRole),
      {
        opponentChampionKey: String(enemyChampion?.key || ""),
        opponentRole: normalizeRole(enemyChampion?.role),
        laneOpponentLikelihood: getCachedLaneOpponentLikelihood(
          enemyChampion?.key,
          targetRole,
          rankFilter,
        ),
      },
    );
  });
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
    laneOpponentWeight,
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
      fetchAllRoleCounterRowResults(
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
      targetRole: ally.role,
      opponentRole: normalizeRole(enemyChampion?.role),
    },
  };
}

function createRowPromiseResult(targetRoleRowResult, metadata = {}) {
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
      ...metadata,
    },
  };
}

async function fetchTargetRoleCounterRowResults(champion, targetRoles, rankFilter) {
  const normalizedTargetRoles = normalizeTargetRoles(targetRoles);
  if (normalizedTargetRoles.length === 0) {
    return new Map();
  }

  const settledRowsByTargetRole = await Promise.all(
    normalizedTargetRoles.map(async (targetRole) => {
      try {
        return [
          targetRole,
          {
            status: "fulfilled",
            value: await fetchRoleCounterRowsForTargetRole(
              champion,
              targetRole,
              rankFilter,
            ),
          },
        ];
      } catch (error) {
        return [
          targetRole,
          {
            status: "rejected",
            reason: error,
          },
        ];
      }
    }),
  );

  return new Map(settledRowsByTargetRole);
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

async function fetchRoleCounterRowsForTargetRole(champion, targetRole, rankFilter) {
  const payload = await fetchLolalyticsTargetRoleCounterData(
    champion.id,
    targetRole,
    rankFilter,
  );
  return extractCounterRows(payload);
}

async function fetchAllRoleCounterRowResults(champion, targetRoles, rankFilter) {
  return buildTargetRoleRowResults(targetRoles, (requestedTargetRoles) =>
    fetchAllRoleCounterRowsByTargetRole(champion, requestedTargetRoles, rankFilter),
  );
}

async function fetchAllRoleCounterRowsByTargetRole(champion, targetRoles, rankFilter) {
  const payload = await fetchLolalyticsAllRoleCounterData(champion.id, rankFilter);
  return extractCounterRoleValues(payload, targetRoles);
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

function extractCounterRows(payload) {
  const rows = new Map();
  const opponentRole = getExpectedOpponentRole(payload);
  if (!Array.isArray(payload?.counters)) {
    return rows;
  }

  for (const row of payload.counters) {
    const candidateKey = String(row?.cid ?? "");

    if (!championByKey.has(candidateKey)) {
      continue;
    }

    rows.set(candidateKey, buildCounterRow(row, opponentRole));
  }

  return rows;
}

function extractCounterRoleValues(payload, targetRoles) {
  const extractedRowsByTargetRole = new Map();
  const opponentRole = getExpectedOpponentRole(payload);

  for (const targetRole of targetRoles) {
    extractedRowsByTargetRole.set(targetRole, new Map());
  }

  if (!Array.isArray(payload?.counters)) {
    return extractedRowsByTargetRole;
  }

  for (const row of payload.counters) {
    const targetRole = normalizeRole(row?.defaultLane);
    const targetRoleRows = extractedRowsByTargetRole.get(targetRole);
    const candidateKey = String(row?.cid ?? "");

    if (!targetRoleRows || !championByKey.has(candidateKey)) {
      continue;
    }

    targetRoleRows.set(candidateKey, buildCounterRow(row, opponentRole));
  }

  return extractedRowsByTargetRole;
}

function buildCounterRow(row, opponentRole = null) {
  const counterValue = parseFiniteNumber(row?.d2);
  const enemyWinRate = parseFiniteNumber(row?.vsWr);

  return {
    value: counterValue == null ? null : -counterValue,
    winRate: enemyWinRate,
    opponentRole,
  };
}

function getExpectedOpponentRole(payload) {
  return normalizeRole(payload?.stats?.defaultLane ?? payload?.stats?.lane ?? null);
}

async function fetchEligibleTierStats(targetRole, rankFilter) {
  const roleLabel = getRoleLabel(targetRole).toLowerCase();
  const tierListDataUrl = buildTierListDataUrl(targetRole, rankFilter);
  const cachedEligibleRoleTierStats = eligibleTierStatsCache.get(tierListDataUrl);
  if (cachedEligibleRoleTierStats) {
    return cachedEligibleRoleTierStats;
  }

  const rows = await fetchTierListRows(targetRole, rankFilter);
  const eligibleRoleTierStats = buildEligibleTierStats(
    rows,
    championBySlug,
    championByName,
    {
      championByKey,
      minLanePercent: MIN_ROLE_TIER_LIST_LANE_PERCENT,
      minPickRate: MIN_ROLE_TIER_LIST_PICK_RATE,
    },
  );

  if (eligibleRoleTierStats.size === 0) {
    throw createHttpError(502, `Lolalytics ${roleLabel} tier list returned no eligible picks.`);
  }

  eligibleTierStatsCache.set(tierListDataUrl, eligibleRoleTierStats);
  return eligibleRoleTierStats;
}

async function fetchTierListRows(targetRole, rankFilter) {
  const roleLabel = getRoleLabel(targetRole).toLowerCase();
  const tierListDataUrl = buildTierListDataUrl(targetRole, rankFilter);
  const cachedRows = tierListRowsCache.get(tierListDataUrl);
  if (cachedRows) {
    return cachedRows;
  }

  const payload = await fetchLolalyticsJson(tierListDataUrl, `${roleLabel} tier data`);
  const rows = extractTierRowsFromMegaPayload(payload, targetRole);
  if (rows.length === 0) {
    throw createHttpError(502, `Lolalytics ${roleLabel} tier data was missing champion rows.`);
  }

  tierListRowsCache.set(tierListDataUrl, rows);
  return rows;
}

async function fetchAllyRoleLikelihoods(rankFilter) {
  const normalizedRankFilter = normalizeRankFilter(rankFilter) || DEFAULT_RANK_FILTER;
  const cachedLikelihoods = allyRoleLikelihoodsCache.get(normalizedRankFilter);
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
        championByKey.get(String(row.championKey || "")) ||
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

  allyRoleLikelihoodsCache.set(normalizedRankFilter, championRoleLikelihoods);
  return championRoleLikelihoods;
}

async function fetchLolalyticsTargetRoleCounterData(slug, targetRole, rankFilter) {
  const searchParams = buildLolalyticsSearchParams(
    {
      ep: "counter",
      v: "1",
      patch: PATCH_WINDOW,
      c: slug,
      vslane: targetRole,
      queue: QUEUE,
      region: REGION,
    },
    rankFilter,
  );

  return fetchLolalyticsMegaJson(
    `?${searchParams.toString()}`,
    `${slug} ${targetRole} counter data`,
  );
}

async function fetchLolalyticsAllRoleCounterData(slug, rankFilter) {
  const searchParams = buildLolalyticsSearchParams(
    {
      ep: "counter",
      v: "1",
      patch: PATCH_WINDOW,
      c: slug,
      queue: QUEUE,
      region: REGION,
    },
    rankFilter,
  );

  return fetchLolalyticsMegaJson(
    `?${searchParams.toString()}`,
    `${slug} counter data`,
  );
}

async function fetchNormalizedMatchupBuildData({
  allyChampion,
  enemyChampion,
  rankFilter,
  role,
}) {
  const enemyRole = normalizeRole(enemyChampion?.role);
  const cacheKey = buildMatchupBuildCacheKey(
    allyChampion.key,
    role,
    enemyChampion.key,
    enemyRole,
    rankFilter,
  );
  const cached = normalizedMatchupBuildCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const [runePayload, renderedPageResult] = await Promise.all([
    fetchLolalyticsRuneBuildData({
      allySlug: allyChampion.id,
      enemySlug: enemyChampion.id,
      label: `${allyChampion.name} vs ${enemyChampion.name} ${role} rune build data`,
      rankFilter,
      role,
      enemyRole,
    }),
    fetchLolalyticsRenderedBuildPage({
      allySlug: allyChampion.id,
      enemySlug: enemyChampion.id,
      label: `${allyChampion.name} vs ${enemyChampion.name} ${role} rendered build page`,
      rankFilter,
      role,
      enemyRole,
    }).then(
      (html) => ({
        status: "fulfilled",
        value: html,
      }),
      (error) => ({
        status: "rejected",
        reason: error,
      }),
    ),
  ]);
  const parsedBuildData = parseLolalyticsRuneBuildPayload(runePayload, {
    allyChampion,
    enemyChampion,
    role,
    enemyRole,
  });
  const renderedBuildData = parseOptionalRenderedBuildPage(renderedPageResult, {
    allyChampion,
    enemyChampion,
    role,
    enemyRole,
  });
  const mergedBuildData = mergeParsedBuildSources(parsedBuildData, renderedBuildData);

  normalizedMatchupBuildCache.set(cacheKey, mergedBuildData);
  return mergedBuildData;
}

async function fetchLolalyticsRuneBuildData({
  allySlug,
  enemySlug = null,
  label,
  rankFilter,
  role,
  enemyRole = null,
}) {
  const searchParams = buildLolalyticsSearchParams(
    {
      ep: "rune",
      v: "1",
      patch: PATCH_WINDOW,
      c: allySlug,
      lane: role,
      queue: QUEUE,
      region: REGION,
    },
    rankFilter,
  );

  if (enemySlug) {
    searchParams.set("vs", enemySlug);
  }
  if (enemyRole) {
    searchParams.set("vslane", enemyRole);
  }

  return fetchLolalyticsMegaJson(`?${searchParams.toString()}`, label);
}

async function fetchLolalyticsRenderedBuildPage({
  allySlug,
  enemySlug = null,
  label,
  rankFilter,
  role,
  enemyRole = null,
}) {
  const searchParams = buildLolalyticsSearchParams(
    {
      lane: role,
      patch: PATCH_WINDOW,
    },
    rankFilter,
  );
  const path = enemySlug
    ? `/lol/${allySlug}/vs/${enemySlug}/build/`
    : `/lol/${allySlug}/build/`;
  if (enemyRole) {
    searchParams.set("vslane", enemyRole);
  }

  return fetchLolalyticsText(
    `${LOLALYTICS_BASE_URL}${path}?${searchParams.toString()}`,
    label,
  );
}

function parseOptionalRenderedBuildPage(result, {
  allyChampion,
  enemyChampion = null,
  role,
  enemyRole = null,
}) {
  if (result?.status !== "fulfilled") {
    return null;
  }

  try {
    return parseLolalyticsRenderedBuildPage(result.value, {
      allyChampionKey: allyChampion.key,
      enemyChampionKey: enemyChampion?.key,
      fetchedAt: new Date().toISOString(),
      role,
      enemyRole,
    });
  } catch (_error) {
    return null;
  }
}

function mergeParsedBuildSources(primaryBuildData, renderedBuildData) {
  if (!renderedBuildData) {
    return primaryBuildData;
  }

  const renderedRunes = hasUsableRuneData(renderedBuildData.runes)
    ? renderedBuildData.runes
    : null;

  return {
    ...primaryBuildData,
    enemyRole: renderedBuildData.enemyRole || primaryBuildData.enemyRole || null,
    totalGames: renderedRunes ? renderedBuildData.totalGames : primaryBuildData.totalGames,
    runes: renderedRunes || primaryBuildData.runes,
    spells: hasBuildList(renderedBuildData.spells?.options)
      ? renderedBuildData.spells
      : primaryBuildData.spells,
    startingItems: hasBuildList(renderedBuildData.startingItems?.options)
      ? renderedBuildData.startingItems
      : primaryBuildData.startingItems,
    skills: hasBuildList(renderedBuildData.skills?.options)
      ? renderedBuildData.skills
      : primaryBuildData.skills,
    items: hasNestedBuildList(renderedBuildData.items?.slotOptions)
      ? renderedBuildData.items
      : primaryBuildData.items,
    boots: hasBuildList(renderedBuildData.boots)
      ? renderedBuildData.boots
      : primaryBuildData.boots,
  };
}

function hasBuildList(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasUsableRuneData(runes) {
  const primarySlots = runes?.primarySlotOptions;
  const secondarySlots = runes?.secondarySlotOptions;

  return (
    Array.isArray(primarySlots) &&
    primarySlots.length >= 4 &&
    primarySlots.every(hasBuildList) &&
    Array.isArray(secondarySlots) &&
    secondarySlots.slice(1).filter(hasBuildList).length >= 2 &&
    hasBuildList(runes?.secondaryStyleOptions) &&
    hasBuildList(runes?.statOptions)
  );
}

function hasNestedBuildList(value) {
  return Array.isArray(value) && value.some((entry) => Array.isArray(entry) && entry.length > 0);
}

function parseLolalyticsRuneBuildPayload(payload, {
  allyChampion,
  enemyChampion = null,
  role,
  enemyRole = null,
}) {
  try {
    return parseLolalyticsRuneBuildData(payload, {
      allyChampionKey: allyChampion.key,
      enemyChampionKey: enemyChampion?.key,
      fetchedAt: new Date().toISOString(),
      role,
      enemyRole,
    });
  } catch (error) {
    const matchupLabel = enemyChampion
      ? `${allyChampion.name} vs ${enemyChampion.name}`
      : allyChampion.name;
    throw createHttpError(
      502,
      `${matchupLabel} rune build data could not be parsed: ${
        error.message || "Unexpected Lolalytics rune payload."
      }`,
    );
  }
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

function buildTierListDataUrl(targetRole, rankFilter) {
  const searchParams = buildLolalyticsSearchParams(
    {
      ep: "tier",
      v: "1",
      lane: targetRole,
      patch: PATCH_WINDOW,
      queue: QUEUE,
      region: REGION,
    },
    rankFilter,
  );
  return `${LOLALYTICS_MEGA_URL}?${searchParams.toString()}`;
}

function buildLolalyticsSearchParams(params, rankFilter) {
  const searchParams = new URLSearchParams(params);
  const tierQueryValue = getLolalyticsDataTierQueryValue(rankFilter);
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
    if (cached.data != null) {
      return cached.data;
    }

    if (cached.promise) {
      return cached.promise;
    }
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
      requestCache.set(url, { data });
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

  requestCache.set(url, { promise: requestPromise }, REQUEST_TIMEOUT_MS);

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

function buildMatchupBuildCacheKey(
  allyChampionKey,
  role,
  enemyChampionKey,
  enemyRole,
  rankFilter,
) {
  return [
    `ally=${String(allyChampionKey || "")}`,
    `role=${String(role || "")}`,
    `enemy=${String(enemyChampionKey || "")}`,
    `enemyRole=${String(enemyRole || "")}`,
    `rank=${String(rankFilter || "")}`,
    `patch=${PATCH_WINDOW}`,
  ].join("|");
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

function parseFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
