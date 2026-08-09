const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

const {
  startServer,
  stopServer,
} = require("./helpers/server-process.js");

async function postJson(baseUrl, pathname, payload) {
  return fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      connection: "close",
    },
    body: JSON.stringify(payload),
  });
}

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    cache: "no-store",
    headers: {
      connection: "close",
    },
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function startMockRiotClient(responder) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const bodyText = Buffer.concat(chunks).toString("utf8");
    requests.push({
      authorization: request.headers.authorization || "",
      bodyText,
      method: request.method,
      pathname: url.pathname,
    });

    const result = await responder({ bodyText, request, url });
    response.writeHead(result?.status || 200, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(result?.body || {}));
  });

  server.listen(0, "127.0.0.1");
  server.unref();
  await once(server, "listening");

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  if (!Number.isInteger(port)) {
    throw new Error("Failed to start the mock Riot client.");
  }

  return {
    port,
    requests,
    close: async () => {
      server.close();
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      await Promise.race([
        once(server, "close"),
        new Promise((resolve) => setTimeout(resolve, 100)),
      ]);
    },
  };
}

async function createMockLockfile(port) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pickban-lockfile-"));
  const lockfilePath = path.join(directory, "lockfile");
  await fs.writeFile(lockfilePath, `LeagueClientUx:1234:${port}:secret:http`, "utf8");
  return lockfilePath;
}

