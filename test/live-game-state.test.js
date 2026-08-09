const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createInitialLiveGameState,
  invalidateLiveGameStateIfEnemyCompositionChanged,
  invalidateLiveGameStateIfSessionChanged,
  markLiveGameDisconnected,
  reconcileLiveGameState,
} = require("../public/live-game-state.js");
const { normalizeRole } = require("../public/roles.js");

function createPayload({
  allies = [],
  complete = true,
  enemies = [],
  playerCount = allies.length + enemies.length,
  sessionId = "game-1",
} = {}) {
  return {
    sessionId,
    allies,
    enemies,
    liveGame: {
      complete,
      playerCount,
      totalPlayerCount: playerCount,
    },
  };
}

function createParticipant(
  championKey,
  buildGold,
  buildGoldRank,
  extra = {},
) {
  return {
    championKey,
    buildGold,
    buildGoldRank,
    hasCompletedFirstItem: false,
    inventoryKnown: true,
    role: "middle",
    ...extra,
  };
}

test("same-session fog omission retains enemy gold and recomputes global ranks", () => {
  const initial = reconcileLiveGameState(
    createInitialLiveGameState(),
    createPayload({
      allies: [createParticipant("103", 1000, 2)],
      enemies: [createParticipant("89", 3000, 1)],
      playerCount: 2,
    }),
    { normalizeRole },
  );
  const afterFogOmission = reconcileLiveGameState(
    initial,
    createPayload({
      allies: [createParticipant("103", 3500, 1)],
      enemies: [],
      complete: false,
      playerCount: 1,
    }),
    { normalizeRole },
  );

  assert.equal(afterFogOmission.complete, true);
  assert.equal(afterFogOmission.playerCount, 2);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(afterFogOmission.playersByChampionKey).map(
        ([championKey, player]) => [
          championKey,
          { buildGold: player.buildGold, buildGoldRank: player.buildGoldRank },
        ],
      ),
    ),
    {
      89: { buildGold: 3000, buildGoldRank: 2 },
      103: { buildGold: 3500, buildGoldRank: 1 },
    },
  );
});

test("a complete-flagged Practice Tool roster decrease is treated as fog omission", () => {
  const initial = reconcileLiveGameState(
    createInitialLiveGameState(),
    createPayload({
      allies: [createParticipant("103", 1000, 2)],
      enemies: [createParticipant("89", 3000, 1)],
      playerCount: 2,
    }),
    { normalizeRole },
  );
  const afterFogOmission = reconcileLiveGameState(
    initial,
    createPayload({
      allies: [createParticipant("103", 3500, 1)],
      enemies: [],
      complete: true,
      playerCount: 1,
    }),
    { normalizeRole },
  );

  assert.equal(afterFogOmission.rosterComplete, true);
  assert.equal(afterFogOmission.latestRosterComplete, false);
  assert.equal(afterFogOmission.complete, true);
  assert.equal(afterFogOmission.playerCount, 2);
  assert.equal(afterFogOmission.playersByChampionKey[89].buildGold, 3000);
  assert.equal(afterFogOmission.playersByChampionKey[89].buildGoldRank, 2);
});

test("enemy positive-to-zero and unknown inventory observations retain the last value", () => {
  const initial = reconcileLiveGameState(
    createInitialLiveGameState(),
    createPayload({
      allies: [createParticipant("103", 2000, 2)],
      enemies: [
        createParticipant("89", 3200, 1, { hasCompletedFirstItem: true }),
      ],
      playerCount: 2,
    }),
    { normalizeRole },
  );
  const afterEmptyInventory = reconcileLiveGameState(
    initial,
    createPayload({
      allies: [createParticipant("103", 2100, 2)],
      enemies: [createParticipant("89", 0, 1)],
      playerCount: 2,
    }),
    { normalizeRole },
  );
  const afterUnknownInventory = reconcileLiveGameState(
    afterEmptyInventory,
    createPayload({
      allies: [createParticipant("103", 2200, 2)],
      enemies: [
        createParticipant("89", 0, 1, {
          hasCompletedFirstItem: null,
          inventoryKnown: false,
        }),
      ],
      playerCount: 2,
    }),
    { normalizeRole },
  );

  assert.equal(afterEmptyInventory.playersByChampionKey[89].buildGold, 3200);
  assert.equal(
    afterEmptyInventory.playersByChampionKey[89].hasCompletedFirstItem,
    true,
  );
  assert.equal(afterUnknownInventory.playersByChampionKey[89].buildGold, 3200);
  assert.equal(afterUnknownInventory.complete, true);
});

test("observed nonzero enemy decreases and allied sell-all states still update", () => {
  const initial = reconcileLiveGameState(
    createInitialLiveGameState(),
    createPayload({
      allies: [
        createParticipant("103", 3000, 2, { hasCompletedFirstItem: true }),
      ],
      enemies: [createParticipant("89", 3200, 1)],
      playerCount: 2,
    }),
    { normalizeRole },
  );
  const updated = reconcileLiveGameState(
    initial,
    createPayload({
      allies: [createParticipant("103", 0, 2)],
      enemies: [createParticipant("89", 2500, 1)],
      playerCount: 2,
    }),
    { normalizeRole },
  );

  assert.equal(updated.playersByChampionKey[103].buildGold, 0);
  assert.equal(updated.playersByChampionKey[103].hasCompletedFirstItem, false);
  assert.equal(updated.playersByChampionKey[89].buildGold, 2500);
});

