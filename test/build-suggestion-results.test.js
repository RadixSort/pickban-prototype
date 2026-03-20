const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBuildSuggestionResults,
} = require("../lib/build-suggestion-results.js");

function createMatchupBuild({
  totalGames,
  fetchedAt,
  primaryStyleOptions,
  secondaryStyleOptions,
  primarySlotOptions,
  secondarySlotOptions,
  statOptions,
  pageCandidates,
  boots,
}) {
  return {
    totalGames,
    fetchedAt,
    runes: {
      primaryStyleOptions,
      secondaryStyleOptions,
      primarySlotOptions,
      secondarySlotOptions,
      statOptions,
      pageCandidates,
    },
    boots,
  };
}

function createPageCandidate({
  pageKey,
  games,
  wins,
  primaryStyleId,
  secondaryStyleId,
  primaryRuneIds,
  secondaryRuneIds,
  modifierIds,
}) {
  return {
    pageKey,
    games,
    wins,
    primaryStyleId,
    secondaryStyleId,
    primaryRunes: primaryRuneIds.map((id) => ({ id, icon: `${id}.webp`, name: `Rune ${id}` })),
    secondaryRunes: secondaryRuneIds.map((id) => ({ id, icon: `${id}.webp`, name: `Rune ${id}` })),
    modifiers: modifierIds.map((id) => ({ id, icon: `${id}.webp`, name: `Mod ${id}` })),
  };
}

