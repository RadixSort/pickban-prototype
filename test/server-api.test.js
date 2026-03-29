const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  buildTierListHtml,
  createGenericBuildQData,
  createMatchupBuildQData,
  createRoleBuildQData,
  jsonResponse,
  startMockLolalyticsServer,
  textResponse,
} = require("./helpers/lolalytics-mock-server.js");
const {
  getAvailablePort,
  spawnServerProcess,
  stopServerProcess,
} = require("./helpers/server-process.js");

const repoRoot = path.resolve(__dirname, "..");

async function startServerWithMock(t, responder) {
  const mockServer = await startMockLolalyticsServer(responder);
  const port = await getAvailablePort();
  const child = await spawnServerProcess({
    cwd: repoRoot,
    port,
    env: {
      LOLALYTICS_BASE_URL: mockServer.baseUrl,
      LOLALYTICS_MEGA_URL: mockServer.megaUrl,
    },
  });

  t.after(async () => {
    await Promise.all([
      stopServerProcess(child),
      mockServer.close(),
    ]);
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    mockServer,
  };
}

async function postJson(baseUrl, endpoint, payload) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      connection: "close",
    },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function getJson(baseUrl, endpoint) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      connection: "close",
    },
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

test("POST /suggest rejects an empty draft before any upstream fetch", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, () => {
    throw new Error("Unexpected upstream request.");
  });

  const response = await postJson(baseUrl, "/suggest", {});

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Choose at least one allied or enemy champion before fetching suggestions.",
    requestStats: {
      lolalyticsLiveAccessCount: 0,
      lolalyticsLifetimeAccessCount: 0,
    },
  });
  assert.equal(mockServer.countRequests(), 0);
});

test("POST /suggest rejects a fully assigned allied draft before any upstream fetch", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, () => {
    throw new Error("Unexpected upstream request.");
  });

  const response = await postJson(baseUrl, "/suggest", {
    allies: [
      { champion: "Darius", role: "top" },
      { champion: "Jarvan IV", role: "jungle" },
      { champion: "Ahri", role: "mid" },
      { champion: "Miss Fortune", role: "bot" },
      { champion: "Leona", role: "support" },
    ],
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error:
      "All five allied roles are already assigned. Remove one ally or clear a role to fetch suggestions.",
    requestStats: {
      lolalyticsLiveAccessCount: 0,
      lolalyticsLifetimeAccessCount: 0,
    },
  });
  assert.equal(mockServer.countRequests(), 0);
});

test("POST /suggest returns single-role results and legacy compatibility fields", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/lol/tierlist/") {
      return textResponse(
        buildTierListHtml([
          {
            slug: "nautilus",
            name: "Nautilus",
            lanePercent: 82.1,
            winRate: 51.1,
            pickRate: 4.4,
          },
        ]),
      );
    }

    if (url.pathname === "/mega/") {
      return jsonResponse({
        team: {
          support: [[111, 53, 0, 60]],
        },
      });
    }

    if (url.pathname === "/lol/leona/build/q-data.json") {
      return jsonResponse(
        createRoleBuildQData({
          support: [[111, 47, 48]],
        }),
      );
    }

    return textResponse("Not found.", 404);
  });

  const response = await postJson(baseUrl, "/suggest", {
    rankFilter: "emerald_plus",
    role: "support",
    allies: [{ champion: "Ahri", role: "mid" }],
    enemies: ["Leona"],
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.roles, ["support"]);
  assert.deepEqual(response.body.resultsByRole.support, [
    {
      candidate: "Nautilus",
      candidateKey: "111",
      support: "Nautilus",
      supportKey: "111",
      icon: "https://cdn5.lolalytics.com/champ140/nautilus.webp",
      role: "support",
      synergyScore: 60,
      counterScore: -48,
      projectedWinRate: 53,
      projectedAgency: 6,
      finalScore: 6,
      lanePercent: 82.1,
      pickRate: 4.4,
      winRate: 51.1,
    },
  ]);
  assert.deepEqual(response.body.metaByRole.support, {
    rankFilter: "emerald_plus",
    role: "support",
    allyCount: 1,
    enemyCount: 1,
    assignedRoleCount: 1,
    partialFailures: [],
  });
  assert.deepEqual(response.body.results, response.body.resultsByRole.support);
  assert.deepEqual(response.body.meta, response.body.metaByRole.support);
  assert.deepEqual(response.body.requestStats, {
    lolalyticsLiveAccessCount: 3,
    lolalyticsLifetimeAccessCount: 3,
  });
  assert.equal(mockServer.countRequests("/lol/tierlist/"), 1);
  assert.equal(mockServer.countRequests("/mega/"), 1);
  assert.equal(mockServer.countRequests("/lol/leona/build/q-data.json"), 1);
});

