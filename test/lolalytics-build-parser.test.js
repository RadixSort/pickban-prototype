const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isCompletedBootItem,
  parseLolalyticsMatchupBuildData,
  parseLolalyticsRenderedBuildPage,
  parseLolalyticsRuneBuildData,
} = require("../lib/lolalytics-build-parser.js");
const {
  createRenderedBuildPageHtml,
} = require("./helpers/lolalytics-mock-server.js");

test("isCompletedBootItem filters unfinished and rune-granted boots", () => {
  assert.equal(isCompletedBootItem(3006, "Berserker's Greaves"), true);
  assert.equal(isCompletedBootItem(3158, "Ionian Boots of Lucidity"), true);
  assert.equal(isCompletedBootItem(1001, "Boots"), false);
  assert.equal(isCompletedBootItem(2422, "Slightly Magical Footwear"), false);
});

test("parseLolalyticsMatchupBuildData normalizes styles, exact page candidates, items, and completed boots", () => {
  const parsed = parseLolalyticsMatchupBuildData(
    {
      header: {
        cid: 15,
        vs: 99,
        lane: "bottom",
        vsLane: "support",
        n: 100,
      },
      runes: {
        stats: {
          8008: [[60, 55, 60]],
          8021: [[40, 50, 40]],
          9111: [[45, 60, 45]],
          8009: [
            [15, 40, 15],
            [70, 57, 70],
          ],
          9103: [[40, 60, 40]],
          8014: [[35, 52, 35]],
          8017: [[25, 55, 25]],
          8304: [
            [0, 0, 0],
            [45, 58, 45],
          ],
          8321: [
            [0, 0, 0],
            [25, 52, 25],
          ],
          8345: [
            [0, 0, 0],
            [30, 56, 30],
          ],
          8347: [
            [0, 0, 0],
            [40, 59, 40],
          ],
          5005: [[80, 55, 80]],
          5008: [[60, 57, 60]],
          5011: [[70, 54, 70]],
        },
      },
      summary: {
        pick: {
          sums: {
            ids: [4, 12],
            n: 70,
            wr: 54,
          },
          runes: {
            wr: 55,
            n: 60,
            set: {
              pri: [8008, 9111, 9103, 8014],
              sec: [8304, 8347],
              mod: [5005, 5008, 5011],
            },
          },
        },
        win: {
          sums: {
            ids: [4, 14],
            n: 30,
            wr: 60,
          },
          runes: {
            wr: 55,
            n: 60,
            set: {
              pri: [8008, 8009, 9103, 8017],
              sec: [8321, 8347],
              mod: [5005, 5008, 5011],
            },
          },
        },
      },
      spells: [
        ["4_12", 54, 70, 70],
        ["4_14", 60, 30, 30],
      ],
      item1: [
        [3118, 54, 65, 65, 10],
        [2503, 58, 35, 35, 11],
      ],
      item2: [
        [3006, 54, 70, 70, 13],
        [3157, 60, 30, 30, 14],
      ],
      item3: [
        [4645, 57, 55, 55, 21],
        [6655, 52, 45, 45, 20],
      ],
      item4: [
        [3089, 59, 50, 50, 27],
      ],
      item5: [
        [3135, 61, 40, 40, 31],
      ],
      item6: [
        [3041, 64, 25, 25, 34],
      ],
      boots: [
        [3006, 54, 70, 70, 0],
        [1001, 50, 20, 20, 0],
        [2422, 60, 5, 5, 0],
        [3158, 60, 10, 10, 0],
      ],
    },
    {
      spells: {
        4: "Flash",
        12: "Teleport",
        14: "Ignite",
      },
      runes: {
        5005: "Attack Speed",
        5008: "Adaptive Force",
        5011: "Health",
        8008: "Lethal Tempo",
        8014: "Coup de Grace",
        8017: "Cut Down",
        8021: "Fleet Footwork",
        8009: "Presence of Mind",
        8304: "Magical Footwear",
        8321: "Cash Back",
        8345: "Biscuit Delivery",
        8347: "Cosmic Insight",
        9103: "Legend: Bloodline",
        9111: "Triumph",
      },
      items: {
        1001: "Boots",
        2422: "Slightly Magical Footwear",
        2503: "Blackfire Torch",
        3006: "Berserker's Greaves",
        3041: "Mejai's Soulstealer",
        3089: "Rabadon's Deathcap",
        3118: "Malignance",
        3135: "Void Staff",
        3158: "Ionian Boots of Lucidity",
        3157: "Zhonya's Hourglass",
        4645: "Shadowflame",
        6655: "Luden's Companion",
      },
    },
    {
      fetchedAt: "2026-03-19T20:15:00.000Z",
    },
  );

  assert.equal(parsed.totalGames, 100);
  assert.equal(parsed.fetchedAt, "2026-03-19T20:15:00.000Z");
  assert.deepEqual(
    parsed.runes.primaryStyleOptions.map((option) => ({
      id: option.id,
      games: option.games,
    })),
    [{ id: 8000, games: 100 }],
  );
  assert.deepEqual(
    parsed.runes.secondaryStyleOptions.map((option) => ({
      id: option.id,
      games: option.games,
    })),
    [
      { id: 8000, games: 35 },
      { id: 8300, games: 70 },
    ],
  );
  assert.equal(parsed.runes.pageCandidates.length, 1);
  assert.deepEqual(
    parsed.runes.pageCandidates[0].primaryRuneIds,
    [8008, 9111, 9103, 8014],
  );
  assert.deepEqual(
    parsed.spells.options.map((option) => ({
      setKey: option.setKey,
      games: option.games,
      spellNames: option.selections.map((selection) => selection.name),
    })),
    [
      { setKey: "4-12", games: 70, spellNames: ["Flash", "Teleport"] },
      { setKey: "4-14", games: 30, spellNames: ["Flash", "Ignite"] },
    ],
  );
  assert.deepEqual(
    parsed.items.slotOptions.map((slotOptions) =>
      slotOptions.map((option) => ({
        itemId: option.itemId,
        games: option.games,
        purchaseMinute: option.purchaseMinute,
      })),
    ),
    [
      [
        { itemId: 3118, games: 65, purchaseMinute: 10 },
        { itemId: 2503, games: 35, purchaseMinute: 11 },
      ],
      [
        { itemId: 3006, games: 70, purchaseMinute: 13 },
        { itemId: 3157, games: 30, purchaseMinute: 14 },
      ],
      [
        { itemId: 4645, games: 55, purchaseMinute: 21 },
        { itemId: 6655, games: 45, purchaseMinute: 20 },
      ],
      [{ itemId: 3089, games: 50, purchaseMinute: 27 }],
      [{ itemId: 3135, games: 40, purchaseMinute: 31 }],
      [{ itemId: 3041, games: 25, purchaseMinute: 34 }],
    ],
  );
  assert.deepEqual(
    parsed.boots.map((option) => ({
      itemId: option.itemId,
      games: option.games,
    })),
    [
      { itemId: 3006, games: 70 },
      { itemId: 3158, games: 10 },
    ],
  );
});