test("buildBuildSuggestionResults aggregates overview groups, exact pages, and boots", () => {
  const aggregated = buildBuildSuggestionResults({
    matchupBuilds: [
      createMatchupBuild({
        totalGames: 100,
        fetchedAt: "2026-03-19T20:15:00.000Z",
        primaryStyleOptions: [
          { id: 8000, icon: "precision.png", name: "Precision", games: 100, wins: 55 },
        ],
        secondaryStyleOptions: [
          { id: 8300, icon: "inspiration.png", name: "Inspiration", games: 100, wins: 55 },
        ],
        primarySlotOptions: [
          [
            { id: 8008, icon: "8008.webp", name: "Lethal Tempo", games: 80, wins: 44, styleId: 8000, styleName: "Precision" },
            { id: 8021, icon: "8021.webp", name: "Fleet Footwork", games: 20, wins: 11, styleId: 8000, styleName: "Precision" },
          ],
          [{ id: 9111, icon: "9111.webp", name: "Triumph", games: 80, wins: 44, styleId: 8000, styleName: "Precision" }],
          [{ id: 9103, icon: "9103.webp", name: "Legend: Bloodline", games: 80, wins: 44, styleId: 8000, styleName: "Precision" }],
          [{ id: 8014, icon: "8014.webp", name: "Coup de Grace", games: 80, wins: 44, styleId: 8000, styleName: "Precision" }],
        ],
        secondarySlotOptions: [
          [],
          [{ id: 8304, icon: "8304.webp", name: "Magical Footwear", games: 60, wins: 33, styleId: 8300, styleName: "Inspiration" }],
          [{ id: 8345, icon: "8345.webp", name: "Biscuit Delivery", games: 40, wins: 22, styleId: 8300, styleName: "Inspiration" }],
          [{ id: 8347, icon: "8347.webp", name: "Cosmic Insight", games: 60, wins: 33, styleId: 8300, styleName: "Inspiration" }],
        ],
        statOptions: [
          { id: 5005, icon: "5005.webp", name: "Attack Speed", games: 80, wins: 44 },
          { id: 5008, icon: "5008.webp", name: "Adaptive Force", games: 70, wins: 39 },
          { id: 5011, icon: "5011.webp", name: "Health", games: 65, wins: 36 },
        ],
        pageCandidates: [
          createPageCandidate({
            pageKey: "page-a",
            games: 80,
            wins: 44,
            primaryStyleId: 8000,
            secondaryStyleId: 8300,
            primaryRuneIds: [8008, 9111, 9103, 8014],
            secondaryRuneIds: [8304, 8347],
            modifierIds: [5005, 5008, 5011],
          }),
        ],
        boots: [
          { itemId: 3006, icon: "3006.webp", name: "Berserker's Greaves", games: 70, wins: 40 },
          { itemId: 3158, icon: "3158.webp", name: "Ionian Boots of Lucidity", games: 30, wins: 19 },
        ],
      }),
      createMatchupBuild({
        totalGames: 100,
        fetchedAt: "2026-03-19T20:30:00.000Z",
        primaryStyleOptions: [
          { id: 8200, icon: "sorcery.png", name: "Sorcery", games: 100, wins: 57 },
        ],
        secondaryStyleOptions: [
          { id: 8400, icon: "resolve.png", name: "Resolve", games: 100, wins: 57 },
        ],
        primarySlotOptions: [
          [
            { id: 8229, icon: "8229.webp", name: "Arcane Comet", games: 30, wins: 19, styleId: 8200, styleName: "Sorcery" },
          ],
          [{ id: 8226, icon: "8226.webp", name: "Manaflow Band", games: 30, wins: 19, styleId: 8200, styleName: "Sorcery" }],
          [{ id: 8233, icon: "8233.webp", name: "Absolute Focus", games: 30, wins: 19, styleId: 8200, styleName: "Sorcery" }],
          [{ id: 8236, icon: "8236.webp", name: "Gathering Storm", games: 30, wins: 19, styleId: 8200, styleName: "Sorcery" }],
        ],
        secondarySlotOptions: [
          [],
          [{ id: 8446, icon: "8446.webp", name: "Demolish", games: 30, wins: 19, styleId: 8400, styleName: "Resolve" }],
          [{ id: 8473, icon: "8473.webp", name: "Bone Plating", games: 30, wins: 19, styleId: 8400, styleName: "Resolve" }],
          [{ id: 8451, icon: "8451.webp", name: "Overgrowth", games: 30, wins: 19, styleId: 8400, styleName: "Resolve" }],
        ],
        statOptions: [
          { id: 5008, icon: "5008.webp", name: "Adaptive Force", games: 30, wins: 19 },
          { id: 5011, icon: "5011.webp", name: "Health", games: 30, wins: 19 },
        ],
        pageCandidates: [
          createPageCandidate({
            pageKey: "page-c",
            games: 30,
            wins: 19,
            primaryStyleId: 8200,
            secondaryStyleId: 8400,
            primaryRuneIds: [8229, 8226, 8233, 8236],
            secondaryRuneIds: [8446, 8451],
            modifierIds: [5008, 5011],
          }),
        ],
        boots: [
          { itemId: 3006, icon: "3006.webp", name: "Berserker's Greaves", games: 20, wins: 10 },
          { itemId: 3158, icon: "3158.webp", name: "Ionian Boots of Lucidity", games: 60, wins: 39 },
        ],
      }),
    ],
  });

  assert.equal(aggregated.lastUpdatedAt, "2026-03-19T20:30:00.000Z");
  assert.equal(aggregated.runes.mostPickedPage.pageKey, "page-a");
  assert.equal(aggregated.runes.highestWinPage.pageKey, "page-c");

  const primaryStyleGroup = aggregated.runes.overview.slotGroups.find(
    (group) => group.key === "primary-style",
  );
  const precisionOption = primaryStyleGroup.options.find((option) => option.id === 8000);
  const sorceryOption = primaryStyleGroup.options.find((option) => option.id === 8200);

  assert.equal(precisionOption.isMostPicked, true);
  assert.equal(precisionOption.isHighestWin, false);
  assert.equal(sorceryOption.isMostPicked, false);
  assert.equal(sorceryOption.isHighestWin, true);

  const bootsById = new Map(
    aggregated.boots.options.map((option) => [option.itemId, option]),
  );
  assert.equal(bootsById.get(3158).isMostPicked, true);
  assert.equal(bootsById.get(3158).isHighestWin, true);
});