test("GET /ally-role-likelihoods returns per-champion lane shares and reuses the cache", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname !== "/lol/tierlist/") {
      return textResponse("Not found.", 404);
    }

    const lane = url.searchParams.get("lane");
    const rowsByLane = {
      top: [
        {
          slug: "aatrox",
          name: "Aatrox",
          lanePercent: 91.2,
          winRate: 50.8,
          pickRate: 8.4,
        },
        {
          slug: "ahri",
          name: "Ahri",
          lanePercent: 6.1,
          winRate: 47.3,
          pickRate: 0.3,
        },
      ],
      jungle: [
        {
          slug: "ahri",
          name: "Ahri",
          lanePercent: 9.6,
          winRate: 48.1,
          pickRate: 0.7,
        },
      ],
      middle: [
        {
          slug: "ahri",
          name: "Ahri",
          lanePercent: 83.4,
          winRate: 51.9,
          pickRate: 9.9,
        },
      ],
      bottom: [
        {
          slug: "ahri",
          name: "Ahri",
          lanePercent: 1.7,
          winRate: 45.5,
          pickRate: 0.1,
        },
      ],
      support: [
        {
          slug: "ahri",
          name: "Ahri",
          lanePercent: 4.2,
          winRate: 48.7,
          pickRate: 0.4,
        },
      ],
    };

    return textResponse(buildTierListHtml(rowsByLane[lane] || []));
  });

  const firstResponse = await getJson(baseUrl, "/ally-role-likelihoods?rankFilter=emerald_plus");

  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.body.rankFilter, "emerald_plus");
  assert.deepEqual(firstResponse.body.championRoleLikelihoods["103"], {
    top: {
      lanePercent: 6.1,
      winRate: 47.3,
      pickRate: 0.3,
    },
    jungle: {
      lanePercent: 9.6,
      winRate: 48.1,
      pickRate: 0.7,
    },
    middle: {
      lanePercent: 83.4,
      winRate: 51.9,
      pickRate: 9.9,
    },
    bottom: {
      lanePercent: 1.7,
      winRate: 45.5,
      pickRate: 0.1,
    },
    support: {
      lanePercent: 4.2,
      winRate: 48.7,
      pickRate: 0.4,
    },
  });
  assert.deepEqual(firstResponse.body.championRoleLikelihoods["266"], {
    top: {
      lanePercent: 91.2,
      winRate: 50.8,
      pickRate: 8.4,
    },
  });
  assert.deepEqual(firstResponse.body.requestStats, {
    lolalyticsLiveAccessCount: 5,
    lolalyticsLifetimeAccessCount: 5,
  });
  assert.equal(mockServer.countRequests("/lol/tierlist/"), 5);

  const secondResponse = await getJson(baseUrl, "/ally-role-likelihoods?rankFilter=emerald_plus");

  assert.equal(secondResponse.status, 200);
  assert.deepEqual(secondResponse.body.requestStats, {
    lolalyticsLiveAccessCount: 0,
    lolalyticsLifetimeAccessCount: 5,
  });
  assert.equal(mockServer.countRequests("/lol/tierlist/"), 5);
});

