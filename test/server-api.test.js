const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createCounterMegaData,
  createRenderedBuildPageHtml,
  createRuneBuildMegaData,
  createTierMegaData,
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

function assertBuildSuggestionSectionsArePopulated(payload) {
  assert.equal(payload.runes.overview.slotGroups.length > 0, true);
  assert.ok(payload.runes.mostPickedPage);
  assert.ok(payload.runes.highestWinPage);
  assert.ok(payload.spells.mostPickedSet);
  assert.ok(payload.spells.highestWinSet);
  assert.ok(payload.startingItems.mostPickedSet);
  assert.ok(payload.startingItems.highestWinSet);
  assert.ok(payload.skillPriority.mostPickedSkill);
  assert.ok(payload.skillPriority.highestWinSkill);
  assert.ok(payload.boots.options.length > 0);
  assert.equal(payload.items.mostPickedBuild.selections.length, 5);
  assert.equal(payload.items.highestWinBuild.selections.length, 5);
}

test("POST /suggest returns first-pick tier lists for an empty draft", async (t) => {
  const rowsByLane = {
    top: [
      {
        championKey: "122",
        lanePercent: 91.2,
        winRate: 52,
        pickRate: 5,
        banRate: 0,
      },
    ],
    jungle: [
      {
        championKey: "64",
        lanePercent: 95.9,
        winRate: 52.1,
        pickRate: 7,
        banRate: 0,
      },
    ],
    middle: [
      {
        championKey: "103",
        lanePercent: 96.7,
        winRate: 52.2,
        pickRate: 8,
        banRate: 0,
      },
    ],
    bottom: [
      {
        championKey: "222",
        lanePercent: 99.7,
        winRate: 52.3,
        pickRate: 9,
        banRate: 0,
      },
    ],
    support: [
      {
        championKey: "412",
        lanePercent: 99.6,
        winRate: 53.5,
        pickRate: 13.29,
        banRate: 7.54,
      },
      {
        championKey: "432",
        lanePercent: 99.6,
        winRate: 52.3,
        pickRate: 7,
        banRate: 0,
      },
    ],
  };
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "tier") {
      const lane = url.searchParams.get("lane");
      return jsonResponse(
        createTierMegaData(lane, rowsByLane[lane] || [], {
          avgWinRate: 51.81,
        }),
      );
    }

    return textResponse("Not found.", 404);
  });

  const response = await postJson(baseUrl, "/suggest", {});

  assert.equal(response.status, 200);
  assert.equal(response.body.mode, "firstPick");
  assert.deepEqual(response.body.roles, ["top", "jungle", "middle", "bottom", "support"]);
  assert.deepEqual(response.body.resultsByRole.support, [
    {
      candidate: "Thresh",
      candidateKey: "412",
      support: "Thresh",
      supportKey: "412",
      icon: "https://cdn5.lolalytics.com/champ140/thresh.webp",
      role: "support",
      pbi: 24,
      winRate: 53.5,
      lanePercent: 99.6,
      pickRate: 13.29,
    },
    {
      candidate: "Bard",
      candidateKey: "432",
      support: "Bard",
      supportKey: "432",
      icon: "https://cdn5.lolalytics.com/champ140/bard.webp",
      role: "support",
      pbi: 3,
      winRate: 52.3,
      lanePercent: 99.6,
      pickRate: 7,
    },
  ]);
  assert.deepEqual(response.body.metaByRole.support, {
    rankFilter: "emerald_plus",
    role: "support",
    allyCount: 0,
    enemyCount: 0,
    assignedRoleCount: 0,
    resultMode: "firstPick",
    partialFailures: [],
  });
  assert.deepEqual(response.body.requestStats, {
    lolalyticsLiveAccessCount: 5,
    lolalyticsLifetimeAccessCount: 5,
  });
  assert.equal(mockServer.countRequests("/mega/"), 5);
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
    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "tier") {
      return jsonResponse(
        createTierMegaData("support", [
          {
            championKey: "111",
            lanePercent: 82.1,
            winRate: 51.1,
            pickRate: 4.4,
            topWinRate: 55.35,
          },
          {
            championKey: "412",
            lanePercent: 80.4,
            winRate: 50.1,
            pickRate: 3.2,
            topWinRate: 53.6,
          },
        ]),
      );
    }

    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "build-team") {
      return jsonResponse({
        team: {
          support: [
            [111, 53, 0, 60],
            [412, 47, 0, 40],
          ],
        },
      });
    }

    if (
      url.pathname === "/mega/" &&
      url.searchParams.get("ep") === "counter" &&
      url.searchParams.get("vslane") === "support"
    ) {
      return jsonResponse(
        createCounterMegaData([
          {
            championKey: "111",
            role: "middle",
            enemyWinRate: 47,
            delta1Score: -999,
            delta2Score: 48,
          },
          {
            championKey: "412",
            role: "middle",
            enemyWinRate: 53,
            delta1Score: 999,
            delta2Score: -48,
          },
        ]),
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
      projectedAgency: 12,
      bestWorldwideWinRateDelta: 4.25,
      projectedWinRateLowSkill: 48.75,
      projectedWinRateHighSkill: 57.25,
      finalScore: 12,
      lanePercent: 82.1,
      pickRate: 4.4,
      winRate: 51.1,
    },
    {
      candidate: "Thresh",
      candidateKey: "412",
      support: "Thresh",
      supportKey: "412",
      icon: "https://cdn5.lolalytics.com/champ140/thresh.webp",
      role: "support",
      synergyScore: 40,
      counterScore: 48,
      projectedWinRate: 47,
      projectedAgency: 88,
      bestWorldwideWinRateDelta: 3.5,
      projectedWinRateLowSkill: 43.5,
      projectedWinRateHighSkill: 50.5,
      finalScore: 88,
      lanePercent: 80.4,
      pickRate: 3.2,
      winRate: 50.1,
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
  assert.equal(mockServer.countRequests("/mega/"), 3);
  assert.equal(
    mockServer.countRequests((entry) => entry.pathname === "/mega/" && entry.search.includes("ep=tier")),
    1,
  );
  assert.equal(
    mockServer.countRequests((entry) => entry.pathname === "/mega/" && entry.search.includes("ep=counter")),
    1,
  );
  assert.equal(
    mockServer.countRequests(
      (entry) =>
        entry.pathname === "/mega/" &&
        new URLSearchParams(entry.search).get("ep") === "counter" &&
        new URLSearchParams(entry.search).get("vslane") === "support",
    ),
    1,
  );
});

