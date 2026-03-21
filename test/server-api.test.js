const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  buildTierListHtml,
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
  });
  assert.equal(mockServer.countRequests("/lol/tierlist/"), 1);
  assert.equal(mockServer.countRequests("/mega/"), 1);
  assert.equal(mockServer.countRequests("/lol/leona/build/q-data.json"), 1);
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
  });
  assert.equal(mockServer.countRequests("/lol/tierlist/"), 2);
  assert.equal(mockServer.countRequests("/mega/"), 2);
  assert.equal(mockServer.countRequests("/lol/leona/build/q-data.json"), 1);
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
