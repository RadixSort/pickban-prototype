(function initializeBuildSuggestionView(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.buildSuggestionView = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_BUILD_SUGGESTION_TAB = "summary";
  const BUILD_SUGGESTION_TABS = [{ value: "summary", label: "Summary" }];
  const validTabs = new Set(BUILD_SUGGESTION_TABS.map((tab) => tab.value));

  function normalizeBuildSuggestionTab(value) {
    return validTabs.has(value) ? value : DEFAULT_BUILD_SUGGESTION_TAB;
  }

  /**
   * Render the cached `/build-suggestions` payload into the summary-only modal
   * layout used by the current browser UI.
   */
  function renderBuildSuggestionBody(
    payload,
    activeTab = DEFAULT_BUILD_SUGGESTION_TAB,
    options = {},
  ) {
    void activeTab;

    if (!payload || typeof payload !== "object") {
      return renderEmptyState("Select an ally with a role, then load build recommendations.");
    }

    const runeNotes = Array.isArray(payload?.runes?.highlighting?.notes)
      ? payload.runes.highlighting.notes
      : [];
    const spellNotes = Array.isArray(payload?.spells?.highlighting?.notes)
      ? payload.spells.highlighting.notes
      : [];
    const slotGroups = Array.isArray(payload?.runes?.overview?.slotGroups)
      ? payload.runes.overview.slotGroups
      : [];
    const highestWinPage = payload?.runes?.highestWinPage || null;
    const mostPickedPage = payload?.runes?.mostPickedPage || null;
    const highestWinSpellSet = payload?.spells?.highestWinSet || null;
    const mostPickedSpellSet = payload?.spells?.mostPickedSet || null;
    const highestWinItemBuild = payload?.items?.highestWinBuild || null;
    const mostPickedItemBuild = payload?.items?.mostPickedBuild || null;
    const boots = Array.isArray(payload?.boots?.options) ? payload.boots.options : [];

    return renderSummaryPanel({
      highestWinPage,
      mostPickedPage,
      highestWinSpellSet,
      mostPickedSpellSet,
      highestWinItemBuild,
      mostPickedItemBuild,
      boots,
      notes: [...runeNotes, ...spellNotes],
      runeImportStatesByPageKey: normalizeRuneImportStates(options?.runeImportStatesByPageKey),
      slotGroupMap: buildSlotGroupMap(slotGroups),
    });
  }

  function renderSummaryPanel({
    highestWinPage,
    mostPickedPage,
    highestWinSpellSet,
    mostPickedSpellSet,
    highestWinItemBuild,
    mostPickedItemBuild,
    boots,
    notes,
    runeImportStatesByPageKey,
    slotGroupMap,
  }) {
    const runeRecommendations = buildRecommendedRunePages(highestWinPage, mostPickedPage);
    const spellRecommendations = buildRecommendedSpellSets(
      highestWinSpellSet,
      mostPickedSpellSet,
    );
    const highlightedBoots = getHighlightedOptions(boots, "itemId");
    const hasAnyContent =
      runeRecommendations.length > 0 ||
      spellRecommendations.length > 0 ||
      highestWinItemBuild ||
      mostPickedItemBuild ||
      highlightedBoots.length > 0;

    if (!hasAnyContent) {
      return `
        <div class="build-view build-view--summary">
          ${renderInlineNotes(notes)}
          ${renderEmptyState("No build recommendation data is available.")}
        </div>
      `;
    }

    return `
      <div class="build-view build-view--summary">
        ${renderInlineNotes(notes)}
        ${renderBuildSummaryGlobalNote()}
        <div class="build-summary-top-grid">
          ${renderRuneRecommendationsSection(
            runeRecommendations,
            slotGroupMap,
            runeImportStatesByPageKey,
          )}
          <div class="build-summary-side-stack">
            ${renderSpellRecommendationsSection(spellRecommendations)}
            ${renderBootsSection(highlightedBoots)}
          </div>
        </div>
        ${renderItemsSection({
          highestWinBuild: highestWinItemBuild,
          mostPickedBuild: mostPickedItemBuild,
        })}
      </div>
    `;
  }

  function renderSummaryPageColumn({
    title,
    tone,
    page,
    runeImportStatesByPageKey,
    slotGroupMap,
    emptyMessage,
  }) {
    if (!page) {
      return `
        <section class="build-summary-column build-summary-column--${escapeAttribute(tone)}">
          <header class="build-summary-column-header">
            <div class="build-summary-column-heading">
              <span class="build-summary-kicker">${escapeHtml(title)}</span>
              <h3>${escapeHtml(title)}</h3>
            </div>
          </header>
          <div class="build-summary-column-empty">${escapeHtml(emptyMessage)}</div>
        </section>
      `;
    }

    const primaryRunes = hydrateRuneSelections(page?.selections?.primary, "primary", slotGroupMap);
    const secondaryRunes = hydrateRuneSelections(
      page?.selections?.secondary,
      "secondary",
      slotGroupMap,
    );
    const modifiers = Array.isArray(page?.selections?.modifiers) ? page.selections.modifiers : [];
    const pageKey = getRecommendationPageKey(page);
    const runeImportState = pageKey ? runeImportStatesByPageKey[pageKey] || null : null;

    return `
      <section class="build-summary-column build-summary-column--${escapeAttribute(tone)}">
        <header class="build-summary-column-header">
          <div class="build-summary-column-header-top">
            <div class="build-summary-column-heading">
              <span class="build-summary-kicker">${escapeHtml(title)}</span>
              <h3>${escapeHtml(getPageTitle(page))}</h3>
            </div>
            ${renderRuneImportAction(pageKey, runeImportState)}
          </div>
          <div class="build-summary-metric-grid">
            ${renderSummaryMetric("Win", formatPercent(page.winRate), "win")}
            ${renderSummaryMetric("Pick", formatPercent(page.pickRate), "pick")}
            ${renderSummaryMetric("Games", formatCount(page.games), "games")}
          </div>
          ${renderRuneImportStatus(runeImportState)}
        </header>
        <div class="build-summary-section-list">
          ${renderRuneSection("Primary Runes", primaryRunes)}
          ${renderRuneSection("Secondary Runes", secondaryRunes)}
          ${renderCompactSection("Mods", modifiers)}
        </div>
      </section>
    `;
  }

  function renderRuneRecommendationsSection(
    recommendations,
    slotGroupMap,
    runeImportStatesByPageKey = {},
  ) {
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      return `
        <section class="build-items-panel" aria-label="Recommended runes">
          <header class="build-items-panel-header">
            <div class="build-items-panel-heading">
              <h3>Runes</h3>
            </div>
          </header>
          <div class="build-summary-column-empty">
            No locked rune page recommendations were available.
          </div>
        </section>
      `;
    }

    return `
      <section class="build-items-panel" aria-label="Recommended runes">
        <header class="build-items-panel-header">
          <div class="build-items-panel-heading">
            <h3>Runes</h3>
          </div>
        </header>
        <div class="build-summary-board${recommendations.length === 1 ? " build-summary-board--single" : ""}">
          ${recommendations
            .map((page) =>
              renderSummaryPageColumn({
                title: getRecommendationTitle(page),
                tone: getRecommendationTone(page),
                page,
                runeImportStatesByPageKey,
                slotGroupMap,
                emptyMessage: "",
              }),
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderSpellRecommendationsSection(recommendations) {
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      return `
        <section class="build-items-panel" aria-label="Recommended summoner spells">
          <header class="build-items-panel-header">
            <div class="build-items-panel-heading">
              <h3>Summoner Spells</h3>
            </div>
          </header>
          <div class="build-summary-column-empty">
            No summoner spell recommendations were available.
          </div>
        </section>
      `;
    }

    return `
      <section class="build-items-panel" aria-label="Recommended summoner spells">
        <header class="build-items-panel-header">
          <div class="build-items-panel-heading">
            <h3>Summoner Spells</h3>
          </div>
        </header>
        <div class="build-spell-card-list">
          ${recommendations.map((spellSet) => renderSpellSetCard(spellSet)).join("")}
        </div>
      </section>
    `;
  }

  function renderBootsSection(boots) {
    if (!Array.isArray(boots) || boots.length === 0) {
      return `
        <section class="build-items-panel" aria-label="Recommended boots">
          <header class="build-items-panel-header">
            <div class="build-items-panel-heading">
              <h3>Boots</h3>
            </div>
          </header>
          <div class="build-summary-column-empty">No completed boots data was available.</div>
        </section>
      `;
    }

    return `
      <section class="build-items-panel" aria-label="Recommended boots">
        <header class="build-items-panel-header">
          <div class="build-items-panel-heading">
            <h3>Boots</h3>
          </div>
        </header>
        <div class="build-summary-boot-list">
          ${boots.map((boot) => renderCompactBootCard(boot)).join("")}
        </div>
      </section>
    `;
  }

  function renderItemsSection({ highestWinBuild, mostPickedBuild }) {
    const hasItems =
      Array.isArray(highestWinBuild?.selections) || Array.isArray(mostPickedBuild?.selections);

    if (!hasItems) {
      return `
        <section class="build-items-panel" aria-label="Recommended items">
          <header class="build-items-panel-header">
            <div class="build-items-panel-heading">
              <h3>Items</h3>
            </div>
            <p class="build-summary-caption">Five non-boot purchases in order.</p>
          </header>
          <div class="build-summary-column-empty">No ordered item path data was available.</div>
        </section>
      `;
    }

    return `
      <section class="build-items-panel" aria-label="Recommended items">
        <header class="build-items-panel-header">
          <div class="build-items-panel-heading">
            <h3>Items</h3>
          </div>
          <p class="build-summary-caption">Five non-boot purchases in order.</p>
        </header>
        <div class="build-items-grid">
          ${renderItemBuildColumn({
            title: "Highest Win",
            tone: "highest-win",
            build: highestWinBuild,
            emptyMessage: "No highest-win item path was available.",
          })}
          ${renderItemBuildColumn({
            title: "Most Picked",
            tone: "most-picked",
            build: mostPickedBuild,
            emptyMessage: "No most-picked item path was available.",
          })}
        </div>
      </section>
    `;
  }

  function renderItemBuildColumn({ title, tone, build, emptyMessage }) {
    const selections = getOrderedSelections(build?.selections);

    if (selections.length === 0) {
      return `
        <section class="build-item-column build-item-column--${escapeAttribute(tone)}">
          <header class="build-item-column-header">
            <span class="build-summary-kicker">${escapeHtml(title)}</span>
            <h4>${escapeHtml(title)}</h4>
          </header>
          <div class="build-summary-column-empty">${escapeHtml(emptyMessage)}</div>
        </section>
      `;
    }

    return `
      <section class="build-item-column build-item-column--${escapeAttribute(tone)}">
        <header class="build-item-column-header">
          <span class="build-summary-kicker">${escapeHtml(title)}</span>
          <h4>${escapeHtml(title)}</h4>
        </header>
        <div class="build-item-list">
          ${selections.map((selection, index) => renderItemCard(selection, index + 1)).join("")}
        </div>
      </section>
    `;
  }

  function hydrateRuneSelections(selections, side, slotGroupMap) {
    return getOrderedSelections(selections).map((selection) => ({
      ...selection,
      ...lookupSelectionRates(side, selection, slotGroupMap),
    }));
  }

  function getOrderedSelections(selections) {
    if (!Array.isArray(selections)) {
      return [];
    }

    return selections
      .filter((selection) => selection && (selection.icon || selection.name))
      .map((selection, index) => ({ ...selection, displayIndex: index }))
      .sort((left, right) => {
        const leftSlot = Number.isInteger(left?.slotIndex) ? left.slotIndex : Number.MAX_SAFE_INTEGER;
        const rightSlot = Number.isInteger(right?.slotIndex) ? right.slotIndex : Number.MAX_SAFE_INTEGER;

        if (leftSlot !== rightSlot) {
          return leftSlot - rightSlot;
        }

        return left.displayIndex - right.displayIndex;
      });
  }

  function buildSlotGroupMap(slotGroups) {
    const map = new Map();

    slotGroups.forEach((group) => {
      if (!group?.key) {
        return;
      }

      map.set(group.key, group);
    });

    return map;
  }

  function lookupSelectionRates(side, selection, slotGroupMap) {
    const slotIndex = Number(selection?.slotIndex);
    if (!Number.isInteger(slotIndex)) {
      return {
        matchedWinRate: null,
        matchedPickRate: null,
      };
    }

    const groupKey = `${side}-slot-${slotIndex}`;
    const group = slotGroupMap.get(groupKey);
    const option = Array.isArray(group?.options)
      ? group.options.find((candidate) => candidate?.id === selection?.id) || null
      : null;

    return {
      matchedWinRate: option?.winRate ?? null,
      matchedPickRate: option?.pickRate ?? null,
    };
  }

  function renderRuneSection(label, selections) {
    if (!Array.isArray(selections) || selections.length === 0) {
      return "";
    }

    return `
      <section class="build-summary-section">
        <span class="build-summary-section-label">${escapeHtml(label)}</span>
        <div class="build-rune-card-grid">
          ${selections.map((selection) => renderRuneCard(selection)).join("")}
        </div>
      </section>
    `;
  }

  function renderRuneCard(selection) {
    return `
      <article class="build-rune-card" title="${escapeAttribute(selection?.name || "Rune")}">
        <img
          src="${escapeAttribute(selection?.icon || "")}"
          alt="${escapeAttribute(selection?.name || "Rune")}"
          width="40"
          height="40"
        />
        <div class="build-rune-card-copy">
          <strong>${escapeHtml(selection?.name || "Unknown")}</strong>
          <div class="build-rune-card-stats">
            ${renderRuneCardStat(selection?.matchedWinRate, "win")}
            ${renderRuneCardStat(selection?.matchedPickRate, "pick")}
          </div>
        </div>
      </article>
    `;
  }

  function renderRuneCardStat(value, tone) {
    return `
      <span class="build-rune-card-stat build-rune-card-stat--${escapeAttribute(tone)}">
        ${escapeHtml(formatPercent(value))} ${escapeHtml(tone)}
      </span>
    `;
  }

  function renderItemCard(selection, orderNumber) {
    return `
      <article class="build-item-card" title="${escapeAttribute(selection?.name || "Item")}">
        <div class="build-item-card-media">
          <span class="build-item-card-order">${escapeHtml(String(orderNumber))}</span>
          <img
            src="${escapeAttribute(selection?.icon || "")}"
            alt="${escapeAttribute(selection?.name || "Item")}"
            width="44"
            height="44"
          />
        </div>
        <div class="build-item-card-copy">
          <strong>${escapeHtml(selection?.name || "Unknown")}</strong>
          <div class="build-item-card-stats">
            ${renderItemCardStat(formatPercent(selection?.winRate), "win")}
            ${renderItemCardStat(formatPercent(selection?.pickRate), "pick")}
            ${renderItemCardStat(formatMinute(selection?.purchaseMinute), "minute")}
          </div>
        </div>
      </article>
    `;
  }

  function renderItemCardStat(value, tone) {
    return `
      <span class="build-item-card-stat build-item-card-stat--${escapeAttribute(tone)}">
        ${escapeHtml(value)}${tone === "minute" ? "" : ` ${escapeHtml(tone)}`}
      </span>
    `;
  }

  function renderCompactSection(label, selections) {
    const normalizedSelections = Array.isArray(selections)
      ? selections.filter((selection) => selection && (selection.icon || selection.name))
      : [];

    if (normalizedSelections.length === 0) {
      return "";
    }

    return `
      <section class="build-summary-section">
        <span class="build-summary-section-label">${escapeHtml(label)}</span>
        <div class="build-summary-chip-row">
          ${normalizedSelections.map((selection) => renderCompactChip(selection)).join("")}
        </div>
      </section>
    `;
  }

  function renderCompactChip(selection) {
    return `
      <article class="build-summary-chip" title="${escapeAttribute(selection?.name || "Selection")}">
        <img
          src="${escapeAttribute(selection?.icon || "")}"
          alt="${escapeAttribute(selection?.name || "Selection")}"
          width="28"
          height="28"
        />
        <span class="sr-only">${escapeHtml(selection?.name || "Unknown")}</span>
      </article>
    `;
  }

  function renderCompactBootCard(boot) {
    return `
      <article class="build-compact-boot-card ${getOptionHighlightClassName("build-compact-boot-card", boot)}">
        <div class="build-compact-boot-card-top">
          <img
            src="${escapeAttribute(boot?.icon || "")}"
            alt="${escapeAttribute(boot?.name || "Boots")}"
            width="38"
            height="38"
          />
          <div class="build-compact-boot-card-copy">
            <h4>${escapeHtml(boot?.name || "Unknown")}</h4>
            ${renderHighlightLegend(boot)}
          </div>
        </div>
        <div class="build-summary-metric-grid">
          ${renderSummaryMetric("Win", formatPercent(boot?.winRate), "win")}
          ${renderSummaryMetric("Pick", formatPercent(boot?.pickRate), "pick")}
          ${renderSummaryMetric("Games", formatCount(boot?.games), "games")}
        </div>
      </article>
    `;
  }

  function renderSpellSetCard(spellSet) {
    const selections = Array.isArray(spellSet?.selections)
      ? spellSet.selections.filter((selection) => selection && (selection.icon || selection.name))
      : [];

    return `
      <article class="build-spell-card ${getOptionHighlightClassName("build-spell-card", spellSet)}">
        <div class="build-spell-card-top">
          <div class="build-spell-card-icons">
            ${selections.map((selection) => renderSpellSelection(selection)).join("")}
          </div>
          <div class="build-spell-card-copy">
            <h4>${escapeHtml(getSpellSetTitle(spellSet))}</h4>
            ${renderHighlightLegend(spellSet)}
          </div>
        </div>
        <div class="build-summary-metric-grid">
          ${renderSummaryMetric("Win", formatPercent(spellSet?.winRate), "win")}
          ${renderSummaryMetric("Pick", formatPercent(spellSet?.pickRate), "pick")}
          ${renderSummaryMetric("Games", formatCount(spellSet?.games), "games")}
        </div>
      </article>
    `;
  }

  function renderSpellSelection(selection) {
    return `
      <article class="build-spell-chip" title="${escapeAttribute(selection?.name || "Spell")}">
        <img
          src="${escapeAttribute(selection?.icon || "")}"
          alt="${escapeAttribute(selection?.name || "Spell")}"
          width="38"
          height="38"
        />
        <span class="sr-only">${escapeHtml(selection?.name || "Unknown")}</span>
      </article>
    `;
  }

  function getPageTitle(page) {
    const parts = [page?.primaryStyle?.name, page?.secondaryStyle?.name].filter(Boolean);

    if (parts.length === 0) {
      return "Locked rune page";
    }

    return parts.join(" + ");
  }

  function getSpellSetTitle(spellSet) {
    const spellNames = Array.isArray(spellSet?.selections)
      ? spellSet.selections.map((selection) => selection?.name).filter(Boolean)
      : [];

    return spellNames.length > 0 ? spellNames.join(" + ") : "Summoner spells";
  }

  function renderSummaryMetric(label, value, tone) {
    return `
      <div class="build-summary-metric build-summary-metric--${escapeAttribute(tone)}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
  }

  function renderRuneImportAction(pageKey, runeImportState) {
    if (!pageKey) {
      return "";
    }

    const isImporting = runeImportState?.status === "importing";

    return `
      <button
        type="button"
        class="build-rune-import-action"
        data-rune-import-key="${escapeAttribute(pageKey)}"
        aria-label="Import this rune page into the League Client"
        ${isImporting ? "disabled" : ""}
      >
        ${isImporting ? "Importing..." : "Import Runes"}
      </button>
    `;
  }

  function renderRuneImportStatus(runeImportState) {
    const message = typeof runeImportState?.message === "string" ? runeImportState.message.trim() : "";
    if (!message) {
      return "";
    }

    const status = runeImportState?.status === "success"
      ? "success"
      : runeImportState?.status === "error"
        ? "error"
        : "pending";

    return `
      <p class="build-rune-import-status build-rune-import-status--${escapeAttribute(status)}" aria-live="polite">
        ${escapeHtml(message)}
      </p>
    `;
  }

  function renderHighlightLegend(option) {
    if (option?.isHighestWin && option?.isMostPicked) {
      return '<span class="build-highlight build-highlight--both">Highest Win + Most Picked</span>';
    }

    if (option?.isHighestWin) {
      return '<span class="build-highlight build-highlight--highest-win">Highest Win</span>';
    }

    if (option?.isMostPicked) {
      return '<span class="build-highlight build-highlight--most-picked">Most Picked</span>';
    }

    return "";
  }

  function getOptionHighlightClassName(baseClassName, option) {
    if (option?.isHighestWin && option?.isMostPicked) {
      return `${baseClassName}--both`;
    }

    if (option?.isHighestWin) {
      return `${baseClassName}--highest-win`;
    }

    if (option?.isMostPicked) {
      return `${baseClassName}--most-picked`;
    }

    return "";
  }

  function buildRecommendedRunePages(highestWinPage, mostPickedPage) {
    const pagesByKey = new Map();

    [
      { page: highestWinPage, isHighestWin: true, isMostPicked: false },
      { page: mostPickedPage, isHighestWin: false, isMostPicked: true },
    ].forEach(({ page, isHighestWin, isMostPicked }) => {
      const recommendationKey = getRecommendationPageKey(page);
      if (!recommendationKey) {
        return;
      }

      const existing = pagesByKey.get(recommendationKey);
      if (existing) {
        existing.isHighestWin = existing.isHighestWin || isHighestWin;
        existing.isMostPicked = existing.isMostPicked || isMostPicked;
        return;
      }

      pagesByKey.set(recommendationKey, {
        ...page,
        isHighestWin,
        isMostPicked,
      });
    });

    return [...pagesByKey.values()].sort(compareHighlightedOptions);
  }

  function normalizeRuneImportStates(statesByPageKey) {
    return statesByPageKey && typeof statesByPageKey === "object" ? statesByPageKey : {};
  }

  function buildRecommendedSpellSets(highestWinSet, mostPickedSet) {
    const setsByKey = new Map();

    [
      { option: highestWinSet, isHighestWin: true, isMostPicked: false },
      { option: mostPickedSet, isHighestWin: false, isMostPicked: true },
    ].forEach(({ option, isHighestWin, isMostPicked }) => {
      const recommendationKey = getRecommendationSpellSetKey(option);
      if (!recommendationKey) {
        return;
      }

      const existing = setsByKey.get(recommendationKey);
      if (existing) {
        existing.isHighestWin = existing.isHighestWin || isHighestWin;
        existing.isMostPicked = existing.isMostPicked || isMostPicked;
        return;
      }

      setsByKey.set(recommendationKey, {
        ...option,
        isHighestWin,
        isMostPicked,
      });
    });

    return [...setsByKey.values()].sort(compareHighlightedOptions);
  }

  function getHighlightedOptions(options, keyField) {
    if (!Array.isArray(options)) {
      return [];
    }

    const optionsByKey = new Map();

    options.forEach((option) => {
      if (!option?.isHighestWin && !option?.isMostPicked) {
        return;
      }

      const optionKey = option?.[keyField];
      if (optionKey == null) {
        return;
      }

      const existing = optionsByKey.get(optionKey);
      if (existing) {
        existing.isHighestWin = existing.isHighestWin || option.isHighestWin;
        existing.isMostPicked = existing.isMostPicked || option.isMostPicked;
        return;
      }

      optionsByKey.set(optionKey, { ...option });
    });

    return [...optionsByKey.values()].sort(compareHighlightedOptions);
  }

  function getRecommendationPageKey(page) {
    if (!page || typeof page !== "object") {
      return null;
    }

    if (page.pageKey) {
      return String(page.pageKey);
    }

    const primaryIds = getSelectionIds(page?.selections?.primary);
    const secondaryIds = getSelectionIds(page?.selections?.secondary);
    const modifierIds = getSelectionIds(page?.selections?.modifiers);

    return [
      page?.primaryStyle?.styleId ?? "",
      page?.secondaryStyle?.styleId ?? "",
      primaryIds.join(","),
      secondaryIds.join(","),
      modifierIds.join(","),
    ].join("|");
  }

  function getRecommendationSpellSetKey(spellSet) {
    if (!spellSet || typeof spellSet !== "object") {
      return null;
    }

    if (spellSet.setKey) {
      return String(spellSet.setKey);
    }

    return getSelectionIds(spellSet?.selections).join("|");
  }

  function getSelectionIds(selections) {
    if (!Array.isArray(selections)) {
      return [];
    }

    return selections
      .map((selection) => selection?.id)
      .filter((selectionId) => selectionId != null)
      .map((selectionId) => String(selectionId));
  }

  function compareHighlightedOptions(left, right) {
    const priorityDifference = getHighlightPriority(left) - getHighlightPriority(right);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const gamesDifference = Number(right?.games || 0) - Number(left?.games || 0);
    if (gamesDifference !== 0) {
      return gamesDifference;
    }

    return Number(right?.winRate || 0) - Number(left?.winRate || 0);
  }

  function getHighlightPriority(option) {
    if (option?.isHighestWin && option?.isMostPicked) {
      return 0;
    }

    if (option?.isHighestWin) {
      return 1;
    }

    if (option?.isMostPicked) {
      return 2;
    }

    return 3;
  }

  function getRecommendationTitle(option) {
    if (option?.isHighestWin && option?.isMostPicked) {
      return "Highest Win + Most Picked";
    }

    if (option?.isHighestWin) {
      return "Highest Win";
    }

    if (option?.isMostPicked) {
      return "Most Picked";
    }

    return "Recommendation";
  }

  function getRecommendationTone(option) {
    if (option?.isHighestWin && option?.isMostPicked) {
      return "both";
    }

    if (option?.isHighestWin) {
      return "highest-win";
    }

    if (option?.isMostPicked) {
      return "most-picked";
    }

    return "boots";
  }

  function renderInlineNotes(notes) {
    if (!Array.isArray(notes) || notes.length === 0) {
      return "";
    }

    return `
      <div class="build-inline-notes">
        ${notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")}
      </div>
    `;
  }

  function renderBuildSummaryGlobalNote() {
    return `
      <p class="build-summary-global-note">
        Most picked and highest win build options are shown below when available.
      </p>
    `;
  }

  function renderEmptyState(message) {
    return `<div class="build-empty-state">${escapeHtml(message)}</div>`;
  }

  function formatCount(value) {
    return Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString() : "-";
  }

  function formatPercent(value) {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "-";
  }

  function formatMinute(value) {
    return Number.isFinite(Number(value)) ? `${Math.round(Number(value))} min` : "-";
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  return {
    BUILD_SUGGESTION_TABS,
    DEFAULT_BUILD_SUGGESTION_TAB,
    getRecommendedRunePages: buildRecommendedRunePages,
    getRunePageRecommendationKey: getRecommendationPageKey,
    normalizeBuildSuggestionTab,
    renderBuildSuggestionBody,
  };
});