test("GET /ally-role-likelihoods returns per-champion lane shares and reuses the cache", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname !== "/mega/" || url.searchParams.get("ep") !== "tier") {
      return textResponse("Not found.", 404);
    }

    const lane = url.searchParams.get("lane");
    const rowsByLane = {
      top: [
        {
          championKey: "266",
          lanePercent: 91.2,
          winRate: 50.8,
          pickRate: 8.4,
        },
        {
          championKey: "103",
          lanePercent: 6.1,
          winRate: 47.3,
          pickRate: 0.3,
        },
      ],
      jungle: [
        {
          championKey: "103",
          lanePercent: 9.6,
          winRate: 48.1,
          pickRate: 0.7,
        },
      ],
      middle: [
        {
          championKey: "103",
          lanePercent: 83.4,
          winRate: 51.9,
          pickRate: 9.9,
        },
      ],
      bottom: [
        {
          championKey: "103",
          lanePercent: 1.7,
          winRate: 45.5,
          pickRate: 0.1,
        },
      ],
      support: [
        {
          championKey: "103",
          lanePercent: 4.2,
          winRate: 48.7,
          pickRate: 0.4,
        },
      ],
    };

    return jsonResponse(createTierMegaData(lane, rowsByLane[lane] || []));
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
  assert.equal(mockServer.countRequests("/mega/"), 5);

  const secondResponse = await getJson(baseUrl, "/ally-role-likelihoods?rankFilter=emerald_plus");

  assert.equal(secondResponse.status, 200);
  assert.deepEqual(secondResponse.body.requestStats, {
    lolalyticsLiveAccessCount: 0,
    lolalyticsLifetimeAccessCount: 5,
  });
  assert.equal(mockServer.countRequests("/mega/"), 5);
});