test("parseLolalyticsRuneBuildData normalizes the current mega rune payload shape", () => {
  const parsed = parseLolalyticsRuneBuildData(
    {
      header: {
        n: 112627,
        defaultLane: "middle",
        lane: "middle",
      },
      summary: {
        runes: {
          pick: {
            wr: 51.77,
            n: 100654,
            page: {
              pri: 1,
              sec: 2,
            },
            set: {
              pri: [8112, 8139, 8140, 8106],
              sec: [8226, 8210],
              mod: [5005, 5008, 5001],
            },
          },
          win: {
            wr: 53.58,
            n: 8232,
            page: {
              pri: 2,
              sec: 3,
            },
            set: {
              pri: [8112, 8139, 8140, 8106],
              sec: [8226, 8210],
              mod: [5005, 5008, 5001],
            },
          },
        },
        pick: {
          pri: [
            [8112, 51.77, 89.37, 100654],
            [8139, 51.64, 83.79, 94365],
            [8140, 51.65, 78.33, 88223],
            [8106, 51.75, 88.5, 99670],
          ],
          sec: [
            [8226, 51.56, 71.01, 79976],
            [8210, 51.71, 61.75, 69545],
          ],
          mod: [
            [5005, 51.71, 91.83, 103425],
            [5008, 51.79, 96.74, 108950],
            [5001, 51.63, 76, 85598],
          ],
        },
        win: {
          pri: [
            [8112, 53.58, 7.31, 8232],
          ],
          sec: [
            [8226, 52.42, 5.53, 6232],
          ],
          mod: [
            [5008, 52.94, 6.72, 7567],
          ],
        },
      },
    },
    {
      allyChampionKey: "103",
      enemyChampionKey: "89",
      fetchedAt: "2026-05-24T13:45:00.000Z",
      role: "middle",
    },
  );

  assert.equal(parsed.allyChampionKey, "103");
  assert.equal(parsed.enemyChampionKey, "89");
  assert.equal(parsed.role, "middle");
  assert.equal(parsed.totalGames, 112627);
  assert.equal(parsed.runes.pageCandidates.length, 1);
  assert.deepEqual(parsed.runes.pageCandidates[0].primaryRuneIds, [8112, 8139, 8140, 8106]);
  assert.deepEqual(
    parsed.runes.primarySlotOptions.map((slotOptions) =>
      slotOptions.map((option) => ({
        id: option.id,
        games: option.games,
      })),
    ),
    [
      [{ id: 8112, games: 100654 }],
      [{ id: 8139, games: 94365 }],
      [{ id: 8140, games: 88223 }],
      [{ id: 8106, games: 99670 }],
    ],
  );
  assert.deepEqual(parsed.spells.options, []);
  assert.deepEqual(parsed.items.slotOptions, [[], [], [], [], [], []]);
  assert.deepEqual(parsed.boots, []);
});