test("POST /suggest preserves the lifetime Lolalytics hit count across later zero-hit requests", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/lol/tierlist/") {
      return textResponse(
        buildTierListHtml([
          {
            slug: "nautilus",
            name: "Nautilus",
            lanePercent: 82.1,
            winRate: 51.1,
            pickRate: 4.4,
          },
        ]),
      );
    }

    if (url.pathname === "/mega/") {
      return jsonResponse({
        team: {
          support: [[111, 53, 0, 60]],
        },
      });
    }

    if (url.pathname === "/lol/leona/build/q-data.json") {
      return jsonResponse(
        createRoleBuildQData({
          support: [[111, 47, 48]],
        }),
      );
    }

    return textResponse("Not found.", 404);
  });

  const successfulResponse = await postJson(baseUrl, "/suggest", {
    rankFilter: "emerald_plus",
    role: "support",
    allies: [{ champion: "Ahri", role: "mid" }],
    enemies: ["Leona"],
  });

  assert.equal(successfulResponse.status, 200);
  assert.deepEqual(successfulResponse.body.requestStats, {
    lolalyticsLiveAccessCount: 3,
    lolalyticsLifetimeAccessCount: 3,
  });

  const emptyDraftResponse = await postJson(baseUrl, "/suggest", {});

  assert.equal(emptyDraftResponse.status, 400);
  assert.deepEqual(emptyDraftResponse.body.requestStats, {
    lolalyticsLiveAccessCount: 0,
    lolalyticsLifetimeAccessCount: 3,
  });
  assert.equal(mockServer.countRequests(), 3);
});

test("POST /suggest preserves per-role failures while deduplicating shared upstream requests", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/lol/tierlist/" && url.searchParams.get("lane") === "support") {
      return textResponse(
        buildTierListHtml([
          {
            slug: "nautilus",
            name: "Nautilus",
            lanePercent: 82.1,
            winRate: 51.1,
            pickRate: 4.4,
          },
        ]),
      );
    }

    if (url.pathname === "/lol/tierlist/" && url.searchParams.get("lane") === "bottom") {
      return textResponse("");
    }

    if (url.pathname === "/mega/") {
      return jsonResponse({
        team: {
          support: [[111, 53, 0, 60]],
        },
      });
    }

    if (url.pathname === "/lol/leona/build/q-data.json") {
      return jsonResponse(
        createRoleBuildQData({
          support: [[111, 47, 48]],
        }),
      );
    }

    if (url.pathname === "/lol/jinx/build/q-data.json") {
      return textResponse("Service unavailable.", 503);
    }

    return textResponse("Not found.", 404);
  });

  const response = await postJson(baseUrl, "/suggest", {
    rankFilter: "emerald_plus",
    roles: ["support", "bottom"],
    allies: [{ champion: "Ahri", role: "mid" }],
    enemies: ["Leona", "Jinx"],
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.roles, ["support", "bottom"]);
  assert.deepEqual(response.body.resultsByRole.support, [
    {
      candidate: "Nautilus",
      candidateKey: "111",
      support: "Nautilus",
      supportKey: "111",
      icon: "https://cdn5.lolalytics.com/champ140/nautilus.webp",
      role: "support",
      synergyScore: 60,
      counterScore: -48,
      projectedWinRate: 53,
      projectedAgency: 6,
      finalScore: 6,
      lanePercent: 82.1,
      pickRate: 4.4,
      winRate: 51.1,
    },
  ]);
  assert.deepEqual(response.body.resultsByRole.bottom, []);
  assert.equal(response.body.metaByRole.support.allyCount, 1);
  assert.equal(response.body.metaByRole.support.enemyCount, 2);
  assert.equal(response.body.metaByRole.support.assignedRoleCount, 1);
  assert.equal(response.body.metaByRole.support.partialFailures.length, 1);
  assert.match(
    response.body.metaByRole.support.partialFailures[0],
    /jinx build q-data .*status 503/i,
  );
  assert.equal(
    response.body.metaByRole.bottom.error,
    "Lolalytics bot tier list was missing champion rows.",
  );
  assert.deepEqual(response.body.requestStats, {
    lolalyticsLiveAccessCount: 6,
    lolalyticsLifetimeAccessCount: 6,
  });
  assert.equal(mockServer.countRequests("/lol/tierlist/"), 2);
  assert.equal(mockServer.countRequests("/mega/"), 2);
  assert.equal(mockServer.countRequests("/lol/leona/build/q-data.json"), 1);
  assert.equal(mockServer.countRequests("/lol/jinx/build/q-data.json"), 1);
});