test("POST /suggest preserves the lifetime Lolalytics hit count across later zero-hit requests", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "tier") {
      return jsonResponse(
        createTierMegaData("support", [
          {
            championKey: "111",
            lanePercent: 82.1,
            winRate: 51.1,
            pickRate: 4.4,
          },
        ]),
      );
    }

    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "build-team") {
      return jsonResponse({
        team: {
          support: [[111, 53, 0, 60]],
        },
      });
    }

    if (
      url.pathname === "/mega/" &&
      url.searchParams.get("ep") === "counter" &&
      url.searchParams.get("vslane") === "support"
    ) {
      return jsonResponse(
        createCounterMegaData([
          {
            championKey: "111",
            role: "support",
            enemyWinRate: 47,
            delta2Score: 48,
          },
        ]),
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

  const fullyAssignedDraftResponse = await postJson(baseUrl, "/suggest", {
    allies: [
      { champion: "Darius", role: "top" },
      { champion: "Jarvan IV", role: "jungle" },
      { champion: "Ahri", role: "mid" },
      { champion: "Miss Fortune", role: "bot" },
      { champion: "Leona", role: "support" },
    ],
  });

  assert.equal(fullyAssignedDraftResponse.status, 400);
  assert.deepEqual(fullyAssignedDraftResponse.body.requestStats, {
    lolalyticsLiveAccessCount: 0,
    lolalyticsLifetimeAccessCount: 3,
  });
  assert.equal(mockServer.countRequests(), 3);
});

test("POST /suggest preserves per-role failures while deduplicating shared upstream requests", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (
      url.pathname === "/mega/" &&
      url.searchParams.get("ep") === "tier" &&
      url.searchParams.get("lane") === "support"
    ) {
      return jsonResponse(
        createTierMegaData("support", [
          {
            championKey: "111",
            lanePercent: 82.1,
            winRate: 51.1,
            pickRate: 4.4,
          },
        ]),
      );
    }

    if (
      url.pathname === "/mega/" &&
      url.searchParams.get("ep") === "tier" &&
      url.searchParams.get("lane") === "bottom"
    ) {
      return jsonResponse(createTierMegaData("bottom", []));
    }

    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "build-team") {
      return jsonResponse({
        team: {
          support: [[111, 53, 0, 60]],
        },
      });
    }

    if (
      url.pathname === "/mega/" &&
      url.searchParams.get("ep") === "counter" &&
      url.searchParams.get("c") === "leona" &&
      ["support", "bottom"].includes(url.searchParams.get("vslane"))
    ) {
      return jsonResponse(
        createCounterMegaData([
          {
            championKey: "111",
            role: "support",
            enemyWinRate: 47,
            delta2Score: 48,
          },
        ]),
      );
    }

    if (
      url.pathname === "/mega/" &&
      url.searchParams.get("ep") === "counter" &&
      url.searchParams.get("c") === "jinx" &&
      ["support", "bottom"].includes(url.searchParams.get("vslane"))
    ) {
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
      projectedAgency: 12,
      finalScore: 12,
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
    /jinx support counter data .*status 503/i,
  );
  assert.equal(
    response.body.metaByRole.bottom.error,
    "Lolalytics bot tier data was missing champion rows.",
  );
  assert.deepEqual(response.body.requestStats, {
    lolalyticsLiveAccessCount: 5,
    lolalyticsLifetimeAccessCount: 5,
  });
  assert.equal(mockServer.countRequests("/mega/"), 5);
  assert.equal(
    mockServer.countRequests((entry) => entry.pathname === "/mega/" && entry.search.includes("ep=tier")),
    2,
  );
  assert.equal(
    mockServer.countRequests(
      (entry) => entry.pathname === "/mega/" && entry.search.includes("ep=build-team"),
    ),
    1,
  );
  assert.equal(
    mockServer.countRequests((entry) => entry.pathname === "/mega/" && entry.search.includes("ep=counter")),
    2,
  );
  assert.equal(
    mockServer.countRequests(
      (entry) =>
        entry.pathname === "/mega/" &&
        new URLSearchParams(entry.search).get("ep") === "counter" &&
        ["support", "bottom"].includes(new URLSearchParams(entry.search).get("vslane")),
    ),
    2,
  );
  assert.equal(
    mockServer.countRequests(
      (entry) =>
        entry.pathname === "/mega/" &&
        new URLSearchParams(entry.search).get("ep") === "counter" &&
        new URLSearchParams(entry.search).get("vslane") === "support",
    ),
    2,
  );
  assert.equal(
    mockServer.countRequests(
      (entry) =>
        entry.pathname === "/mega/" &&
        new URLSearchParams(entry.search).get("ep") === "counter" &&
        new URLSearchParams(entry.search).get("vslane") === "bottom",
    ),
    0,
  );
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
  const enemyCounterRows = [
    { championKey: "122", role: "top", enemyWinRate: 46, delta2Score: 7 },
    { championKey: "59", role: "jungle", enemyWinRate: 46, delta2Score: 7 },
    { championKey: "103", role: "middle", enemyWinRate: 46, delta2Score: 7 },
    { championKey: "21", role: "bottom", enemyWinRate: 46, delta2Score: 7 },
    { championKey: "89", role: "support", enemyWinRate: 46, delta2Score: 7 },
  ];
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "build-team") {
      return jsonResponse({
        team: allySynergyRowsByChampionSlug[url.searchParams.get("c")] || {},
      });
    }

    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "counter") {
      return jsonResponse(createCounterMegaData(enemyCounterRows));
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
  assert.equal(validResponse.body.projection.projectedAgency, 3);
  assert.deepEqual(validResponse.body.requestStats, {
    lolalyticsLiveAccessCount: 7,
    lolalyticsLifetimeAccessCount: 7,
  });
  assert.equal(mockServer.countRequests("/mega/"), 7);
  assert.equal(
    mockServer.countRequests((entry) => entry.pathname === "/mega/" && entry.search.includes("ep=build-team")),
    5,
  );
  assert.equal(
    mockServer.countRequests((entry) => entry.pathname === "/mega/" && entry.search.includes("ep=counter")),
    2,
  );

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
  assert.equal(mockServer.countRequests("/mega/"), 7);
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
  const enemyCounterRows = [
    { championKey: "122", role: "top", enemyWinRate: null, delta2Score: 7 },
    { championKey: "59", role: "jungle", enemyWinRate: null, delta2Score: 7 },
    { championKey: "103", role: "middle", enemyWinRate: null, delta2Score: 7 },
    { championKey: "21", role: "bottom", enemyWinRate: null, delta2Score: 7 },
    { championKey: "89", role: "support", enemyWinRate: null, delta2Score: 7 },
  ];
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "build-team") {
      return jsonResponse({
        team: allySynergyRowsByChampionSlug[url.searchParams.get("c")] || {},
      });
    }

    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "counter") {
      return jsonResponse(createCounterMegaData(enemyCounterRows));
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
  assert.equal(mockServer.countRequests("/mega/"), 6);
});

