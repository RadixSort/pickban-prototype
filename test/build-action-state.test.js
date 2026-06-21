const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getBuildSuggestionActionState,
} = require("../public/build-action-state.js");

test("build action explains missing enemy champion after role assignment", () => {
  const action = getBuildSuggestionActionState({
    ally: {
      name: "Ahri",
      role: "middle",
    },
    enemyCount: 0,
  });

  assert.equal(action.disabledReason, "Select at least 1 enemy champion to unlock build suggestions.");
  assert.equal(action.tooltipText, action.disabledReason);
  assert.equal(
    action.ariaLabel,
    "Build recommendation for Ahri. Select at least 1 enemy champion to unlock build suggestions.",
  );
});

test("build action is enabled after ally role and one enemy are selected", () => {
  const action = getBuildSuggestionActionState({
    ally: {
      name: "Ahri",
      role: "middle",
    },
    enemyCount: 1,
  });

  assert.equal(action.disabledReason, "");
  assert.equal(action.tooltipText, "Open matchup build recommendation for Ahri.");
});

test("build action prioritizes missing ally role before enemy count", () => {
  const action = getBuildSuggestionActionState({
    ally: {
      name: "Ahri",
      role: "",
    },
    enemyCount: 0,
  });

  assert.equal(action.tooltipText, "Assign a role to unlock build suggestions.");
});

test("build action remains enabled after ally role and full enemy team are selected", () => {
  const action = getBuildSuggestionActionState({
    ally: {
      name: "Ahri",
      role: "middle",
    },
    enemyCount: 5,
  });

  assert.equal(action.disabledReason, "");
  assert.equal(action.tooltipText, "Open matchup build recommendation for Ahri.");
});