test("POST /draft-outlook returns projected team win rates and caches identical drafts across enemy order", async (t) => {
  const allySynergyRowsByChampionSlug = {
    darius: {
      jungle: [[59, 54, 0, 10]],
      middle: [[103, 54, 0, 10]],
      bottom: [[21, 54, 0, 10]],
      support: [[89, 54, 0, 10]],
    },
    jarvaniv: {
      top: [[122, 54, 0, 10]],
      middle: [[103, 54, 0, 10]],
      bottom: [[21, 54, 0, 10]],
      support: [[89, 54, 0, 10]],
    },
    ahri: {
      top: [[122, 54, 0, 10]],
      jungle: [[59, 54, 0, 10]],
      bottom: [[21, 54, 0, 10]],
      support: [[89, 54, 0, 10]],
    },
    missfortune: {
      top: [[122, 54, 0, 10]],
      jungle: [[59, 54, 0, 10]],
      middle: [[103, 54, 0, 10]],
      support: [[89, 54, 0, 10]],
    },
    leona: {
      top: [[122, 54, 0, 10]],
      jungle: [[59, 54, 0, 10]],
      middle: [[103, 54, 0, 10]],
      bottom: [[21, 54, 0, 10]],
    },
  };
  const enemyCounterRows = {
    top: [[122, 46, 7]],
    jungle: [[59, 46, 7]],
    middle: [[103, 46, 7]],
    bottom: [[21, 46, 7]],
    support: [[89, 46, 7]],
  };
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/mega/") {
      return jsonResponse({
        team: allySynergyRowsByChampionSlug[url.searchParams.get("c")] || {},
      });
    }

    if (url.pathname === "/lol/leona/build/q-data.json") {
      return jsonResponse(createRoleBuildQData(enemyCounterRows));
    }

    if (url.pathname === "/lol/lux/build/q-data.json") {
      return jsonResponse(createRoleBuildQData(enemyCounterRows));
    }

    if (url.pathname === "/lol/jinx/build/q-data.json") {
      return jsonResponse(createRoleBuildQData(enemyCounterRows));
    }

    return textResponse("Not found.", 404);
  });

  const firstResponse = await postJson(baseUrl, "/draft-outlook", {
    rankFilter: "emerald_plus",
    allies: [
      { champion: "Darius", role: "top" },
      { champion: "Jarvan IV", role: "jungle" },
      { champion: "Ahri", role: "mid" },
      { champion: "Miss Fortune", role: "bot" },
      { champion: "Leona", role: "support" },
    ],
    enemies: ["Leona", "Jinx"],
  });

  assert.equal(firstResponse.status, 400);
  assert.match(firstResponse.body.error, /cannot appear on both allied and enemy sides/i);

  const validResponse = await postJson(baseUrl, "/draft-outlook", {
    rankFilter: "emerald_plus",
    allies: [
      { champion: "Darius", role: "top" },
      { champion: "Jarvan IV", role: "jungle" },
      { champion: "Ahri", role: "mid" },
      { champion: "Miss Fortune", role: "bot" },
      { champion: "Leona", role: "support" },
    ],
    enemies: ["Jinx", "Lux"],
  });

  assert.equal(validResponse.status, 200);
  assert.deepEqual(validResponse.body.request, {
    allies: [
      { champion: "Darius", championKey: "122", role: "top" },
      { champion: "Jarvan IV", championKey: "59", role: "jungle" },
      { champion: "Ahri", championKey: "103", role: "middle" },
      { champion: "Miss Fortune", championKey: "21", role: "bottom" },
      { champion: "Leona", championKey: "89", role: "support" },
    ],
    enemies: ["Jinx", "Lux"],
    rankFilter: "emerald_plus",
  });
  assert.deepEqual(validResponse.body.summary, {
    allyCount: 5,
    enemyCount: 2,
    synergyMatchupCount: 20,
    counterMatchupCount: 10,
    sourceMatchups: 30,
    projectedWinRateMatchupCount: 30,
    partialFailures: [],
  });
  assert.equal(validResponse.body.projection.allyWinRate, 54);
  assert.equal(validResponse.body.projection.enemyWinRate, 46);
  assert.equal(validResponse.body.projection.synergyScore, 10);
  assert.equal(validResponse.body.projection.counterScore, -7);
  assert.equal(validResponse.body.projection.projectedAgency, 1.5);
  assert.deepEqual(validResponse.body.requestStats, {
    lolalyticsLiveAccessCount: 7,
    lolalyticsLifetimeAccessCount: 7,
  });
  assert.equal(mockServer.countRequests("/mega/"), 5);
  assert.equal(mockServer.countRequests("/lol/jinx/build/q-data.json"), 1);
  assert.equal(mockServer.countRequests("/lol/lux/build/q-data.json"), 1);

  const secondResponse = await postJson(baseUrl, "/draft-outlook", {
    rankFilter: "emerald_plus",
    allies: [
      { champion: "Darius", role: "top" },
      { champion: "Jarvan IV", role: "jungle" },
      { champion: "Ahri", role: "mid" },
      { champion: "Miss Fortune", role: "bot" },
      { champion: "Leona", role: "support" },
    ],
    enemies: ["Lux", "Jinx"],
  });

  assert.equal(secondResponse.status, 200);
  assert.deepEqual(
    {
      ...secondResponse.body,
      requestStats: validResponse.body.requestStats,
    },
    validResponse.body,
  );
  assert.deepEqual(secondResponse.body.requestStats, {
    lolalyticsLiveAccessCount: 0,
    lolalyticsLifetimeAccessCount: 7,
  });
  assert.equal(mockServer.countRequests("/mega/"), 5);
  assert.equal(mockServer.countRequests("/lol/jinx/build/q-data.json"), 1);
  assert.equal(mockServer.countRequests("/lol/lux/build/q-data.json"), 1);
});

