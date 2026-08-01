"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildItemCostById,
  buildLegendaryItemIdSet,
  buildLiveClientRequestOptions,
  buildLiveGameSnapshot,
  calculateBuildGold,
  fetchLiveGameSnapshot,
  findLocalPlayerIndex,
  hasCompletedFirstItem,
  isLoopbackHostname,
  normalizeChampionToken,
  normalizeLiveItems,
  rankLivePlayersByBuildGold,
  resolveLiveClientDataBaseUrl,
} = require("../lib/riot-live-game.js");
const { normalizeRole } = require("../public/roles.js");

const CHAMPIONS = [
  {
    id: "ahri",
    key: "103",
    name: "Ahri",
    icon: "https://example.test/ahri.webp",
  },
  {
    id: "wukong",
    key: "62",
    name: "Wukong",
    icon: "https://example.test/wukong.webp",
  },
  {
    id: "leona",
    key: "89",
    name: "Leona",
    icon: "https://example.test/leona.webp",
  },
  {
    id: "nunu",
    key: "20",
    name: "Nunu & Willump",
    icon: "https://example.test/nunu.webp",
  },
];

const championByName = new Map(
  CHAMPIONS.map((champion) => [normalizeChampionToken(champion.name), champion]),
);
const championBySlug = new Map(CHAMPIONS.map((champion) => [champion.id, champion]));

function createItem(itemID, price, extra = {}) {
  return {
    itemID,
    price,
    count: 1,
    consumable: false,
    ...extra,
  };
}

test("normalizeLiveItems keeps only privacy-safe item fields and calculateBuildGold normalizes values", () => {
  const items = [
    createItem(1001, 350, {
      count: 2,
      displayName: "Secret display text",
      rawDescription: "Secret raw text",
    }),
    createItem(2003, "50", { count: 0, consumable: true }),
    createItem(3001, -100, { count: 3 }),
    createItem(3002, Number.POSITIVE_INFINITY, { count: 2 }),
    createItem(3003, Number.MAX_VALUE, { count: 2 }),
    null,
  ];

  assert.deepEqual(normalizeLiveItems(items), [
    { itemId: 1001, count: 2, price: 350, consumable: false },
    { itemId: 2003, count: 0, price: 50, consumable: true },
    { itemId: 3001, count: 3, price: 0, consumable: false },
    { itemId: 3002, count: 2, price: 0, consumable: false },
    { itemId: 3003, count: 2, price: Number.MAX_VALUE, consumable: false },
  ]);
  assert.equal(calculateBuildGold(items), 700);
});

test("build gold uses full catalog cost for components, completed items, and consumables", () => {
  const itemCostById = buildItemCostById([
    { id: 1036, price: 350, priceTotal: 350 },
    { id: 3074, price: 150, priceTotal: 3300 },
    { id: 2003, price: 50, priceTotal: 50 },
    { id: 3340, price: 0, priceTotal: 0 },
  ]);
  const items = [
    createItem(1036, 350),
    createItem(3074, 150),
    createItem(2003, 50, { consumable: true, count: 3 }),
    createItem(3340, 0),
  ];

  assert.deepEqual([...itemCostById.entries()], [
    [1036, 350],
    [3074, 3300],
    [2003, 50],
    [3340, 0],
  ]);
  assert.deepEqual(
    normalizeLiveItems(items, { itemCostById }).map(({ itemId, price, count }) => ({
      itemId,
      price,
      count,
    })),
    [
      { itemId: 1036, price: 350, count: 1 },
      { itemId: 3074, price: 3300, count: 1 },
      { itemId: 2003, price: 50, count: 3 },
      { itemId: 3340, price: 0, count: 1 },
    ],
  );
  assert.equal(calculateBuildGold(items, { itemCostById }), 3800);
});

test("inventory metrics are unknown when a held item lacks a catalog total cost", () => {
  const known = rankLivePlayersByBuildGold(
    [{ items: [createItem(1036, 350)] }],
    { itemCostById: new Map([[1036, 350]]) },
  );
  const unknown = rankLivePlayersByBuildGold(
    [{ items: [createItem(3074, 150)] }],
    { itemCostById: new Map([[1036, 350]]) },
  );

  assert.equal(known[0].inventoryKnown, true);
  assert.equal(known[0].buildGold, 350);
  assert.equal(unknown[0].inventoryKnown, false);
  assert.equal(unknown[0].buildGold, null);
  assert.equal(unknown[0].buildGoldRank, 0);
});

test("inventory metrics are unknown without a catalog, never trusted from live recipe price", () => {
  const [metrics] = rankLivePlayersByBuildGold([
    { items: [createItem(3074, 150)] },
  ]);

  assert.equal(metrics.inventoryKnown, false);
  assert.equal(metrics.buildGold, null);
  assert.equal(metrics.buildGoldRank, 0);
});

