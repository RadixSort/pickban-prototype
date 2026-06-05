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
  assert.equal(payload.lolalyticsDataWindowDays, 7);
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

test("GET /live-draft disables auto import outside draft and ranked queues", async (t) => {
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
    enemies: ["Ahri"],
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
    enemies: ["Ahri"],
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /cannot appear on both allied and enemy sides/i);

  await stopServer(child);
});