test("POST /draft-outlook rejects projections that have no usable win-rate inputs", async (t) => {
  const allySynergyRowsByChampionSlug = {
    darius: {
      jungle: [[59, null, 0, 10]],
      middle: [[103, null, 0, 10]],
      bottom: [[21, null, 0, 10]],
      support: [[89, null, 0, 10]],
    },
    jarvaniv: {
      top: [[122, null, 0, 10]],
      middle: [[103, null, 0, 10]],
      bottom: [[21, null, 0, 10]],
      support: [[89, null, 0, 10]],
    },
    ahri: {
      top: [[122, null, 0, 10]],
      jungle: [[59, null, 0, 10]],
      bottom: [[21, null, 0, 10]],
      support: [[89, null, 0, 10]],
    },
    missfortune: {
      top: [[122, null, 0, 10]],
      jungle: [[59, null, 0, 10]],
      middle: [[103, null, 0, 10]],
      support: [[89, null, 0, 10]],
    },
    leona: {
      top: [[122, null, 0, 10]],
      jungle: [[59, null, 0, 10]],
      middle: [[103, null, 0, 10]],
      bottom: [[21, null, 0, 10]],
    },
  };
  const enemyCounterRows = {
    top: [[122, null, 7]],
    jungle: [[59, null, 7]],
    middle: [[103, null, 7]],
    bottom: [[21, null, 7]],
    support: [[89, null, 7]],
  };
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/mega/") {
      return jsonResponse({
        team: allySynergyRowsByChampionSlug[url.searchParams.get("c")] || {},
      });
    }

    if (url.pathname === "/lol/jinx/build/q-data.json") {
      return jsonResponse(createRoleBuildQData(enemyCounterRows));
    }

    return textResponse("Not found.", 404);
  });

  const response = await postJson(baseUrl, "/draft-outlook", {
    rankFilter: "emerald_plus",
    allies: [
      { champion: "Darius", role: "top" },
      { champion: "Jarvan IV", role: "jungle" },
      { champion: "Ahri", role: "mid" },
      { champion: "Miss Fortune", role: "bot" },
      { champion: "Leona", role: "support" },
    ],
    enemies: ["Jinx"],
  });

  assert.equal(response.status, 502);
  assert.equal(
    response.body.error,
    "No projected draft win-rate data was returned from Lolalytics for the selected team compositions.",
  );
  assert.deepEqual(response.body.summary, {
    allyCount: 5,
    enemyCount: 1,
    synergyMatchupCount: 20,
    counterMatchupCount: 5,
    sourceMatchups: 25,
    projectedWinRateMatchupCount: 0,
    partialFailures: [],
  });
  assert.deepEqual(response.body.requestStats, {
    lolalyticsLiveAccessCount: 6,
    lolalyticsLifetimeAccessCount: 6,
  });
  assert.equal(mockServer.countRequests("/mega/"), 5);
  assert.equal(mockServer.countRequests("/lol/jinx/build/q-data.json"), 1);
});

