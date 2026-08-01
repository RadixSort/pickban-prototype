const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createInitialLiveGameState,
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
