const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getBuildSuggestionActionState,
} = require("../public/build-action-state.js");

test("build action explains missing enemy champions after role assignment", () => {
  const action = getBuildSuggestionActionState({
    ally: {
      name: "Ahri",
      role: "middle",
    },
    enemyCount: 2,
    enemyLimit: 5,
  });

  assert.equal(action.disabledReason, "Select 3 more enemy champions to unlock build suggestions.");
  assert.equal(action.tooltipText, action.disabledReason);
  assert.equal(
    action.ariaLabel,
    "Build recommendation for Ahri. Select 3 more enemy champions to unlock build suggestions.",
  );
});

test("build action uses singular enemy text for one missing enemy", () => {
  const action = getBuildSuggestionActionState({
    ally: {
      name: "Ahri",
      role: "middle",
    },
    enemyCount: 4,
    enemyLimit: 5,
  });

  assert.equal(action.tooltipText, "Select 1 more enemy champion to unlock build suggestions.");
});

test("build action prioritizes missing ally role before enemy count", () => {
  const action = getBuildSuggestionActionState({
    ally: {
      name: "Ahri",
      role: "",
    },
    enemyCount: 0,
    enemyLimit: 5,
  });

  assert.equal(action.tooltipText, "Assign a role to unlock build suggestions.");
});

test("build action is enabled after ally role and full enemy team are selected", () => {
  const action = getBuildSuggestionActionState({
    ally: {
      name: "Ahri",
      role: "middle",
    },
    enemyCount: 5,
    enemyLimit: 5,
  });

  assert.equal(action.disabledReason, "");
  assert.equal(action.tooltipText, "Open matchup build recommendation for Ahri.");
});