test("POST /build-suggestions returns partial data and caches identical drafts across enemy order", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/lol/ahri/vs/leona/build/q-data.json") {
      return jsonResponse(
        createMatchupBuildQData({
          allyChampionKey: "103",
          enemyChampionKey: "89",
          role: "middle",
          enemyRole: "support",
          totalGames: 60,
          winRate: 55,
        }),
      );
    }

    if (url.pathname === "/lol/ahri/vs/jinx/build/q-data.json") {
      return textResponse("Service unavailable.", 503);
    }

    return textResponse("Not found.", 404);
  });

  const firstResponse = await postJson(baseUrl, "/build-suggestions", {
    rankFilter: "emerald_plus",
    ally: {
      champion: "Ahri",
      role: "mid",
    },
    enemies: ["Leona", "Jinx"],
  });

  assert.equal(firstResponse.status, 200);
  assert.deepEqual(firstResponse.body.request, {
    ally: {
      champion: "Ahri",
      championKey: "103",
      role: "middle",
    },
    enemies: ["Leona", "Jinx"],
    rankFilter: "emerald_plus",
  });
  assert.equal(firstResponse.body.summary.enemyCount, 2);
  assert.equal(firstResponse.body.summary.sourceMatchups, 1);
  assert.equal(firstResponse.body.summary.partialFailures.length, 1);
  assert.match(
    firstResponse.body.summary.partialFailures[0],
    /Jinx: .*ahri vs jinx middle build q-data .*status 503/i,
  );
  assert.equal(firstResponse.body.runes.overview.slotGroups.length > 0, true);
  assert.equal(
    firstResponse.body.runes.mostPickedPage.pageKey,
    "priStyle=8000|pri=8008-9111-9103-8014|secStyle=8300|sec=8304-8347|mods=5005-5008-5011",
  );
  assert.deepEqual(firstResponse.body.spells.mostPickedSet.spellIds, [4, 12]);
  assert.deepEqual(firstResponse.body.spells.highestWinSet.spellIds, [4, 14]);
  assert.deepEqual(firstResponse.body.boots.options.map((option) => ({
    itemId: option.itemId,
    isHighestWin: option.isHighestWin,
    isMostPicked: option.isMostPicked,
  })), [
    {
      itemId: 3006,
      isHighestWin: true,
      isMostPicked: true,
    },
  ]);
  assert.deepEqual(
    firstResponse.body.items.mostPickedBuild.selections.map((selection) => selection.itemId),
    [3118, 3157, 3089, 3135, 4645],
  );

  const secondResponse = await postJson(baseUrl, "/build-suggestions", {
    rankFilter: "emerald_plus",
    ally: {
      champion: "Ahri",
      role: "mid",
    },
    enemies: ["Jinx", "Leona"],
  });

  assert.equal(secondResponse.status, 200);
  assert.deepEqual(secondResponse.body, firstResponse.body);
  assert.equal(mockServer.countRequests("/lol/ahri/vs/leona/build/q-data.json"), 1);
  assert.equal(mockServer.countRequests("/lol/ahri/vs/jinx/build/q-data.json"), 1);
});

