const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBuildSuggestionResults,
} = require("../lib/build-suggestion-results.js");

function createMatchupBuild({
  totalGames,
  fetchedAt,
  role = null,
  enemyRole = null,
  primaryStyleOptions,
  secondaryStyleOptions,
  primarySlotOptions,
  secondarySlotOptions,
  statOptions,
  pageCandidates,
  spellOptions = [],
  startingItemOptions = [],
  skillOptions = [],
  itemSlotOptions = [[], [], [], [], [], []],
  mostPickedItemSlotOptions = [[], [], [], [], [], []],
  highestWinItemSlotOptions = [[], [], [], [], [], []],
  boots,
}) {
  return {
    totalGames,
    fetchedAt,
    role,
    enemyRole,
    runes: {
      primaryStyleOptions,
      secondaryStyleOptions,
      primarySlotOptions,
      secondarySlotOptions,
      statOptions,
      pageCandidates,
    },
    spells: {
      options: spellOptions,
    },
    startingItems: {
      options: startingItemOptions,
    },
    skills: {
      options: skillOptions,
    },
    items: {
      slotOptions: itemSlotOptions,
      mostPickedSlotOptions: mostPickedItemSlotOptions,
      highestWinSlotOptions: highestWinItemSlotOptions,
    },
    boots,
  };
}

test("buildBuildSuggestionResults triples likely lanes across runes, spells, boots, and items", () => {
  const matchupSpecs = [
    { enemyRole: "top", spellIds: [4, 12] },
    { enemyRole: "top", spellIds: [4, 6] },
    { enemyRole: "top", spellIds: [4, 14] },
    { enemyRole: "support", spellIds: [3, 4] },
  ];
  const aggregated = buildBuildSuggestionResults({
    laneOpponentWeight: 3,
    matchupBuilds: matchupSpecs.map(({ enemyRole, spellIds }) =>
      createMatchupBuild({
        totalGames: 10,
        fetchedAt: "2026-07-17T12:00:00.000Z",
        role: "top",
        enemyRole,
        primaryStyleOptions: [],
        secondaryStyleOptions: [],
        primarySlotOptions: [[], [], [], []],
        secondarySlotOptions: [[], [], [], []],
        statOptions: [],
        pageCandidates: [],
        spellOptions: [createSpellSetOption({ spellIds, games: 10, wins: 5 })],
        itemSlotOptions: [
          [createItemOption({
            itemId: enemyRole === "top" ? 3118 : 6655,
            name: enemyRole === "top" ? "Malignance" : "Luden's Companion",
            games: 10,
            wins: 5,
            purchaseMinute: 11,
          })],
          [],
          [],
          [],
          [],
          [],
        ],
        boots: [{
          itemId: enemyRole === "top" ? 3006 : 3158,
          icon: enemyRole === "top" ? "3006.webp" : "3158.webp",
          name:
            enemyRole === "top"
              ? "Berserker's Greaves"
              : "Ionian Boots of Lucidity",
          games: 10,
          wins: 5,
        }],
      }),
    ),
  });
  const spellGamesBySet = new Map(
    aggregated.spells.options.map((option) => [option.setKey, option.games]),
  );

  assert.equal(aggregated.totalGames, 100);
  assert.equal(spellGamesBySet.get("4-12"), 30);
  assert.equal(spellGamesBySet.get("4-6"), 30);
  assert.equal(spellGamesBySet.get("4-14"), 30);
  assert.equal(spellGamesBySet.get("3-4"), 10);
  assert.equal(
    aggregated.boots.options.find((option) => option.itemId === 3006)?.games,
    90,
  );
  assert.equal(
    aggregated.boots.options.find((option) => option.itemId === 3158)?.games,
    10,
  );
  assert.equal(aggregated.items.mostPickedBuild.selections[0].itemId, 3118);
  assert.equal(aggregated.items.mostPickedBuild.selections[0].games, 90);
  assert.equal(aggregated.items.highestWinBuild.selections[0].itemId, 3118);
  assert.equal(aggregated.items.highestWinBuild.selections[0].games, 90);
});