async function waitForMockRequestPaths(requests, expectedPaths, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (
    !expectedPaths.every((expectedPath) =>
      requests.some((request) => request.pathname === expectedPath),
    ) &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createRuneImportPage() {
  return {
    primaryStyle: {
      styleId: 8000,
      name: "Precision",
    },
    secondaryStyle: {
      styleId: 8200,
      name: "Sorcery",
    },
    selections: {
      primary: [
        { id: 8008, slotIndex: 0 },
        { id: 9111, slotIndex: 1 },
        { id: 9103, slotIndex: 2 },
        { id: 8014, slotIndex: 3 },
      ],
      secondary: [
        { id: 8210, slotIndex: 1 },
        { id: 8236, slotIndex: 3 },
      ],
      modifiers: [
        { id: 5008 },
        { id: 5005 },
        { id: 5001 },
      ],
    },
  };
}

test("GET /app-config returns the local app metadata", async (t) => {
  const { child, baseUrl } = await startServer(t);

  const response = await fetch(`${baseUrl}/app-config`, {
    cache: "no-store",
    headers: {
      connection: "close",
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(payload.version, /^\d+\.\d+\.\d+$/);
  assert.equal(payload.lolalyticsDataWindowDays, 30);
  assert.equal(payload.canShutdown, true);
  assert.equal(typeof payload.shutdownToken, "string");
  assert.equal(payload.shutdownToken.length, 48);
  assert.deepEqual(payload.requestStats, {
    lolalyticsLiveAccessCount: 0,
    lolalyticsLifetimeAccessCount: 0,
  });

  await stopServer(child);
});

test("GET /live-draft returns normalized League champ-select picks", async (t) => {
  const riotClient = await startMockRiotClient(({ url }) => {
    if (url.pathname === "/lol-gameflow/v1/session") {
      return {
        body: {
          phase: "ChampSelect",
          gameData: {
            queue: {
              id: 400,
            },
          },
        },
      };
    }

    if (url.pathname === "/lol-champ-select/v1/session") {
      return {
        body: {
          localPlayerCellId: 1,
          myTeam: [
            {
              cellId: 1,
              championId: 103,
              assignedPosition: "middle",
            },
          ],
          theirTeam: [
            {
              cellId: 6,
              championId: 89,
              assignedPosition: "utility",
            },
          ],
        },
      };
    }

    return {
      status: 404,
      body: {},
    };
  });
  t.after(() => riotClient.close());
  const lockfilePath = await createMockLockfile(riotClient.port);
  const { child, baseUrl } = await startServer(t, {
    env: {
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
  });

  const response = await getJson(baseUrl, "/live-draft");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "active");
  assert.equal(response.body.source, "champ_select");
  assert.equal(response.body.assignedRole, "middle");
  assert.deepEqual(response.body.queue, {
    id: 400,
    description: "Normal Draft",
    type: "normal_draft",
  });
  assert.deepEqual(response.body.allies.map(({ champion, championKey, role }) => ({
    champion,
    championKey,
    role,
  })), [
    {
      champion: "Ahri",
      championKey: "103",
      role: "middle",
    },
  ]);
  assert.deepEqual(response.body.enemies.map(({ champion, championKey, role }) => ({
    champion,
    championKey,
    role,
  })), [
    {
      champion: "Leona",
      championKey: "89",
      role: "support",
    },
  ]);
  assert.equal(
    riotClient.requests.every((request) => request.authorization.startsWith("Basic ")),
    true,
  );

  await stopServer(child);
});

test("GET /live-draft statusOnly reports active phases without reading draft or live-game details", async (t) => {
  let gameflowPhase = "InProgress";
  const riotClient = await startMockRiotClient(({ url }) => {
    if (url.pathname === "/lol-gameflow/v1/session") {
      return {
        body: {
          phase: gameflowPhase,
          gameData: {
            gameId: 987654,
            queue: {
              id: 420,
            },
          },
        },
      };
    }

    return {
      status: 500,
      body: { message: `Unexpected detail request: ${url.pathname}` },
    };
  });
  t.after(() => riotClient.close());
  const lockfilePath = await createMockLockfile(riotClient.port);
  const { child, baseUrl } = await startServer(t, {
    env: {
      PICKBAN_LIVE_CLIENT_DATA_URL: `http://127.0.0.1:${riotClient.port}`,
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
  });

  const liveResponse = await getJson(baseUrl, "/live-draft?statusOnly=1");

  assert.equal(liveResponse.status, 200);
  assert.equal(liveResponse.body.status, "active");
  assert.equal(liveResponse.body.active, true);
  assert.equal(liveResponse.body.source, "live_game");
  assert.deepEqual(
    riotClient.requests.map((request) => request.pathname),
    ["/lol-gameflow/v1/session"],
  );

  riotClient.requests.length = 0;
  gameflowPhase = "ChampSelect";
  const champSelectResponse = await getJson(baseUrl, "/live-draft?statusOnly=1");

  assert.equal(champSelectResponse.status, 200);
  assert.equal(champSelectResponse.body.status, "active");
  assert.equal(champSelectResponse.body.active, true);
  assert.equal(champSelectResponse.body.source, "champ_select");
  assert.deepEqual(
    riotClient.requests.map((request) => request.pathname),
    ["/lol-gameflow/v1/session"],
  );

  await stopServer(child);
});

test("GET /live-draft returns ranked inventory metrics without exposing raw items or forwarding LCU auth", async (t) => {
  const riotClient = await startMockRiotClient(({ url }) => {
    if (url.pathname === "/lol-gameflow/v1/session") {
      return {
        body: {
          phase: "InProgress",
          gameData: {
            gameId: 987654,
            queue: {
              id: 420,
            },
          },
        },
      };
    }

    if (url.pathname === "/lol-game-data/assets/v1/items.json") {
      return {
        body: [
          {
            id: 6655,
            name: "Luden's Companion",
            price: 800,
            priceTotal: 2800,
            categories: ["SpellDamage"],
            from: [3802, 1026],
            to: [],
            inStore: true,
          },
          {
            id: 1001,
            name: "Boots",
            price: 300,
            priceTotal: 300,
            categories: ["Boots"],
            from: [],
            to: [3020],
            inStore: true,
          },
        ],
      };
    }

    if (url.pathname === "/liveclientdata/playerlist") {
      return {
        body: [
          {
            championName: "Ahri",
            riotId: "Local Player#NA1",
            team: "ORDER",
            position: "MIDDLE",
            items: [
              {
                itemID: 6655,
                count: 1,
                price: 800,
                consumable: false,
              },
            ],
          },
          {
            championName: "Leona",
            riotId: "Enemy Player#NA1",
            team: "CHAOS",
            position: "UTILITY",
            items: [
              {
                itemID: 1001,
                count: 1,
                price: 300,
                consumable: false,
              },
            ],
          },
          ...[
            ["Wukong", "Ally Top#NA1", "ORDER", "TOP"],
            ["Nunu & Willump", "Ally Jungle#NA1", "ORDER", "JUNGLE"],
            ["Ashe", "Ally Bottom#NA1", "ORDER", "BOTTOM"],
            ["Lux", "Ally Support#NA1", "ORDER", "UTILITY"],
            ["Darius", "Enemy Top#NA1", "CHAOS", "TOP"],
            ["Anivia", "Enemy Middle#NA1", "CHAOS", "MIDDLE"],
            ["Garen", "Enemy Jungle#NA1", "CHAOS", "JUNGLE"],
            ["Annie", "Enemy Bottom#NA1", "CHAOS", "BOTTOM"],
          ].map(([championName, riotId, team, position]) => ({
            championName,
            riotId,
            team,
            position,
            items: [],
          })),
        ],
      };
    }

    if (url.pathname === "/liveclientdata/activeplayername") {
      return {
        body: "Local Player#NA1",
      };
    }

    if (url.pathname === "/liveclientdata/gamestats") {
      return {
        body: { gameTime: 126.5 },
      };
    }

    return {
      status: 404,
      body: {},
    };
  });
  t.after(() => riotClient.close());
  const lockfilePath = await createMockLockfile(riotClient.port);
  const { child, baseUrl } = await startServer(t, {
    env: {
      PICKBAN_LIVE_CLIENT_DATA_URL: `http://127.0.0.1:${riotClient.port}`,
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
  });

  const firstResponse = await getJson(baseUrl, "/live-draft");
  const secondResponse = await getJson(baseUrl, "/live-draft");

  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.body.status, "active");
  assert.equal(firstResponse.body.source, "live_game");
  assert.equal(firstResponse.body.gameflowPhase, "InProgress");
  assert.equal(firstResponse.body.champSelectPhase, "in_game");
  assert.equal(firstResponse.body.sessionId, "987654");
  assert.equal(firstResponse.body.assignedRole, "middle");
  assert.equal(firstResponse.body.localPlayerChampionKey, "103");
  assert.deepEqual(firstResponse.body.liveGame, {
    complete: true,
    metricsComplete: true,
    firstItemStatusKnown: true,
    playerCount: 10,
    totalPlayerCount: 10,
    resolvedPlayerCount: 10,
    omittedParticipantCount: 0,
    gameTimeSeconds: 126.5,
    fetchedAt: firstResponse.body.fetchedAt,
  });
  assert.deepEqual(
    firstResponse.body.allies
      .filter((player) => player.isLocalPlayer)
      .map((player) => ({
        champion: player.champion,
        role: player.role,
        buildGold: player.buildGold,
        buildGoldRank: player.buildGoldRank,
        completedLegendaryItemCount: player.completedLegendaryItemCount,
        hasCompletedFirstItem: player.hasCompletedFirstItem,
        inventoryKnown: player.inventoryKnown,
      })),
    [
      {
        champion: "Ahri",
        role: "middle",
        buildGold: 2800,
        buildGoldRank: 1,
        completedLegendaryItemCount: 1,
        hasCompletedFirstItem: true,
        inventoryKnown: true,
      },
    ],
  );
  assert.deepEqual(
    firstResponse.body.enemies
      .filter((player) => player.champion === "Leona")
      .map((player) => ({
        champion: player.champion,
        role: player.role,
        buildGold: player.buildGold,
        buildGoldRank: player.buildGoldRank,
        completedLegendaryItemCount: player.completedLegendaryItemCount,
        hasCompletedFirstItem: player.hasCompletedFirstItem,
        inventoryKnown: player.inventoryKnown,
      })),
    [
      {
        champion: "Leona",
        role: "support",
        buildGold: 300,
        buildGoldRank: 2,
        completedLegendaryItemCount: 0,
        hasCompletedFirstItem: false,
        inventoryKnown: true,
      },
    ],
  );
  for (const participant of [
    ...firstResponse.body.allies,
    ...firstResponse.body.enemies,
  ]) {
    assert.equal("items" in participant, false);
  }
  assert.equal(JSON.stringify(firstResponse.body).includes("Local Player#NA1"), false);
  assert.equal(secondResponse.body.source, "live_game");

  const itemCatalogRequests = riotClient.requests.filter(
    (request) => request.pathname === "/lol-game-data/assets/v1/items.json",
  );
  const liveClientRequests = riotClient.requests.filter((request) =>
    request.pathname.startsWith("/liveclientdata/"),
  );
  assert.equal(itemCatalogRequests.length, 1);
  assert.equal(itemCatalogRequests[0].authorization.startsWith("Basic "), true);
  assert.equal(liveClientRequests.length, 6);
  assert.equal(liveClientRequests.every((request) => request.authorization === ""), true);

  await stopServer(child);
});

test("GET /live-draft requires exact 5v5 snapshots for standard queues but permits variable Practice Tool teams", async (t) => {
  let scenario = {
    queueId: 400,
    allyCount: 5,
    enemyCount: 5,
  };
  const createPlayers = ({ allyCount, enemyCount }) => [
    ...Array.from({ length: allyCount }, (_value, index) => ({
      championName: "Ahri",
      riotId: index === 0 ? "Local Player#NA1" : `Ally ${index}#NA1`,
      team: "ORDER",
      position: "MIDDLE",
      items: [],
    })),
    ...Array.from({ length: enemyCount }, (_value, index) => ({
      championName: "Leona",
      riotId: `Enemy ${index}#NA1`,
      team: "CHAOS",
      position: "UTILITY",
      items: [],
    })),
  ];
  const riotClient = await startMockRiotClient(({ url }) => {
    if (url.pathname === "/lol-gameflow/v1/session") {
      return {
        body: {
          phase: "InProgress",
          gameData: {
            gameId: 24680,
            queue: {
              id: scenario.queueId,
            },
          },
        },
      };
    }

    if (url.pathname === "/lol-game-data/assets/v1/items.json") {
      return {
        body: [{ id: 6655, price: 800, priceTotal: 2800, rarity: "Legendary" }],
      };
    }

    if (url.pathname === "/liveclientdata/playerlist") {
      return {
        body: createPlayers(scenario),
      };
    }

    if (url.pathname === "/liveclientdata/activeplayername") {
      return {
        body: "Local Player#NA1",
      };
    }

    return {
      status: 404,
      body: {},
    };
  });
  t.after(() => riotClient.close());
  const lockfilePath = await createMockLockfile(riotClient.port);
  const { child, baseUrl } = await startServer(t, {
    env: {
      PICKBAN_LIVE_CLIENT_DATA_URL: `http://127.0.0.1:${riotClient.port}`,
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
  });

  const standardQueueScenarios = [
    ...[400, 420, 440].map((queueId) => ({
      queueId,
      allyCount: 5,
      enemyCount: 4,
      complete: false,
    })),
    ...[400, 420, 440].map((queueId) => ({
      queueId,
      allyCount: 6,
      enemyCount: 4,
      complete: false,
    })),
    ...[400, 420, 440].map((queueId) => ({
      queueId,
      allyCount: 5,
      enemyCount: 5,
      complete: true,
    })),
  ];

  for (const nextScenario of standardQueueScenarios) {
    scenario = nextScenario;
    const response = await getJson(baseUrl, "/live-draft");
    const description = `queue ${scenario.queueId}, ${scenario.allyCount}/${scenario.enemyCount}`;

    assert.equal(response.status, 200, description);
    assert.equal(response.body.liveGame.complete, scenario.complete, description);
    assert.equal(
      response.body.liveGame.totalPlayerCount,
      scenario.allyCount + scenario.enemyCount,
      description,
    );
  }

  scenario = {
    queueId: 0,
    allyCount: 1,
    enemyCount: 1,
  };
  const practiceResponse = await getJson(baseUrl, "/live-draft");

  assert.equal(practiceResponse.status, 200);
  assert.equal(practiceResponse.body.source, "live_game");
  assert.equal(practiceResponse.body.liveGame.complete, true);
  assert.equal(practiceResponse.body.liveGame.totalPlayerCount, 2);

  await stopServer(child);
});

test("GET /live-draft keeps live champions but withholds metrics when the item catalog is unavailable", async (t) => {
  const riotClient = await startMockRiotClient(({ url }) => {
    if (url.pathname === "/lol-gameflow/v1/session") {
      return {
        body: {
          phase: "InProgress",
          gameData: {
            gameId: 13579,
            queue: {
              id: 0,
            },
          },
        },
      };
    }

    if (url.pathname === "/lol-game-data/assets/v1/items.json") {
      return {
        status: 503,
        body: { message: "catalog unavailable" },
      };
    }

    if (url.pathname === "/liveclientdata/playerlist") {
      return {
        body: [
          {
            championName: "Ahri",
            riotId: "Local Player#NA1",
            team: "ORDER",
            position: "MIDDLE",
            items: [
              {
                itemID: 6655,
                count: 1,
                price: 2800,
                consumable: false,
              },
            ],
          },
          {
            championName: "Leona",
            riotId: "Enemy Player#NA1",
            team: "CHAOS",
            position: "UTILITY",
            items: [
              {
                itemID: 1001,
                count: 1,
                price: 300,
                consumable: false,
              },
            ],
          },
        ],
      };
    }

    if (url.pathname === "/liveclientdata/activeplayername") {
      return {
        body: "Local Player#NA1",
      };
    }

    return {
      status: 404,
      body: {},
    };
  });
  t.after(() => riotClient.close());
  const lockfilePath = await createMockLockfile(riotClient.port);
  const { child, baseUrl } = await startServer(t, {
    env: {
      PICKBAN_LIVE_CLIENT_DATA_URL: `http://127.0.0.1:${riotClient.port}`,
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
  });

  const response = await getJson(baseUrl, "/live-draft");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "active");
  assert.equal(response.body.source, "live_game");
  assert.equal(response.body.liveGame.complete, true);
  assert.equal(response.body.liveGame.metricsComplete, false);
  assert.equal(response.body.liveGame.firstItemStatusKnown, false);
  assert.deepEqual(
    [...response.body.allies, ...response.body.enemies].map((participant) => ({
      champion: participant.champion,
      buildGold: participant.buildGold,
      buildGoldRank: participant.buildGoldRank,
      hasCompletedFirstItem: participant.hasCompletedFirstItem,
      inventoryKnown: participant.inventoryKnown,
      hasRawItems: "items" in participant,
    })),
    [
      {
        champion: "Ahri",
        buildGold: null,
        buildGoldRank: null,
        hasCompletedFirstItem: null,
        inventoryKnown: false,
        hasRawItems: false,
      },
      {
        champion: "Leona",
        buildGold: null,
        buildGoldRank: null,
        hasCompletedFirstItem: null,
        inventoryKnown: false,
        hasRawItems: false,
      },
    ],
  );
  assert.equal(
    riotClient.requests.some((request) => request.pathname === "/liveclientdata/playerlist"),
    true,
  );

  await stopServer(child);
});

test("GET /live-draft stays active during the game-start data transition", async (t) => {
  const riotClient = await startMockRiotClient(({ url }) => {
    if (url.pathname === "/lol-gameflow/v1/session") {
      return {
        body: {
          phase: "GameStart",
          gameData: {
            gameId: 12345,
            queue: {
              id: 400,
            },
          },
        },
      };
    }

    if (url.pathname === "/lol-game-data/assets/v1/items.json") {
      return {
        status: 404,
        body: {},
      };
    }

    return {
      status: 404,
      body: {},
    };
  });
  t.after(() => riotClient.close());
  const lockfilePath = await createMockLockfile(riotClient.port);
  const { child, baseUrl } = await startServer(t, {
    env: {
      PICKBAN_LIVE_CLIENT_DATA_URL: `http://127.0.0.1:${riotClient.port}`,
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
  });

  const response = await getJson(baseUrl, "/live-draft");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "active");
  assert.equal(response.body.active, true);
  assert.equal(response.body.source, "transition");
  assert.equal(response.body.reason, "live_game_loading");
  assert.equal(response.body.sessionId, "12345");
  assert.deepEqual(response.body.allies, []);
  assert.deepEqual(response.body.enemies, []);
  assert.equal(response.body.liveGame.complete, false);
  await waitForMockRequestPaths(riotClient.requests, [
    "/liveclientdata/activeplayername",
    "/liveclientdata/gamestats",
    "/liveclientdata/playerlist",
  ]);
  assert.deepEqual(
    riotClient.requests
      .filter((request) => request.pathname.startsWith("/liveclientdata/"))
      .map((request) => request.pathname)
      .sort(),
    [
      "/liveclientdata/activeplayername",
      "/liveclientdata/gamestats",
      "/liveclientdata/playerlist",
    ],
  );

  await stopServer(child);
});

test("GET /live-draft imports Practice Tool champion select", async (t) => {
  const riotClient = await startMockRiotClient(({ url }) => {
    if (url.pathname === "/lol-gameflow/v1/session") {
      return {
        body: {
          phase: "ChampSelect",
          gameData: {
            queue: {
              id: 0,
            },
          },
        },
      };
    }

    if (url.pathname === "/lol-champ-select/v1/session") {
      return {
        body: {
          localPlayerCellId: 1,
          myTeam: [
            {
              cellId: 1,
              championId: 103,
              assignedPosition: "middle",
            },
          ],
          theirTeam: [],
        },
      };
    }

    return {
      status: 404,
      body: {},
    };
  });
  t.after(() => riotClient.close());
  const lockfilePath = await createMockLockfile(riotClient.port);
  const { child, baseUrl } = await startServer(t, {
    env: {
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
  });

  const response = await getJson(baseUrl, "/live-draft");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "active");
  assert.deepEqual(response.body.queue, {
    id: 0,
    description: "Practice Tool",
    type: "practice",
  });
  assert.deepEqual(response.body.allies.map(({ champion, championKey, role }) => ({
    champion,
    championKey,
    role,
  })), [
    {
      champion: "Ahri",
      championKey: "103",
      role: "middle",
    },
  ]);

  await stopServer(child);
});

test("GET /live-draft disables auto import outside supported queues", async (t) => {
  const riotClient = await startMockRiotClient(({ url }) => {
    if (url.pathname === "/lol-gameflow/v1/session") {
      return {
        body: {
          phase: "ChampSelect",
          gameData: {
            queue: {
              id: 450,
            },
          },
        },
      };
    }

    if (url.pathname === "/lol-champ-select/v1/session") {
      return {
        body: {
          localPlayerCellId: 1,
          myTeam: [
            {
              cellId: 1,
              championId: 103,
              assignedPosition: "middle",
            },
          ],
          theirTeam: [],
        },
      };
    }

    return {
      status: 404,
      body: {},
    };
  });
  t.after(() => riotClient.close());
  const lockfilePath = await createMockLockfile(riotClient.port);
  const { child, baseUrl } = await startServer(t, {
    env: {
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
  });

  const response = await getJson(baseUrl, "/live-draft");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "disabled");
  assert.equal(response.body.reason, "unsupported_queue");
  assert.deepEqual(response.body.allies, []);
  assert.deepEqual(response.body.enemies, []);
  assert.equal(
    riotClient.requests.some((request) => request.pathname === "/lol-champ-select/v1/session"),
    false,
  );

  await stopServer(child);
});

test("POST /rune-import rewrites the first editable League rune page", async (t) => {
  const riotClient = await startMockRiotClient(({ bodyText, url }) => {
    if (url.pathname === "/lol-gameflow/v1/session") {
      return {
        body: {
          phase: "ChampSelect",
        },
      };
    }

    if (url.pathname === "/lol-perks/v1/pages") {
      return {
        body: [
          {
            id: 1,
            name: "Default",
            order: 0,
            isEditable: false,
            isDeletable: false,
          },
          {
            id: 7,
            name: "Saved",
            order: 1,
            isEditable: true,
            isDeletable: true,
          },
        ],
      };
    }

    if (url.pathname === "/lol-perks/v1/pages/7") {
      return {
        body: JSON.parse(bodyText),
      };
    }

    return {
      status: 404,
      body: {},
    };
  });
  t.after(() => riotClient.close());
  const lockfilePath = await createMockLockfile(riotClient.port);
  const { child, baseUrl } = await startServer(t, {
    env: {
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
  });

  const response = await postJson(baseUrl, "/rune-import", {
    champion: "Ahri",
    page: createRuneImportPage(),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "imported");
  assert.equal(payload.page.name, "import - Ahri");
  assert.deepEqual(payload.page.selectedPerkIds, [
    8008,
    9111,
    9103,
    8014,
    8210,
    8236,
    5008,
    5005,
    5001,
  ]);

  const putRequest = riotClient.requests.find(
    (request) => request.method === "PUT" && request.pathname === "/lol-perks/v1/pages/7",
  );
  assert.ok(putRequest);
  assert.deepEqual(JSON.parse(putRequest.bodyText), {
    id: 7,
    name: "import - Ahri",
    order: 1,
    isEditable: true,
    isDeletable: true,
    primaryStyleId: 8000,
    selectedPerkIds: [8008, 9111, 9103, 8014, 8210, 8236, 5008, 5005, 5001],
    subStyleId: 8200,
  });

  await stopServer(child);
});

test("POST /rune-import refuses to rewrite pages outside champ select", async (t) => {
  const riotClient = await startMockRiotClient(({ url }) => {
    if (url.pathname === "/lol-gameflow/v1/session") {
      return {
        body: {
          phase: "Lobby",
        },
      };
    }

    return {
      status: 404,
      body: {},
    };
  });
  t.after(() => riotClient.close());
  const lockfilePath = await createMockLockfile(riotClient.port);
  const { child, baseUrl } = await startServer(t, {
    env: {
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
  });

  const response = await postJson(baseUrl, "/rune-import", {
    champion: "Ahri",
    page: createRuneImportPage(),
  });
  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.equal(payload.status, "disabled");
  assert.equal(payload.reason, "not_in_champ_select");
  assert.equal(
    riotClient.requests.some((request) => request.method === "PUT"),
    false,
  );

  await stopServer(child);
});

test("POST /suggest rejects champions that appear on both sides before live fetches", async (t) => {
  const { child, baseUrl } = await startServer(t);

  const response = await postJson(baseUrl, "/suggest", {
    allies: [{ champion: "Ahri" }],
    enemies: ["Ahri", "Leona", "Jinx", "Sion", "Vi"],
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /cannot appear on both allied and enemy sides/i);
  assert.deepEqual(payload.requestStats, {
    lolalyticsLiveAccessCount: 0,
    lolalyticsLifetimeAccessCount: 0,
  });

  await stopServer(child);
});

test("POST /build-suggestions rejects champions that appear on both sides", async (t) => {
  const { child, baseUrl } = await startServer(t);

  const response = await postJson(baseUrl, "/build-suggestions", {
    ally: {
      champion: "Ahri",
      role: "mid",
    },
    enemies: ["Ahri", "Leona", "Jinx", "Sion", "Vi"],
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /cannot appear on both allied and enemy sides/i);

  await stopServer(child);
});
