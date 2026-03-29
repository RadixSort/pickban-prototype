const {
  buildRuneStyleIconUrl,
  getRuneStyle,
} = require("../public/rune-metadata.js");
const { isCompletedBootItem } = require("./lolalytics-build-parser.js");

const PRIMARY_SLOT_LABELS = ["Keystone", "Primary Row 1", "Primary Row 2", "Primary Row 3"];
const SECONDARY_SLOT_LABELS = ["", "Secondary Row 1", "Secondary Row 2", "Secondary Row 3"];
const ITEM_SLOT_COUNT = 6;

/**
 * Merge parsed matchup build records into one summary response for the
 * `/build-suggestions` endpoint.
 *
 * The output keeps both overview-level slot distributions and exact
 * rune-page/spell/boots/item highlights so the UI can render a compact answer
 * without knowing about the raw Lolalytics payload structure.
 */
function buildBuildSuggestionResults({
  matchupBuilds = [],
  highestWinPageThresholdPct = 1,
  highestWinSpellThresholdPct = 1,
  highestWinBootThresholdPct = 1,
  highestWinItemThresholdPct = 1,
} = {}) {
  const totalGames = matchupBuilds.reduce((sum, matchup) => sum + toNumber(matchup?.totalGames), 0);
  const lastUpdatedAt = determineLastUpdatedAt(matchupBuilds);
  const primaryStyleMap = new Map();
  const secondaryStyleMap = new Map();
  const primarySlotMaps = [new Map(), new Map(), new Map(), new Map()];
  const secondarySlotMaps = [new Map(), new Map(), new Map(), new Map()];
  const statModMap = new Map();
  const pageMap = new Map();
  const spellMap = new Map();
  const itemSlotMaps = createItemSlotMaps();
  const bootMap = new Map();

  matchupBuilds.forEach((matchup) => {
    mergeOptionList(primaryStyleMap, matchup?.runes?.primaryStyleOptions);
    mergeOptionList(secondaryStyleMap, matchup?.runes?.secondaryStyleOptions);
    mergeGroupedOptionLists(primarySlotMaps, matchup?.runes?.primarySlotOptions);
    mergeGroupedOptionLists(secondarySlotMaps, matchup?.runes?.secondarySlotOptions);
    mergeOptionList(statModMap, matchup?.runes?.statOptions);
    mergePageCandidates(pageMap, matchup?.runes?.pageCandidates);
    mergeSpellOptions(spellMap, matchup?.spells?.options);
    mergeGroupedItemOptionLists(itemSlotMaps, matchup?.items?.slotOptions);
    mergeBootOptions(bootMap, matchup?.boots);
  });

  const mostPickedPage = selectMostPickedPage(pageMap, totalGames);
  const highestWinPage = selectHighestWinPage(pageMap, totalGames, highestWinPageThresholdPct);
  const spells = buildSpellResults(spellMap, highestWinSpellThresholdPct);
  const slotGroups = buildOverviewSlotGroups({
    totalGames,
    primaryStyleMap,
    secondaryStyleMap,
    primarySlotMaps,
    secondarySlotMaps,
    statModMap,
    highestWinPage,
    mostPickedPage,
  });
  const items = buildItemResults(itemSlotMaps, highestWinItemThresholdPct);
  const boots = buildBootResults(bootMap, highestWinBootThresholdPct);
  const highlightingNotes = [];

  if (!highestWinPage && pageMap.size > 0) {
    highlightingNotes.push(
      `No locked page met the ${formatThreshold(highestWinPageThresholdPct)} highest-win sample threshold.`,
    );
  }

  return {
    totalGames,
    lastUpdatedAt,
    runes: {
      overview: {
        slotGroups,
      },
      highestWinPage,
      mostPickedPage,
      highlighting: {
        highestWinPageKey: highestWinPage?.pageKey || null,
        mostPickedPageKey: mostPickedPage?.pageKey || null,
        highestWinThresholdPct: highestWinPageThresholdPct,
        notes: highlightingNotes,
      },
    },
    spells,
    items,
    boots: {
      options: boots,
    },
  };
}

function createItemSlotMaps() {
  return Array.from({ length: ITEM_SLOT_COUNT }, () => new Map());
}

