const test = require("node:test");
const assert = require("node:assert/strict");

const champions = require("../public/champions.json");
const {
  DEFAULT_RANK_FILTER,
  normalizeRankFilter,
} = require("../public/rank-filters.js");
const { normalizeRole } = require("../public/roles.js");
const { buildSelectedChampionKeys } = require("../public/suggestion-filters.js");
const {
  normalizeChampionName,
} = require("../lib/request-normalization.js");
const {
  resolveRequestedTargetRoles,
} = require("../lib/requested-target-roles.js");
const {
  buildBuildSuggestionsPayload,
  buildDraftProjectionPayload,
  buildRoleSuggestionResponse,
  collectSuccessfulMatchupBuilds,
  hasUsableBuildSuggestions,
  normalizeSuggestRequest,
} = require("../lib/server-route-helpers.js");

const championByName = new Map(
  champions.map((champion) => [normalizeChampionName(champion.name), champion]),
);

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createSuggestionMeta(rankFilter, targetRole, allies, enemies) {
  return {
    rankFilter,
    role: targetRole,
    allyCount: allies.length,
    enemyCount: enemies.length,
    assignedRoleCount: allies.filter((ally) => ally.role).length,
    partialFailures: [],
  };
}

test("normalizeSuggestRequest composes shared /suggest normalization helpers", () => {
  const normalized = normalizeSuggestRequest(
    {
      rankFilter: "Diamond+",
      allies: [{ champion: "Nami", role: "sup" }],
      enemies: ["Blitzcrank"],
    },
    {
      championByName,
      defaultRankFilter: DEFAULT_RANK_FILTER,
      normalizeRankFilter,
      normalizeRole,
      createError: createHttpError,
      resolveRequestedTargetRoles,
      buildSelectedChampionKeys,
    },
  );

  assert.equal(normalized.rankFilter, "diamond_plus");
  assert.deepEqual(
    normalized.allies.map((ally) => ({
      champion: ally.champion.name,
      role: ally.role,
    })),
    [{ champion: "Nami", role: "support" }],
  );
  assert.deepEqual(
    normalized.enemies.map((champion) => champion.name),
    ["Blitzcrank"],
  );
  assert.deepEqual(normalized.targetRoles, ["top", "jungle", "middle", "bottom"]);

  const namiKey = String(championByName.get(normalizeChampionName("Nami")).key);
  const blitzcrankKey = String(championByName.get(normalizeChampionName("Blitzcrank")).key);
  assert.deepEqual(
    [...normalized.selectedChampionKeys].sort(),
    [blitzcrankKey, namiKey].sort(),
  );
});

