const test = require("node:test");
const assert = require("node:assert/strict");

const {
  filterBuildCounterEnemies,
  formatBuildGoldThousands,
  resolveBuildGoldScoreboard,
  resolveAutomaticBuildCounterFilter,
  resolveHighestRankedEnemyChampionKey,
  resolveVisibleBuildGoldRank,
  toggleBuildCounterFilter,
} = require("../public/build-counter-filter.js");

const availableKeys = ["103", "99", "64"];

test("team build-gold totals use one-decimal thousands", () => {
  assert.equal(formatBuildGoldThousands(21303), "21.3k");
  assert.equal(formatBuildGoldThousands(21360), "21.4k");
  assert.equal(formatBuildGoldThousands(1000), "1.0k");
  assert.equal(formatBuildGoldThousands(0), "0.0k");
});

test("team build-gold formatting safely falls back to zero", () => {
  assert.equal(formatBuildGoldThousands(-1), "0.0k");
  assert.equal(formatBuildGoldThousands(Number.NaN), "0.0k");
  assert.equal(formatBuildGoldThousands(Number.POSITIVE_INFINITY), "0.0k");
});

test("an empty legacy selection is treated as all enemies before toggling", () => {
  assert.deepEqual(
    toggleBuildCounterFilter([], "99", availableKeys),
    ["103", "64"],
  );
});

test("excluded portraits can be added back into the filter", () => {
  assert.deepEqual(
    toggleBuildCounterFilter(["103", "64"], "99", availableKeys),
    availableKeys,
  );
});

test("active portraits can be removed and the final removal restores all enemies", () => {
  assert.deepEqual(
    toggleBuildCounterFilter(availableKeys, "99", availableKeys),
    ["103", "64"],
  );
  assert.deepEqual(
    toggleBuildCounterFilter(["64"], "64", availableKeys),
    availableKeys,
  );
});

test("filterBuildCounterEnemies treats an empty selection as the full draft", () => {
  const enemies = availableKeys.map((key) => ({ key }));

  assert.deepEqual(filterBuildCounterEnemies(enemies, []), enemies);
  assert.deepEqual(
    filterBuildCounterEnemies(enemies, ["99", "64"]),
    [{ key: "99" }, { key: "64" }],
  );
});

test("automatic live filtering selects exact lane opponents before the first item", () => {
  const enemies = [
    { key: "103", role: "middle" },
    { key: "99", role: "support" },
    { key: "64", role: "jungle" },
  ];

  assert.deepEqual(
    resolveAutomaticBuildCounterFilter(
      { key: "7", role: "middle", hasCompletedFirstItem: false },
      enemies,
      { liveGameActive: true, liveGameComplete: true },
    ),
    {
      applied: true,
      reason: "lane",
      selectedChampionKeys: ["103"],
    },
  );
});

test("automatic lane filtering treats Bottom and Support as one shared lane", () => {
  const enemies = [
    { key: "22", role: "bottom" },
    { key: "89", role: "support" },
    { key: "103", role: "middle" },
  ];

  assert.deepEqual(
    resolveAutomaticBuildCounterFilter(
      { key: "51", role: "bottom", hasCompletedFirstItem: false },
      enemies,
      { liveGameActive: true, liveGameComplete: true },
    ),
    {
      applied: true,
      reason: "lane",
      selectedChampionKeys: ["22", "89"],
    },
  );
});

test("automatic lane filtering explicitly falls back to all enemies when no lane matches", () => {
  const enemies = [
    { key: "122", role: "top" },
    { key: "64", role: "jungle" },
    { key: "89", role: "support" },
  ];

  assert.deepEqual(
    resolveAutomaticBuildCounterFilter(
      { key: "103", role: "middle", hasCompletedFirstItem: false },
      enemies,
      { liveGameActive: true, liveGameComplete: true },
    ),
    {
      applied: false,
      reason: null,
      selectedChampionKeys: ["122", "64", "89"],
    },
  );
});

