const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBuildSuggestionConsensus,
  getBuildChoiceKey,
  isBuildChoiceUnanimous,
} = require("../public/build-suggestion-consensus.js");

function createPayload({ runeKey = "rune-a", spellKey = "4-14", bootId = 3006 } = {}) {
  return {
    runes: {
      highestWinPage: { pageKey: runeKey },
      mostPickedPage: { pageKey: "rune-most" },
    },
    spells: {
      highestWinSet: { setKey: spellKey },
      mostPickedSet: { setKey: "4-12" },
    },
    startingItems: {
      highestWinSet: { setKey: "1056-2003" },
      mostPickedSet: { setKey: "1082-2031" },
    },
    skillPriority: {
      highestWinSkill: { abilityKey: "Q" },
      mostPickedSkill: { abilityKey: "E" },
    },
    items: {
      highestWinBuild: {
        selections: [{ itemId: 1 }, { itemId: 2 }],
      },
      mostPickedBuild: {
        selections: [{ itemId: 3 }, { itemId: 4 }],
      },
    },
    boots: {
      options: [
        { itemId: bootId, isHighestWin: true },
        { itemId: 3158, isMostPicked: true },
      ],
    },
  };
}

test("build consensus requires cached payloads for all four lane weights", () => {
  const consensus = buildBuildSuggestionConsensus({
    1: createPayload(),
    2: createPayload(),
    3: createPayload(),
  });

  assert.equal(consensus.complete, false);
  assert.equal(consensus.choices.runes.highestWin, null);
});

test("build consensus identifies matching choices across all lane weights", () => {
  const payloads = Object.fromEntries(
    [1, 2, 3, 4].map((weight) => [weight, createPayload()]),
  );
  const consensus = buildBuildSuggestionConsensus(payloads);

  assert.equal(consensus.complete, true);
  assert.equal(consensus.choices.runes.highestWin, "rune-a");
  assert.equal(consensus.choices.items.highestWin, "1|2");
  assert.equal(consensus.choices.boots.highestWin, "3006");
  assert.equal(
    isBuildChoiceUnanimous(consensus, "spells", "highestWin", "4-14"),
    true,
  );
});

test("build consensus leaves a changed choice unmarked", () => {
  const payloads = {
    1: createPayload(),
    2: createPayload(),
    3: createPayload(),
    4: createPayload({ spellKey: "4-6" }),
  };
  const consensus = buildBuildSuggestionConsensus(payloads);

  assert.equal(consensus.complete, true);
  assert.equal(consensus.choices.spells.highestWin, null);
  assert.equal(
    isBuildChoiceUnanimous(consensus, "spells", "highestWin", "4-14"),
    false,
  );
});

test("item build keys preserve purchase order", () => {
  assert.equal(
    getBuildChoiceKey("items", {
      selections: [
        { itemId: 2, slotIndex: 1 },
        { itemId: 1, slotIndex: 0 },
      ],
    }),
    "1|2",
  );
});
