const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BUILD_SUGGESTION_TABS,
  DEFAULT_BUILD_SUGGESTION_TAB,
  getRecommendedRunePages,
  getRunePageRecommendationKey,
  renderBuildSuggestionBody,
} = require("../public/build-suggestion-view.js");

function createOption({
  id,
  icon,
  name,
  winRate,
  pickRate,
  games,
  isHighestWin = false,
  isMostPicked = false,
}) {
  return {
    id,
    icon,
    name,
    winRate,
    pickRate,
    games,
    isHighestWin,
    isMostPicked,
  };
}

function createPayload() {
  return {
    totalGames: 2000,
    runes: {
      overview: {
        slotGroups: [
          {
            key: "primary-style",
            label: "Primary Tree",
            options: [
              createOption({
                id: 8000,
                icon: "precision.png",
                name: "Precision",
                winRate: 51.2,
                pickRate: 66.1,
                games: 1088,
                isMostPicked: true,
              }),
            ],
          },
          {
            key: "primary-slot-0",
            label: "Keystone",
            options: [
              createOption({
                id: 8008,
                icon: "8008.webp",
                name: "Lethal Tempo",
                winRate: 50.1,
                pickRate: 73.5,
                games: 1209,
                isHighestWin: true,
                isMostPicked: true,
              }),
            ],
          },
          {
            key: "primary-slot-1",
            label: "Primary Row 1",
            options: [
              createOption({
                id: 9111,
                icon: "9111.webp",
                name: "Triumph",
                winRate: 53.0,
                pickRate: 18.0,
                games: 297,
              }),
            ],
          },
          {
            key: "primary-slot-2",
            label: "Primary Row 2",
            options: [
              createOption({
                id: 9103,
                icon: "9103.webp",
                name: "Legend: Bloodline",
                winRate: 55.8,
                pickRate: 9.4,
                games: 154,
              }),
            ],
          },
          {
            key: "primary-slot-3",
            label: "Primary Row 3",
            options: [
              createOption({
                id: 8014,
                icon: "8014.webp",
                name: "Coup de Grace",
                winRate: 54.4,
                pickRate: 12.4,
                games: 204,
              }),
            ],
          },
          {
            key: "secondary-slot-1",
            label: "Secondary Row 1",
            options: [
              createOption({
                id: 8210,
                icon: "8210.webp",
                name: "Nimbus Cloak",
                winRate: 50.8,
                pickRate: 12.7,
                games: 209,
              }),
            ],
          },
          {
            key: "secondary-slot-3",
            label: "Secondary Row 3",
            options: [
              createOption({
                id: 8236,
                icon: "8236.webp",
                name: "Gathering Storm",
                winRate: 47.2,
                pickRate: 8.7,
                games: 144,
              }),
            ],
          },
          {
            key: "stat-mods",
            label: "Stat Mods",
            options: [
              createOption({
                id: 5008,
                icon: "5008.webp",
                name: "Adaptive Force",
                winRate: 50.9,
                pickRate: 76.8,
                games: 1264,
                isHighestWin: true,
              }),
            ],
          },
        ],
      },
      highestWinPage: {
        winRate: 50.9,
        pickRate: 76.8,
        games: 1264,
        primaryStyle: {
          styleId: 8000,
          name: "Precision",
          icon: "precision.png",
        },
        secondaryStyle: {
          styleId: 8200,
          name: "Sorcery",
          icon: "sorcery.png",
        },
        selections: {
          primary: [
            { id: 8014, icon: "8014.webp", name: "Coup de Grace", slotIndex: 3 },
            { id: 8008, icon: "8008.webp", name: "Lethal Tempo", slotIndex: 0 },
            { id: 9111, icon: "9111.webp", name: "Triumph", slotIndex: 1 },
            { id: 9103, icon: "9103.webp", name: "Legend: Bloodline", slotIndex: 2 },
          ],
          secondary: [
            { id: 8236, icon: "8236.webp", name: "Gathering Storm", slotIndex: 3 },
            { id: 8210, icon: "8210.webp", name: "Nimbus Cloak", slotIndex: 1 },
          ],
          modifiers: [{ id: 5008, icon: "5008.webp", name: "Adaptive Force" }],
        },
      },
      mostPickedPage: {
        winRate: 50.1,
        pickRate: 73.5,
        games: 1209,
        primaryStyle: {
          styleId: 8000,
          name: "Precision",
          icon: "precision.png",
        },
        secondaryStyle: {
          styleId: 8400,
          name: "Resolve",
          icon: "resolve.png",
        },
        selections: {
          primary: [
            { id: 8014, icon: "8014.webp", name: "Coup de Grace", slotIndex: 3 },
            { id: 8008, icon: "8008.webp", name: "Lethal Tempo", slotIndex: 0 },
          ],
          secondary: [{ id: 8451, icon: "8451.webp", name: "Overgrowth", slotIndex: 3 }],
          modifiers: [{ id: 5008, icon: "5008.webp", name: "Adaptive Force" }],
        },
      },
      highlighting: {
        notes: ["No locked page met the prior threshold."],
      },
    },
    spells: {
      highestWinSet: {
        setKey: "4-14",
        spellIds: [4, 14],
        winRate: 53.6,
        pickRate: 42.1,
        games: 1197,
        selections: [
          { id: 4, icon: "flash.png", name: "Flash" },
          { id: 14, icon: "ignite.png", name: "Ignite" },
        ],
      },
      mostPickedSet: {
        setKey: "4-12",
        spellIds: [4, 12],
        winRate: 51.6,
        pickRate: 56.4,
        games: 1604,
        selections: [
          { id: 4, icon: "flash.png", name: "Flash" },
          { id: 12, icon: "teleport.png", name: "Teleport" },
        ],
      },
      highlighting: {
        notes: [],
      },
    },
    startingItems: {
      highestWinSet: {
        setKey: "1082-2031",
        itemIds: [1082, 2031],
        winRate: 57.2,
        pickRate: 18.4,
        games: 304,
        selections: [
          { id: 1082, itemId: 1082, icon: "1082.webp", name: "Dark Seal" },
          { id: 2031, itemId: 2031, icon: "2031.webp", name: "Refillable Potion" },
        ],
      },
      mostPickedSet: {
        setKey: "1056-2003",
        itemIds: [1056, 2003],
        winRate: 53.6,
        pickRate: 62.1,
        games: 1022,
        selections: [
          { id: 1056, itemId: 1056, icon: "1056.webp", name: "Doran's Ring" },
          { id: 2003, itemId: 2003, icon: "2003.webp", name: "Health Potion" },
        ],
      },
      highlighting: {
        notes: [],
      },
    },
    skillPriority: {
      highestWinSkill: {
        abilityKey: "E",
        winRate: 57.8,
        pickRate: 18.6,
        games: 318,
      },
      mostPickedSkill: {
        abilityKey: "Q",
        winRate: 52.9,
        pickRate: 71.4,
        games: 1221,
      },
      highlighting: {
        notes: [],
      },
    },
    items: {
      highestWinBuild: {
        selections: [
          {
            itemId: 6655,
            icon: "6655.webp",
            name: "Luden's Companion",
            slotIndex: 1,
            winRate: 56.5,
            pickRate: 28.4,
            purchaseMinute: 11,
          },
          {
            itemId: 3157,
            icon: "3157.webp",
            name: "Zhonya's Hourglass",
            slotIndex: 2,
            winRate: 54.8,
            pickRate: 17.6,
            purchaseMinute: 15,
          },
          {
            itemId: 3100,
            icon: "3100.webp",
            name: "Lich Bane",
            slotIndex: 3,
            winRate: 58.1,
            pickRate: 14.2,
            purchaseMinute: 21,
          },
          {
            itemId: 3089,
            icon: "3089.webp",
            name: "Rabadon's Deathcap",
            slotIndex: 4,
            winRate: 61.3,
            pickRate: 33.9,
            purchaseMinute: 28,
          },
          {
            itemId: 3135,
            icon: "3135.webp",
            name: "Void Staff",
            slotIndex: 6,
            winRate: 63.0,
            pickRate: 18.4,
            purchaseMinute: 33,
          },
        ],
      },
      mostPickedBuild: {
        selections: [
          {
            itemId: 3118,
            icon: "3118.webp",
            name: "Malignance",
            slotIndex: 1,
            winRate: 52.4,
            pickRate: 71.8,
            purchaseMinute: 11,
          },
          {
            itemId: 4645,
            icon: "4645.webp",
            name: "Shadowflame",
            slotIndex: 3,
            winRate: 54.6,
            pickRate: 48.4,
            purchaseMinute: 21,
          },
          {
            itemId: 3089,
            icon: "3089.webp",
            name: "Rabadon's Deathcap",
            slotIndex: 4,
            winRate: 59.2,
            pickRate: 51.9,
            purchaseMinute: 27,
          },
          {
            itemId: 3135,
            icon: "3135.webp",
            name: "Void Staff",
            slotIndex: 5,
            winRate: 57.8,
            pickRate: 41.2,
            purchaseMinute: 31,
          },
          {
            itemId: 3041,
            icon: "3041.webp",
            name: "Mejai's Soulstealer",
            slotIndex: 6,
            winRate: 66.7,
            pickRate: 8.9,
            purchaseMinute: 33,
          },
        ],
      },
    },
    boots: {
      options: [
        {
          itemId: 3006,
          icon: "3006.webp",
          name: "Berserker's Greaves",
          winRate: 50.1,
          pickRate: 62.1,
          games: 1022,
          isHighestWin: false,
          isMostPicked: true,
        },
        {
          itemId: 3158,
          icon: "3158.webp",
          name: "Ionian Boots of Lucidity",
          winRate: 53.4,
          pickRate: 18.4,
          games: 304,
          isHighestWin: true,
          isMostPicked: false,
        },
        {
          itemId: 3111,
          icon: "3111.webp",
          name: "Mercury's Treads",
          winRate: 51.7,
          pickRate: 14.8,
          games: 241,
          isHighestWin: false,
          isMostPicked: false,
        },
      ],
    },
  };
}