test("POST /build-suggestions aggregates a full enemy team and caches identical drafts across enemy order", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (
      url.pathname === "/mega/" &&
      url.searchParams.get("ep") === "rune" &&
      ["leona", "sion", "vi", "neeko"].includes(url.searchParams.get("vs"))
    ) {
      return jsonResponse(
        createRuneBuildMegaData({
          role: "middle",
          totalGames: 60,
          pickWinRate: 55,
        }),
      );
    }

    if (
      url.pathname === "/mega/" &&
      url.searchParams.get("ep") === "rune" &&
      url.searchParams.get("vs") === "jinx"
    ) {
      return textResponse("Service unavailable.", 503);
    }

    if (url.pathname.startsWith("/lol/ahri/vs/") && url.pathname.endsWith("/build/")) {
      return textResponse(createRenderedBuildPageHtml({ splitStats: true }));
    }

    return textResponse("Not found.", 404);
  });

  const firstResponse = await postJson(baseUrl, "/build-suggestions", {
    rankFilter: "emerald_plus",
    ally: {
      champion: "Ahri",
      role: "mid",
    },
    enemies: ["Leona", "Jinx", "Sion", "Vi", "Neeko"],
  });

  assert.equal(firstResponse.status, 200);
  assert.deepEqual(firstResponse.body.request, {
    ally: {
      champion: "Ahri",
      championKey: "103",
      role: "middle",
    },
    enemies: ["Leona", "Jinx", "Sion", "Vi", "Neeko"],
    rankFilter: "emerald_plus",
  });
  assert.equal(firstResponse.body.summary.enemyCount, 5);
  assert.equal(firstResponse.body.summary.sourceMatchups, 4);
  assert.equal(firstResponse.body.summary.partialFailures.length, 1);
  assert.match(
    firstResponse.body.summary.partialFailures[0],
    /Jinx: .*Ahri vs Jinx middle rune build data .*status 503/i,
  );
  assertBuildSuggestionSectionsArePopulated(firstResponse.body);
  assert.equal(
    firstResponse.body.runes.mostPickedPage.pageKey,
    "priStyle=8000|pri=8008-9111-9103-8014|secStyle=8300|sec=8304-8347|mods=5005-5008-5011",
  );
  assert.deepEqual(firstResponse.body.spells.mostPickedSet.spellIds, [4, 14]);
  assert.deepEqual(firstResponse.body.spells.highestWinSet.spellIds, [4, 14]);
  assert.deepEqual(firstResponse.body.startingItems.mostPickedSet.itemIds, [1056, 2003]);
  assert.deepEqual(firstResponse.body.startingItems.highestWinSet.itemIds, [1082, 2031]);
  assert.equal(firstResponse.body.skillPriority.mostPickedSkill.abilityKey, "Q");
  assert.equal(firstResponse.body.skillPriority.highestWinSkill.abilityKey, "Q");
  assert.deepEqual(
    firstResponse.body.items.mostPickedBuild.selections.map((selection) => selection.itemId),
    [2510, 3115, 3089, 4645, 3135],
  );
  assert.deepEqual(
    firstResponse.body.items.highestWinBuild.selections.map((selection) => selection.itemId),
    [2510, 3115, 3089, 4645, 3135],
  );
  assert.deepEqual(
    firstResponse.body.boots.options.map((option) => option.itemId),
    [3170],
  );
  assert.deepEqual(firstResponse.body.requestStats, {
    lolalyticsLiveAccessCount: 10,
    lolalyticsLifetimeAccessCount: 10,
  });

  const secondResponse = await postJson(baseUrl, "/build-suggestions", {
    rankFilter: "emerald_plus",
    ally: {
      champion: "Ahri",
      role: "mid",
    },
    enemies: ["Neeko", "Vi", "Sion", "Jinx", "Leona"],
  });

  assert.equal(secondResponse.status, 200);
  assert.deepEqual(
    {
      ...secondResponse.body,
      requestStats: firstResponse.body.requestStats,
    },
    firstResponse.body,
  );
  assert.deepEqual(secondResponse.body.requestStats, {
    lolalyticsLiveAccessCount: 0,
    lolalyticsLifetimeAccessCount: 10,
  });
  assert.equal(mockServer.countRequests("/mega/"), 5);
  assert.equal(
    mockServer.countRequests((entry) => entry.pathname === "/mega/" && entry.search.includes("ep=rune")),
    5,
  );
  assert.equal(
    mockServer.countRequests(
      (entry) =>
        entry.pathname === "/mega/" &&
        new URLSearchParams(entry.search).get("ep") === "rune" &&
        new URLSearchParams(entry.search).get("tier") === "emerald_plus",
    ),
    5,
  );
  assert.equal(
    mockServer.countRequests((entry) => entry.pathname.startsWith("/lol/ahri/vs/")),
    5,
  );
  assert.equal(
    mockServer.countRequests(
      (entry) =>
        entry.pathname.startsWith("/lol/ahri/vs/") &&
        new URLSearchParams(entry.search).get("tier") === "emerald_plus" &&
        new URLSearchParams(entry.search).get("lane") === "middle" &&
        new URLSearchParams(entry.search).get("patch") === "7",
    ),
    5,
  );
});

