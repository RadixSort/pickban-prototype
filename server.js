const { AsyncLocalStorage } = require("async_hooks");
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { version: appVersion } = require("./package.json");
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
  parseLolalyticsRenderedBuildPage,
  parseLolalyticsRuneBuildData,
} = require("./lib/lolalytics-build-parser.js");
const {
  parseUggBuildPage,
} = require("./lib/ugg-build-parser.js");
const {
  fetchLiveDraftImport,
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
const LOLALYTICS_DATA_WINDOW_DAYS = Number.parseInt(PATCH_WINDOW, 10);
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
const UGG_BASE_URL = normalizeBaseUrl(process.env.UGG_BASE_URL, "https://u.gg");
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

app.get("/live-draft", async (_request, response) => {
  const payload = await fetchLiveDraftImport({
    championByKey,
    normalizeRole,
  });

  response.set("Cache-Control", "no-store");
  response.json(payload);
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
            "Lolalytics returned build data, but it did not include usable build recommendations.",
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
  const payload = await fetchLolalyticsCounterData(champion.id, rankFilter);
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

function extractCounterRoleValues(payload, targetRoles) {
  const extractedRowsByTargetRole = new Map();

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

    const counterValue = parseFiniteNumber(row.d1);
    const candidateWinRate = parseFiniteNumber(row.vsWr);
    targetRoleRows.set(candidateKey, {
      value: counterValue == null ? null : -counterValue,
      winRate: candidateWinRate == null ? null : 100 - candidateWinRate,
    });
  }

  return extractedRowsByTargetRole;
}

async function fetchEligibleTierStats(targetRole, rankFilter) {
  const roleLabel = getRoleLabel(targetRole).toLowerCase();
  const tierListDataUrl = buildTierListDataUrl(targetRole, rankFilter);
  const cachedEligibleRoleTierStats = getCachedData(eligibleTierStatsCache, tierListDataUrl);
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

  setCachedData(eligibleTierStatsCache, tierListDataUrl, eligibleRoleTierStats);
  return eligibleRoleTierStats;
}

async function fetchTierListRows(targetRole, rankFilter) {
  const roleLabel = getRoleLabel(targetRole).toLowerCase();
  const tierListDataUrl = buildTierListDataUrl(targetRole, rankFilter);
  const cachedRows = getCachedData(tierListRowsCache, tierListDataUrl);
  if (cachedRows) {
    return cachedRows;
  }

  const payload = await fetchLolalyticsJson(tierListDataUrl, `${roleLabel} tier data`);
  const rows = extractTierRowsFromMegaPayload(payload, targetRole);
  if (rows.length === 0) {
    throw createHttpError(502, `Lolalytics ${roleLabel} tier data was missing champion rows.`);
  }

  setCachedData(tierListRowsCache, tierListDataUrl, rows);
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

  setCachedData(allyRoleLikelihoodsCache, normalizedRankFilter, championRoleLikelihoods);
  return championRoleLikelihoods;
}

async function fetchLolalyticsCounterData(slug, rankFilter) {
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
    { includeDefaultTier: true },
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

  const [runePayload, renderedPageResult] = await Promise.all([
    fetchLolalyticsRuneBuildData({
      allySlug: allyChampion.id,
      enemySlug: enemyChampion.id,
      label: `${allyChampion.name} vs ${enemyChampion.name} ${role} rune build data`,
      rankFilter,
      role,
    }),
    fetchLolalyticsRenderedBuildPage({
      allySlug: allyChampion.id,
      enemySlug: enemyChampion.id,
      label: `${allyChampion.name} vs ${enemyChampion.name} ${role} rendered build page`,
      rankFilter,
      role,
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
  });
  const renderedBuildData = parseOptionalRenderedBuildPage(renderedPageResult, {
    allyChampion,
    enemyChampion,
    role,
  });
  const fallbackBuildData = hasCompleteSupplementalBuildData(renderedBuildData)
    ? null
    : await fetchOptionalUggBuildData({
        allyChampion,
        enemyChampion,
        rankFilter,
        role,
      });
  const supplementalBuildData = mergeMissingBuildSections(renderedBuildData, fallbackBuildData);
  const mergedBuildData = mergeParsedBuildSources(parsedBuildData, supplementalBuildData);

  setCachedData(normalizedMatchupBuildCache, cacheKey, mergedBuildData);
  return mergedBuildData;
}

async function fetchNormalizedChampionBuildData({
  allyChampion,
  rankFilter,
  role,
}) {
  const [runePayload, renderedPageResult] = await Promise.all([
    fetchLolalyticsRuneBuildData({
      allySlug: allyChampion.id,
      label: `${allyChampion.name} ${role} rune build data`,
      rankFilter,
      role,
    }),
    fetchLolalyticsRenderedBuildPage({
      allySlug: allyChampion.id,
      label: `${allyChampion.name} ${role} rendered build page`,
      rankFilter,
      role,
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
    role,
  });
  const renderedBuildData = parseOptionalRenderedBuildPage(renderedPageResult, {
    allyChampion,
    role,
  });
  const fallbackBuildData = hasCompleteSupplementalBuildData(renderedBuildData)
    ? null
    : await fetchOptionalUggBuildData({
        allyChampion,
        rankFilter,
        role,
      });
  const supplementalBuildData = mergeMissingBuildSections(renderedBuildData, fallbackBuildData);

  return mergeParsedBuildSources(parsedBuildData, supplementalBuildData);
}

async function fetchLolalyticsRuneBuildData({
  allySlug,
  enemySlug = null,
  label,
  rankFilter,
  role,
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
    { includeDefaultTier: true },
  );

  if (enemySlug) {
    searchParams.set("vs", enemySlug);
  }

  return fetchLolalyticsMegaJson(`?${searchParams.toString()}`, label);
}

async function fetchLolalyticsRenderedBuildPage({
  allySlug,
  enemySlug = null,
  label,
  rankFilter,
  role,
}) {
  const searchParams = buildLolalyticsSearchParams(
    {
      lane: role,
      patch: PATCH_WINDOW,
    },
    rankFilter,
    { includeDefaultTier: true },
  );
  const path = enemySlug
    ? `/lol/${allySlug}/vs/${enemySlug}/build/`
    : `/lol/${allySlug}/build/`;

  return fetchLolalyticsText(
    `${LOLALYTICS_BASE_URL}${path}?${searchParams.toString()}`,
    label,
  );
}

function parseOptionalRenderedBuildPage(result, {
  allyChampion,
  enemyChampion = null,
  role,
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
    });
  } catch (_error) {
    return null;
  }
}

async function fetchOptionalUggBuildData({
  allyChampion,
  enemyChampion = null,
  rankFilter,
  role,
}) {
  try {
    const html = await fetchUggBuildPage({
      allySlug: allyChampion.id,
      label: `${allyChampion.name} ${role} fallback build page`,
      rankFilter,
      role,
    });

    return parseUggBuildPage(html, {
      allyChampionKey: allyChampion.key,
      enemyChampionKey: enemyChampion?.key,
      fetchedAt: new Date().toISOString(),
      rankFilter,
      role,
    });
  } catch (_error) {
    return null;
  }
}

async function fetchUggBuildPage({
  allySlug,
  label,
  rankFilter,
  role,
}) {
  const rolePath = getUggRolePath(role);
  const rankQueryValue = getUggRankQueryValue(rankFilter);
  const searchParams = new URLSearchParams();
  if (rankQueryValue) {
    searchParams.set("rank", rankQueryValue);
  }
  const query = searchParams.toString();

  return fetchExternalText(
    `${UGG_BASE_URL}/lol/champions/${allySlug}/build/${rolePath}${query ? `?${query}` : ""}`,
    label,
    "U.GG",
    {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "referer": "https://u.gg/",
    },
  );
}

function mergeMissingBuildSections(primaryBuildData, fallbackBuildData) {
  if (!primaryBuildData) {
    return fallbackBuildData;
  }

  if (!fallbackBuildData) {
    return primaryBuildData;
  }

  return {
    ...primaryBuildData,
    spells: hasBuildList(primaryBuildData.spells?.options)
      ? primaryBuildData.spells
      : fallbackBuildData.spells,
    items: hasNestedBuildList(primaryBuildData.items?.slotOptions)
      ? primaryBuildData.items
      : fallbackBuildData.items,
    boots: hasBuildList(primaryBuildData.boots)
      ? primaryBuildData.boots
      : fallbackBuildData.boots,
  };
}

function hasCompleteSupplementalBuildData(buildData) {
  return Boolean(
    hasBuildList(buildData?.spells?.options) &&
      hasNestedBuildList(buildData?.items?.slotOptions) &&
      hasBuildList(buildData?.boots),
  );
}

function mergeParsedBuildSources(primaryBuildData, renderedBuildData) {
  if (!renderedBuildData) {
    return primaryBuildData;
  }

  return {
    ...primaryBuildData,
    spells: hasBuildList(renderedBuildData.spells?.options)
      ? renderedBuildData.spells
      : primaryBuildData.spells,
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

function hasNestedBuildList(value) {
  return Array.isArray(value) && value.some((entry) => Array.isArray(entry) && entry.length > 0);
}

function getUggRolePath(role) {
  switch (role) {
    case "middle":
      return "mid";
    case "bottom":
      return "adc";
    default:
      return role || "mid";
  }
}

function getUggRankQueryValue(rankFilter) {
  switch (rankFilter) {
    case "all":
      return "overall";
    case "gold_plus":
      return "gold";
    case "platinum_plus":
      return "platinum_plus";
    case "diamond_plus":
      return "diamond_plus";
    case "d2_plus":
      return "diamond_2_plus";
    case "emerald_plus":
    default:
      return null;
  }
}

function parseLolalyticsRuneBuildPayload(payload, {
  allyChampion,
  enemyChampion = null,
  role,
}) {
  try {
    return parseLolalyticsRuneBuildData(payload, {
      allyChampionKey: allyChampion.key,
      enemyChampionKey: enemyChampion?.key,
      fetchedAt: new Date().toISOString(),
      role,
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

async function fetchExternalText(url, label, sourceName, headers = {}) {
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
      const res = await fetch(url, {
        signal: controller.signal,
        headers,
      });

      if (!res.ok) {
        throw createHttpError(
          502,
          `${sourceName} request failed for ${label} with status ${res.status}.`,
        );
      }

      const data = await res.text();
      requestCache.set(url, {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return data;
    } catch (error) {
      requestCache.delete(url);

      if (error.name === "AbortError") {
        throw createHttpError(504, `Timed out while fetching ${label} from ${sourceName}.`);
      }

      if (error.statusCode) {
        throw error;
      }

      throw createHttpError(502, `Failed to fetch ${label} from ${sourceName}.`);
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
    { includeDefaultTier: true },
  );
  return `${LOLALYTICS_MEGA_URL}?${searchParams.toString()}`;
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