test("automatic live filtering keeps global build-gold ranks 1 through 5 after the first item", () => {
  const enemies = [
    { key: "103", buildGoldRank: 1 },
    { key: "99", buildGoldRank: 5 },
    { key: "64", buildGoldRank: 6 },
    { key: "22", buildGoldRank: 10 },
  ];

  assert.deepEqual(
    resolveAutomaticBuildCounterFilter(
      { key: "7", hasCompletedFirstItem: true },
      enemies,
      { liveGameActive: true, liveGameComplete: true },
    ),
    {
      applied: true,
      reason: "top-half",
      selectedChampionKeys: ["103", "99"],
    },
  );
});

test("automatic filtering follows current Legendary ownership through buy and sell", () => {
  const enemies = [
    { key: "84", role: "middle", buildGoldRank: 6 },
    { key: "799", role: "top", buildGoldRank: 2 },
    { key: "233", role: "jungle", buildGoldRank: 4 },
    { key: "523", role: "bottom", buildGoldRank: 8 },
    { key: "201", role: "support", buildGoldRank: 1 },
  ];
  const options = { liveGameActive: true, liveGameComplete: true };

  const beforeFirstLegendary = resolveAutomaticBuildCounterFilter(
    { key: "103", role: "middle", hasCompletedFirstItem: false },
    enemies,
    options,
  );
  const afterBuyingLegendary = resolveAutomaticBuildCounterFilter(
    { key: "103", role: "middle", hasCompletedFirstItem: true },
    enemies,
    options,
  );
  const afterSellingAllLegendaries = resolveAutomaticBuildCounterFilter(
    { key: "103", role: "middle", hasCompletedFirstItem: false },
    enemies,
    options,
  );

  assert.deepEqual(beforeFirstLegendary, {
    applied: true,
    reason: "lane",
    selectedChampionKeys: ["84"],
  });
  assert.deepEqual(afterBuyingLegendary, {
    applied: true,
    reason: "top-half",
    selectedChampionKeys: ["799", "233", "201"],
  });
  assert.deepEqual(afterSellingAllLegendaries, beforeFirstLegendary);
  assert.deepEqual(
    enemies.map((enemy) => resolveVisibleBuildGoldRank(enemy.buildGoldRank, options)),
    [6, 2, 4, 8, 1],
  );
});

test("highest-ranked enemy uses the best enemy global rank, even when an ally is rank 1", () => {
  const enemies = [
    { key: "84", buildGoldRank: 7 },
    { key: "799", buildGoldRank: 2 },
    { key: "233", buildGoldRank: 5 },
  ];

  assert.equal(
    resolveHighestRankedEnemyChampionKey(enemies, {
      liveGameActive: true,
      liveGameComplete: true,
    }),
    "799",
  );
  assert.equal(
    resolveHighestRankedEnemyChampionKey(
      [
        { key: "84", buildGoldRank: 3 },
        { key: "799", buildGoldRank: 6 },
        { key: "233", buildGoldRank: 8 },
      ],
      { liveGameActive: true, liveGameComplete: true },
    ),
    "84",
  );
  assert.equal(
    resolveHighestRankedEnemyChampionKey(enemies, {
      liveGameActive: true,
      liveGameComplete: false,
    }),
    "",
  );
});

test("automatic filtering falls back to all enemies when live-game data is inactive or incomplete", () => {
  const enemies = [
    { key: "103", role: "middle", buildGoldRank: 4 },
    { key: "99", role: "support", buildGoldRank: 6 },
  ];
  const ally = {
    key: "7",
    role: "middle",
    hasCompletedFirstItem: false,
  };
  const fallback = {
    applied: false,
    reason: null,
    selectedChampionKeys: ["103", "99"],
  };

  assert.deepEqual(
    resolveAutomaticBuildCounterFilter(ally, enemies, {
      liveGameActive: false,
      liveGameComplete: true,
    }),
    fallback,
  );
  assert.deepEqual(
    resolveAutomaticBuildCounterFilter(ally, enemies, {
      liveGameActive: true,
      liveGameComplete: false,
    }),
    fallback,
  );
});