test("POST /build-suggestions accepts partial enemy teams", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "rune") {
      return jsonResponse(
        createRuneBuildMegaData({
          role: "middle",
          totalGames: 75,
          pickWinRate: 54,
        }),
      );
    }

    if (url.pathname.startsWith("/lol/ahri/vs/") && url.pathname.endsWith("/build/")) {
      return textResponse(createRenderedBuildPageHtml({ splitStats: true }));
    }

    return textResponse("Not found.", 404);
  });

  const response = await postJson(baseUrl, "/build-suggestions", {
    rankFilter: "emerald_plus",
    ally: {
      champion: "Ahri",
      role: "mid",
    },
    enemies: ["Leona"],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.summary.enemyCount, 1);
  assert.equal(response.body.summary.sourceMatchups, 1);
  assertBuildSuggestionSectionsArePopulated(response.body);
  assert.deepEqual(response.body.requestStats, {
    lolalyticsLiveAccessCount: 2,
    lolalyticsLifetimeAccessCount: 2,
  });
  assert.equal(mockServer.countRequests("/mega/"), 1);
  assert.equal(
    mockServer.countRequests((entry) => entry.pathname.startsWith("/lol/ahri/vs/")),
    1,
  );
});

test("POST /build-suggestions rejects missing enemies before upstream fetches", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, () => {
    return textResponse("Not found.", 404);
  });

  const response = await postJson(baseUrl, "/build-suggestions", {
    rankFilter: "emerald_plus",
    ally: {
      champion: "Ahri",
      role: "mid",
    },
    enemies: [],
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /at least 1 enemy champion/i);
  assert.equal(mockServer.countRequests(), 0);
});