function buildOverviewSlotGroups({
  totalGames,
  primaryStyleMap,
  secondaryStyleMap,
  primarySlotMaps,
  secondarySlotMaps,
  statModMap,
  highestWinPage,
  mostPickedPage,
}) {
  const groups = [];

  groups.push(
    createOverviewGroup({
      key: "primary-style",
      label: "Primary Tree",
      type: "style",
      options: [...primaryStyleMap.values()],
      denominator: sumOptionGames(primaryStyleMap),
      highestWinPage,
      mostPickedPage,
    }),
  );

  primarySlotMaps.forEach((slotMap, slotIndex) => {
    groups.push(
      createOverviewGroup({
        key: `primary-slot-${slotIndex}`,
        label: PRIMARY_SLOT_LABELS[slotIndex],
        type: "rune",
        options: [...slotMap.values()],
        denominator: sumOptionGames(slotMap),
        highestWinPage,
        mostPickedPage,
      }),
    );
  });

  groups.push(
    createOverviewGroup({
      key: "secondary-style",
      label: "Secondary Tree",
      type: "style",
      options: [...secondaryStyleMap.values()],
      denominator: sumOptionGames(secondaryStyleMap),
      highestWinPage,
      mostPickedPage,
    }),
  );

  secondarySlotMaps.forEach((slotMap, slotIndex) => {
    if (slotIndex === 0) {
      return;
    }

    groups.push(
      createOverviewGroup({
        key: `secondary-slot-${slotIndex}`,
        label: SECONDARY_SLOT_LABELS[slotIndex],
        type: "rune",
        options: [...slotMap.values()],
        denominator: sumOptionGames(slotMap),
        highestWinPage,
        mostPickedPage,
      }),
    );
  });

  groups.push(
    createOverviewGroup({
      key: "stat-mods",
      label: "Stat Mods",
      type: "stat",
      options: [...statModMap.values()],
      denominator: totalGames,
      highestWinPage,
      mostPickedPage,
    }),
  );

  return groups.filter((group) => group.options.length > 0);
}

function createOverviewGroup({
  key,
  label,
  type,
  options,
  denominator,
  highestWinPage,
  mostPickedPage,
}) {
  return {
    key,
    label,
    type,
    options: options
      .map((option) => {
        const games = toNumber(option.games);
        const wins = toNumber(option.wins);
        return {
          id: option.id,
          name: option.name,
          icon: option.icon,
          styleId: option.styleId ?? option.id ?? null,
          styleName:
            option.styleName || getRuneStyle(option.styleId ?? option.id)?.name || option.name,
          games: Math.round(games),
          wins: Math.round(wins),
          winRate: calculateRate(wins, games),
          pickRate: calculateRate(games, denominator),
          isHighestWin: optionMatchesPage(key, option, highestWinPage),
          isMostPicked: optionMatchesPage(key, option, mostPickedPage),
        };
      })
      .sort(compareDisplayOptions),
  };
}

function selectMostPickedPage(pageMap, totalGames) {
  const selectedPage = selectBestRecord(pageMap.values(), compareMostPickedPages);
  return hydratePageResult(selectedPage, totalGames);
}

function selectHighestWinPage(pageMap, totalGames, thresholdPct) {
  const selectedPage = selectBestRecord(
    pageMap.values(),
    compareHighestWinPages,
    (page) => calculateRate(page.games, totalGames) >= thresholdPct,
  );
  return hydratePageResult(selectedPage, totalGames);
}

function hydratePageResult(pageRecord, totalGames) {
  if (!pageRecord) {
    return null;
  }

  const primaryStyle = getRuneStyle(pageRecord.primaryStyleId);
  const secondaryStyle = getRuneStyle(pageRecord.secondaryStyleId);

  return {
    pageKey: pageRecord.pageKey,
    games: Math.round(pageRecord.games),
    wins: Math.round(pageRecord.wins),
    winRate: calculateRate(pageRecord.wins, pageRecord.games),
    pickRate: calculateRate(pageRecord.games, totalGames),
    primaryStyle: {
      styleId: pageRecord.primaryStyleId,
      name: primaryStyle?.name || pageRecord.primaryRunes[0]?.styleName || "Primary",
      icon: buildRuneStyleIconUrl(pageRecord.primaryStyleId),
    },
    secondaryStyle: {
      styleId: pageRecord.secondaryStyleId,
      name: secondaryStyle?.name || pageRecord.secondaryRunes[0]?.styleName || "Secondary",
      icon: buildRuneStyleIconUrl(pageRecord.secondaryStyleId),
    },
    selections: {
      primary: pageRecord.primaryRunes,
      secondary: pageRecord.secondaryRunes,
      modifiers: pageRecord.modifiers,
    },
  };
}

