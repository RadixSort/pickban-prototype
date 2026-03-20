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

test("parseLolalyticsMatchupBuildData normalizes styles, exact page candidates, and completed boots", () => {
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
      boots: [
        [3006, 54, 70, 70, 0],
        [1001, 50, 20, 20, 0],
        [2422, 60, 5, 5, 0],
        [3158, 60, 10, 10, 0],
      ],
    },
    {
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
        3006: "Berserker's Greaves",
        3158: "Ionian Boots of Lucidity",
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