function countMatches(value, pattern) {
  return [...String(value).matchAll(pattern)].length;
}

test("build suggestion tabs expose only the summary layout", () => {
  assert.deepEqual(
    BUILD_SUGGESTION_TABS.map((tab) => tab.value),
    ["summary"],
  );
  assert.equal(DEFAULT_BUILD_SUGGESTION_TAB, "summary");
});

test("renderBuildSuggestionBody renders named, ordered runes and items with their stats", () => {
  const html = renderBuildSuggestionBody(createPayload());

  assert.match(html, /Highest Win/);
  assert.match(html, /Most Picked/);
  assert.match(html, /Runes/);
  assert.equal(countMatches(html, /Import Runes/g), 2);
  assert.equal(countMatches(html, /data-rune-import-key=/g), 2);
  assert.match(html, /Summoner Spells/);
  assert.equal(countMatches(html, /build-spell-card-list--spells/g), 1);
  assert.doesNotMatch(html, /build-spell-card-list--single/);
  assert.match(html, /Starting Items/);
  assert.match(html, /Skill Max Priority/);
  assert.match(html, /Boots/);
  assert.match(html, /Items/);
  assert.match(html, /Most picked and highest win build options are shown below when available\./);
  assert.match(html, /Precision \+ Sorcery/);
  assert.match(html, /Precision \+ Resolve/);
  assert.match(html, /Flash \+ Ignite/);
  assert.match(html, /Flash \+ Teleport/);
  assert.match(html, /Dark Seal \+ Refillable Potion/);
  assert.match(html, /Doran(?:&#39;|')s Ring \+ Health Potion/);
  assert.match(html, /Max E first/);
  assert.match(html, /Max Q first/);
  assert.match(html, /Berserker(?:&#39;|')s Greaves/);
  assert.match(html, /Ionian Boots of Lucidity/);
  assert.doesNotMatch(html, /Mercury(?:&#39;|')s Treads/);
  assert.match(html, /Luden(?:&#39;|')?s Companion/);
  assert.match(html, /Malignance/);
  assert.match(html, /Void Staff/);
  assert.match(html, /11 min/);
  assert.match(html, /33 min/);
  assert.match(html, /No locked page met the prior threshold\./);
  assert.match(html, /Lethal Tempo/);
  assert.match(html, /Gathering Storm/);
  assert.match(html, /Adaptive Force/);
  assert.match(html, /50\.1%/);
  assert.match(html, /47\.2%/);
  assert.match(html, /Lethal Tempo[\s\S]*50\.1% win[\s\S]*73\.5% pick/);
  assert.match(html, /Gathering Storm[\s\S]*47\.2% win[\s\S]*8\.7% pick/);
  assert.match(html, /Lethal Tempo[\s\S]*Triumph[\s\S]*Legend: Bloodline[\s\S]*Coup de Grace/);
  assert.match(html, /Nimbus Cloak[\s\S]*Gathering Storm/);
  assert.match(
    html,
    /Runes[\s\S]*Precision \+ Sorcery[\s\S]*Precision \+ Resolve[\s\S]*Summoner Spells[\s\S]*Flash \+ Ignite[\s\S]*Flash \+ Teleport[\s\S]*Starting Items[\s\S]*Dark Seal \+ Refillable Potion[\s\S]*Doran(?:&#39;|')s Ring \+ Health Potion[\s\S]*Skill Max Priority[\s\S]*Max E first[\s\S]*Max Q first[\s\S]*Boots/,
  );
  assert.match(
    html,
    /build-summary-rune-stack[\s\S]*Recommended runes[\s\S]*Recommended summoner spells[\s\S]*build-summary-side-stack/,
  );
  assert.match(html, /Summoner Spells[\s\S]*Starting Items[\s\S]*Skill Max Priority[\s\S]*Boots[\s\S]*Items/);
  assert.match(html, /build-summary-side-stack/);
  assert.equal(
    countMatches(
      html,
      /Most picked and highest win build options are shown below when available\./g,
    ),
    1,
  );
  assert.doesNotMatch(html, /Most picked and highest win locked pages\./);
  assert.doesNotMatch(html, /Most picked and highest win spell sets\./);
  assert.doesNotMatch(html, /Most picked and highest win completed boots\./);
  assert.doesNotMatch(html, /<span class="build-summary-kicker">Runes<\/span>/);
  assert.doesNotMatch(html, /<span class="build-summary-kicker">Summoner Spells<\/span>/);
  assert.doesNotMatch(html, /<span class="build-summary-kicker">Starting Items<\/span>/);
  assert.doesNotMatch(html, /<span class="build-summary-kicker">Boots<\/span>/);
  assert.doesNotMatch(html, /<span class="build-summary-kicker">Items<\/span>/);
  assert.match(html, /Flash \+ Ignite[\s\S]*53\.6%[\s\S]*42\.1%[\s\S]*1,197/);
  assert.match(html, /Flash \+ Teleport[\s\S]*51\.6%[\s\S]*56\.4%[\s\S]*1,604/);
  assert.match(html, /Dark Seal \+ Refillable Potion[\s\S]*57\.2%[\s\S]*18\.4%[\s\S]*304/);
  assert.match(html, /Doran(?:&#39;|')s Ring \+ Health Potion[\s\S]*53\.6%[\s\S]*62\.1%[\s\S]*1,022/);
  assert.match(html, /Max E first[\s\S]*57\.8%[\s\S]*18\.6%[\s\S]*318/);
  assert.match(html, /Max Q first[\s\S]*52\.9%[\s\S]*71\.4%[\s\S]*1,221/);
  assert.match(html, /Berserker(?:&#39;|')s Greaves[\s\S]*Most Picked/);
  assert.match(html, /Ionian Boots of Lucidity[\s\S]*Highest Win/);
  assert.match(html, /Items[\s\S]*Highest Win[\s\S]*Luden(?:&#39;|')?s Companion[\s\S]*Most Picked[\s\S]*Malignance/);
  assert.doesNotMatch(html, /build-item-column[\s\S]*build-summary-kicker">Highest Win/);
  assert.doesNotMatch(html, /build-item-column[\s\S]*build-summary-kicker">Most Picked/);
  assert.match(html, /Malignance[\s\S]*52\.4% win[\s\S]*71\.8% pick[\s\S]*11 min/);
  assert.match(html, /Luden(?:&#39;|')?s Companion[\s\S]*56\.5% win[\s\S]*28\.4% pick[\s\S]*11 min/);
  assert.doesNotMatch(html, /Primary Tree/);
  assert.doesNotMatch(html, /Secondary Tree/);
  assert.doesNotMatch(html, /Highest Win page/);
  assert.doesNotMatch(html, /Most Picked page/);
  assert.doesNotMatch(html, /Overview/);
});

test("renderBuildSuggestionBody renders unknown item purchase minutes as empty", () => {
  const payload = createPayload();
  payload.items.highestWinBuild.selections[0].purchaseMinute = null;

  const html = renderBuildSuggestionBody(payload);

  assert.doesNotMatch(html, /0 min/);
  assert.match(html, /build-item-card-stat--minute">\s*-/);
});

test("renderBuildSuggestionBody marks sub-50 item build win rates as low win", () => {
  const payload = createPayload();
  payload.items.highestWinBuild.selections[0].winRate = 49.9;
  payload.items.mostPickedBuild.selections[0].winRate = 48.3;

  const html = renderBuildSuggestionBody(payload);

  assert.equal(countMatches(html, /build-item-card-stat--win build-item-card-stat--low-win/g), 2);
  assert.match(html, /Luden(?:&#39;|')?s Companion[\s\S]*49\.9% win/);
  assert.match(html, /Malignance[\s\S]*48\.3% win/);
});

test("renderBuildSuggestionBody collapses overlapping rune, summoner spell, and boot highlights", () => {
  const payload = createPayload();
  payload.runes.mostPickedPage = payload.runes.highestWinPage;
  payload.spells.mostPickedSet = payload.spells.highestWinSet;
  payload.startingItems.mostPickedSet = payload.startingItems.highestWinSet;
  payload.boots.options = [
    {
      itemId: 3020,
      icon: "3020.webp",
      name: "Sorcerer's Shoes",
      winRate: 54.2,
      pickRate: 49.6,
      games: 812,
      isHighestWin: true,
      isMostPicked: true,
    },
    {
      itemId: 3111,
      icon: "3111.webp",
      name: "Mercury's Treads",
      winRate: 51.7,
      pickRate: 14.8,
      games: 241,
      isHighestWin: false,
      isMostPicked: false,
    },
  ];

  const html = renderBuildSuggestionBody(payload);

  assert.match(html, /build-summary-board--single/);
  assert.match(
    html,
    /build-spell-card-list build-spell-card-list--spells build-spell-card-list--single/,
  );
  assert.equal(countMatches(html, /Precision \+ Sorcery/g), 1);
  assert.equal(countMatches(html, /Flash \+ Ignite/g), 1);
  assert.equal(countMatches(html, /Dark Seal \+ Refillable Potion/g), 1);
  assert.equal(countMatches(html, /Sorcerer(?:&#39;|')s Shoes/g), 2);
  assert.match(html, /Highest Win \+ Most Picked/);
  assert.equal(countMatches(html, /Import Runes/g), 1);
  assert.doesNotMatch(html, /Mercury(?:&#39;|')s Treads/);
});

test("renderBuildSuggestionBody renders rune import status for the matching page", () => {
  const payload = createPayload();
  const [page] = getRecommendedRunePages(
    payload.runes.highestWinPage,
    payload.runes.mostPickedPage,
  );
  const pageKey = getRunePageRecommendationKey(page);
  const html = renderBuildSuggestionBody(payload, DEFAULT_BUILD_SUGGESTION_TAB, {
    runeImportStatesByPageKey: {
      [pageKey]: {
        status: "success",
        message: "Imported runes into import - Ahri.",
      },
    },
  });

  assert.match(html, /Imported runes into import - Ahri\./);
  assert.match(html, /build-rune-import-status--success/);
  assert.equal(countMatches(html, /Imported runes into import - Ahri\./g), 1);
});

test("renderBuildSuggestionBody returns an empty state when payload is missing", () => {
  const html = renderBuildSuggestionBody(null);

  assert.match(html, /build recommendations/i);
});
