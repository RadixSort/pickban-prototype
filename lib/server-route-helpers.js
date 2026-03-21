const {
  normalizeAllySelections,
  normalizeChampionSelections,
  normalizeRequestedRankFilter,
  validateAllyRoleAssignments,
  validateNoOpposingChampionSelections,
} = require("./request-normalization.js");

/**
 * Compose the shared `/suggest` request-validation path so the Express route
 * stays focused on fetch orchestration instead of input normalization.
 */
function normalizeSuggestRequest(
  requestBody,
  {
    championByName,
    defaultRankFilter,
    normalizeRankFilter,
    normalizeRole,
    createError,
    resolveRequestedTargetRoles,
    buildSelectedChampionKeys,
  },
) {
  const rankFilter = normalizeRequestedRankFilter(
    requestBody?.rankFilter ?? requestBody?.tier ?? null,
    {
      defaultRankFilter,
      normalizeRankFilter,
      createError,
    },
  );
  const allies = normalizeAllySelections(requestBody?.allies, {
    championByName,
    maxCount: 5,
    label: "allies",
    normalizeRole,
    createError,
  });
  const enemies = normalizeChampionSelections(requestBody?.enemies, {
    championByName,
    maxCount: 5,
    label: "enemies",
    createError,
  });

  validateAllyRoleAssignments(allies, createError);
  validateNoOpposingChampionSelections(allies, enemies, createError);

  return {
    rankFilter,
    allies,
    enemies,
    targetRoles: resolveRequestedTargetRoles({
      allies,
      role: requestBody?.role ?? null,
      targetRole: requestBody?.targetRole ?? null,
      roles: requestBody?.roles ?? null,
    }),
    selectedChampionKeys: buildSelectedChampionKeys(allies, enemies),
  };
}

/**
 * Convert per-role promise results into the public `/suggest` response shape,
 * including legacy single-role fields and per-role error metadata.
 */
function buildRoleSuggestionResponse({
  targetRoles,
  roleSuggestions,
  rankFilter,
  allies,
  enemies,
  requestStats,
  buildSuggestionMeta,
}) {
  const resultsByRole = {};
  const metaByRole = {};
  let successfulRoleCount = 0;
  let firstFailure = null;

  roleSuggestions.forEach((result, index) => {
    const targetRole = targetRoles[index];

    if (result.status === "fulfilled") {
      resultsByRole[targetRole] = result.value.results;
      metaByRole[targetRole] = result.value.meta;
      successfulRoleCount += 1;
      return;
    }

    if (!firstFailure) {
      firstFailure = result.reason;
    }

    resultsByRole[targetRole] = [];
    metaByRole[targetRole] = {
      ...buildSuggestionMeta(rankFilter, targetRole, allies, enemies),
      ...(result.reason?.meta || {}),
      error: result.reason?.message || "Unexpected server error.",
    };
  });

  if (successfulRoleCount === 0) {
    return {
      statusCode: firstFailure?.statusCode || 502,
      payload: {
        error:
          firstFailure?.message ||
          "No role suggestions were available for the selected champions.",
        roles: targetRoles,
        resultsByRole,
        metaByRole,
        requestStats,
      },
    };
  }

  const payload = {
    roles: targetRoles,
    resultsByRole,
    metaByRole,
    requestStats,
  };

  if (targetRoles.length === 1) {
    payload.results = resultsByRole[targetRoles[0]];
    payload.meta = metaByRole[targetRoles[0]];
  }

  return {
    statusCode: 200,
    payload,
  };
}

/**
 * Separate fulfilled matchup build payloads from enemy-specific failures so the
 * `/build-suggestions` route can preserve partial progress.
 */
function collectSuccessfulMatchupBuilds(matchupResults, enemies) {
  const matchupBuilds = [];
  const partialFailures = [];

  matchupResults.forEach((result, index) => {
    const enemyChampion = enemies[index];
    if (result.status === "fulfilled") {
      matchupBuilds.push(result.value);
      return;
    }

    partialFailures.push(
      `${enemyChampion.name}: ${result.reason?.message || "Unexpected server error."}`,
    );
  });

  return {
    matchupBuilds,
    partialFailures,
  };
}

/**
 * Build the stable `/build-suggestions` payload returned to the frontend.
 */
function buildBuildSuggestionsPayload({
  normalizedRequest,
  aggregatedResults,
  sourceMatchups,
  partialFailures,
}) {
  return {
    request: buildPublicRequest({
      ally: normalizedRequest.ally,
      enemies: normalizedRequest.enemies,
      rankFilter: normalizedRequest.rankFilter,
    }),
    summary: {
      enemyCount: normalizedRequest.enemies.length,
      sourceMatchups,
      lastUpdatedAt: aggregatedResults.lastUpdatedAt,
      partialFailures,
    },
    runes: aggregatedResults.runes,
    items: aggregatedResults.items,
    boots: aggregatedResults.boots,
  };
}

/**
 * Build the stable full-draft projection payload returned to the frontend.
 */
function buildDraftProjectionPayload({
  normalizedRequest,
  projection,
  requestStats,
}) {
  return {
    request: buildPublicRequest({
      allies: normalizedRequest.allies,
      enemies: normalizedRequest.enemies,
      rankFilter: normalizedRequest.rankFilter,
    }),
    summary: {
      allyCount: normalizedRequest.allies.length,
      enemyCount: normalizedRequest.enemies.length,
      synergyMatchupCount: projection.synergyMatchupCount,
      counterMatchupCount: projection.counterMatchupCount,
      sourceMatchups: projection.sourceMatchups,
      projectedWinRateMatchupCount: projection.projectedWinRateMatchupCount,
      partialFailures: projection.partialFailures,
    },
    projection: {
      allyWinRate: projection.allyWinRate,
      enemyWinRate: projection.enemyWinRate,
      synergyScore: projection.synergyScore,
      counterScore: projection.counterScore,
      projectedAgency: projection.projectedAgency,
    },
    requestStats,
  };
}

/**
 * Treat overview slot groups, a most-picked page, or boots as a usable build
 * suggestion response. Otherwise the route returns an error instead.
 */
function hasUsableBuildSuggestions(payload) {
  return (
    payload.runes.overview.slotGroups.length > 0 ||
    Boolean(payload.runes.mostPickedPage) ||
    Boolean(payload.items?.highestWinBuild) ||
    Boolean(payload.items?.mostPickedBuild) ||
    payload.boots.options.length > 0
  );
}

function buildPublicRequest({ ally = null, allies = null, enemies = [], rankFilter }) {
  const request = {
    enemies: enemies.map(getChampionName),
    rankFilter,
  };

  if (ally) {
    request.ally = buildPublicAllySelection(ally);
  }

  if (allies) {
    request.allies = allies.map(buildPublicAllySelection);
  }

  return request;
}

function buildPublicAllySelection({ champion, role }) {
  return {
    champion: champion.name,
    championKey: String(champion.key),
    role,
  };
}

function getChampionName(champion) {
  return champion.name;
}

module.exports = {
  buildBuildSuggestionsPayload,
  buildDraftProjectionPayload,
  buildRoleSuggestionResponse,
  collectSuccessfulMatchupBuilds,
  hasUsableBuildSuggestions,
  normalizeSuggestRequest,
};
