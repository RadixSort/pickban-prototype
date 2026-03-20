const {
  buildRuneStyleIconUrl,
  getRuneStyle,
} = require("../public/rune-metadata.js");

const PRIMARY_SLOT_LABELS = ["Keystone", "Primary Row 1", "Primary Row 2", "Primary Row 3"];
const SECONDARY_SLOT_LABELS = ["", "Secondary Row 1", "Secondary Row 2", "Secondary Row 3"];

function buildBuildSuggestionResults({
  matchupBuilds = [],
  highestWinPageThresholdPct = 1,
  highestWinBootThresholdPct = 1,
} = {}) {
  const totalGames = matchupBuilds.reduce((sum, matchup) => sum + toNumber(matchup?.totalGames), 0);
  const lastUpdatedAt = determineLastUpdatedAt(matchupBuilds);
  const primaryStyleMap = new Map();
  const secondaryStyleMap = new Map();
  const primarySlotMaps = [new Map(), new Map(), new Map(), new Map()];
  const secondarySlotMaps = [new Map(), new Map(), new Map(), new Map()];
  const statModMap = new Map();
  const pageMap = new Map();
  const bootMap = new Map();

  matchupBuilds.forEach((matchup) => {
    mergeOptionList(primaryStyleMap, matchup?.runes?.primaryStyleOptions);
    mergeOptionList(secondaryStyleMap, matchup?.runes?.secondaryStyleOptions);
    mergeGroupedOptionLists(primarySlotMaps, matchup?.runes?.primarySlotOptions);
    mergeGroupedOptionLists(secondarySlotMaps, matchup?.runes?.secondarySlotOptions);
    mergeOptionList(statModMap, matchup?.runes?.statOptions);
    mergePageCandidates(pageMap, matchup?.runes?.pageCandidates);
    mergeBootOptions(bootMap, matchup?.boots);
  });

  const mostPickedPage = selectMostPickedPage(pageMap, totalGames);
  const highestWinPage = selectHighestWinPage(pageMap, totalGames, highestWinPageThresholdPct);
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
    boots: {
      options: boots,
    },
  };
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
  const pages = [...pageMap.values()];
  if (pages.length === 0) {
    return null;
  }

  const selectedPage = pages.sort(compareMostPickedPages)[0];
  return hydratePageResult(selectedPage, totalGames);
}

function selectHighestWinPage(pageMap, totalGames, thresholdPct) {
  const thresholdPages = [...pageMap.values()].filter(
    (page) => calculateRate(page.games, totalGames) >= thresholdPct,
  );
  if (thresholdPages.length === 0) {
    return null;
  }

  const selectedPage = thresholdPages.sort(compareHighestWinPages)[0];
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

function buildBootResults(bootMap, thresholdPct) {
  const bootOptions = [...bootMap.values()];
  const totalBootGames = bootOptions.reduce((sum, option) => sum + toNumber(option.games), 0);
  const mostPickedBoot = bootOptions.sort(compareMostPickedOptions)[0] || null;
  const highestWinBoot =
    bootOptions
      .filter((option) => calculateRate(option.games, totalBootGames) >= thresholdPct)
      .sort(compareHighestWinOptions)[0] || null;

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
    .sort(compareDisplayOptions);
}

function mergeGroupedOptionLists(targetGroups, sourceGroups) {
  if (!Array.isArray(sourceGroups)) {
    return;
  }

  targetGroups.forEach((targetGroup, index) => {
    mergeOptionList(targetGroup, sourceGroups[index]);
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
  const timestamps = matchupBuilds
    .map((matchup) => Date.parse(matchup?.fetchedAt || ""))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) {
    return new Date().toISOString();
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function sumOptionGames(optionMap) {
  return [...optionMap.values()].reduce((sum, option) => sum + toNumber(option.games), 0);
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

module.exports = {
  buildBuildSuggestionResults,
};
