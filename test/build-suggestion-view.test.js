const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BUILD_SUGGESTION_TABS,
  DEFAULT_BUILD_SUGGESTION_TAB,
  renderBuildSuggestionBody,
} = require("../public/build-suggestion-view.js");

function createPayload() {
  return {
    totalGames: 2000,
    runes: {
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
          primary: [{ id: 8008, icon: "8008.webp", name: "Lethal Tempo", slotIndex: 0 }],
          secondary: [{ id: 8236, icon: "8236.webp", name: "Gathering Storm", slotIndex: 3 }],
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
          primary: [{ id: 8008, icon: "8008.webp", name: "Lethal Tempo", slotIndex: 0 }],
          secondary: [{ id: 8451, icon: "8451.webp", name: "Overgrowth", slotIndex: 3 }],
          modifiers: [{ id: 5008, icon: "5008.webp", name: "Adaptive Force" }],
        },
      },
      highlighting: {
        notes: ["No locked page met the prior threshold."],
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

test("build suggestion tabs expose the compact three-tab layout", () => {
  assert.deepEqual(
    BUILD_SUGGESTION_TABS.map((tab) => tab.value),
    ["highestWinPage", "mostPickedPage", "boots"],
  );
  assert.equal(DEFAULT_BUILD_SUGGESTION_TAB, "highestWinPage");
});

test("renderBuildSuggestionBody renders the highest-win page panel by default", () => {
  const html = renderBuildSuggestionBody(createPayload());

  assert.match(html, /Highest Win Page/);
  assert.match(html, /Precision \+ Sorcery/);
  assert.match(html, /Primary Tree/);
  assert.match(html, /Primary Runes/);
  assert.match(html, /Stat Mods/);
  assert.match(html, /No locked page met the prior threshold\./);
});

test("renderBuildSuggestionBody renders the most-picked page tab", () => {
  const html = renderBuildSuggestionBody(createPayload(), "mostPickedPage");

  assert.match(html, /Most Picked Page/);
  assert.match(html, /Precision \+ Resolve/);
  assert.match(html, /Overgrowth/);
});

test("renderBuildSuggestionBody renders the boots tab", () => {
  const html = renderBuildSuggestionBody(createPayload(), "boots");

  assert.match(html, /Completed boots options/);
  assert.match(html, /Berserker(?:&#39;|')s Greaves/);
  assert.match(html, /Highest Win \+ Most Picked/);
});

test("renderBuildSuggestionBody returns an empty state when payload is missing", () => {
  const html = renderBuildSuggestionBody(null);

  assert.match(html, /Select an ally with a role/);
});
