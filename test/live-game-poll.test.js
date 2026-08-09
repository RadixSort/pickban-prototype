const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LIVE_GAME_POLL_INTERVAL_MS,
  MIN_LIVE_GAME_POLL_DELAY_MS,
  resolveLiveGamePollDelayMs,
} = require("../public/live-game-poll.js");

test("live-game polling aligns to the next ten-second in-game boundary", () => {
  const fetchedAt = "2026-08-08T12:00:00.000Z";
  const fetchedAtMs = Date.parse(fetchedAt);

  assert.equal(LIVE_GAME_POLL_INTERVAL_MS, 10_000);
  assert.equal(
    resolveLiveGamePollDelayMs({
      fetchedAt,
      gameTimeSeconds: 123.4,
      nowMs: fetchedAtMs,
    }),
    6600,
  );
  assert.equal(
    resolveLiveGamePollDelayMs({
      fetchedAt,
      gameTimeSeconds: 123.4,
      nowMs: fetchedAtMs + 1100,
    }),
    5500,
  );
});

test("an exact in-game boundary schedules the following boundary", () => {
  assert.equal(
    resolveLiveGamePollDelayMs({
      fetchedAt: 1000,
      gameTimeSeconds: 120,
      nowMs: 1000,
    }),
    10_000,
  );
});

test("elapsed handling time skips missed boundaries without accumulating drift", () => {
  assert.equal(
    resolveLiveGamePollDelayMs({
      fetchedAt: 1000,
      gameTimeSeconds: 123.4,
      nowMs: 28_000,
    }),
    9600,
  );
});

test("live-game polling falls back to a ten-second poll-start cadence", () => {
  assert.equal(
    resolveLiveGamePollDelayMs({
      gameTimeSeconds: null,
      lastPollStartedAt: 0,
      nowMs: 12_000,
    }),
    10_000,
  );
  assert.equal(
    resolveLiveGamePollDelayMs({
      gameTimeSeconds: null,
      lastPollStartedAt: 1000,
      nowMs: 3500,
    }),
    7500,
  );
  assert.equal(
    resolveLiveGamePollDelayMs({
      gameTimeSeconds: null,
      lastPollStartedAt: 1000,
      nowMs: 12_000,
    }),
    MIN_LIVE_GAME_POLL_DELAY_MS,
  );
});

test("invalid clocks use the fallback and near-boundary delays remain bounded", () => {
  assert.equal(
    resolveLiveGamePollDelayMs({
      fetchedAt: "not-a-time",
      gameTimeSeconds: "invalid",
      lastPollStartedAt: 1000,
      nowMs: 2000,
    }),
    9000,
  );
  assert.equal(
    resolveLiveGamePollDelayMs({
      fetchedAt: 1000,
      gameTimeSeconds: 129.9,
      nowMs: 1000,
    }),
    MIN_LIVE_GAME_POLL_DELAY_MS,
  );
});