test("parseLolalyticsRuneBuildData accepts current Senna Sorcery pages with Deathfire Touch", () => {
  const parsed = parseLolalyticsRuneBuildData(
    {
      header: {
        n: 103151,
        defaultLane: "bottom",
        lane: "support",
      },
      summary: {
        runes: {
          pick: {
            wr: 54.44,
            n: 76443,
            page: {
              pri: 2,
              sec: 4,
            },
            set: {
              pri: [8992, 8226, 8234, 8236],
              sec: [8304, 8316],
              mod: [5005, 5008, 5011],
            },
          },
          win: {
            wr: 54.44,
            n: 76443,
            page: {
              pri: 2,
              sec: 4,
            },
            set: {
              pri: [8992, 8226, 8234, 8236],
              sec: [8316, 8304],
              mod: [5008, 5010, 5011],
            },
          },
        },
        pick: {
          pri: [
            [8992, 54.44, 74.11, 76443],
            [8226, 54.37, 78.27, 80735],
            [8234, 54.56, 71.83, 74098],
            [8236, 54.53, 70.85, 73084],
          ],
          sec: [
            [8304, 54.76, 65.59, 67661],
            [8316, 55.26, 53.35, 55031],
          ],
          mod: [
            [5005, 54.33, 37.21, 38390],
            [5008, 54.67, 38.81, 40039],
            [5011, 54.27, 48.71, 50253],
          ],
        },
        win: {
          pri: [
            [8992, 54.44, 74.11, 76443],
          ],
          sec: [
            [8316, 55.26, 53.35, 55031],
          ],
          mod: [
            [5010, 55.29, 29.98, 30933],
          ],
        },
      },
    },
    {
      allyChampionKey: "235",
      enemyChampionKey: "103",
      fetchedAt: "2026-06-07T02:41:13.285Z",
      role: "support",
    },
  );

  assert.equal(parsed.totalGames, 103151);
  assert.equal(parsed.runes.pageCandidates.length, 1);
  assert.deepEqual(parsed.runes.pageCandidates[0].primaryRuneIds, [8992, 8226, 8234, 8236]);
  assert.deepEqual(parsed.runes.pageCandidates[0].secondaryRuneIds, [8304, 8316]);
  assert.equal(parsed.runes.pageCandidates[0].primaryStyleId, 8200);
  assert.deepEqual(
    parsed.runes.primarySlotOptions.map((slotOptions) =>
      slotOptions.map((option) => option.id),
    ),
    [[8992], [8226], [8234], [8236]],
  );
});