test("buildBuildSuggestionResults triples at least one most-likely lane opponent", () => {
  const matchupSpecs = [
    { enemyChampionKey: "1", laneOpponentLikelihood: 12, spellIds: [4, 12] },
    { enemyChampionKey: "2", laneOpponentLikelihood: 37, spellIds: [4, 6] },
    { enemyChampionKey: "3", laneOpponentLikelihood: 8, spellIds: [4, 14] },
  ];
  const aggregated = buildBuildSuggestionResults({
    laneOpponentWeight: 3,
    matchupBuilds: matchupSpecs.map((spec) => ({
      ...createMatchupBuild({
        totalGames: 10,
        fetchedAt: "2026-07-17T12:00:00.000Z",
        role: "middle",
        enemyRole: "support",
        primaryStyleOptions: [],
        secondaryStyleOptions: [],
        primarySlotOptions: [[], [], [], []],
        secondarySlotOptions: [[], [], [], []],
        statOptions: [],
        pageCandidates: [],
        spellOptions: [createSpellSetOption({
          spellIds: spec.spellIds,
          games: 10,
          wins: 5,
        })],
        boots: [],
      }),
      enemyChampionKey: spec.enemyChampionKey,
      laneOpponentLikelihood: spec.laneOpponentLikelihood,
    })),
  });
  const spellGamesBySet = new Map(
    aggregated.spells.options.map((option) => [option.setKey, option.games]),
  );

  assert.equal(aggregated.totalGames, 50);
  assert.equal(spellGamesBySet.get("4-6"), 30);
  assert.equal(spellGamesBySet.get("4-12"), 10);
  assert.equal(spellGamesBySet.get("4-14"), 10);
});

test("buildBuildSuggestionResults treats Bottom and Support as the same lane", () => {
  const aggregated = buildBuildSuggestionResults({
    laneOpponentWeight: 4,
    matchupBuilds: [
      { enemyRole: "bottom", spellIds: [4, 7] },
      { enemyRole: "jungle", spellIds: [4, 11] },
    ].map(({ enemyRole, spellIds }) =>
      createMatchupBuild({
        totalGames: 10,
        fetchedAt: "2026-07-17T12:00:00.000Z",
        role: "support",
        enemyRole,
        primaryStyleOptions: [],
        secondaryStyleOptions: [],
        primarySlotOptions: [[], [], [], []],
        secondarySlotOptions: [[], [], [], []],
        statOptions: [],
        pageCandidates: [],
        spellOptions: [createSpellSetOption({ spellIds, games: 10, wins: 5 })],
        boots: [],
      }),
    ),
  });
  const spellGamesBySet = new Map(
    aggregated.spells.options.map((option) => [option.setKey, option.games]),
  );

  assert.equal(aggregated.totalGames, 50);
  assert.equal(spellGamesBySet.get("4-7"), 40);
  assert.equal(spellGamesBySet.get("4-11"), 10);
});

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

function createItemOption({
  itemId,
  name,
  games,
  wins,
  purchaseMinute,
}) {
  return {
    itemId,
    icon: `${itemId}.webp`,
    name,
    games,
    wins,
    purchaseMinute,
  };
}

function createSpellSetOption({
  spellIds,
  games,
  wins,
}) {
  const normalizedSpellIds = [...spellIds].sort((left, right) => left - right);
  return {
    setKey: normalizedSpellIds.join("-"),
    spellIds: normalizedSpellIds,
    selections: normalizedSpellIds.map((id) => ({
      id,
      icon: `${id}.png`,
      name: `Spell ${id}`,
    })),
    games,
    wins,
  };
}

function createStartingItemSetOption({
  itemIds,
  games,
  wins,
}) {
  return {
    setKey: itemIds.join("-"),
    itemIds,
    selections: itemIds.map((itemId) => ({
      id: itemId,
      itemId,
      icon: `${itemId}.webp`,
      name: `Item ${itemId}`,
    })),
    games,
    wins,
  };
}