test("inventory metrics are unknown when an item stack count is malformed", () => {
  const [metrics] = rankLivePlayersByBuildGold(
    [{ items: [createItem(2003, 50, { consumable: true, count: null })] }],
    { itemCostById: new Map([[2003, 50]]) },
  );

  assert.equal(metrics.inventoryKnown, false);
  assert.equal(metrics.buildGold, null);
  assert.equal(metrics.buildGoldRank, 0);
});

test("overflow cannot turn an inventory into a trusted zero", () => {
  const [metrics] = rankLivePlayersByBuildGold(
    [{ items: [createItem(3074, 150, { count: 2 })] }],
    { itemCostById: new Map([[3074, Number.MAX_VALUE]]) },
  );

  assert.equal(metrics.inventoryKnown, false);
  assert.equal(metrics.buildGold, null);
  assert.equal(metrics.buildGoldRank, 0);
});

test("Legendary completion uses catalog membership and never falls back to price", () => {
  const legendaryItemIds = new Set([6655, "3001"]);

  assert.equal(
    hasCompletedFirstItem([createItem(6655, 100)], legendaryItemIds),
    true,
  );
  assert.equal(
    hasCompletedFirstItem([createItem(9999, 9999)], legendaryItemIds),
    false,
  );
  assert.equal(
    hasCompletedFirstItem(
      [createItem(6655, 3000, { consumable: true })],
      legendaryItemIds,
    ),
    false,
  );
  assert.equal(
    hasCompletedFirstItem([createItem(6655, 3000, { count: 0 })], legendaryItemIds),
    false,
  );
  assert.equal(hasCompletedFirstItem([createItem(6655, 3000)]), false);
});

test("Legendary ownership is recalculated after every inventory update", () => {
  const legendaryItemIds = new Set([6655]);
  const afterBuying = rankLivePlayersByBuildGold(
    [{ items: [createItem(6655, 3000)] }],
    { itemCostById: new Map([[6655, 3000]]), legendaryItemIds },
  );
  const afterSellingAll = rankLivePlayersByBuildGold(
    [{ items: [] }],
    { legendaryItemIds },
  );

  assert.equal(afterBuying[0].hasCompletedFirstItem, true);
  assert.equal(afterSellingAll[0].hasCompletedFirstItem, false);
  assert.equal(afterSellingAll[0].buildGoldRank, 1);
});

test("buildLegendaryItemIdSet recognizes explicit and catalog-derived Legendary items", () => {
  const legendaryItemIds = buildLegendaryItemIdSet({
    data: {
      1001: {
        id: 1001,
        tier: 3,
        price: 3000,
        from: [1000],
        to: [],
        categories: ["Boots"],
        inStore: true,
      },
      2003: {
        id: 2003,
        from: [1000],
        to: [],
        categories: ["Consumable"],
        inStore: true,
      },
      1056: {
        id: 1056,
        from: [],
        to: [],
        inStore: true,
      },
      3108: {
        id: 3108,
        from: [1004],
        to: [6655],
        inStore: true,
      },
      3001: {
        itemID: 3001,
        itemTier: { name: "Legendary" },
      },
      6655: {
        id: 6655,
        rarity: "LEGENDARY",
      },
      6657: {
        id: 6657,
        categories: [{ name: "Legendary" }],
      },
      3041: {
        id: 3041,
        from: [1082],
        to: [],
        inStore: true,
        price: 1500,
      },
      3089: {
        id: 3089,
        active: false,
        from: [1058, 1026],
        to: [],
        inStore: true,
      },
      7000: {
        id: 7000,
        from: [],
        to: [],
        specialRecipe: 3089,
        inStore: false,
      },
      9999: {
        id: 9999,
        price: 9999,
        from: [1, 2],
        to: [],
        inStore: false,
      },
    },
  });

  assert.deepEqual(
    [...legendaryItemIds].sort((left, right) => left - right),
    [3001, 3041, 3089, 6655, 6657, 7000],
  );
});

test("Legendary classification skips support quest intermediates but keeps final support items", () => {
  const legendaryItemIds = buildLegendaryItemIdSet([
    {
      id: 3866,
      specialRecipe: 3865,
      inStore: false,
      categories: ["Vision", "GoldPer", "Lane"],
    },
    {
      id: 3869,
      from: [3867],
      categories: ["Vision", "GoldPer", "Lane"],
    },
  ]);

  assert.equal(legendaryItemIds.has(3866), false);
  assert.equal(legendaryItemIds.has(3869), true);
});