test("a new game session never inherits prior enemy inventory", () => {
  const initial = reconcileLiveGameState(
    createInitialLiveGameState(),
    createPayload({
      allies: [createParticipant("103", 2000, 2)],
      enemies: [createParticipant("89", 3000, 1)],
      playerCount: 2,
    }),
    { normalizeRole },
  );
  const nextSession = reconcileLiveGameState(
    initial,
    createPayload({
      allies: [createParticipant("103", 0, 1)],
      enemies: [],
      complete: false,
      playerCount: 1,
      sessionId: "game-2",
    }),
    { normalizeRole },
  );

  assert.equal(nextSession.complete, false);
  assert.equal(nextSession.playerCount, 1);
  assert.equal("89" in nextSession.playersByChampionKey, false);
});

test("a disconnected game retains trustworthy team totals, ranks, and roster identity", () => {
  const connected = reconcileLiveGameState(
    createInitialLiveGameState(),
    createPayload({
      allies: [
        createParticipant("103", 4200, 1, {
          completedLegendaryItemCount: 2,
          hasCompletedFirstItem: true,
        }),
        createParticipant("64", 1800, 4),
      ],
      enemies: [
        createParticipant("89", 3000, 2, {
          completedLegendaryItemCount: 1,
          hasCompletedFirstItem: true,
        }),
        createParticipant("99", 2200, 3),
      ],
      playerCount: 4,
    }),
    { normalizeRole },
  );
  const disconnected = markLiveGameDisconnected(connected);

  assert.equal(disconnected.active, false);
  assert.equal(disconnected.complete, true);
  assert.equal(disconnected.allyBuildGold, 6000);
  assert.equal(disconnected.enemyBuildGold, 5200);
  assert.deepEqual(disconnected.allyChampionKeys, ["64", "103"]);
  assert.deepEqual(disconnected.enemyChampionKeys, ["89", "99"]);
  assert.equal(disconnected.playersByChampionKey[103].buildGoldRank, 1);
  assert.equal(disconnected.playersByChampionKey[103].completedLegendaryItemCount, 2);
  assert.notEqual(disconnected.playersByChampionKey, connected.playersByChampionKey);
});

test("a same-session reconnect continues from retained disconnected inventory", () => {
  const connected = reconcileLiveGameState(
    createInitialLiveGameState(),
    createPayload({
      allies: [createParticipant("103", 2000, 2)],
      enemies: [createParticipant("89", 3000, 1)],
      playerCount: 2,
    }),
    { normalizeRole },
  );
  const reconnected = reconcileLiveGameState(
    markLiveGameDisconnected(connected),
    createPayload({
      allies: [createParticipant("103", 3500, 1)],
      enemies: [],
      complete: false,
      playerCount: 1,
    }),
    { normalizeRole },
  );

  assert.equal(reconnected.active, true);
  assert.equal(reconnected.complete, true);
  assert.equal(reconnected.allyBuildGold, 3500);
  assert.equal(reconnected.enemyBuildGold, 3000);
  assert.equal(reconnected.playersByChampionKey[89].buildGoldRank, 2);
});

test("retained live metrics invalidate only when enemy champion identity changes", () => {
  const connected = reconcileLiveGameState(
    createInitialLiveGameState(),
    createPayload({
      allies: [createParticipant("103", 2000, 3)],
      enemies: [createParticipant("89", 3000, 1), createParticipant("99", 2500, 2)],
      playerCount: 3,
    }),
    { normalizeRole },
  );
  const disconnected = markLiveGameDisconnected(connected);

  assert.equal(
    invalidateLiveGameStateIfEnemyCompositionChanged(disconnected, [
      { key: "99", role: "top" },
      { championKey: "89", role: "support" },
    ]),
    disconnected,
  );

  const invalidated = invalidateLiveGameStateIfEnemyCompositionChanged(disconnected, [
    { key: "99" },
    { key: "64" },
  ]);
  assert.deepEqual(invalidated, createInitialLiveGameState());
  assert.deepEqual(
    invalidateLiveGameStateIfEnemyCompositionChanged(disconnected, []),
    createInitialLiveGameState(),
  );
});

test("a newly identified transition session invalidates prior-game metrics", () => {
  const connected = reconcileLiveGameState(
    createInitialLiveGameState(),
    createPayload({
      allies: [createParticipant("103", 2000, 2)],
      enemies: [createParticipant("89", 3000, 1)],
      playerCount: 2,
      sessionId: "game-1",
    }),
    { normalizeRole },
  );
  const retained = markLiveGameDisconnected(connected);

  assert.equal(
    invalidateLiveGameStateIfSessionChanged(retained, "game-1"),
    retained,
  );
  assert.equal(
    invalidateLiveGameStateIfSessionChanged(retained, ""),
    retained,
  );
  assert.deepEqual(
    invalidateLiveGameStateIfSessionChanged(retained, "game-2"),
    createInitialLiveGameState(),
  );
});

test("a full roster remains distinct from complete inventory metrics", () => {
  const state = reconcileLiveGameState(
    createInitialLiveGameState(),
    createPayload({
      allies: [
        createParticipant("103", 0, 1, {
          hasCompletedFirstItem: null,
          inventoryKnown: false,
        }),
      ],
      playerCount: 1,
    }),
    { normalizeRole },
  );

  assert.equal(state.rosterComplete, true);
  assert.equal(state.complete, false);
  assert.equal(state.playersByChampionKey[103].buildGold, null);
});