function createSkillOption({ abilityKey, games, wins }) {
  return {
    id: abilityKey,
    abilityKey,
    name: abilityKey,
    games,
    wins,
  };
}

test("buildBuildSuggestionResults aggregates rune histograms, items, and boots", () => {
  const aggregated = buildBuildSuggestionResults({
    matchupBuilds: [
      createMatchupBuild({
        totalGames: 100,
        fetchedAt: "2026-03-19T20:15:00.000Z",
        role: "middle",
        enemyRole: "middle",
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
        spellOptions: [
          createSpellSetOption({ spellIds: [4, 12], games: 80, wins: 44 }),
          createSpellSetOption({ spellIds: [4, 14], games: 20, wins: 12 }),
        ],
        startingItemOptions: [
          createStartingItemSetOption({ itemIds: [1056, 2003], games: 70, wins: 38 }),
          createStartingItemSetOption({ itemIds: [1082, 2031], games: 30, wins: 19 }),
        ],
        skillOptions: [
          createSkillOption({ abilityKey: "Q", games: 70, wins: 38 }),
          createSkillOption({ abilityKey: "E", games: 30, wins: 18 }),
        ],
        itemSlotOptions: [
          [
            createItemOption({ itemId: 3118, name: "Malignance", games: 80, wins: 44, purchaseMinute: 12 }),
            createItemOption({ itemId: 2503, name: "Blackfire Torch", games: 20, wins: 12, purchaseMinute: 11 }),
          ],
          [
            createItemOption({ itemId: 3006, name: "Berserker's Greaves", games: 70, wins: 40, purchaseMinute: 14 }),
            createItemOption({ itemId: 3157, name: "Zhonya's Hourglass", games: 30, wins: 19, purchaseMinute: 13 }),
          ],
          [
            createItemOption({ itemId: 4645, name: "Shadowflame", games: 70, wins: 41, purchaseMinute: 21 }),
            createItemOption({ itemId: 6655, name: "Luden's Companion", games: 30, wins: 16, purchaseMinute: 20 }),
          ],
          [
            createItemOption({ itemId: 3157, name: "Zhonya's Hourglass", games: 50, wins: 31, purchaseMinute: 27 }),
            createItemOption({ itemId: 3089, name: "Rabadon's Deathcap", games: 50, wins: 30, purchaseMinute: 28 }),
          ],
          [
            createItemOption({ itemId: 3089, name: "Rabadon's Deathcap", games: 60, wins: 37, purchaseMinute: 31 }),
            createItemOption({ itemId: 3135, name: "Void Staff", games: 40, wins: 26, purchaseMinute: 32 }),
          ],
          [
            createItemOption({ itemId: 3089, name: "Rabadon's Deathcap", games: 55, wins: 36, purchaseMinute: 35 }),
            createItemOption({ itemId: 3135, name: "Void Staff", games: 45, wins: 31, purchaseMinute: 34 }),
            createItemOption({ itemId: 3041, name: "Mejai's Soulstealer", games: 15, wins: 11, purchaseMinute: 33 }),
          ],
        ],
        boots: [
          { itemId: 3006, icon: "3006.webp", name: "Berserker's Greaves", games: 70, wins: 40 },
          { itemId: 3158, icon: "3158.webp", name: "Ionian Boots of Lucidity", games: 30, wins: 19 },
        ],
      }),
      createMatchupBuild({
        totalGames: 100,
        fetchedAt: "2026-03-19T20:30:00.000Z",
        role: "middle",
        enemyRole: "middle",
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
        spellOptions: [
          createSpellSetOption({ spellIds: [4, 12], games: 20, wins: 10 }),
          createSpellSetOption({ spellIds: [4, 14], games: 60, wins: 36 }),
        ],
        startingItemOptions: [
          createStartingItemSetOption({ itemIds: [1056, 2003], games: 50, wins: 25 }),
          createStartingItemSetOption({ itemIds: [1082, 2031], games: 50, wins: 34 }),
        ],
        skillOptions: [
          createSkillOption({ abilityKey: "Q", games: 30, wins: 15 }),
          createSkillOption({ abilityKey: "E", games: 30, wins: 22 }),
        ],
        itemSlotOptions: [
          [
            createItemOption({ itemId: 3118, name: "Malignance", games: 60, wins: 34, purchaseMinute: 11 }),
            createItemOption({ itemId: 6655, name: "Luden's Companion", games: 40, wins: 25, purchaseMinute: 12 }),
          ],
          [
            createItemOption({ itemId: 3158, name: "Ionian Boots of Lucidity", games: 80, wins: 48, purchaseMinute: 13 }),
            createItemOption({ itemId: 3157, name: "Zhonya's Hourglass", games: 20, wins: 13, purchaseMinute: 15 }),
          ],
          [
            createItemOption({ itemId: 4645, name: "Shadowflame", games: 60, wins: 36, purchaseMinute: 22 }),
            createItemOption({ itemId: 3100, name: "Lich Bane", games: 40, wins: 26, purchaseMinute: 20 }),
          ],
          [
            createItemOption({ itemId: 3089, name: "Rabadon's Deathcap", games: 60, wins: 38, purchaseMinute: 27 }),
            createItemOption({ itemId: 3157, name: "Zhonya's Hourglass", games: 40, wins: 25, purchaseMinute: 28 }),
          ],
          [
            createItemOption({ itemId: 3135, name: "Void Staff", games: 60, wins: 39, purchaseMinute: 31 }),
            createItemOption({ itemId: 3089, name: "Rabadon's Deathcap", games: 40, wins: 25, purchaseMinute: 30 }),
          ],
          [
            createItemOption({ itemId: 3135, name: "Void Staff", games: 50, wins: 34, purchaseMinute: 34 }),
            createItemOption({ itemId: 3041, name: "Mejai's Soulstealer", games: 50, wins: 40, purchaseMinute: 32 }),
          ],
        ],
        boots: [
          { itemId: 3006, icon: "3006.webp", name: "Berserker's Greaves", games: 20, wins: 10 },
          { itemId: 3158, icon: "3158.webp", name: "Ionian Boots of Lucidity", games: 60, wins: 39 },
        ],
      }),
    ],
  });

  assert.equal(aggregated.lastUpdatedAt, "2026-03-19T20:30:00.000Z");
  assert.equal(aggregated.runes.mostPickedPage.isComposite, true);
  assert.equal(aggregated.runes.highestWinPage.isComposite, true);
  assert.deepEqual(
    aggregated.runes.mostPickedPage.selections.primary.map((selection) => selection.id),
    [8008, 9111, 9103, 8014],
  );
  assert.deepEqual(
    aggregated.runes.mostPickedPage.selections.modifiers.map((selection) => selection.id),
    [5008, 5008, 5011],
  );
  assert.deepEqual(
    aggregated.runes.highestWinPage.selections.primary.map((selection) => selection.id),
    [8229, 8226, 8233, 8236],
  );
  assert.deepEqual(
    aggregated.runes.highestWinPage.selections.secondary.map((selection) => selection.id),
    [8446, 8473],
  );
  assert.notEqual(aggregated.runes.mostPickedPage.pageKey, "page-a");
  assert.notEqual(aggregated.runes.highestWinPage.pageKey, "page-c");
  assert.deepEqual(aggregated.spells.mostPickedSet.spellIds, [4, 12]);
  assert.deepEqual(aggregated.spells.highestWinSet.spellIds, [4, 14]);
  assert.deepEqual(aggregated.startingItems.mostPickedSet.itemIds, [1056, 2003]);
  assert.deepEqual(aggregated.startingItems.highestWinSet.itemIds, [1082, 2031]);
  assert.equal(aggregated.skillPriority.mostPickedSkill.abilityKey, "Q");
  assert.equal(aggregated.skillPriority.highestWinSkill.abilityKey, "E");
  assert.equal(aggregated.skillPriority.mostPickedSkill.games, 300);
  assert.equal(aggregated.skillPriority.highestWinSkill.games, 180);

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
  assert.equal(aggregated.spells.options.find((option) => option.setKey === "4-12")?.isMostPicked, true);
  assert.equal(aggregated.spells.options.find((option) => option.setKey === "4-14")?.isHighestWin, true);
  assert.equal(aggregated.startingItems.options.find((option) => option.setKey === "1056-2003")?.isMostPicked, true);
  assert.equal(aggregated.startingItems.options.find((option) => option.setKey === "1082-2031")?.isHighestWin, true);

  assert.deepEqual(
    aggregated.items.mostPickedBuild.selections.map((selection) => selection.itemId),
    [3118, 3157, 4645, 3089, 3135],
  );
  assert.deepEqual(
    aggregated.items.highestWinBuild.selections.map((selection) => selection.itemId),
    [6655, 3157, 3100, 3089, 3135],
  );
  assert.equal(aggregated.items.mostPickedBuild.selections[0].purchaseMinute, 12);
  assert.equal(aggregated.items.mostPickedBuild.selections[4].purchaseMinute, 31);
});