test("automatic filtering falls back to all enemies when required participant data is missing", () => {
  const options = { liveGameActive: true, liveGameComplete: true };
  const enemies = [
    { key: "103", role: "middle", buildGoldRank: 4 },
    { key: "99", role: "support", buildGoldRank: 6 },
  ];
  const fallback = {
    applied: false,
    reason: null,
    selectedChampionKeys: ["103", "99"],
  };

  assert.deepEqual(
    resolveAutomaticBuildCounterFilter(
      { key: "7", role: "middle" },
      enemies,
      options,
    ),
    fallback,
  );
  assert.deepEqual(
    resolveAutomaticBuildCounterFilter(
      { key: "7", role: "middle", hasCompletedFirstItem: false },
      [{ key: "103", role: "middle" }, { key: "99" }],
      options,
    ),
    fallback,
  );
  assert.deepEqual(
    resolveAutomaticBuildCounterFilter(
      { key: "7", hasCompletedFirstItem: true },
      [{ key: "103", buildGoldRank: 4 }, { key: "99" }],
      options,
    ),
    fallback,
  );
});

test("automatic top-half filtering silently restores all enemies when none rank in the top five", () => {
  const enemies = [
    { key: "103", buildGoldRank: 6 },
    { key: "99", buildGoldRank: 7 },
    { key: "64", buildGoldRank: 10 },
  ];
  const resolution = resolveAutomaticBuildCounterFilter(
    { key: "7", hasCompletedFirstItem: true },
    enemies,
    { liveGameActive: true, liveGameComplete: true },
  );

  assert.deepEqual(resolution, {
    applied: false,
    reason: null,
    selectedChampionKeys: ["103", "99", "64"],
  });
  assert.deepEqual(
    filterBuildCounterEnemies(enemies, resolution.selectedChampionKeys),
    enemies,
  );
});

test("build-gold ranks are visible only for complete live snapshots", () => {
  assert.equal(
    resolveVisibleBuildGoldRank(4, {
      liveGameActive: true,
      liveGameComplete: true,
    }),
    4,
  );
  assert.equal(
    resolveVisibleBuildGoldRank(4, {
      liveGameActive: true,
      liveGameComplete: false,
    }),
    null,
  );
  assert.equal(
    resolveVisibleBuildGoldRank(4, {
      liveGameActive: false,
      liveGameComplete: true,
    }),
    null,
  );
});

test("team build-gold scoreboard sums every player in a complete live snapshot", () => {
  assert.deepEqual(
    resolveBuildGoldScoreboard(
      [{ buildGold: 3200 }, { buildGold: 4100 }, { buildGold: 2750 }],
      [{ buildGold: 3900 }, { buildGold: 3050 }],
      { liveGameActive: true, liveGameComplete: true },
    ),
    {
      available: true,
      allyBuildGold: 10050,
      enemyBuildGold: 6950,
    },
  );
});

test("team build-gold scoreboard suppresses stale values without complete live data", () => {
  const allies = [{ buildGold: 12345 }];
  const enemies = [{ buildGold: 9876 }];
  const unavailable = {
    available: false,
    allyBuildGold: 0,
    enemyBuildGold: 0,
  };

  assert.deepEqual(
    resolveBuildGoldScoreboard(allies, enemies, {
      liveGameActive: false,
      liveGameComplete: true,
    }),
    unavailable,
  );
  assert.deepEqual(
    resolveBuildGoldScoreboard(allies, enemies, {
      liveGameActive: true,
      liveGameComplete: false,
    }),
    unavailable,
  );
});

test("team build-gold scoreboard requires valid values for every player", () => {
  const options = { liveGameActive: true, liveGameComplete: true };
  const unavailable = {
    available: false,
    allyBuildGold: 0,
    enemyBuildGold: 0,
  };

  assert.deepEqual(
    resolveBuildGoldScoreboard([{ buildGold: 4000 }, {}], [{ buildGold: 3500 }], options),
    unavailable,
  );
  assert.deepEqual(
    resolveBuildGoldScoreboard([{ buildGold: -1 }], [{ buildGold: 3500 }], options),
    unavailable,
  );
  assert.deepEqual(
    resolveBuildGoldScoreboard([{ buildGold: 4000 }], [{ buildGold: Infinity }], options),
    unavailable,
  );
});

test("team build-gold scoreboard preserves legitimate zero values", () => {
  assert.deepEqual(
    resolveBuildGoldScoreboard(
      [{ buildGold: 0 }],
      [{ buildGold: "0" }],
      { liveGameActive: true, liveGameComplete: true },
    ),
    {
      available: true,
      allyBuildGold: 0,
      enemyBuildGold: 0,
    },
  );
});