function buildSpellResults(spellMap, thresholdPct) {
  const spellOptions = [...spellMap.values()];
  let totalSpellGames = 0;

  for (const option of spellOptions) {
    totalSpellGames += toNumber(option.games);
  }

  const mostPickedSet = selectBestRecord(spellOptions, compareMostPickedSpellSets);
  const highestWinSet = selectBestRecord(
    spellOptions,
    compareHighestWinSpellSets,
    (option) => calculateRate(option.games, totalSpellGames) >= thresholdPct,
  );
  const highlightingNotes = [];

  if (!highestWinSet && spellOptions.length > 0) {
    highlightingNotes.push(
      `No summoner spell set met the ${formatThreshold(thresholdPct)} highest-win sample threshold.`,
    );
  }

  return {
    options: spellOptions
      .map((option) => hydrateSpellSetResult(option, totalSpellGames, mostPickedSet, highestWinSet))
      .sort(compareHighestWinSpellSets),
    mostPickedSet: hydrateSpellSetResult(mostPickedSet, totalSpellGames, mostPickedSet, highestWinSet),
    highestWinSet: hydrateSpellSetResult(highestWinSet, totalSpellGames, mostPickedSet, highestWinSet),
    highlighting: {
      highestWinThresholdPct: thresholdPct,
      notes: highlightingNotes,
    },
  };
}

function hydrateSpellSetResult(spellRecord, totalSpellGames, mostPickedSet, highestWinSet) {
  if (!spellRecord) {
    return null;
  }

  return {
    setKey: spellRecord.setKey,
    spellIds: spellRecord.spellIds,
    selections: spellRecord.selections,
    games: Math.round(toNumber(spellRecord.games)),
    wins: Math.round(toNumber(spellRecord.wins)),
    winRate: calculateRate(spellRecord.wins, spellRecord.games),
    pickRate: calculateRate(spellRecord.games, totalSpellGames),
    isMostPicked: mostPickedSet?.setKey === spellRecord.setKey,
    isHighestWin: highestWinSet?.setKey === spellRecord.setKey,
  };
}

function buildBootResults(bootMap, thresholdPct) {
  const bootOptions = [...bootMap.values()];
  let totalBootGames = 0;

  for (const option of bootOptions) {
    totalBootGames += toNumber(option.games);
  }

  const mostPickedBoot = selectBestRecord(bootOptions, compareMostPickedOptions);
  const highestWinBoot = selectBestRecord(
    bootOptions,
    compareHighestWinOptions,
    (option) => calculateRate(option.games, totalBootGames) >= thresholdPct,
  );

  return bootOptions
    .map((option) => {
      const games = toNumber(option.games);
      const wins = toNumber(option.wins);
      return {
        itemId: option.itemId,
        name: option.name,
        icon: option.icon,
        games: Math.round(games),
        wins: Math.round(wins),
        winRate: calculateRate(wins, games),
        pickRate: calculateRate(games, totalBootGames),
        isHighestWin: highestWinBoot?.itemId === option.itemId,
        isMostPicked: mostPickedBoot?.itemId === option.itemId,
      };
    })
    .sort(compareHighestWinOptions);
}

function buildItemResults(itemSlotMaps, thresholdPct) {
  const slotGroups = itemSlotMaps
    .map((slotMap, index) => createItemSlotGroup(slotMap, index + 1))
    .filter((group) => group.options.length > 0);

  return {
    highestWinBuild: buildOrderedItemBuild(slotGroups, compareHighestWinOptions, thresholdPct),
    mostPickedBuild: buildOrderedItemBuild(slotGroups, compareMostPickedOptions),
  };
}

function createItemSlotGroup(slotMap, slotIndex) {
  const denominator = sumOptionGames(slotMap);

  return {
    slotIndex,
    options: [...slotMap.values()]
      .map((option) => {
        const games = toNumber(option.games);
        const wins = toNumber(option.wins);
        return {
          itemId: option.itemId,
          name: option.name,
          icon: option.icon,
          games: Math.round(games),
          wins: Math.round(wins),
          winRate: calculateRate(wins, games),
          pickRate: calculateRate(games, denominator),
          purchaseMinute: calculateAverageMinute(option),
        };
      })
      .sort(compareMostPickedOptions),
  };
}

function buildOrderedItemBuild(slotGroups, comparator, thresholdPct = 0) {
  const selections = [];
  const selectedItemIds = new Set();

  slotGroups.forEach((slotGroup) => {
    const rankedOptions = rankItemOptions(slotGroup.options, comparator, thresholdPct);
    if (rankedOptions.length === 0) {
      return;
    }

    if (isCompletedBootItem(rankedOptions[0].itemId, rankedOptions[0].name)) {
      return;
    }

    const selectedOption =
      rankedOptions.find(
        (option) =>
          !isCompletedBootItem(option.itemId, option.name) &&
          !selectedItemIds.has(option.itemId),
      ) || null;

    if (!selectedOption) {
      return;
    }

    selections.push({
      ...selectedOption,
      slotIndex: slotGroup.slotIndex,
    });
    selectedItemIds.add(selectedOption.itemId);
  });

  if (selections.length === 0) {
    return null;
  }

  return {
    selections: selections.slice(0, 5),
  };
}