test("buildBuildSuggestionResults keeps unknown item purchase minutes empty", () => {
  const aggregated = buildBuildSuggestionResults({
    matchupBuilds: [
      createMatchupBuild({
        totalGames: 20,
        fetchedAt: "2026-03-19T20:15:00.000Z",
        itemSlotOptions: [
          [
            createItemOption({
              itemId: 3118,
              name: "Malignance",
              games: 20,
              wins: 11,
            }),
          ],
          [],
          [],
          [],
          [],
          [],
        ],
        boots: [],
      }),
    ],
  });

  assert.equal(aggregated.items.mostPickedBuild.selections[0].purchaseMinute, null);
  assert.equal(aggregated.items.highestWinBuild.selections[0].purchaseMinute, null);
});

test("buildBuildSuggestionResults prefers tab-specific item slots when available", () => {
  const aggregated = buildBuildSuggestionResults({
    matchupBuilds: [
      createMatchupBuild({
        totalGames: 200,
        fetchedAt: "2026-06-26T12:00:00.000Z",
        itemSlotOptions: [
          [
            createItemOption({
              itemId: 6610,
              name: "Sundered Sky",
              games: 134,
              wins: 77,
              purchaseMinute: 11,
            }),
            createItemOption({
              itemId: 3078,
              name: "Trinity Force",
              games: 1494,
              wins: 812,
              purchaseMinute: 11,
            }),
          ],
          [],
          [],
          [],
          [],
          [],
        ],
        mostPickedItemSlotOptions: [
          [
            createItemOption({
              itemId: 3078,
              name: "Trinity Force",
              games: 1494,
              wins: 812,
              purchaseMinute: 11,
            }),
          ],
          [],
          [],
          [],
          [],
          [],
        ],
        highestWinItemSlotOptions: [
          [
            createItemOption({
              itemId: 6610,
              name: "Sundered Sky",
              games: 134,
              wins: 77,
              purchaseMinute: 11,
            }),
          ],
          [],
          [],
          [],
          [],
          [],
        ],
        boots: [],
      }),
    ],
  });

  assert.equal(aggregated.items.mostPickedBuild.selections[0].itemId, 3078);
  assert.equal(aggregated.items.mostPickedBuild.selections[0].name, "Trinity Force");
  assert.equal(aggregated.items.highestWinBuild.selections[0].itemId, 6610);
  assert.equal(aggregated.items.highestWinBuild.selections[0].name, "Sundered Sky");
});