test("rankLivePlayersByBuildGold assigns stable ordinal global ranks", () => {
  const metrics = rankLivePlayersByBuildGold(
    [
      { items: [createItem(1, 3000)] },
      { items: [createItem(2, 3000)] },
      { items: [createItem(3, 5000)] },
      { items: [createItem(4, -50)] },
    ],
    { itemCostById: new Map([[1, 3000], [2, 3000], [3, 5000], [4, 0]]) },
  );

  assert.deepEqual(
    metrics.map(({ buildGold, buildGoldRank }) => [buildGold, buildGoldRank]),
    [
      [3000, 2],
      [3000, 3],
      [5000, 1],
      [0, 4],
    ],
  );
  assert.equal("riotId" in metrics[0], false);
  assert.equal("summonerName" in metrics[0], false);
});

test("findLocalPlayerIndex checks Riot ID, structured Riot ID, then summoner name", () => {
  assert.equal(
    findLocalPlayerIndex(
      [
        { riotId: "First#NA1", summonerName: "Target#NA1" },
        { riotId: "Target#NA1" },
      ],
      "target#na1",
    ),
    1,
  );
  assert.equal(
    findLocalPlayerIndex(
      [
        {
          riotIdGameName: "Structured Player",
          riotIdTagLine: "TAG",
        },
      ],
      "Structured Player#TAG",
    ),
    0,
  );
  assert.equal(
    findLocalPlayerIndex([{ summonerName: "Legacy Name" }], "legacy name"),
    0,
  );
  assert.equal(findLocalPlayerIndex([{ riotId: "Someone#Else" }], "missing#id"), -1);
});

test("buildLiveGameSnapshot ranks unknown champions before omitting them and splits by local team", () => {
  const snapshot = buildLiveGameSnapshot({
    activePlayerName: "Local Player#NA1",
    championByName,
    championBySlug,
    itemCostById: new Map([[3109, 2400], [6655, 3000], [9999, 3000], [9998, 5000]]),
    legendaryItemIds: new Set([6655]),
    normalizeRole,
    players: [
      {
        championName: "Leona",
        rawChampionName: "game_character_displayname_Leona",
        riotId: "Enemy Support#NA1",
        team: "CHAOS",
        position: "UTILITY",
        items: [createItem(3109, 2400)],
      },
      {
        championName: "Ahri",
        rawChampionName: "game_character_displayname_Ahri",
        riotId: "Local Player#NA1",
        team: "ORDER",
        position: "MIDDLE",
        items: [createItem(6655, 3000)],
      },
      {
        championName: "MonkeyKing",
        rawChampionName: "game_character_displayname_MonkeyKing",
        riotIdGameName: "Ally Top",
        riotIdTagLine: "NA1",
        team: "ORDER",
        position: "TOP",
        items: [createItem(9999, 3000)],
      },
      {
        championName: "Unreleased Champion",
        rawChampionName: "game_character_displayname_UnreleasedChampion",
        summonerName: "Unknown Enemy#NA1",
        team: "CHAOS",
        position: "JUNGLE",
        items: [createItem(9998, 5000)],
      },
      {
        championName: "雪人骑士",
        rawChampionName: "game_character_displayname_Nunu",
        summonerName: "Enemy Jungle#NA1",
        team: "CHAOS",
        position: "JUNGLE",
        items: [],
      },
    ],
  });

  assert.equal(snapshot.status, "active");
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.metricsComplete, true);
  assert.equal(snapshot.totalPlayerCount, 5);
  assert.equal(snapshot.resolvedPlayerCount, 4);
  assert.equal(snapshot.omittedParticipantCount, 1);
  assert.deepEqual(
    snapshot.allies.map(
      ({ champion, championKey, role, isLocalPlayer, buildGold, buildGoldRank, hasCompletedFirstItem }) => ({
        champion,
        championKey,
        role,
        isLocalPlayer,
        buildGold,
        buildGoldRank,
        hasCompletedFirstItem,
      }),
    ),
    [
      {
        champion: "Ahri",
        championKey: "103",
        role: "middle",
        isLocalPlayer: true,
        buildGold: 3000,
        buildGoldRank: 2,
        hasCompletedFirstItem: true,
      },
      {
        champion: "Wukong",
        championKey: "62",
        role: "top",
        isLocalPlayer: false,
        buildGold: 3000,
        buildGoldRank: 3,
        hasCompletedFirstItem: false,
      },
    ],
  );
  assert.deepEqual(
    snapshot.enemies.map(({ champion, role, buildGoldRank }) => ({
      champion,
      role,
      buildGoldRank,
    })),
    [
      { champion: "Leona", role: "support", buildGoldRank: 4 },
      { champion: "Nunu & Willump", role: "jungle", buildGoldRank: 5 },
    ],
  );

  const serializedSnapshot = JSON.stringify(snapshot);
  assert.doesNotMatch(serializedSnapshot, /Local Player|Enemy Support|Ally Top|Unknown Enemy/);
  for (const participant of [...snapshot.allies, ...snapshot.enemies]) {
    assert.equal("riotId" in participant, false);
    assert.equal("riotIdGameName" in participant, false);
    assert.equal("riotIdTagLine" in participant, false);
    assert.equal("summonerName" in participant, false);
    assert.equal("team" in participant, false);
  }
});