test("parseLolalyticsRenderedBuildPage restores current rendered page spells, items, and boots", () => {
  const parsed = parseLolalyticsRenderedBuildPage(
    createRenderedBuildPageHtml({
      coreGames: 60,
      coreWinRate: 57.61,
      spellGames: 48,
      spellWinRate: 53.63,
      splitStats: true,
    }),
    {
      allyChampionKey: "103",
      enemyChampionKey: "89",
      fetchedAt: "2026-05-24T14:15:00.000Z",
      role: "middle",
    },
  );

  assert.equal(parsed.allyChampionKey, "103");
  assert.equal(parsed.enemyChampionKey, "89");
  assert.equal(parsed.role, "middle");
  assert.equal(parsed.totalGames, 60);
  assert.deepEqual(parsed.spells.options[0].spellIds, [4, 14]);
  assert.deepEqual(
    parsed.spells.options[0].selections.map((selection) => selection.name),
    ["Flash", "Ignite"],
  );
  assert.deepEqual(
    parsed.startingItems.options.map((option) => option.selections.map((selection) => selection.name)),
    [
      ["Doran's Ring", "Health Potion"],
      ["Dark Seal", "Refillable Potion"],
    ],
  );
  assert.equal(parsed.startingItems.options[0].games, 36);
  assert.equal(Number(parsed.startingItems.options[1].winRate.toFixed(2)), 57.22);
  assert.deepEqual(
    parsed.items.slotOptions.map((slotOptions) => slotOptions.map((option) => option.name)),
    [
      ["Dusk and Dawn"],
      [],
      ["Nashor's Tooth"],
      ["Rabadon's Deathcap", "Shadowflame"],
      ["Shadowflame", "Void Staff"],
      ["Void Staff"],
    ],
  );
  assert.equal(parsed.items.slotOptions[0][0].games, 60);
  assert.equal(parsed.items.slotOptions[2][0].games, 6);
  assert.deepEqual(
    parsed.boots.map((option) => ({
      itemId: option.itemId,
      name: option.name,
      games: option.games,
    })),
    [{ itemId: 3170, name: "Gluttonous Greaves", games: 9 }],
  );
});

test("parseLolalyticsRenderedBuildPage reads starting items from both build tabs", () => {
  const parsed = parseLolalyticsRenderedBuildPage(
    `
      <main>
        <h2>Highest Win Build</h2>
        <h2>Starting Items</h2>
        <img src="https://cdn5.lolalytics.com/item64/1082.webp" alt="Dark Seal" />
        <img src="https://cdn5.lolalytics.com/item64/2031.webp" alt="Refillable Potion" />
        <p>54.88% Win Rate 82 Games</p>
        <h2>Core Build</h2>
        <img src="https://cdn5.lolalytics.com/item64/4646.webp" alt="Stormsurge" />
        <p>59.21%</p>
        <p>152</p>
        <h2>Most Common Build</h2>
        <h2>Starting Items</h2>
        <img src="https://cdn5.lolalytics.com/item64/1056.webp" alt="Doran's Ring" />
        <img src="https://cdn5.lolalytics.com/item64/2003.webp" alt="Health Potion" />
        <span>50.64</span>
        <span>% Win Rate</span>
        <span>312 Games</span>
        <h2>Core Build</h2>
        <img src="https://cdn5.lolalytics.com/item64/3118.webp" alt="Malignance" />
        <p>52.2%</p>
        <p>401</p>
      </main>
    `,
    {
      allyChampionKey: "8",
      enemyChampionKey: "254",
      fetchedAt: "2026-06-08T12:00:00.000Z",
      role: "middle",
    },
  );

  assert.deepEqual(
    parsed.startingItems.options.map((option) => ({
      itemIds: option.itemIds,
      games: option.games,
      names: option.selections.map((selection) => selection.name),
    })),
    [
      {
        itemIds: [1082, 2031],
        games: 82,
        names: ["Dark Seal", "Refillable Potion"],
      },
      {
        itemIds: [1056, 2003],
        games: 312,
        names: ["Doran's Ring", "Health Potion"],
      },
    ],
  );
});