function rankItemOptions(options, comparator, thresholdPct = 0) {
  const normalizedOptions = Array.isArray(options)
    ? options.filter((option) => option?.itemId)
    : [];
  const thresholdOptions =
    thresholdPct > 0
      ? normalizedOptions.filter((option) => option.pickRate >= thresholdPct)
      : normalizedOptions;
  const optionsToRank = thresholdOptions.length > 0 ? thresholdOptions : normalizedOptions;

  return [...optionsToRank].sort(comparator);
}

function mergeGroupedOptionLists(targetGroups, sourceGroups) {
  if (!Array.isArray(sourceGroups)) {
    return;
  }

  targetGroups.forEach((targetGroup, index) => {
    mergeOptionList(targetGroup, sourceGroups[index]);
  });
}

function mergeGroupedItemOptionLists(targetGroups, sourceGroups) {
  if (!Array.isArray(sourceGroups)) {
    return;
  }

  targetGroups.forEach((targetGroup, index) => {
    mergeItemOptionList(targetGroup, sourceGroups[index]);
  });
}

function mergeOptionList(targetMap, options) {
  if (!Array.isArray(options)) {
    return;
  }

  options.forEach((option) => {
    if (!option || option.id == null) {
      return;
    }

    const existing = targetMap.get(option.id);
    if (existing) {
      existing.games += toNumber(option.games);
      existing.wins += toNumber(option.wins);
      return;
    }

    targetMap.set(option.id, { ...option });
  });
}

function mergeItemOptionList(targetMap, options) {
  if (!Array.isArray(options)) {
    return;
  }

  options.forEach((option) => {
    if (!option?.itemId) {
      return;
    }

    const games = toNumber(option.games);
    const minuteGames =
      toNumber(option.minuteGames) ||
      (Number.isFinite(Number(option.purchaseMinute)) ? games : 0);
    const minuteTotal =
      toNumber(option.minuteTotal) ||
      (Number.isFinite(Number(option.purchaseMinute)) ? toNumber(option.purchaseMinute) * games : 0);
    const existing = targetMap.get(option.itemId);

    if (existing) {
      existing.games += games;
      existing.wins += toNumber(option.wins);
      existing.minuteTotal += minuteTotal;
      existing.minuteGames += minuteGames;
      return;
    }

    targetMap.set(option.itemId, {
      ...option,
      games,
      wins: toNumber(option.wins),
      minuteTotal,
      minuteGames,
    });
  });
}

function mergePageCandidates(targetMap, pageCandidates) {
  if (!Array.isArray(pageCandidates)) {
    return;
  }

  pageCandidates.forEach((pageCandidate) => {
    if (!pageCandidate?.pageKey) {
      return;
    }

    const existing = targetMap.get(pageCandidate.pageKey);
    if (existing) {
      existing.games += toNumber(pageCandidate.games);
      existing.wins += toNumber(pageCandidate.wins);
      return;
    }

    targetMap.set(pageCandidate.pageKey, {
      ...pageCandidate,
      games: toNumber(pageCandidate.games),
      wins: toNumber(pageCandidate.wins),
    });
  });
}

function mergeSpellOptions(targetMap, spellOptions) {
  if (!Array.isArray(spellOptions)) {
    return;
  }

  spellOptions.forEach((spellOption) => {
    if (!spellOption?.setKey) {
      return;
    }

    const existing = targetMap.get(spellOption.setKey);
    if (existing) {
      existing.games += toNumber(spellOption.games);
      existing.wins += toNumber(spellOption.wins);
      return;
    }

    targetMap.set(spellOption.setKey, {
      ...spellOption,
      spellIds: Array.isArray(spellOption.spellIds) ? [...spellOption.spellIds] : [],
      selections: Array.isArray(spellOption.selections) ? [...spellOption.selections] : [],
      games: toNumber(spellOption.games),
      wins: toNumber(spellOption.wins),
    });
  });
}

function mergeBootOptions(targetMap, bootOptions) {
  if (!Array.isArray(bootOptions)) {
    return;
  }

  bootOptions.forEach((bootOption) => {
    if (!bootOption?.itemId) {
      return;
    }

    const existing = targetMap.get(bootOption.itemId);
    if (existing) {
      existing.games += toNumber(bootOption.games);
      existing.wins += toNumber(bootOption.wins);
      return;
    }

    targetMap.set(bootOption.itemId, { ...bootOption });
  });
}