test("buildLiveGameSnapshot reports an unavailable privacy-safe snapshot when local identity is absent", () => {
  const snapshot = buildLiveGameSnapshot({
    activePlayerName: "Missing#NA1",
    championByName,
    championBySlug,
    normalizeRole,
    players: [
      {
        championName: "Ahri",
        riotId: "Someone Else#NA1",
        team: "ORDER",
      },
    ],
  });

  assert.deepEqual(snapshot, {
    status: "unavailable",
    active: false,
    complete: false,
    metricsComplete: false,
    reason: "local_player_not_found",
    allies: [],
    enemies: [],
    totalPlayerCount: 1,
    resolvedPlayerCount: 0,
    omittedParticipantCount: 1,
  });
  assert.doesNotMatch(JSON.stringify(snapshot), /Someone Else/);
});

test("fetchLiveGameSnapshot requests both resources with the configured URL and timeout", async () => {
  const requests = [];
  const requestJson = async (resourcePath, options) => {
    requests.push({ resourcePath, options });
    if (resourcePath === "/liveclientdata/playerlist") {
      return [
        {
          championName: "Ahri",
          riotId: "Local#NA1",
          team: "ORDER",
          position: "MIDDLE",
          items: [createItem(6655, 2800)],
        },
        {
          championName: "Leona",
          riotId: "Enemy#NA1",
          team: "CHAOS",
          position: "UTILITY",
          items: [],
        },
      ];
    }
    if (resourcePath === "/liveclientdata/activeplayername") {
      return "Local#NA1";
    }
    throw new Error(`Unexpected resource: ${resourcePath}`);
  };

  const snapshot = await fetchLiveGameSnapshot({
    championByName,
    championBySlug,
    env: {
      PICKBAN_LIVE_CLIENT_DATA_URL: "http://127.0.0.1:4567/ignored-path/",
    },
    itemCostById: new Map([[6655, 3000]]),
    legendaryItemIds: new Set([6655]),
    normalizeRole,
    requestJson,
    timeoutMs: 777,
  });

  assert.equal(snapshot.status, "active");
  assert.equal(snapshot.allies[0].hasCompletedFirstItem, true);
  assert.match(snapshot.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(
    requests.map((request) => request.resourcePath).sort(),
    ["/liveclientdata/activeplayername", "/liveclientdata/playerlist"],
  );
  assert.equal(
    requests.every(
      (request) =>
        request.options.baseUrl === "http://127.0.0.1:4567" &&
        request.options.timeoutMs === 777 &&
        Object.keys(request.options).length === 2,
    ),
    true,
  );
});

test("Live Client Data URL validation permits only credential-free HTTP(S) origins", () => {
  assert.equal(
    resolveLiveClientDataBaseUrl({}),
    "https://127.0.0.1:2999",
  );
  assert.equal(
    resolveLiveClientDataBaseUrl({
      PICKBAN_LIVE_CLIENT_DATA_URL: " http://127.0.0.1:4567/path/ ",
    }),
    "http://127.0.0.1:4567",
  );
  assert.throws(
    () =>
      resolveLiveClientDataBaseUrl({
        PICKBAN_LIVE_CLIENT_DATA_URL: "ftp://127.0.0.1/data",
      }),
    /HTTP or HTTPS/,
  );
  assert.throws(
    () =>
      resolveLiveClientDataBaseUrl({
        PICKBAN_LIVE_CLIENT_DATA_URL: "https://user:secret@127.0.0.1:2999",
      }),
    /must not include credentials/,
  );
  assert.equal(isLoopbackHostname("127.0.0.1"), true);
  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("[::1]"), true);
  assert.equal(isLoopbackHostname("example.com"), false);
});

test("Live Client request options are unauthenticated and relax TLS only for loopback HTTPS", () => {
  const localHttpsOptions = buildLiveClientRequestOptions(
    "https://127.0.0.1:2999/liveclientdata/playerlist",
  );
  const remoteHttpsOptions = buildLiveClientRequestOptions(
    "https://example.com/liveclientdata/playerlist",
  );
  const localHttpOptions = buildLiveClientRequestOptions(
    "http://127.0.0.1:4567/liveclientdata/playerlist",
  );

  assert.deepEqual(localHttpsOptions.headers, { accept: "application/json" });
  assert.equal("authorization" in localHttpsOptions.headers, false);
  assert.equal(localHttpsOptions.rejectUnauthorized, false);
  assert.equal(remoteHttpsOptions.rejectUnauthorized, true);
  assert.equal("rejectUnauthorized" in localHttpOptions, false);
});