test("parseLolalyticsRenderedBuildPage reads inactive item tabs from Qwik snapshot data", () => {
  const itemNames = Object.fromEntries(
    Array.from({ length: 120 }, (_, index) => {
      const itemId = 1000 + index;
      return [String(itemId), `Item ${itemId}`];
    }),
  );
  Object.assign(itemNames, {
    1102: "Gustwalker Hatchling",
    1103: "Mosstomper Seedling",
    2003: "Health Potion",
    3047: "Plated Steelcaps",
    3078: "Trinity Force",
    6333: "Death's Dance",
    6610: "Sundered Sky",
  });
  const qwikSnapshot = {
    refs: {},
    ctx: {},
    subs: [],
    objs: [
      {
        header: {
          cid: 62,
          vs: 254,
          lane: "jungle",
          vsLane: "jungle",
          n: 1738,
        },
        summary: {
          pick: {
            items: {
              start: {
                n: 578,
                wr: 53.81,
                set: [1102, 2003],
              },
              item1: {
                id: 3078,
                n: 1494,
                wr: 54.35,
              },
              item2: {
                id: 3047,
                n: 936,
                wr: 55.88,
              },
              item3: {
                id: 6610,
                n: 1104,
                wr: 54.62,
              },
            },
          },
          win: {
            items: {
              start: {
                n: 80,
                wr: 63.75,
                set: [1103, 2003],
              },
              item1: {
                id: 6610,
                n: 134,
                wr: 57.46,
              },
              item2: {
                id: 3047,
                n: 936,
                wr: 55.88,
              },
              item3: {
                id: 6333,
                n: 47,
                wr: 59.57,
              },
            },
          },
        },
        spells: [["4_11", 54.23, 99.94, 1737]],
        startSet: [
          ["1102_2003", 53.81, 33.26, 578],
          ["1103_2003", 63.75, 4.6, 80],
        ],
        boots: [[3047, 55.88, 53.86, 936, 16]],
        item: [
          [3078, 54.45, 91.2, 1585, 12],
          [6610, 54.94, 75.09, 1305, 19],
          [3047, 55.88, 53.86, 936, 16],
          [6333, 60.82, 26.58, 462, 26],
        ],
        item1: [
          [3078, 54.35, 85.96, 1494, 11],
          [6610, 57.46, 7.71, 134, 11],
        ],
        item2: [[6610, 54.62, 63.52, 1104, 19]],
        item3: [[6333, 59.57, 2.7, 47, 26]],
      },
      itemNames,
    ],
  };
  const parsed = parseLolalyticsRenderedBuildPage(
    `
      <main>
        <h2>Highest Win Build</h2>
        <h2>Starting Items</h2>
        <img src="https://cdn5.lolalytics.com/item64/1103.webp" alt="Mosstomper Seedling" />
        <img src="https://cdn5.lolalytics.com/item64/2003.webp" alt="Health Potion" />
        <p>63.75% Win Rate 80 Games</p>
        <h2>Core Build</h2>
        <img src="https://cdn5.lolalytics.com/item64/6610.webp" alt="Sundered Sky" />
        <p>57.46%</p>
        <p>134</p>
      </main>
      <script type="qwik/json">${JSON.stringify(qwikSnapshot)}</script>
    `,
    {
      allyChampionKey: "62",
      enemyChampionKey: "254",
      fetchedAt: "2026-06-26T12:00:00.000Z",
      role: "jungle",
    },
  );

  assert.deepEqual(
    parsed.items.mostPickedSlotOptions[0].map((option) => ({
      itemId: option.itemId,
      name: option.name,
      games: option.games,
      purchaseMinute: option.purchaseMinute,
    })),
    [
      {
        itemId: 3078,
        name: "Trinity Force",
        games: 1494,
        purchaseMinute: 11,
      },
    ],
  );
  assert.deepEqual(
    parsed.items.highestWinSlotOptions[0].map((option) => ({
      itemId: option.itemId,
      name: option.name,
      games: option.games,
      purchaseMinute: option.purchaseMinute,
    })),
    [
      {
        itemId: 6610,
        name: "Sundered Sky",
        games: 134,
        purchaseMinute: 11,
      },
    ],
  );
  assert.equal(parsed.items.slotOptions[0][0].name, "Trinity Force");
  assert.equal(parsed.startingItems.options[0].setKey, "1102-2003");
});

test("parseLolalyticsRenderedBuildPage isolates missing rendered build rows", () => {
  assert.throws(
    () => parseLolalyticsRenderedBuildPage("<section><h2>Core Build</h2></section>"),
    /did not include usable build rows/i,
  );
});

test("parseLolalyticsRuneBuildData isolates missing rune summaries", () => {
  assert.throws(
    () =>
      parseLolalyticsRuneBuildData({
        header: {
          n: 100,
          lane: "middle",
        },
        summary: {},
      }),
    /missing rune summary data/i,
  );
});
