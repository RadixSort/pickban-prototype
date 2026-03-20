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