test("buildBuildSuggestionResults reports when no page crosses the highest-win threshold", () => {
  const aggregated = buildBuildSuggestionResults({
    highestWinPageThresholdPct: 60,
    matchupBuilds: [
      createMatchupBuild({
        totalGames: 100,
        fetchedAt: "2026-03-19T20:15:00.000Z",
        primaryStyleOptions: [{ id: 8000, icon: "", name: "Precision", games: 100, wins: 55 }],
        secondaryStyleOptions: [{ id: 8300, icon: "", name: "Inspiration", games: 100, wins: 55 }],
        primarySlotOptions: [[], [], [], []],
        secondarySlotOptions: [[], [], [], []],
        statOptions: [],
        pageCandidates: [
          createPageCandidate({
            pageKey: "page-a",
            games: 40,
            wins: 24,
            primaryStyleId: 8000,
            secondaryStyleId: 8300,
            primaryRuneIds: [8008, 9111, 9103, 8014],
            secondaryRuneIds: [8304, 8347],
            modifierIds: [5005, 5008, 5011],
          }),
        ],
        boots: [],
      }),
    ],
  });

  assert.equal(aggregated.runes.highestWinPage, null);
  assert.match(aggregated.runes.highlighting.notes[0], /60%/i);
});

test("buildBuildSuggestionResults uses a 1% default threshold for highest-win page and boots", () => {
  const aggregated = buildBuildSuggestionResults({
    matchupBuilds: [
      createMatchupBuild({
        totalGames: 1000,
        fetchedAt: "2026-03-19T20:15:00.000Z",
        primaryStyleOptions: [{ id: 8000, icon: "", name: "Precision", games: 1000, wins: 500 }],
        secondaryStyleOptions: [{ id: 8300, icon: "", name: "Inspiration", games: 1000, wins: 500 }],
        primarySlotOptions: [[], [], [], []],
        secondarySlotOptions: [[], [], [], []],
        statOptions: [],
        pageCandidates: [
          createPageCandidate({
            pageKey: "page-over-threshold",
            games: 15,
            wins: 12,
            primaryStyleId: 8000,
            secondaryStyleId: 8300,
            primaryRuneIds: [8008, 9111, 9103, 8014],
            secondaryRuneIds: [8304, 8347],
            modifierIds: [5005, 5008, 5011],
          }),
          createPageCandidate({
            pageKey: "page-under-threshold",
            games: 9,
            wins: 9,
            primaryStyleId: 8000,
            secondaryStyleId: 8300,
            primaryRuneIds: [8021, 9111, 9103, 8014],
            secondaryRuneIds: [8304, 8347],
            modifierIds: [5005, 5008, 5011],
          }),
        ],
        boots: [
          { itemId: 3158, icon: "3158.webp", name: "Ionian Boots of Lucidity", games: 15, wins: 12 },
          { itemId: 3006, icon: "3006.webp", name: "Berserker's Greaves", games: 9, wins: 9 },
          { itemId: 3047, icon: "3047.webp", name: "Plated Steelcaps", games: 976, wins: 400 },
        ],
      }),
    ],
  });

  assert.equal(aggregated.runes.highestWinPage.pageKey, "page-over-threshold");
  assert.equal(
    aggregated.boots.options.find((option) => option.itemId === 3158)?.isHighestWin,
    true,
  );
  assert.equal(
    aggregated.boots.options.find((option) => option.itemId === 3006)?.isHighestWin,
    false,
  );
});

test("buildBuildSuggestionResults sorts boot options by descending win rate", () => {
  const aggregated = buildBuildSuggestionResults({
    matchupBuilds: [
      createMatchupBuild({
        totalGames: 1000,
        fetchedAt: "2026-03-19T20:15:00.000Z",
        primaryStyleOptions: [{ id: 8000, icon: "", name: "Precision", games: 1000, wins: 500 }],
        secondaryStyleOptions: [{ id: 8300, icon: "", name: "Inspiration", games: 1000, wins: 500 }],
        primarySlotOptions: [[], [], [], []],
        secondarySlotOptions: [[], [], [], []],
        statOptions: [],
        pageCandidates: [],
        boots: [
          { itemId: 3158, icon: "3158.webp", name: "Ionian Boots of Lucidity", games: 15, wins: 12 },
          { itemId: 3006, icon: "3006.webp", name: "Berserker's Greaves", games: 9, wins: 9 },
          { itemId: 3047, icon: "3047.webp", name: "Plated Steelcaps", games: 976, wins: 400 },
        ],
      }),
    ],
  });

  assert.deepEqual(
    aggregated.boots.options.map((option) => option.itemId),
    [3006, 3158, 3047],
  );
});
