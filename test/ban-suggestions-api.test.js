const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createCounterMegaData,
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
    await Promise.all([stopServerProcess(child), mockServer.close()]);
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    mockServer,
  };
}

async function postJson(baseUrl, payload) {
  const response = await fetch(`${baseUrl}/ban-suggestions`, {
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

const tierRowsByLane = {
  top: [
    { championKey: "54", lanePercent: 94, winRate: 53, pickRate: 8, banRate: 1 },
  ],
  jungle: [
    { championKey: "64", lanePercent: 95, winRate: 53, pickRate: 9, banRate: 1 },
  ],
  middle: [
    { championKey: "34", lanePercent: 91, winRate: 51, pickRate: 4, banRate: 1 },
    { championKey: "238", lanePercent: 96, winRate: 54, pickRate: 10, banRate: 2 },
  ],
  bottom: [
    { championKey: "222", lanePercent: 99, winRate: 53, pickRate: 10, banRate: 2 },
  ],
  support: [
    { championKey: "89", lanePercent: 98, winRate: 53, pickRate: 8, banRate: 2 },
  ],
};

test("POST /ban-suggestions returns one lane result, uses hover counters, and deduplicates data", async (t) => {
  const { baseUrl, mockServer } = await startServerWithMock(t, ({ url }) => {
    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "tier") {
      const lane = url.searchParams.get("lane");
      return jsonResponse(
        createTierMegaData(lane, tierRowsByLane[lane] || [], { avgWinRate: 50 }),
      );
    }

    if (url.pathname === "/mega/" && url.searchParams.get("ep") === "counter") {
      const hoveredChampion = url.searchParams.get("c");
      const rows =
        hoveredChampion === "lux"
          ? [
              { championKey: "34", role: "middle", enemyWinRate: 49, delta2Score: -1 },
              { championKey: "238", role: "middle", enemyWinRate: 42, delta2Score: -8 },
            ]
          : [
              { championKey: "34", role: "middle", enemyWinRate: 43, delta2Score: -7 },
              { championKey: "238", role: "middle", enemyWinRate: 49, delta2Score: -1 },
            ];
      return jsonResponse(createCounterMegaData(rows));
    }

    return textResponse("Not found.", 404);
  });

  const first = await postJson(baseUrl, {
    rankFilter: "emerald_plus",
    hovers: [{ champion: "Ahri", role: "mid" }],
  });

  assert.equal(first.status, 200);
  assert.deepEqual(first.body.roles, ["top", "jungle", "middle", "bottom", "support"]);
  assert.equal(first.body.suggestions.length, 5);
  assert.equal(new Set(first.body.suggestions.map((suggestion) => suggestion.role)).size, 5);
  assert.deepEqual(
    first.body.suggestions.find((suggestion) => suggestion.role === "middle"),
    {
      role: "middle",
      champion: "Anivia",
      championKey: "34",
      icon: "https://cdn5.lolalytics.com/champ140/anivia.webp",
      strategy: "counter",
      hoveredChampion: "Ahri",
      hoveredChampionKey: "103",
      pbi: null,
      winRate: 51,
      projectedWinRate: 57,
      counterScore: 7,
    },
  );
  assert.equal(
    first.body.suggestions.find((suggestion) => suggestion.role === "top").strategy,
    "pbi",
  );
  assert.equal(mockServer.countRequests("/mega/"), 6);

  const repeated = await postJson(baseUrl, {
    rankFilter: "emerald_plus",
    hovers: [{ champion: "Ahri", role: "middle" }],
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.requestStats.lolalyticsLiveAccessCount, 0);
  assert.equal(mockServer.countRequests("/mega/"), 6);

  const changed = await postJson(baseUrl, {
    rankFilter: "emerald_plus",
    hovers: [{ champion: "Lux", role: "middle" }],
  });
  assert.equal(changed.status, 200);
  assert.equal(
    changed.body.suggestions.find((suggestion) => suggestion.role === "middle").champion,
    "Zed",
  );
  assert.equal(mockServer.countRequests("/mega/"), 7);

  const removed = await postJson(baseUrl, {
    rankFilter: "emerald_plus",
    hovers: [],
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.summary.counterSuggestionCount, 0);
  assert.equal(removed.body.summary.fallbackSuggestionCount, 5);
  assert.equal(mockServer.countRequests("/mega/"), 7);

  const invalid = await postJson(baseUrl, {
    rankFilter: "emerald_plus",
    hovers: [
      { champion: "Unknown", role: "middle" },
      { champion: "Ahri", role: "invalid" },
    ],
  });
  assert.equal(invalid.status, 200);
  assert.equal(invalid.body.summary.fallbackSuggestionCount, 5);
  assert.equal(mockServer.countRequests("/mega/"), 7);
});