test("POST /build-suggestions returns generic build data when no enemy is selected", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/lol/ahri/build/q-data.json") {
      return jsonResponse(
        createGenericBuildQData({
          allyChampionKey: "103",
          role: "middle",
          totalGames: 75,
          winRate: 54,
        }),
      );
    }

    return textResponse("Not found.", 404);
  });

  const firstResponse = await postJson(baseUrl, "/build-suggestions", {
    rankFilter: "emerald_plus",
    ally: {
      champion: "Ahri",
      role: "mid",
    },
    enemies: [],
  });

  assert.equal(firstResponse.status, 200);
  assert.deepEqual(firstResponse.body.request, {
    ally: {
      champion: "Ahri",
      championKey: "103",
      role: "middle",
    },
    enemies: [],
    rankFilter: "emerald_plus",
  });
  assert.deepEqual(firstResponse.body.summary, {
    enemyCount: 0,
    sourceMatchups: 1,
    lastUpdatedAt: firstResponse.body.summary.lastUpdatedAt,
    partialFailures: [],
  });
  assert.equal(Number.isFinite(Date.parse(firstResponse.body.summary.lastUpdatedAt)), true);
  assert.equal(firstResponse.body.runes.overview.slotGroups.length > 0, true);
  assert.equal(
    firstResponse.body.runes.mostPickedPage.pageKey,
    "priStyle=8000|pri=8008-9111-9103-8014|secStyle=8300|sec=8304-8347|mods=5005-5008-5011",
  );
  assert.deepEqual(firstResponse.body.spells.mostPickedSet.spellIds, [4, 12]);
  assert.deepEqual(firstResponse.body.spells.highestWinSet.spellIds, [4, 14]);
  assert.deepEqual(
    firstResponse.body.items.mostPickedBuild.selections.map((selection) => selection.itemId),
    [3118, 3157, 3089, 3135, 4645],
  );
  assert.deepEqual(firstResponse.body.boots.options.map((option) => option.itemId), [3006]);

  const secondResponse = await postJson(baseUrl, "/build-suggestions", {
    rankFilter: "emerald_plus",
    ally: {
      champion: "Ahri",
      role: "mid",
    },
    enemies: [],
  });

  assert.equal(secondResponse.status, 200);
  assert.deepEqual(secondResponse.body, firstResponse.body);
  assert.equal(
    mockServer.countRequests(
      (entry) =>
        entry.pathname === "/lol/ahri/build/q-data.json" &&
        /(?:^|&)lane=middle(?:&|$)/.test(entry.search.slice(1)),
    ),
    1,
  );
});

test("POST /build-suggestions returns a 502 summary when every matchup fetch fails", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/lol/ahri/vs/leona/build/q-data.json") {
      return textResponse("Service unavailable.", 503);
    }

    if (url.pathname === "/lol/ahri/vs/jinx/build/q-data.json") {
      return textResponse("Gateway timeout.", 504);
    }

    return textResponse("Not found.", 404);
  });

  const response = await postJson(baseUrl, "/build-suggestions", {
    rankFilter: "emerald_plus",
    ally: {
      champion: "Ahri",
      role: "mid",
    },
    enemies: ["Leona", "Jinx"],
  });

  assert.equal(response.status, 502);
  assert.equal(
    response.body.error,
    "No build recommendation data was returned from Lolalytics for the selected ally, role, and enemies.",
  );
  assert.equal(response.body.summary.enemyCount, 2);
  assert.equal(response.body.summary.sourceMatchups, 0);
  assert.equal(Number.isFinite(Date.parse(response.body.summary.lastUpdatedAt)), true);
  assert.equal(response.body.summary.partialFailures.length, 2);
  assert.match(
    response.body.summary.partialFailures[0],
    /Leona: .*ahri vs leona middle build q-data .*status 503/i,
  );
  assert.match(
    response.body.summary.partialFailures[1],
    /Jinx: .*ahri vs jinx middle build q-data .*status 504/i,
  );
  assert.equal(mockServer.countRequests("/lol/ahri/vs/leona/build/q-data.json"), 1);
  assert.equal(mockServer.countRequests("/lol/ahri/vs/jinx/build/q-data.json"), 1);
});