test("buildRoleSuggestionResponse preserves legacy single-role fields", () => {
  const results = [{ candidate: "Thresh" }];
  const meta = { role: "support", partialFailures: [] };

  const response = buildRoleSuggestionResponse({
    targetRoles: ["support"],
    roleSuggestions: [{ status: "fulfilled", value: { results, meta } }],
    rankFilter: "emerald_plus",
    allies: [],
    enemies: [],
    requestStats: {
      lolalyticsLiveAccessCount: 2,
      lolalyticsLifetimeAccessCount: 2,
    },
    buildSuggestionMeta: createSuggestionMeta,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload.roles, ["support"]);
  assert.deepEqual(response.payload.resultsByRole.support, results);
  assert.deepEqual(response.payload.metaByRole.support, meta);
  assert.deepEqual(response.payload.results, results);
  assert.deepEqual(response.payload.meta, meta);
});

test("buildRoleSuggestionResponse reports the first failure when every role fails", () => {
  const timeoutError = createHttpError(504, "Timed out while fetching top suggestions.");
  timeoutError.meta = {
    partialFailures: ["Ahri: upstream timeout"],
  };
  const parseError = createHttpError(502, "Failed to parse middle suggestions.");

  const response = buildRoleSuggestionResponse({
    targetRoles: ["top", "middle"],
    roleSuggestions: [
      { status: "rejected", reason: timeoutError },
      { status: "rejected", reason: parseError },
    ],
    rankFilter: "emerald_plus",
    allies: [{ role: "support" }],
    enemies: [{ name: "Lux" }],
    requestStats: {
      lolalyticsLiveAccessCount: 5,
      lolalyticsLifetimeAccessCount: 5,
    },
    buildSuggestionMeta: createSuggestionMeta,
  });

  assert.equal(response.statusCode, 504);
  assert.equal(response.payload.error, "Timed out while fetching top suggestions.");
  assert.deepEqual(response.payload.resultsByRole.top, []);
  assert.deepEqual(response.payload.resultsByRole.middle, []);
  assert.equal(
    response.payload.metaByRole.top.error,
    "Timed out while fetching top suggestions.",
  );
  assert.deepEqual(response.payload.metaByRole.top.partialFailures, ["Ahri: upstream timeout"]);
  assert.equal(
    response.payload.metaByRole.middle.error,
    "Failed to parse middle suggestions.",
  );
});

test("buildRoleSuggestionResponse keeps successful roles while surfacing failed roles", () => {
  const results = [{ candidate: "Thresh" }];
  const meta = { role: "support", partialFailures: [] };
  const timeoutError = createHttpError(504, "Timed out while fetching bottom suggestions.");
  timeoutError.meta = {
    partialFailures: ["Jinx: upstream timeout"],
  };

  const response = buildRoleSuggestionResponse({
    targetRoles: ["support", "bottom"],
    roleSuggestions: [
      { status: "fulfilled", value: { results, meta } },
      { status: "rejected", reason: timeoutError },
    ],
    rankFilter: "emerald_plus",
    allies: [{ role: "middle" }],
    enemies: [{ name: "Jinx" }],
    requestStats: {
      lolalyticsLiveAccessCount: 4,
      lolalyticsLifetimeAccessCount: 4,
    },
    buildSuggestionMeta: createSuggestionMeta,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload.roles, ["support", "bottom"]);
  assert.deepEqual(response.payload.resultsByRole.support, results);
  assert.deepEqual(response.payload.metaByRole.support, meta);
  assert.deepEqual(response.payload.resultsByRole.bottom, []);
  assert.equal(
    response.payload.metaByRole.bottom.error,
    "Timed out while fetching bottom suggestions.",
  );
  assert.deepEqual(response.payload.metaByRole.bottom.partialFailures, [
    "Jinx: upstream timeout",
  ]);
  assert.equal("results" in response.payload, false);
  assert.equal("meta" in response.payload, false);
});

test("build suggestion helper payloads preserve request and summary fields", () => {
  const matchupBuild = { id: "vs-blitzcrank" };
  const collected = collectSuccessfulMatchupBuilds(
    [
      { status: "fulfilled", value: matchupBuild },
      { status: "rejected", reason: new Error("Missing matchup rows.") },
    ],
    [{ name: "Blitzcrank" }, { name: "Leona" }],
  );

  assert.deepEqual(collected.matchupBuilds, [matchupBuild]);
  assert.deepEqual(collected.partialFailures, ["Leona: Missing matchup rows."]);

  const payload = buildBuildSuggestionsPayload({
    normalizedRequest: {
      ally: {
        champion: championByName.get(normalizeChampionName("Nami")),
        role: "support",
      },
      enemies: [
        championByName.get(normalizeChampionName("Blitzcrank")),
        championByName.get(normalizeChampionName("Leona")),
      ],
      rankFilter: "emerald_plus",
    },
    aggregatedResults: {
      lastUpdatedAt: "2026-03-19T20:30:00.000Z",
      runes: {
        overview: {
          slotGroups: [{ key: "primary-style" }],
        },
        mostPickedPage: null,
      },
      items: {
        highestWinBuild: null,
        mostPickedBuild: {
          selections: [{ itemId: 3118 }],
        },
      },
      boots: {
        options: [],
      },
    },
    sourceMatchups: collected.matchupBuilds.length,
    partialFailures: collected.partialFailures,
  });

  assert.deepEqual(payload.request, {
    ally: {
      champion: "Nami",
      championKey: String(championByName.get(normalizeChampionName("Nami")).key),
      role: "support",
    },
    enemies: ["Blitzcrank", "Leona"],
    rankFilter: "emerald_plus",
  });
  assert.deepEqual(payload.summary, {
    enemyCount: 2,
    sourceMatchups: 1,
    lastUpdatedAt: "2026-03-19T20:30:00.000Z",
    partialFailures: ["Leona: Missing matchup rows."],
  });
  assert.deepEqual(payload.items, {
    highestWinBuild: null,
    mostPickedBuild: {
      selections: [{ itemId: 3118 }],
    },
  });
  assert.equal(hasUsableBuildSuggestions(payload), true);

  const emptyPayload = buildBuildSuggestionsPayload({
    normalizedRequest: {
      ally: {
        champion: championByName.get(normalizeChampionName("Nami")),
        role: "support",
      },
      enemies: [],
      rankFilter: "emerald_plus",
    },
    aggregatedResults: {
      lastUpdatedAt: "2026-03-19T20:30:00.000Z",
      runes: {
        overview: {
          slotGroups: [],
        },
        mostPickedPage: null,
      },
      items: {
        highestWinBuild: null,
        mostPickedBuild: null,
      },
      boots: {
        options: [],
      },
    },
    sourceMatchups: 0,
    partialFailures: [],
  });

  assert.equal(hasUsableBuildSuggestions(emptyPayload), false);
});

test("buildDraftProjectionPayload preserves request, summary, and projection fields", () => {
  const payload = buildDraftProjectionPayload({
    normalizedRequest: {
      allies: [
        {
          champion: championByName.get(normalizeChampionName("Nami")),
          role: "support",
        },
        {
          champion: championByName.get(normalizeChampionName("Ahri")),
          role: "middle",
        },
      ],
      enemies: [
        championByName.get(normalizeChampionName("Blitzcrank")),
        championByName.get(normalizeChampionName("Leona")),
      ],
      rankFilter: "emerald_plus",
    },
    projection: {
      allyWinRate: 53.2,
      enemyWinRate: 46.8,
      synergyScore: 4,
      counterScore: -2,
      projectedAgency: 2,
      synergyMatchupCount: 3,
      counterMatchupCount: 2,
      sourceMatchups: 5,
      projectedWinRateMatchupCount: 4,
      partialFailures: ["Ahri vs Leona: Missing counter row."],
    },
    requestStats: {
      lolalyticsLiveAccessCount: 5,
      lolalyticsLifetimeAccessCount: 5,
    },
  });

  assert.deepEqual(payload.request, {
    allies: [
      {
        champion: "Nami",
        championKey: String(championByName.get(normalizeChampionName("Nami")).key),
        role: "support",
      },
      {
        champion: "Ahri",
        championKey: String(championByName.get(normalizeChampionName("Ahri")).key),
        role: "middle",
      },
    ],
    enemies: ["Blitzcrank", "Leona"],
    rankFilter: "emerald_plus",
  });
  assert.deepEqual(payload.summary, {
    allyCount: 2,
    enemyCount: 2,
    synergyMatchupCount: 3,
    counterMatchupCount: 2,
    sourceMatchups: 5,
    projectedWinRateMatchupCount: 4,
    partialFailures: ["Ahri vs Leona: Missing counter row."],
  });
  assert.deepEqual(payload.projection, {
    allyWinRate: 53.2,
    enemyWinRate: 46.8,
    synergyScore: 4,
    counterScore: -2,
    projectedAgency: 2,
  });
  assert.deepEqual(payload.requestStats, {
    lolalyticsLiveAccessCount: 5,
    lolalyticsLifetimeAccessCount: 5,
  });
});
