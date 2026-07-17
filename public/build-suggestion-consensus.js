(function initializeBuildSuggestionConsensus(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./lane-opponent-weight.js"));
    return;
  }

  globalScope.buildSuggestionConsensus = factory(globalScope.laneOpponentWeight || {});
})(typeof globalThis !== "undefined" ? globalThis : this, (laneWeights = {}) => {
  const getLaneOpponentWeightOptions =
    typeof laneWeights.getLaneOpponentWeightOptions === "function"
      ? laneWeights.getLaneOpponentWeightOptions
      : () => [1, 2, 3, 4].map((value) => ({ value, label: `×${value}` }));
  const CHOICE_DEFINITIONS = [
    ["runes", "highestWin", (payload) => payload?.runes?.highestWinPage],
    ["runes", "mostPicked", (payload) => payload?.runes?.mostPickedPage],
    ["spells", "highestWin", (payload) => payload?.spells?.highestWinSet],
    ["spells", "mostPicked", (payload) => payload?.spells?.mostPickedSet],
    ["startingItems", "highestWin", (payload) => payload?.startingItems?.highestWinSet],
    ["startingItems", "mostPicked", (payload) => payload?.startingItems?.mostPickedSet],
    ["skillPriority", "highestWin", (payload) => payload?.skillPriority?.highestWinSkill],
    ["skillPriority", "mostPicked", (payload) => payload?.skillPriority?.mostPickedSkill],
    ["items", "highestWin", (payload) => payload?.items?.highestWinBuild],
    ["items", "mostPicked", (payload) => payload?.items?.mostPickedBuild],
    [
      "boots",
      "highestWin",
      (payload) => payload?.boots?.options?.find((option) => option?.isHighestWin),
    ],
    [
      "boots",
      "mostPicked",
      (payload) => payload?.boots?.options?.find((option) => option?.isMostPicked),
    ],
  ];

  function buildBuildSuggestionConsensus(payloadsByLaneWeight = {}) {
    const requiredWeights = getLaneOpponentWeightOptions().map((option) => option.value);
    const payloads = requiredWeights.map((weight) =>
      getPayloadForLaneWeight(payloadsByLaneWeight, weight),
    );
    const complete = payloads.every(
      (payload) => payload && typeof payload === "object",
    );
    const choices = {};

    CHOICE_DEFINITIONS.forEach(([category, tone, getChoice]) => {
      choices[category] ||= {};
      if (!complete) {
        choices[category][tone] = null;
        return;
      }

      const choiceKeys = payloads.map((payload) =>
        getBuildChoiceKey(category, getChoice(payload)),
      );
      const firstChoiceKey = choiceKeys[0];
      choices[category][tone] =
        firstChoiceKey && choiceKeys.every((choiceKey) => choiceKey === firstChoiceKey)
          ? firstChoiceKey
          : null;
    });

    return {
      complete,
      requiredWeights,
      choices,
    };
  }

  function isBuildChoiceUnanimous(consensus, category, tone, choiceKey) {
    if (!consensus?.complete || !choiceKey) {
      return false;
    }

    return consensus?.choices?.[category]?.[tone] === String(choiceKey);
  }

  function getBuildChoiceKey(category, choice) {
    if (!choice || typeof choice !== "object") {
      return null;
    }

    if (category === "runes") {
      return getRunePageKey(choice);
    }

    if (category === "spells") {
      return getSetKey(choice, "spellIds", "id", { sort: true });
    }

    if (category === "startingItems") {
      return getSetKey(choice, "itemIds", "itemId", { sort: true });
    }

    if (category === "skillPriority") {
      const abilityKey = String(choice?.abilityKey || "").trim().toUpperCase();
      return abilityKey || null;
    }

    if (category === "items") {
      return getOrderedItemBuildKey(choice);
    }

    if (category === "boots") {
      const itemId = choice?.itemId ?? choice?.id;
      return itemId == null ? null : String(itemId);
    }

    return null;
  }

  function getPayloadForLaneWeight(payloadsByLaneWeight, weight) {
    if (payloadsByLaneWeight instanceof Map) {
      return payloadsByLaneWeight.get(weight) || payloadsByLaneWeight.get(String(weight)) || null;
    }

    return payloadsByLaneWeight?.[weight] || null;
  }

  function getRunePageKey(page) {
    if (page?.pageKey) {
      return String(page.pageKey);
    }

    const primaryIds = getSelectionIds(page?.selections?.primary, "id");
    const secondaryIds = getSelectionIds(page?.selections?.secondary, "id");
    const modifierIds = getSelectionIds(page?.selections?.modifiers, "id");
    const key = [
      page?.primaryStyle?.styleId ?? "",
      page?.secondaryStyle?.styleId ?? "",
      primaryIds.join(","),
      secondaryIds.join(","),
      modifierIds.join(","),
    ].join("|");

    return key === "||||" ? null : key;
  }

  function getSetKey(choice, idsField, selectionIdField, { sort = false } = {}) {
    if (choice?.setKey) {
      return String(choice.setKey);
    }

    const directIds = Array.isArray(choice?.[idsField]) ? choice[idsField] : [];
    const ids = directIds.length > 0
      ? directIds.map(String)
      : getSelectionIds(choice?.selections, selectionIdField);
    if (sort) {
      ids.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    }

    return ids.length > 0 ? ids.join("|") : null;
  }

  function getOrderedItemBuildKey(build) {
    if (!Array.isArray(build?.selections)) {
      return null;
    }

    const ids = build.selections
      .map((selection, index) => ({
        id: selection?.itemId ?? selection?.id,
        index,
        slotIndex: Number.isInteger(selection?.slotIndex)
          ? selection.slotIndex
          : index,
      }))
      .filter((selection) => selection.id != null)
      .sort((left, right) => left.slotIndex - right.slotIndex || left.index - right.index)
      .map((selection) => String(selection.id));

    return ids.length > 0 ? ids.join("|") : null;
  }

  function getSelectionIds(selections, idField) {
    if (!Array.isArray(selections)) {
      return [];
    }

    return selections
      .map((selection) => selection?.[idField] ?? selection?.id)
      .filter((selectionId) => selectionId != null)
      .map(String);
  }

  return {
    buildBuildSuggestionConsensus,
    getBuildChoiceKey,
    isBuildChoiceUnanimous,
  };
});
