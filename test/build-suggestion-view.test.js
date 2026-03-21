const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BUILD_SUGGESTION_TABS,
  DEFAULT_BUILD_SUGGESTION_TAB,
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
          isHighestWin: true,
          isMostPicked: true,
        },
      ],
    },
  };
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
  assert.match(html, /Boots/);
  assert.match(html, /Items/);
  assert.match(html, /Precision \+ Sorcery/);
  assert.match(html, /Precision \+ Resolve/);
  assert.match(html, /Berserker(?:&#39;|')s Greaves/);
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
  assert.match(html, /Malignance[\s\S]*52\.4% win[\s\S]*71\.8% pick[\s\S]*11 min/);
  assert.match(html, /Luden(?:&#39;|')?s Companion[\s\S]*56\.5% win[\s\S]*28\.4% pick[\s\S]*11 min/);
  assert.doesNotMatch(html, /Primary Tree/);
  assert.doesNotMatch(html, /Secondary Tree/);
  assert.doesNotMatch(html, /Highest Win page/);
  assert.doesNotMatch(html, /Most Picked page/);
  assert.doesNotMatch(html, /Overview/);
});

test("renderBuildSuggestionBody returns an empty state when payload is missing", () => {
  const html = renderBuildSuggestionBody(null);

  assert.match(html, /build recommendations/i);
});