function optionMatchesPage(groupKey, option, page) {
  if (!page) {
    return false;
  }

  if (groupKey === "primary-style") {
    return page.primaryStyle?.styleId === option.id;
  }

  if (groupKey === "secondary-style") {
    return page.secondaryStyle?.styleId === option.id;
  }

  if (groupKey.startsWith("primary-slot-")) {
    return page.selections?.primary?.some((selection) => selection.id === option.id);
  }

  if (groupKey.startsWith("secondary-slot-")) {
    return page.selections?.secondary?.some((selection) => selection.id === option.id);
  }

  if (groupKey === "stat-mods") {
    return page.selections?.modifiers?.some((selection) => selection.id === option.id);
  }

  return false;
}

function determineLastUpdatedAt(matchupBuilds) {
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const matchup of matchupBuilds) {
    const timestamp = Date.parse(matchup?.fetchedAt || "");
    if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
    }
  }

  if (!Number.isFinite(latestTimestamp)) {
    return new Date().toISOString();
  }

  return new Date(latestTimestamp).toISOString();
}

function sumOptionGames(optionMap) {
  let totalGames = 0;

  for (const option of optionMap.values()) {
    totalGames += toNumber(option.games);
  }

  return totalGames;
}

function calculateAverageMinute(option) {
  const minuteGames = toNumber(option.minuteGames);
  if (minuteGames <= 0) {
    return null;
  }

  return Math.round(toNumber(option.minuteTotal) / minuteGames);
}

function compareDisplayOptions(left, right) {
  return (
    toNumber(right.games) - toNumber(left.games) ||
    Number(right.winRate || 0) - Number(left.winRate || 0) ||
    String(left.name || "").localeCompare(String(right.name || ""))
  );
}

function compareMostPickedPages(left, right) {
  return (
    toNumber(right.games) - toNumber(left.games) ||
    toNumber(right.wins) - toNumber(left.wins) ||
    String(left.pageKey || "").localeCompare(String(right.pageKey || ""))
  );
}

function compareHighestWinPages(left, right) {
  return (
    calculateRate(right.wins, right.games) - calculateRate(left.wins, left.games) ||
    toNumber(right.games) - toNumber(left.games) ||
    toNumber(right.wins) - toNumber(left.wins) ||
    String(left.pageKey || "").localeCompare(String(right.pageKey || ""))
  );
}

function compareMostPickedSpellSets(left, right) {
  return (
    toNumber(right.games) - toNumber(left.games) ||
    toNumber(right.wins) - toNumber(left.wins) ||
    String(left.setKey || "").localeCompare(String(right.setKey || ""))
  );
}

function compareHighestWinSpellSets(left, right) {
  return (
    calculateRate(right.wins, right.games) - calculateRate(left.wins, left.games) ||
    toNumber(right.games) - toNumber(left.games) ||
    toNumber(right.wins) - toNumber(left.wins) ||
    String(left.setKey || "").localeCompare(String(right.setKey || ""))
  );
}

function compareMostPickedOptions(left, right) {
  return (
    toNumber(right.games) - toNumber(left.games) ||
    toNumber(right.wins) - toNumber(left.wins) ||
    String(left.name || "").localeCompare(String(right.name || ""))
  );
}

function compareHighestWinOptions(left, right) {
  return (
    calculateRate(right.wins, right.games) - calculateRate(left.wins, left.games) ||
    toNumber(right.games) - toNumber(left.games) ||
    toNumber(right.wins) - toNumber(left.wins) ||
    String(left.name || "").localeCompare(String(right.name || ""))
  );
}

function selectBestRecord(records, comparator, predicate = alwaysTrue) {
  let bestRecord = null;

  for (const record of records) {
    if (!predicate(record)) {
      continue;
    }

    if (!bestRecord || comparator(record, bestRecord) < 0) {
      bestRecord = record;
    }
  }

  return bestRecord;
}

function calculateRate(part, total) {
  const numericPart = Number(part);
  const numericTotal = Number(total);
  if (!Number.isFinite(numericPart) || !Number.isFinite(numericTotal) || numericTotal <= 0) {
    return 0;
  }

  return (numericPart / numericTotal) * 100;
}

function formatThreshold(value) {
  return `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1)}%`;
}

function toNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function alwaysTrue() {
  return true;
}

module.exports = {
  buildBuildSuggestionResults,
};