test("buildBuildSuggestionResults reports when no rune element crosses the highest-win threshold", () => {
  const aggregated = buildBuildSuggestionResults({
    highestWinPageThresholdPct: 60,
    matchupBuilds: [
      createMatchupBuild({
        totalGames: 100,
        fetchedAt: "2026-03-19T20:15:00.000Z",
        primaryStyleOptions: [{ id: 8000, icon: "", name: "Precision", games: 100, wins: 55 }],
        secondaryStyleOptions: [{ id: 8300, icon: "", name: "Inspiration", games: 100, wins: 55 }],
        primarySlotOptions: [
          [{ id: 8008, icon: "", name: "Lethal Tempo", games: 40, wins: 24, styleId: 8000, styleName: "Precision" }],
          [{ id: 9111, icon: "", name: "Triumph", games: 40, wins: 24, styleId: 8000, styleName: "Precision" }],
          [{ id: 9103, icon: "", name: "Legend: Bloodline", games: 40, wins: 24, styleId: 8000, styleName: "Precision" }],
          [{ id: 8014, icon: "", name: "Coup de Grace", games: 40, wins: 24, styleId: 8000, styleName: "Precision" }],
        ],
        secondarySlotOptions: [
          [],
          [{ id: 8304, icon: "", name: "Magical Footwear", games: 40, wins: 24, styleId: 8300, styleName: "Inspiration" }],
          [],
          [{ id: 8347, icon: "", name: "Cosmic Insight", games: 40, wins: 24, styleId: 8300, styleName: "Inspiration" }],
        ],
        statOptions: [
          { id: 5005, icon: "", name: "Attack Speed", games: 40, wins: 24 },
          { id: 5008, icon: "", name: "Adaptive Force", games: 40, wins: 24 },
          { id: 5011, icon: "", name: "Health", games: 40, wins: 24 },
        ],
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
        spellOptions: [createSpellSetOption({ spellIds: [4, 12], games: 40, wins: 24 })],
        boots: [],
      }),
    ],
  });

  assert.equal(aggregated.runes.highestWinPage, null);
  assert.match(aggregated.runes.highlighting.notes[0], /60%/i);
});

