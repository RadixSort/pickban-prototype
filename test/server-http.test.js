const test = require("node:test");
const assert = require("node:assert/strict");

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
  assert.equal(payload.canShutdown, true);
  assert.equal(typeof payload.shutdownToken, "string");
  assert.equal(payload.shutdownToken.length, 48);
  assert.deepEqual(payload.requestStats, {
    lolalyticsLiveAccessCount: 0,
    lolalyticsLifetimeAccessCount: 0,
  });

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
