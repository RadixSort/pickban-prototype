const test = require("node:test");
const assert = require("node:assert/strict");

const { createTtlCache } = require("../lib/ttl-cache.js");

test("TTL cache expires entries", () => {
  let time = 100;
  const cache = createTtlCache({ maxEntries: 2, ttlMs: 10, now: () => time });

  cache.set("key", "value");
  assert.equal(cache.get("key"), "value");

  time = 110;
  assert.equal(cache.get("key"), undefined);
});

test("TTL cache evicts the least recently used entry", () => {
  const cache = createTtlCache({ maxEntries: 2, ttlMs: 10 });

  cache.set("old", 1);
  cache.set("kept", 2);
  cache.get("old");
  cache.set("new", 3);

  assert.equal(cache.get("old"), 1);
  assert.equal(cache.get("kept"), undefined);
  assert.equal(cache.get("new"), 3);
});

test("TTL cache accepts a shorter per-entry lifetime", () => {
  let time = 0;
  const cache = createTtlCache({ maxEntries: 1, ttlMs: 100, now: () => time });

  cache.set("pending", Promise.resolve(), 5);
  time = 5;

  assert.equal(cache.get("pending"), undefined);
});