test("buildBuildSuggestionResults uses a 1% default threshold for highest-win build elements", () => {
  const aggregated = buildBuildSuggestionResults({
    matchupBuilds: [
      createMatchupBuild({
        totalGames: 1000,
        fetchedAt: "2026-03-19T20:15:00.000Z",
        primaryStyleOptions: [{ id: 8000, icon: "", name: "Precision", games: 1000, wins: 500 }],
        secondaryStyleOptions: [{ id: 8300, icon: "", name: "Inspiration", games: 1000, wins: 500 }],
        primarySlotOptions: [
          [
            { id: 8008, icon: "", name: "Lethal Tempo", games: 15, wins: 12, styleId: 8000, styleName: "Precision" },
            { id: 8021, icon: "", name: "Fleet Footwork", games: 9, wins: 9, styleId: 8000, styleName: "Precision" },
            { id: 8010, icon: "", name: "Conqueror", games: 976, wins: 400, styleId: 8000, styleName: "Precision" },
          ],
          [{ id: 9111, icon: "", name: "Triumph", games: 15, wins: 12, styleId: 8000, styleName: "Precision" }],
          [{ id: 9103, icon: "", name: "Legend: Bloodline", games: 15, wins: 12, styleId: 8000, styleName: "Precision" }],
          [{ id: 8014, icon: "", name: "Coup de Grace", games: 15, wins: 12, styleId: 8000, styleName: "Precision" }],
        ],
        secondarySlotOptions: [
          [],
          [{ id: 8304, icon: "", name: "Magical Footwear", games: 15, wins: 12, styleId: 8300, styleName: "Inspiration" }],
          [],
          [{ id: 8347, icon: "", name: "Cosmic Insight", games: 15, wins: 12, styleId: 8300, styleName: "Inspiration" }],
        ],
        statOptions: [
          { id: 5005, icon: "", name: "Attack Speed", games: 15, wins: 12 },
          { id: 5008, icon: "", name: "Adaptive Force", games: 15, wins: 12 },
          { id: 5011, icon: "", name: "Health", games: 15, wins: 12 },
        ],
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
        spellOptions: [
          createSpellSetOption({ spellIds: [4, 12], games: 15, wins: 12 }),
          createSpellSetOption({ spellIds: [4, 14], games: 9, wins: 9 }),
          createSpellSetOption({ spellIds: [3, 4], games: 976, wins: 400 }),
        ],
        startingItemOptions: [
          createStartingItemSetOption({ itemIds: [1056, 2003], games: 15, wins: 12 }),
          createStartingItemSetOption({ itemIds: [1082, 2031], games: 9, wins: 9 }),
          createStartingItemSetOption({ itemIds: [1102], games: 976, wins: 400 }),
        ],
        skillOptions: [
          createSkillOption({ abilityKey: "E", games: 15, wins: 12 }),
          createSkillOption({ abilityKey: "Q", games: 9, wins: 9 }),
          createSkillOption({ abilityKey: "W", games: 976, wins: 400 }),
        ],
        boots: [
          { itemId: 3158, icon: "3158.webp", name: "Ionian Boots of Lucidity", games: 15, wins: 12 },
          { itemId: 3006, icon: "3006.webp", name: "Berserker's Greaves", games: 9, wins: 9 },
          { itemId: 3047, icon: "3047.webp", name: "Plated Steelcaps", games: 976, wins: 400 },
        ],
      }),
    ],
  });

  assert.equal(aggregated.runes.highestWinPage.selections.primary[0].id, 8008);
  assert.equal(
    aggregated.runes.highestWinPage.selections.primary.some((selection) => selection.id === 8021),
    false,
  );
  assert.deepEqual(aggregated.spells.highestWinSet.spellIds, [4, 12]);
  assert.deepEqual(aggregated.startingItems.highestWinSet.itemIds, [1056, 2003]);
  assert.equal(aggregated.skillPriority.highestWinSkill.abilityKey, "E");
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
        spellOptions: [],
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

test("buildBuildSuggestionResults falls back to current time and unfiltered item options", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-03-20T12:00:00.000Z"),
  });

  const aggregated = buildBuildSuggestionResults({
    highestWinItemThresholdPct: 50,
    matchupBuilds: [
      createMatchupBuild({
        totalGames: 100,
        fetchedAt: "not-a-date",
        primaryStyleOptions: [],
        secondaryStyleOptions: [],
        primarySlotOptions: [[], [], [], []],
        secondarySlotOptions: [[], [], [], []],
        statOptions: [],
        pageCandidates: [],
        spellOptions: [],
        itemSlotOptions: [
          [createItemOption({ itemId: 3118, name: "Malignance", games: 10, wins: 6, purchaseMinute: 10 })],
          [createItemOption({ itemId: 3157, name: "Zhonya's Hourglass", games: 10, wins: 6, purchaseMinute: 18 })],
          [createItemOption({ itemId: 3089, name: "Rabadon's Deathcap", games: 10, wins: 6, purchaseMinute: 24 })],
          [createItemOption({ itemId: 3135, name: "Void Staff", games: 10, wins: 6, purchaseMinute: 29 })],
          [createItemOption({ itemId: 4645, name: "Shadowflame", games: 10, wins: 6, purchaseMinute: 33 })],
          [createItemOption({ itemId: 3041, name: "Mejai's Soulstealer", games: 10, wins: 6, purchaseMinute: 36 })],
        ],
        boots: [],
      }),
    ],
  });

  assert.equal(aggregated.lastUpdatedAt, "2026-03-20T12:00:00.000Z");
  assert.deepEqual(
    aggregated.items.highestWinBuild.selections.map((selection) => selection.itemId),
    [3118, 3157, 3089, 3135, 4645],
  );
});
