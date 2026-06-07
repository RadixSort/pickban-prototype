const test = require("node:test");
const assert = require("node:assert/strict");

const {
  startServer,
  stopServer,
} = require("./helpers/server-process.js");

test("server.js starts cleanly, reports the bound port, and handles SIGTERM shutdown", async (t) => {
  const { child, baseUrl, port, stdout } = await startServer(t);

  assert.match(stdout, /PickBan prototype running at http:\/\/localhost:\d+/);
  assert.equal(baseUrl, `http://localhost:${port}`);
  assert.ok(Number.isInteger(port));
  assert.ok(port > 0);

  await stopServer(child);
});

test("start.js runs the startup wrapper before the server", async (t) => {
  const { child, stdout } = await startServer(t, {
    script: "start.js",
    env: {
      PICKBAN_DISABLE_AUTO_UPDATE: "1",
    },
  });

  assert.match(stdout, /PickBan auto-update disabled\./);
  assert.match(stdout, /PickBan prototype running at http:\/\/localhost:\d+/);

  await stopServer(child);
});