test("POST /build-suggestions rejects rune-only data when rendered build pages are blocked", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "rune") {
      return jsonResponse(
        createRuneBuildMegaData({
          role: "middle",
          totalGames: 75,
          pickWinRate: 54,
        }),
      );
    }

    if (url.pathname.startsWith("/lol/ahri/vs/") && url.pathname.endsWith("/build/")) {
      return textResponse("Just a moment...", 403);
    }

    return textResponse("Not found.", 404);
  });

  const response = await postJson(baseUrl, "/build-suggestions", {
    rankFilter: "emerald_plus",
    ally: {
      champion: "Ahri",
      role: "mid",
    },
    enemies: ["Leona", "Jinx", "Sion", "Vi", "Neeko"],
  });

  assert.equal(response.status, 502);
  assert.equal(
    response.body.error,
    "Lolalytics returned build data, but it did not include usable build recommendations.",
  );
  assert.equal(response.body.summary.enemyCount, 5);
  assert.equal(response.body.summary.sourceMatchups, 5);
  assert.deepEqual(response.body.requestStats, {
    lolalyticsLiveAccessCount: 10,
    lolalyticsLifetimeAccessCount: 10,
  });
  assert.equal(mockServer.countRequests("/mega/"), 5);
  assert.equal(
    mockServer.countRequests((entry) => entry.pathname.startsWith("/lol/ahri/vs/")),
    5,
  );
});

test("POST /build-suggestions returns a 502 summary when every rune build fetch fails", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (
      url.pathname === "/mega/" &&
      url.searchParams.get("ep") === "rune" &&
      url.searchParams.get("vs") === "leona"
    ) {
      return textResponse("Service unavailable.", 503);
    }

    if (
      url.pathname === "/mega/" &&
      url.searchParams.get("ep") === "rune" &&
      ["jinx", "sion", "vi", "neeko"].includes(url.searchParams.get("vs"))
    ) {
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
    enemies: ["Leona", "Jinx", "Sion", "Vi", "Neeko"],
  });

  assert.equal(response.status, 502);
  assert.equal(
    response.body.error,
    "No build recommendation data was returned from Lolalytics for the selected ally, role, and enemies.",
  );
  assert.equal(response.body.summary.enemyCount, 5);
  assert.equal(response.body.summary.sourceMatchups, 0);
  assert.equal(Number.isFinite(Date.parse(response.body.summary.lastUpdatedAt)), true);
  assert.equal(response.body.summary.partialFailures.length, 5);
  assert.match(
    response.body.summary.partialFailures[0],
    /Leona: .*Ahri vs Leona middle rune build data .*status 503/i,
  );
  assert.match(
    response.body.summary.partialFailures[1],
    /Jinx: .*Ahri vs Jinx middle rune build data .*status 504/i,
  );
  assert.deepEqual(response.body.requestStats, {
    lolalyticsLiveAccessCount: 10,
    lolalyticsLifetimeAccessCount: 10,
  });
  assert.equal(mockServer.countRequests("/mega/"), 5);
});

test("POST /build-suggestions isolates malformed rune payload failures", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "rune") {
      return jsonResponse({
        header: {
          n: 75,
          lane: "middle",
        },
        summary: {},
      });
    }

    return textResponse("Not found.", 404);
  });

  const response = await postJson(baseUrl, "/build-suggestions", {
    rankFilter: "emerald_plus",
    ally: {
      champion: "Ahri",
      role: "mid",
    },
    enemies: ["Leona", "Jinx", "Sion", "Vi", "Neeko"],
  });

  assert.equal(response.status, 502);
  assert.equal(
    response.body.error,
    "No build recommendation data was returned from Lolalytics for the selected ally, role, and enemies.",
  );
  assert.equal(response.body.summary.partialFailures.length, 5);
  assert.match(response.body.summary.partialFailures[0], /Ahri vs Leona rune build data could not be parsed/i);
  assert.match(response.body.summary.partialFailures[0], /missing rune summary data/i);
  assert.equal(mockServer.countRequests("/mega/"), 5);
});
