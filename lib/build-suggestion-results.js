const {
  buildRuneStyleIconUrl,
  getRuneStyle,
  getStatModDefinition,
} = require("../public/rune-metadata.js");
const { isCompletedBootItem } = require("./lolalytics-build-parser.js");
const { expandEntriesByLaneOpponentWeight } = require("./lane-opponent-weight.js");
const {
  DEFAULT_LANE_OPPONENT_WEIGHT,
} = require("../public/lane-opponent-weight.js");

const PRIMARY_SLOT_LABELS = ["Keystone", "Primary Row 1", "Primary Row 2", "Primary Row 3"];
const SECONDARY_SLOT_LABELS = ["", "Secondary Row 1", "Secondary Row 2", "Secondary Row 3"];
const ITEM_SLOT_COUNT = 6;
const STAT_MOD_SLOT_COUNT = 3;

/**
 * Merge parsed matchup build records into one summary response for the
 * `/build-suggestions` endpoint.
 *
 * The output keeps overview-level rune distributions and composes importable
 * rune recommendations from individual element statistics. Spell, boots, and
 * item highlights retain their source set/path aggregation.
 */
function buildBuildSuggestionResults({
  matchupBuilds = [],
  laneOpponentWeight = DEFAULT_LANE_OPPONENT_WEIGHT,
  highestWinPageThresholdPct = 1,
  highestWinSpellThresholdPct = 1,
  highestWinStartingItemThresholdPct = 1,
  highestWinSkillThresholdPct = 1,
  highestWinBootThresholdPct = 1,
  highestWinItemThresholdPct = 1,
} = {}) {
  const weightedMatchupBuilds = expandEntriesByLaneOpponentWeight(matchupBuilds, {
    laneOpponentWeight,
    targetRole: matchupBuilds.find((matchup) => matchup?.role)?.role,
    getOpponentRole: (matchup) => matchup?.enemyRole,
    getLaneOpponentLikelihood: (matchup) => matchup?.laneOpponentLikelihood,
    getFallbackScore: (matchup) => matchup?.totalGames,
    getStableKey: (matchup) => matchup?.enemyChampionKey,
  });
  const totalGames = weightedMatchupBuilds.reduce(
    (sum, matchup) => sum + toNumber(matchup?.totalGames),
    0,
  );
  const lastUpdatedAt = determineLastUpdatedAt(matchupBuilds);
  const primaryStyleMap = new Map();
  const secondaryStyleMap = new Map();
  const primarySlotMaps = [new Map(), new Map(), new Map(), new Map()];
  const secondarySlotMaps = [new Map(), new Map(), new Map(), new Map()];
  const statModMap = new Map();
  const spellMap = new Map();
  const startingItemMap = new Map();
  const skillPriorityMap = new Map();
  const itemSlotMaps = createItemSlotMaps();
  const mostPickedItemSlotMaps = createItemSlotMaps();
  const highestWinItemSlotMaps = createItemSlotMaps();
  const bootMap = new Map();

  weightedMatchupBuilds.forEach((matchup) => {
    mergeOptionList(primaryStyleMap, matchup?.runes?.primaryStyleOptions);
    mergeOptionList(secondaryStyleMap, matchup?.runes?.secondaryStyleOptions);
    mergeGroupedOptionLists(primarySlotMaps, matchup?.runes?.primarySlotOptions);
    mergeGroupedOptionLists(secondarySlotMaps, matchup?.runes?.secondarySlotOptions);
    mergeOptionList(statModMap, matchup?.runes?.statOptions);
    mergeSpellOptions(spellMap, matchup?.spells?.options);
    mergeStartingItemOptions(startingItemMap, matchup?.startingItems?.options);
    mergeOptionList(skillPriorityMap, matchup?.skills?.options);
    mergeGroupedItemOptionLists(itemSlotMaps, matchup?.items?.slotOptions);
    mergeGroupedItemOptionLists(mostPickedItemSlotMaps, matchup?.items?.mostPickedSlotOptions);
    mergeGroupedItemOptionLists(highestWinItemSlotMaps, matchup?.items?.highestWinSlotOptions);
    mergeBootOptions(bootMap, matchup?.boots);
  });

  const runeHistogram = {
    totalGames,
    secondaryStyleMap,
    primarySlotMaps,
    secondarySlotMaps,
    statModMap,
  };
  const mostPickedPage = buildCompositeRunePage({
    ...runeHistogram,
    comparator: compareMostPickedOptions,
  });
  const highestWinPage = buildCompositeRunePage({
    ...runeHistogram,
    comparator: compareHighestWinOptions,
    thresholdPct: highestWinPageThresholdPct,
  });
  const spells = buildSpellResults(spellMap, highestWinSpellThresholdPct);
  const startingItems = buildStartingItemResults(
    startingItemMap,
    highestWinStartingItemThresholdPct,
  );
  const skillPriority = buildSkillPriorityResults(
    skillPriorityMap,
    highestWinSkillThresholdPct,
  );
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
  const items = buildItemResults({
    itemSlotMaps,
    mostPickedItemSlotMaps,
    highestWinItemSlotMaps,
    highestWinItemThresholdPct,
  });
  const boots = buildBootResults(bootMap, highestWinBootThresholdPct);
  const highlightingNotes = [];

  if (!highestWinPage && primarySlotMaps.some((slotMap) => slotMap.size > 0)) {
    highlightingNotes.push(
      `No complete composite rune recommendation met the ${formatThreshold(highestWinPageThresholdPct)} highest-win sample threshold.`,
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
    startingItems,
    skillPriority,
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

/**
 * Build a legal rune page from the aggregated element histogram. The
 * keystone selects the primary tree, the independently ranked secondary tree
 * selects the secondary pool, and each remaining element is then chosen from
 * the legal rows for those trees.
 */
function buildCompositeRunePage({
  totalGames,
  secondaryStyleMap,
  primarySlotMaps,
  secondarySlotMaps,
  statModMap,
  comparator,
  thresholdPct = 0,
}) {
  const meetsThreshold = (option) =>
    thresholdPct <= 0 || calculateRate(option?.games, totalGames) >= thresholdPct;
  const keystone = selectBestRecord(
    primarySlotMaps[0]?.values() || [],
    comparator,
    (option) =>
      meetsThreshold(option) &&
      hasCompletePrimaryTree(option.styleId, primarySlotMaps, meetsThreshold),
  );
  if (!keystone) {
    return null;
  }

  const primaryStyleId = keystone.styleId;
  const primaryRunes = [hydrateRuneElement(keystone, 0)];
  for (let slotIndex = 1; slotIndex < primarySlotMaps.length; slotIndex += 1) {
    const rune = selectBestRecord(
      primarySlotMaps[slotIndex].values(),
      comparator,
      (option) => option.styleId === primaryStyleId && meetsThreshold(option),
    );
    if (!rune) {
      return null;
    }
    primaryRunes.push(hydrateRuneElement(rune, slotIndex));
  }

  const secondaryStyle = selectBestRecord(
    secondaryStyleMap.values(),
    comparator,
    (style) =>
      style.id !== primaryStyleId &&
      meetsThreshold(style) &&
      countPopulatedSecondaryRows(
        style.id,
        secondarySlotMaps,
        meetsThreshold,
      ) >= 2,
  );
  if (!secondaryStyle) {
    return null;
  }

  const secondaryRunes = selectSecondaryRunes({
    comparator,
    meetsThreshold,
    secondarySlotMaps,
    secondaryStyleId: secondaryStyle.id,
  });
  const modifiers = selectStatModifiers({
    comparator,
    meetsThreshold,
    statModMap,
  });
  if (secondaryRunes.length < 2 || modifiers.length < STAT_MOD_SLOT_COUNT) {
    return null;
  }

  return hydrateCompositeRunePage({
    totalGames,
    primaryStyleId,
    secondaryStyleId: secondaryStyle.id,
    primaryRunes,
    secondaryRunes,
    modifiers,
  });
}

function hasCompletePrimaryTree(styleId, primarySlotMaps, predicate) {
  return primarySlotMaps.slice(1).every((slotMap) =>
    [...slotMap.values()].some(
      (option) => option.styleId === styleId && predicate(option),
    ),
  );
}

function countPopulatedSecondaryRows(styleId, secondarySlotMaps, predicate) {
  return secondarySlotMaps.slice(1).filter((slotMap) =>
    [...slotMap.values()].some(
      (option) => option.styleId === styleId && predicate(option),
    ),
  ).length;
}

function selectSecondaryRunes({
  comparator,
  meetsThreshold,
  secondarySlotMaps,
  secondaryStyleId,
}) {
  const candidates = secondarySlotMaps
    .slice(1)
    .flatMap((slotMap, index) =>
      [...slotMap.values()]
        .filter(
          (option) => option.styleId === secondaryStyleId && meetsThreshold(option),
        )
        .map((option) => ({
          option,
          slotIndex: index + 1,
        })),
    )
    .sort((left, right) => comparator(left.option, right.option));
  const selectedSlotIndexes = new Set();
  const selections = [];

  for (const candidate of candidates) {
    if (selectedSlotIndexes.has(candidate.slotIndex)) {
      continue;
    }

    selections.push(hydrateRuneElement(candidate.option, candidate.slotIndex));
    selectedSlotIndexes.add(candidate.slotIndex);
    if (selections.length === 2) {
      break;
    }
  }

  return selections.sort((left, right) => left.slotIndex - right.slotIndex);
}

function selectStatModifiers({ comparator, meetsThreshold, statModMap }) {
  const options = [...statModMap.values()];

  return Array.from({ length: STAT_MOD_SLOT_COUNT }, (_, slotIndex) => {
    const selected = selectBestRecord(
      options,
      comparator,
      (option) =>
        getStatModSlotIndexes(option).includes(slotIndex) && meetsThreshold(option),
    );

    return selected ? hydrateStatModifier(selected, slotIndex) : null;
  }).filter(Boolean);
}

function getStatModSlotIndexes(option) {
  if (Array.isArray(option?.slotIndexes) && option.slotIndexes.length > 0) {
    return option.slotIndexes;
  }

  return getStatModDefinition(option?.id)?.slotIndexes || [];
}

function hydrateRuneElement(option, slotIndex) {
  return {
    id: option.id,
    icon: option.icon,
    name: option.name,
    styleId: option.styleId,
    styleName: option.styleName,
    slotIndex,
    games: toNumber(option.games),
    wins: toNumber(option.wins),
  };
}

function hydrateStatModifier(option, slotIndex) {
  return {
    id: option.id,
    icon: option.icon,
    name: option.name,
    slotIndex,
    games: toNumber(option.games),
    wins: toNumber(option.wins),
  };
}

function hydrateCompositeRunePage({
  totalGames,
  primaryStyleId,
  secondaryStyleId,
  primaryRunes,
  secondaryRunes,
  modifiers,
}) {
  const componentRecords = [...primaryRunes, ...secondaryRunes, ...modifiers];
  const componentGames = sumGames(componentRecords);
  const componentWins = componentRecords.reduce(
    (total, record) => total + toNumber(record?.wins),
    0,
  );
  const averageGames = componentGames / componentRecords.length;
  const averageWins = componentWins / componentRecords.length;
  const primaryStyle = getRuneStyle(primaryStyleId);
  const secondaryStyle = getRuneStyle(secondaryStyleId);
  const pageKey = [
    `priStyle=${primaryStyleId}`,
    `pri=${primaryRunes.map((rune) => rune.id).join("-")}`,
    `secStyle=${secondaryStyleId}`,
    `sec=${secondaryRunes.map((rune) => rune.id).join("-")}`,
    `mods=${modifiers.map((modifier) => modifier.id).join("-")}`,
  ].join("|");

  return {
    pageKey,
    isComposite: true,
    componentCount: componentRecords.length,
    games: Math.round(averageGames),
    wins: Math.round(averageWins),
    winRate: calculateRate(componentWins, componentGames),
    pickRate: calculateRate(averageGames, totalGames),
    primaryStyle: {
      styleId: primaryStyleId,
      name: primaryStyle?.name || primaryRunes[0]?.styleName || "Primary",
      icon: buildRuneStyleIconUrl(primaryStyleId),
    },
    secondaryStyle: {
      styleId: secondaryStyleId,
      name: secondaryStyle?.name || secondaryRunes[0]?.styleName || "Secondary",
      icon: buildRuneStyleIconUrl(secondaryStyleId),
    },
    selections: {
      primary: primaryRunes,
      secondary: secondaryRunes,
      modifiers,
    },
  };
}

function buildSpellResults(spellMap, thresholdPct) {
  return buildSetResults({
    optionMap: spellMap,
    thresholdPct,
    highestWinComparator: compareHighestWinSpellSets,
    mostPickedComparator: compareMostPickedSpellSets,
    noHighestWinMessage:
      `No summoner spell set met the ${formatThreshold(thresholdPct)} highest-win sample threshold.`,
    hydrateResult: (record, context) => hydrateSetResult(record, context, "spellIds"),
  });
}

function buildStartingItemResults(startingItemMap, thresholdPct) {
  return buildSetResults({
    optionMap: startingItemMap,
    thresholdPct,
    highestWinComparator: compareHighestWinSets,
    mostPickedComparator: compareMostPickedSets,
    noHighestWinMessage:
      `No starting item set met the ${formatThreshold(thresholdPct)} highest-win sample threshold.`,
    hydrateResult: (record, context) => hydrateSetResult(record, context, "itemIds"),
  });
}

function buildSkillPriorityResults(skillPriorityMap, thresholdPct) {
  const options = [...skillPriorityMap.values()];
  const totalGames = sumGames(options);
  const mostPickedSkill = selectBestRecord(options, compareMostPickedOptions);
  const highestWinSkill = selectBestRecord(
    options,
    compareHighestWinOptions,
    (option) => calculateRate(option.games, totalGames) >= thresholdPct,
  );
  const hydrateSkill = (record) => {
    if (!record) {
      return null;
    }

    return {
      abilityKey: record.abilityKey || record.id || null,
      name: record.name || record.abilityKey || record.id || "Skill",
      games: Math.round(toNumber(record.games)),
      wins: Math.round(toNumber(record.wins)),
      winRate: calculateRate(record.wins, record.games),
      pickRate: calculateRate(record.games, totalGames),
      isHighestWin: highestWinSkill?.id === record.id,
      isMostPicked: mostPickedSkill?.id === record.id,
    };
  };

  return {
    options: options.map(hydrateSkill).sort(compareHighestWinOptions),
    highestWinSkill: hydrateSkill(highestWinSkill),
    mostPickedSkill: hydrateSkill(mostPickedSkill),
    highlighting: {
      highestWinThresholdPct: thresholdPct,
      notes:
        !highestWinSkill && options.length > 0
          ? [
              `No skill max priority met the ${formatThreshold(thresholdPct)} highest-win sample threshold.`,
            ]
          : [],
    },
  };
}

function buildSetResults({
  optionMap,
  thresholdPct,
  highestWinComparator,
  mostPickedComparator,
  noHighestWinMessage,
  hydrateResult,
}) {
  const options = [...optionMap.values()];
  const totalGames = sumGames(options);
  const mostPickedSet = selectBestRecord(options, mostPickedComparator);
  const highestWinSet = selectBestRecord(
    options,
    highestWinComparator,
    (option) => calculateRate(option.games, totalGames) >= thresholdPct,
  );
  const context = {
    highestWinSet,
    mostPickedSet,
    totalGames,
  };

  return {
    options: options
      .map((option) => hydrateResult(option, context))
      .sort(highestWinComparator),
    mostPickedSet: hydrateResult(mostPickedSet, context),
    highestWinSet: hydrateResult(highestWinSet, context),
    highlighting: {
      highestWinThresholdPct: thresholdPct,
      notes: !highestWinSet && options.length > 0 ? [noHighestWinMessage] : [],
    },
  };
}

function hydrateSetResult(record, {
  highestWinSet,
  mostPickedSet,
  totalGames,
}, idsProperty) {
  if (!record) {
    return null;
  }

  return {
    setKey: record.setKey,
    [idsProperty]: record[idsProperty],
    selections: record.selections,
    games: Math.round(toNumber(record.games)),
    wins: Math.round(toNumber(record.wins)),
    winRate: calculateRate(record.wins, record.games),
    pickRate: calculateRate(record.games, totalGames),
    isMostPicked: mostPickedSet?.setKey === record.setKey,
    isHighestWin: highestWinSet?.setKey === record.setKey,
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

function buildItemResults({
  itemSlotMaps,
  mostPickedItemSlotMaps,
  highestWinItemSlotMaps,
  highestWinItemThresholdPct,
}) {
  const slotGroups = createItemSlotGroups(itemSlotMaps);
  const mostPickedSlotGroups = createPreferredItemSlotGroups(
    mostPickedItemSlotMaps,
    slotGroups,
  );
  const highestWinSlotGroups = createPreferredItemSlotGroups(
    highestWinItemSlotMaps,
    slotGroups,
  );

  return {
    highestWinBuild: buildOrderedItemBuild(
      highestWinSlotGroups,
      compareHighestWinOptions,
      highestWinItemThresholdPct,
    ),
    mostPickedBuild: buildOrderedItemBuild(mostPickedSlotGroups, compareMostPickedOptions),
  };
}

function createItemSlotGroups(itemSlotMaps) {
  return itemSlotMaps
    .map((slotMap, index) => createItemSlotGroup(slotMap, index + 1))
    .filter((group) => group.options.length > 0);
}

function createPreferredItemSlotGroups(preferredSlotMaps, fallbackSlotGroups) {
  const preferredSlotGroups = createItemSlotGroups(preferredSlotMaps);
  if (preferredSlotGroups.length === 0) {
    return fallbackSlotGroups;
  }

  const preferredGroupsBySlot = new Map(
    preferredSlotGroups.map((group) => [group.slotIndex, group]),
  );
  const fallbackGroupsBySlot = new Map(
    fallbackSlotGroups.map((group) => [group.slotIndex, group]),
  );

  return Array.from({ length: ITEM_SLOT_COUNT }, (_, index) => {
    const slotIndex = index + 1;
    return preferredGroupsBySlot.get(slotIndex) || fallbackGroupsBySlot.get(slotIndex) || null;
  }).filter(Boolean);
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
      if (Array.isArray(option.slotIndexes)) {
        existing.slotIndexes = [
          ...new Set([...(existing.slotIndexes || []), ...option.slotIndexes]),
        ];
      }
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
    const purchaseMinute = Number(option.purchaseMinute);
    const hasPurchaseMinute =
      option.purchaseMinute != null && Number.isFinite(purchaseMinute) && purchaseMinute > 0;
    const minuteGames =
      toNumber(option.minuteGames) ||
      (hasPurchaseMinute ? games : 0);
    const minuteTotal =
      toNumber(option.minuteTotal) ||
      (hasPurchaseMinute ? purchaseMinute * games : 0);
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

function mergeSpellOptions(targetMap, spellOptions) {
  mergeSetOptions(targetMap, spellOptions, "spellIds");
}

function mergeStartingItemOptions(targetMap, startingItemOptions) {
  mergeSetOptions(targetMap, startingItemOptions, "itemIds");
}

function mergeSetOptions(targetMap, options, idsProperty) {
  if (!Array.isArray(options)) {
    return;
  }

  options.forEach((option) => {
    if (!option?.setKey) {
      return;
    }

    const existing = targetMap.get(option.setKey);
    if (existing) {
      existing.games += toNumber(option.games);
      existing.wins += toNumber(option.wins);
      return;
    }

    targetMap.set(option.setKey, {
      ...option,
      [idsProperty]: Array.isArray(option[idsProperty]) ? [...option[idsProperty]] : [],
      selections: Array.isArray(option.selections) ? [...option.selections] : [],
      games: toNumber(option.games),
      wins: toNumber(option.wins),
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

function sumGames(records) {
  return records.reduce((total, record) => total + toNumber(record?.games), 0);
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

function compareMostPickedSets(left, right) {
  return (
    toNumber(right.games) - toNumber(left.games) ||
    toNumber(right.wins) - toNumber(left.wins) ||
    String(left.setKey || "").localeCompare(String(right.setKey || ""))
  );
}

function compareHighestWinSets(left, right) {
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
