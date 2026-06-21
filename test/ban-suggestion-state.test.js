const test = require("node:test");
const assert = require("node:assert/strict");

const {
  completeBanSuggestionRequest,
  createInitialBanSuggestionState,
  reconcileBanSuggestionState,
} = require("../public/ban-suggestion-state.js");

function createPayload() {
  const roles = ["top", "jungle", "middle", "bottom", "support"];
  return {
    suggestions: roles.map((role) => ({
      role,
      champion: `${role} champion`,
      championKey: role,
      strategy: "pbi",
    })),
  };
}

test("ban suggestion state appears only in the ban phase and keeps five lane suggestions", () => {
  const initial = createInitialBanSuggestionState();
  const loading = reconcileBanSuggestionState(initial, {
    active: true,
    champSelectPhase: "ban",
    hovers: [{ champion: "Ahri", championKey: "103", role: "middle" }],
    rankFilter: "emerald_plus",
    sessionId: "game-1",
  });
  const completed = completeBanSuggestionRequest(loading, {
    key: loading.activeKey,
    payload: createPayload(),
    requestVersion: loading.requestVersion,
  });

  assert.equal(loading.visible, true);
  assert.equal(loading.loading, true);
  assert.equal(completed.loading, false);
  assert.equal(completed.payload.suggestions.length, 5);
});

test("changing or removing an ally hover invalidates the active ban request", () => {
  const ahri = reconcileBanSuggestionState(createInitialBanSuggestionState(), {
    active: true,
    champSelectPhase: "ban",
    hovers: [{ champion: "Ahri", championKey: "103", role: "middle" }],
    rankFilter: "emerald_plus",
    sessionId: "game-1",
  });
  const ahriCompleted = completeBanSuggestionRequest(ahri, {
    key: ahri.activeKey,
    payload: createPayload(),
    requestVersion: ahri.requestVersion,
  });
  const lux = reconcileBanSuggestionState(ahriCompleted, {
    active: true,
    champSelectPhase: "ban",
    hovers: [{ champion: "Lux", championKey: "99", role: "middle" }],
    rankFilter: "emerald_plus",
    sessionId: "game-1",
  });
  const removed = reconcileBanSuggestionState(lux, {
    active: true,
    champSelectPhase: "ban",
    hovers: [],
    rankFilter: "emerald_plus",
    sessionId: "game-1",
  });

  assert.notEqual(lux.activeKey, ahri.activeKey);
  assert.equal(lux.payload, null);
  assert.equal(lux.loading, true);
  assert.notEqual(removed.activeKey, lux.activeKey);
  assert.equal(removed.hovers.length, 0);
});

test("phase exit and champion-select termination clear UI and reject stale completions", () => {
  const loading = reconcileBanSuggestionState(createInitialBanSuggestionState(), {
    active: true,
    champSelectPhase: "ban",
    hovers: [],
    rankFilter: "emerald_plus",
    sessionId: "game-1",
  });
  const pickPhase = reconcileBanSuggestionState(loading, {
    active: true,
    champSelectPhase: "pick",
  });
  const staleCompletion = completeBanSuggestionRequest(pickPhase, {
    key: loading.activeKey,
    payload: createPayload(),
    requestVersion: loading.requestVersion,
  });
  const terminated = reconcileBanSuggestionState(loading, {
    active: false,
    champSelectPhase: "unknown",
  });

  assert.equal(pickPhase.visible, false);
  assert.equal(pickPhase.payload, null);
  assert.equal(staleCompletion.payload, null);
  assert.equal(terminated.visible, false);
  assert.deepEqual(terminated.cache, {});
});
