const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isCompletedBootItem,
  parseLolalyticsMatchupBuildData,
} = require("../lib/lolalytics-build-parser.js");

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
