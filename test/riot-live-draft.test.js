const test = require("node:test");
const assert = require("node:assert/strict");

const champions = require("../public/champions.json");
const {
  normalizeRole,
} = require("../public/roles.js");
const {
  buildLiveDraftImport,
  parseLeagueClientLockfile,
} = require("../lib/riot-live-draft.js");

const championByKey = new Map(champions.map((champion) => [String(champion.key), champion]));

test("parseLeagueClientLockfile extracts local League Client credentials", () => {
  assert.deepEqual(parseLeagueClientLockfile("LeagueClientUx:1234:54321:secret:https"), {
    password: "secret",
    port: 54321,
    protocol: "https",
  });
});

test("buildLiveDraftImport returns visible champ-select picks and the local assigned role", () => {
  const payload = buildLiveDraftImport({
    championByKey,
    normalizeRole,
    gameflowSession: {
      phase: "ChampSelect",
      gameData: {
        queue: {
          id: 420,
        },
      },
    },
    champSelectSession: {
      localPlayerCellId: 1,
      myTeam: [
        {
          cellId: 1,
          championId: 0,
          assignedPosition: "utility",
        },
        {
          cellId: 2,
          championId: 103,
          assignedPosition: "middle",
        },
      ],
      theirTeam: [
        {
          cellId: 6,
          championId: 122,
          assignedPosition: "top",
        },
      ],
    },
  });

  assert.equal(payload.status, "active");
  assert.equal(payload.assignedRole, "support");
  assert.deepEqual(payload.queue, {
    id: 420,
    description: "Ranked Solo/Duo",
    type: "ranked",
  });
  assert.deepEqual(payload.allies.map(({ champion, championKey, role }) => ({
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
  assert.deepEqual(payload.enemies.map(({ champion, championKey, role }) => ({
    champion,
    championKey,
    role,
  })), [
    {
      champion: "Darius",
      championKey: "122",
      role: "top",
    },
  ]);
});

test("buildLiveDraftImport disables unsupported queues without returning picks", () => {
  const payload = buildLiveDraftImport({
    championByKey,
    normalizeRole,
    gameflowSession: {
      phase: "ChampSelect",
      gameData: {
        queue: {
          id: 450,
        },
      },
    },
    champSelectSession: {
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
  });

  assert.equal(payload.status, "disabled");
  assert.equal(payload.reason, "unsupported_queue");
  assert.deepEqual(payload.allies, []);
  assert.deepEqual(payload.enemies, []);
});
